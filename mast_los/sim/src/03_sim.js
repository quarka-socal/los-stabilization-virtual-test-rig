// ============================================================================
// 03_sim.js — zaman alanı simülatörü
//   taban (hexapod/işletme) → 3B kinematik → 2 eksen gimbal + LuGre + gyro +
//   stabilizasyon döngüsü → esnek/optik modlar → ölçüm zinciri (video, oto-
//   kolimatör, IMU, enkoder) → kayıt
// ============================================================================
const MECH_DEFAULT = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: true, gyroBias: true,
  imbalance: true, gimMode: true, optMode: true, cooler: true, earth: true, compErr: true, gyroG: true };
const MEAS_DEFAULT = { video: true, ac: true, imu: true, air: true, microvib: true, noise: true };
const AX = { roll: 0, pitch: 1, yaw: 2, x: 0, y: 1, z: 2 };

// hexapod komut profilinin θ/ω/α sınırlarına göre kontrolü (1 kHz örnekleme)
// v13.3: senaryodaki hexapod öteleme komutlarının (S.trans) eksen başına en büyük mutlak değeri (m) — strok denetimi
function transPeak(P, S) {
  if (!S.trans || !S.trans.length) return 0;
  const fs = 500, n = Math.max(3, Math.round(S.T * fs)), ch = makeChannel(S.trans, fs, makeRngFactory(S.seed == null ? 1 : S.seed)), v = [0, 0, 0];
  let pk = 0; for (let k = 0; k < n; k++) { v[0] = v[1] = v[2] = 0; ch.eval(k / fs, v); pk = Math.max(pk, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])); }
  return pk;
}
function hexLimitCheck(P, S) {
  const hx = P.wb.hex;
  const fs = 1000, n = Math.max(3, Math.round(S.T * fs));
  const ch = makeChannel(S.cmd, fs, makeRngFactory(S.seed == null ? 1 : S.seed));
  const v = [0, 0, 0];
  const th = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let k = 0; k < n; k++) { ch.eval(k / fs, v); th[0][k] = v[0]; th[1][k] = v[1]; th[2][k] = v[2]; }
  const res = { axes: [], clipFrac: 0, any: false };
  let clipAny = 0;
  const lim = [hx.theta_max * D2R, hx.omega_max * D2R, hx.alpha_max * D2R];
  const over = new Uint8Array(n);
  for (let i = 0; i < 3; i++) {
    let pm = 0, vm = 0, am = 0;
    const x = th[i];
    for (let k = 1; k < n - 1; k++) {
      const p = Math.abs(x[k]), vv = Math.abs((x[k + 1] - x[k - 1]) * fs / 2), aa = Math.abs((x[k + 1] - 2 * x[k] + x[k - 1]) * fs * fs);
      if (p > pm) pm = p; if (vv > vm) vm = vv; if (aa > am) am = aa;
      if (p > lim[0] || vv > lim[1] * 1.0001 || aa > lim[2] * 1.0001) over[k] = 1;
    }
    res.axes.push({ peakDeg: pm * R2D, peakRate: vm * R2D, peakAcc: am * R2D,
      ratio: Math.max(pm / lim[0], vm / lim[1], am / lim[2]) });
  }
  for (let k = 0; k < n; k++) clipAny += over[k];
  res.clipFrac = clipAny / n; res.any = clipAny > 0;
  return res;
}

function simIter(P, S, onProg) {
  const d = derive(P), wb = P.wb, dut = P.dut, lab = P.lab;
  const fs = S.fs || 4000, dt = 1 / fs, N = Math.max(1, Math.round(S.T * fs));
  const fctl = dut.ctl.fctl, m = Math.max(1, Math.round(fs / fctl)), dtc = m * dt;
  const rngf = makeRngFactory(S.seed == null ? 1 : S.seed);
  const mech = Object.assign({}, MECH_DEFAULT, S.mech || {});
  const meas = Object.assign({}, MEAS_DEFAULT, S.meas || {});
  const isLab = S.world !== 'op';
  const stab = S.stab !== false;
  const comp = S.earthComp != null ? !!S.earthComp : !!wb.earth.comp;
  // video kanalı: varsayılan bütçe referans kanalı; S.channel ile başka kanal (ör. WFOV) seçilebilir
  const chS = S.channel ? (wb.channels.find(c => c.name === S.channel) || d.ch) : d.ch;
  const IFOV = chS.p_um / chS.f_mm * 1e-3, IFOVt = IFOV * (1 + dut.optics.scaleErr);
  const Tint = S.Tint != null ? S.Tint : chS.Tint_ms * 1e-3, fps = chS.fps;
  const Nh = chS.Nh, Nv = chS.Nv;

  // ------------------------------------------------------------- geometri ----
  const a0 = dut.geom.a0 * D2R;
  const e0 = (S.e0 != null ? S.e0 : (dut.geom.e0 != null ? dut.geom.e0 : wb.earth.el)) * D2R;
  const alC = wb.earth.az * D2R;
  const los0 = [Math.sin(alC) * Math.cos(e0), Math.cos(alC) * Math.cos(e0), Math.sin(e0)];
  const beta = Math.atan2(los0[1], los0[0]) - a0, cb = Math.cos(beta), sbt = Math.sin(beta);
  // laboratuvara sabit referans görüntü eksenleri: x=LOS0, y=yukarı×x (sol), z=x×y (yukarı)
  let yr = [-los0[1], los0[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = [yr[0] / n, yr[1] / n, 0]; }
  const xr = los0, zr = [xr[1] * yr[2] - xr[2] * yr[1], xr[2] * yr[0] - xr[0] * yr[2], xr[0] * yr[1] - xr[1] * yr[0]];
  // dünya dönüşü (ENU) ve kompanzasyon kestirimi
  const phiL = wb.earth.lat * D2R, Om = mech.earth ? wb.earth.Omega : 0;
  const OmL = [0, Om * Math.cos(phiL), Om * Math.sin(phiL)];
  let OmH = [0, 0, 0];
  if (comp) {
    let dv = [los0[1] * OmL[2] - los0[2] * OmL[1], los0[2] * OmL[0] - los0[0] * OmL[2], los0[0] * OmL[1] - los0[1] * OmL[0]];
    let dn = Math.hypot(dv[0], dv[1], dv[2]); if (dn < 1e-15) { dv = [0, 0, 1]; dn = 1; }
    const dm = mech.compErr ? wb.earth.Omega * wb.earth.delta_deg * D2R * (mech.earth ? 1 : 0) : 0;
    const sgn = S.compErrSign == null ? 1 : S.compErrSign;
    OmH = [OmL[0] + sgn * dv[0] / dn * dm, OmL[1] + sgn * dv[1] / dn * dm, OmL[2] + sgn * dv[2] / dn * dm];
  }

  // -------------------------------------------------------- taban kanalları --
  const hexF = S.hexF || (isLab ? wb.hex.fbw : 1500);
  const vibList = (S.vib || []).slice();
  if (isLab && S.hexActive !== false && meas.microvib && wb.hex.microvib > 0) {
    const mv = lab.microvib;
    for (let i = 0; i < 3; i++) vibList.push({ type: 'noise', axis: i, rms: wb.hex.microvib * URAD, hp: mv.f1, lp: mv.f2,
      peak: { f: mv.fres, Q: mv.Qres, g: mv.gres }, stream: 'microvib' + i });
  }
  const cmdCh = makeChannel(S.cmd, fs, rngf), vibCh = makeChannel(vibList, fs, rngf);
  const trCh = makeChannel(S.trans, fs, rngf), accCh = makeChannel(S.acc, fs, rngf), accmCh = makeChannel(S.accMount, fs, rngf);
  const hasVib = vibCh.comps.length > 0, hasTr = trCh.comps.length > 0, hasAcc = accCh.comps.length > 0, hasAccm = accmCh.comps.length > 0;
  const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ce0 = Math.cos(e0), se0 = Math.sin(e0);
  const hexO = [0, 1, 2].map(() => new Osc2(hexF, 0.7071, dt));
  const vibO = [0, 1, 2].map(() => new Osc2(1500, 0.7071, dt));
  // v13.4: hexapod ötelemesi bacak dinamiğinden geçer (wb.hex.transDyn = 'fbw': açıyla aynı Osc2). 'ideal': 1500 Hz (süzgeçsiz).
  const trF = isLab && S.hexActive !== false && wb.hex.transDyn === 'fbw' ? hexF : 1500;
  const trO = [0, 1, 2].map(() => new Osc2(trF, 0.7071, dt));
  const mnt = dut.mount;
  // direk modu yalnız işletmede: laboratuvarda DUT rijit fikstürde (hexapod / shaker) — açısal yol ayrıca uyarılır
  const useMount = (S.mount != null ? !!S.mount : !isLab) && mnt && mnt.kappa > 0;
  const mO = [0, 1, 2].map(() => new Osc2(mnt.f, mnt.zeta, dt));
  const kRock = (S.rocking || 0) * 1e-3;          // µrad/mm → rad/m
  const accmL = S.accMountLinear === false ? 0 : 1; // 0: yalnız direk modunun açısal çıktısı (açısal uyarıcı ile yeniden üretim)
  const thMax = wb.hex.theta_max * D2R;
  const cmdv = [0, 0, 0], vibv = [0, 0, 0], trv = [0, 0, 0], accv = [0, 0, 0], accmv = [0, 0, 0];

  // -------------------------------------------------------- DUT parametreleri
  const EL = dut.el, AZ = dut.az, G = dut.gyro, CT = dut.ctl;
  const Je = EL.J;
  const be = mech.coupling ? EL.b : 0, ke = mech.coupling ? EL.k : 0;
  const ba = mech.coupling ? AZ.b : 0, ka = mech.coupling ? AZ.k : 0;
  const Ke = d.loopEl.K, Ka = d.loopAz.K, wie = TAU * EL.fi, wia = TAU * AZ.fi;
  const kcur = 1 - Math.exp(-TAU * dut.cur.fbw * dt);
  const kgy = 1 - Math.exp(-TAU * G.fbw * dt);
  // v11 FOG ekleri (nötr değerlerde önceki sürümle bit düzeyinde aynı): sıcaklık farkı ΔT = Top − Tcal → bias (tcBias,
  // °/h/°C) ve ölçek (tcSF, ppm/°C); kübik ölçek doğrusalsızlığı (en küçük kareler doğrusundan en büyük sapma = sfnl·FS:
  // δω = k3·ω³ − 0,6·k3·FS²·ω, k3 = 2,5·sfnl·10⁻⁶/FS²); ölçüm menzili ±FS (doyum); kuantizasyon (LSB, °/h);
  // g-duyarlılığı (giriş eksenindeki özgül kuvvet değişimi, °/h/g); saf gecikme (kontrol hızında, doğrusal ara değer)
  const Tcal = G.Tcal != null ? G.Tcal : 20, dTg = (G.Top != null ? G.Top : Tcal) - Tcal;
  const tcB = (G.tcBias || 0) * dTg, tcS = (G.tcSF || 0) * dTg;
  const sf = 1 + (tcS ? G.sf_ppm + tcS : G.sf_ppm) * 1e-6;
  const FSr = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R;
  const k3 = (G.sfnl_ppm || 0) * 2.5e-6 / (FSr * FSr), bNL = 0.6 * k3 * FSr * FSr, fogNL = k3 !== 0;
  const lsbR = (G.lsb_dph || 0) * DEGPH, kgR = mech.gyroG !== false ? (G.kg || 0) * DEGPH / G0 : 0;
  const nLat = Math.max(0, (G.lat_ms || 0) * 1e-3 * fctl), latN = Math.ceil(nLat) + 2;
  const latY = nLat > 0 ? new Float64Array(latN) : null, latZ = nLat > 0 ? new Float64Array(latN) : null;
  let latI = 0, gSat = 0, gMaxY = 0, gMaxZ = 0;
  const epsE = mech.misalign ? G.epsEl * 1e-3 : 0, epsX = mech.misalign ? G.epsXel * 1e-3 : 0;
  const arwN = mech.gyroNoise ? G.arw * DEGPSQH : 0, nStd = arwN / Math.sqrt(dtc);
  const rG = rngf('gyro');
  const gyroFresh = !!(S.gyroFresh || G.freshCal);      // isteğe bağlı: bias koşudan hemen önce kalibre edilmiş
  const gmY = new BiasProcess(mech.gyroBias ? G.bi * DEGPH : 0, rngf('gmY'), dtc, gyroFresh);
  const gmZ = new BiasProcess(mech.gyroBias ? G.bi * DEGPH : 0, rngf('gmZ'), dtc, gyroFresh);
  const b0r = rngf('bias0');
  // sıcaklık kaynaklı bias değişimi, eksenin sabit bias işaretiyle aynı yönde alınır (en kötü durum)
  const b0Y = mech.gyroBias ? (tcB ? G.bias0 + tcB : G.bias0) * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  const b0Z = mech.gyroBias ? (tcB ? G.bias0 + tcB : G.bias0) * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  // kontrolcü süzgeçleri (kontrol hızında)
  const lpE = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp)), lpA = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp));
  // v13.10 (§9 K1): uyarlanır kipte dar bant kestirilen frekansa ayarlanır: f_kestirim = f_gerçek·(1 + estErr); estErr = 0 ideal (v13.9 davranışı)
  const res = CT.res, rEst = res.adaptive && res.estErr ? 1 + res.estErr : 1, resF = (res.adaptive && S.resF) ? S.resF * rEst : res.f;
  const resOn = !!res.on && stab;
  const gr = Math.pow(10, res.gain_dB / 20) - 1;
  const rbE = bqBP(resF, fctl, 1 / (2 * res.zeta)), rbA = bqBP(resF, fctl, 1 / (2 * res.zeta));
  // adaptif izleme (S.resTrack: t → f, ideal frekans kestirimi) ve çalışma bandı [fmin, fmax]
  const rBand = [res.fmin || 0, res.fmax || 1e9];
  const resTrack = resOn && res.adaptive && typeof S.resTrack === 'function' ? (rEst !== 1 ? (t) => S.resTrack(t) * rEst : S.resTrack) : null;
  const inBand = (f) => f > 0 && f >= rBand[0] && f <= rBand[1];
  let resGt = resOn ? (inBand(resTrack ? (resTrack(0) || resF) : resF) ? 1 : 0) : 0, resG = resGt, nextRT = 0;
  const kResG = 1 - Math.exp(-dtc / 0.3);
  // sürtünme
  const fricE = mech.friction ? { Fc: EL.Fc, Fs: EL.Fs, ws: EL.ws, s0: EL.sigma0 } : null;
  const fricA = mech.friction ? { Fc: AZ.Fc, Fs: AZ.Fs, ws: AZ.ws, s0: AZ.sigma0 } : null;
  // v13.10 (§9 K2): ileri beslemenin gözlemcisi kendi sürtünme modelini kullanır (tesis × oran); oranlar 1 iken tesisle aynı (v13.9)
  const FO = (CT.ff && CT.ff.obs) || {}, oFc = FO.Fc != null ? FO.Fc : 1, oFs = FO.Fs != null ? FO.Fs : 1, oVs = FO.vs != null ? FO.vs : 1, oS0 = FO.s0 != null ? FO.s0 : 1;
  const obsE = fricE ? { Fc: fricE.Fc * oFc, Fs: fricE.Fs * oFs, ws: fricE.ws * oVs, s0: fricE.s0 * oS0 } : null;
  const obsA = fricA ? { Fc: fricA.Fc * oFc, Fs: fricA.Fs * oFs, ws: fricA.ws * oVs, s0: fricA.s0 * oS0 } : null;
  const cogAe = mech.cogging ? EL.cogA : 0, cogAa = mech.cogging ? AZ.cogA : 0;
  // sürtünme ileri besleme: enkoder türevinden bağıl hız kestirimi (AGF) ve Coulomb modeli
  const FF = CT.ff || { on: false }, ffOn = !!FF.on && !!fricE && stab && S.ff !== false;
  const kff = 1 - Math.exp(-TAU * (FF.f_est || 100) * dt);
  let wEf = 0, wAf = 0, sgE = 0, sgA = 0, zhE = 0, zhA = 0;
  const ffLu = FF.mode === 'lugre';
  const ffHys = FF.hys != null ? FF.hys : 0;   // >0: histerezisli işaret (rad/s); 0: tanh(ŵ/w_ff)
  // dengesizlik (kg·m): Ue el montajı (E çerçevesi), Ua az boyunduruğu (A çerçevesi). Az ekseni etrafında dönen
  // kütle ikisinin toplamıdır: U_A = Ua + R_AE(e)·Ue (el montajının payı yükseklik açısıyla döner)
  const Ue = mech.imbalance ? dut.imb.rcg_e.map(v => v * 1e-3 * dut.imb.me) : [0, 0, 0];
  const Ua = mech.imbalance ? dut.imb.rcg_a.map(v => v * 1e-3 * dut.imb.ma) : [0, 0, 0];
  // pivot → gimbal merkezi (gövde çerçevesi): göz bebeğinden L_pg geride + pivot yüksekliği
  const losB0 = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
  const hP = S.pivotH || 0;
  const rpg = [-dut.L_pg * losB0[0], -dut.L_pg * losB0[1], -dut.L_pg * losB0[2] + hP];
  // modlar
  const MD = dut.modes;
  const gimY = new Osc2(MD.gim.f, MD.gim.zeta, dt), gimZ = new Osc2(MD.gim.f, MD.gim.zeta, dt);
  const optY = new Osc2(MD.opt.f, MD.opt.zeta, dt), optZ = new Osc2(MD.opt.f, MD.opt.zeta, dt);
  const gGim = mech.gimMode ? MD.gim.gA : 0, gOpt = mech.optMode ? MD.opt.gAcc : 0;
  const CL = dut.cooler, rC = rngf('cooler');
  const cAmp = mech.cooler && S.cooler !== false ? CL.A * URAD : 0;
  const cph = [0, 1, 2, 3, 4, 5].map(() => TAU * rC.uniform());
  const cw = TAU * CL.f;
  // özyinelemeli (karmaşık dönüş) osilatörler: büyük argümanlı Math.sin maliyetinden kaçınır
  const oscC = new Float64Array(6), oscS = new Float64Array(6), oscCd = new Float64Array(6), oscSd = new Float64Array(6);
  for (let j = 0; j < 6; j++) { const h = (j % 3) + 1; oscC[j] = Math.cos(cph[j]); oscS[j] = Math.sin(cph[j]); oscCd[j] = Math.cos(h * cw * dt); oscSd[j] = Math.sin(h * cw * dt); }
  // türetme (dönüş ekseni etrafında)
  const DR = dut.derot, derotOn = S.derot != null ? !!S.derot : !!DR.on;
  const rotBufN = Math.max(1, Math.round(DR.lat_ms * 1e-3 * fs) + 1), rotBuf = new Float64Array(rotBufN);
  const rD = rngf('derot');
  // ölçüm zinciri
  const CH = wb.chain;
  const airOn = isLab && meas.air && CH.air > 0;
  // hava türbülansı + kolimatör kararlılığı: yavaş renkli gürültü, düşük hızda sentez + kübik ara değer
  const airShape = (f) => 1 / ((1 + sq(f / lab.air.fc)) * (1 + sq(sq(f / (4 * lab.air.fc)))));
  const airE = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airE')) : null;
  const airX = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airX')) : null;
  const airAE = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airAE')) : null;
  const airAX = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airAX')) : null;
  const floorK = isLab ? (S.floorCoupling != null ? S.floorCoupling : lab.floorCoupling) * URAD : 0;
  // v13.5 (kullanıcı kararı): kolimatör paralaksı. Odak hatası δ (µm; + hedef odak düzleminin ötesinde) hedefi R = f_c²/δ uzaklığına
  // koyar; göz bebeği d kadar yana kayınca görünür hedef açısı −d/R değişir (el: zr, xel: yr). d, pupilShift ile aynı geometri:
  // pivot O, stab ON G − O = −L_pg·l_B + h·z, stab OFF E0 − O = h·z; d_lab = Rz(β)·t + L·v − Rz(β)·v (gerçekleşen duruş ve öteleme).
  const parK = isLab ? (S.collDelta != null ? S.collDelta : (wb.coll && wb.coll.delta_um) || 0) * 1e-6 / sq(wb.coll.fc_mm * 1e-3) : 0;
  const parV = (() => { const h = S.pivotH || 0, L = dut.L_pg, lb = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
    return stab ? [-L * lb[0], -L * lb[1], -L * lb[2] + h] : [0, 0, h]; })();
  let parE = 0, parX = 0;
  const imuLP = [0, 1, 2].map(() => bqLP(CH.imu_bw, fs, 0.7071));
  const imuDel = Math.max(0, (S.syncDt != null ? S.syncDt : CH.dt_sync_ms) * 1e-3 * fs);
  const imuBufN = Math.ceil(imuDel) + 3, imuBuf = [new Float64Array(imuBufN), new Float64Array(imuBufN), new Float64Array(imuBufN)];
  const rM = rngf('meas');
  const noiseOn = meas.noise !== false;
  const cNoise = noiseOn && isLab ? CH.centroid_px : 0;
  const plA = noiseOn && isLab ? CH.pixlock_px * Math.SQRT2 : 0;
  // v13.7 (K4): gürültü yoğunluğu. 'asd': IMU gürültüsü benzetim adımında (yoğunluk imu_asd, örnek başına imu_asd·√(fs/2)) açıya
  // eklenir ve hareketle birlikte IMU süzgecinden geçer (ayrı RNG akışı 'imuN'); otokolimatör kayıt örneği başına ac_asd·√(f_kayıt/2).
  // 'sample' (compatV10): eski tanım. rM akışı her iki kipte aynı tüketilir (video ve otokolimatör gerçekleşmeleri değişmez).
  const nzSample = CH.noiseModel === 'sample', fRecEff = fs / Math.max(1, Math.round(fs / ((S.rec && S.rec.fs) || 1000)));
  const imuN = noiseOn && nzSample ? CH.imu_noise * URAD : 0;
  const imuA = noiseOn && !nzSample ? (CH.imu_asd || 0) * URAD * Math.sqrt(fs / 2) : 0, rI = rngf('imuN');
  const acN = noiseOn ? (nzSample ? CH.ac_noise : (CH.ac_asd || 0) * Math.sqrt(fRecEff / 2)) * URAD : 0;
  const k1 = dut.optics.k1, rRef2 = (Nh * Nh + Nv * Nv) / 4;
  const x0 = dut.video.x0, y0 = dut.video.y0, edge = P.ana.edgeMargin_px;
  const vidLat = (dut.video.lat_ms || 0) * 1e-3;
  const xiPi = Math.PI / IFOVt;    // 2π ξ_N θ, ξ_N = 1/(2·IFOV)

  // ----------------------------------------------------------- kayıt ---------
  const fRec = (S.rec && S.rec.fs) || 1000, recEvery = Math.max(1, Math.round(fs / fRec));
  const chans = (S.rec && S.rec.ch) || ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'imu_r', 'imu_p', 'imu_y'];
  const nRec = Math.floor(N / recEvery) + 1;
  const rec = {}; for (const c of chans) rec[c] = new Float32Array(nRec);
  const RC = (c) => rec[c] || null;
  const r_opt_el = RC('opt_el'), r_opt_xel = RC('opt_xel'), r_mech_el = RC('mech_el'), r_mech_xel = RC('mech_xel');
  const r_rel_el = RC('rel_el'), r_rel_xel = RC('rel_xel'), r_ac_el = RC('ac_el'), r_ac_xel = RC('ac_xel');
  const r_base_r = RC('base_r'), r_base_p = RC('base_p'), r_base_y = RC('base_y');
  const r_imu_r = RC('imu_r'), r_imu_p = RC('imu_p'), r_imu_y = RC('imu_y'), anyImu = !!(r_imu_r || r_imu_p || r_imu_y);
  const r_cmd_r = RC('cmd_r'), r_cmd_p = RC('cmd_p'), r_cmd_y = RC('cmd_y'), r_enc_a = RC('enc_a'), r_enc_e = RC('enc_e');
  const r_gyr_y = RC('gyr_y'), r_gyr_z = RC('gyr_z'), r_rot = RC('rot'), r_rot_res = RC('rot_res');
  const r_tq_e = RC('tq_e'), r_tq_a = RC('tq_a'), r_w_e = RC('w_e'), r_w_a = RC('w_a'), r_acc_e = RC('acc_e'), r_acc_y = RC('acc_y'), r_trk_el = RC('trk_el');
  const r_tr_x = RC('tr_x'), r_tr_y = RC('tr_y'), r_tr_z = RC('tr_z');      // hexapod/shaker ötelemesi (m, gövde ekseninde; yalnız kayıt)
  const r_par_el = RC('par_el'), r_par_xel = RC('par_xel');      // v13.5: kolimatör paralaksının hedef açısı (rad; yalnız kayıt)
  // kayma ayrıştırması (yalnız kayıt; dinamiği değiştirmez): dünya dönüşü artığının (Ω̂ − Ω) ve gyro bias'ının
  // LOS'a görüntü eksenlerinde biriken katkısı
  const r_dre_el = RC('dr_e_el'), r_dre_xel = RC('dr_e_xel'), r_drb_el = RC('dr_b_el'), r_drb_xel = RC('dr_b_xel');
  const doDr = !!(r_dre_el || r_dre_xel || r_drb_el || r_drb_xel);
  const dOm = [OmH[0] - OmL[0], OmH[1] - OmL[1], OmH[2] - OmL[2]];     // kompanzasyon kapalıysa Ω̂ = 0 → −Ω
  let drEe = 0, drEx = 0, drBe = 0, drBx = 0;
  // video
  const doVideo = meas.video !== false;
  const Tf = 1 / fps, tOff = S.frameOffset != null ? S.frameOffset : 0.37e-3;
  const nF = doVideo ? Math.floor((S.T - tOff - Tint) / Tf) + 1 : 0;
  const V = { n: 0, t: new Float64Array(Math.max(nF, 0)), x: new Float64Array(Math.max(nF, 0)), y: new Float64Array(Math.max(nF, 0)),
    valid: new Uint8Array(Math.max(nF, 0)), mEl: new Float64Array(Math.max(nF, 0)), mXel: new Float64Array(Math.max(nF, 0)),
    vEl: new Float64Array(Math.max(nF, 0)), vXel: new Float64Array(Math.max(nF, 0)), oEl: new Float64Array(Math.max(nF, 0)), oXel: new Float64Array(Math.max(nF, 0)),
    fps, Tint, IFOV, x0, y0 };
  let fi = 0, fStart = tOff, fEnd = tOff + Tint, s1e = 0, s2e = 0, s1x = 0, s2x = 0, oce = 0, ose = 0, ocx = 0, osx = 0, fn = 0, stt = 0;
  // ROI yüksek hızlı optik kanal
  const roiF = S.roiFps != null ? S.roiFps : CH.roi_fps;
  const doRoi = isLab && roiF > 0;
  const TroiInt = doRoi ? 0.5 / roiF : 0, nRoi = doRoi ? Math.floor((S.T - TroiInt) * roiF) : 0;
  const RO = { n: 0, t: new Float64Array(nRoi), el: new Float64Array(nRoi), xel: new Float64Array(nRoi), fps: roiF };
  const roiNoise = noiseOn ? CH.centroid_px * Math.sqrt(Tint / Math.max(TroiInt, 1e-9)) * IFOV : 0;
  let ri = 0, rStart = 0, rEnd = TroiInt, rsE = 0, rsX = 0, rn = 0, rst = 0;
  // izleyici (T1.7) ve dönüş (T1.8)
  const TR = S.tracker || null;
  const trQ = []; let trIy = 0, trIz = 0, trWy = 0, trWz = 0, trLost = 0, trLostState = false, trErrE = 0, trErrX = 0;
  const trK = TR ? TAU * TR.bw : 0, trWi = TR ? trK / 4 : 0;
  const SL = S.slew || null;
  // trapez dönüş profili: ivmelen → sabit hız → yavaşla; gidiş t0'da, dönüş t0+Tm+hold'da
  let slA = 0, slW = 0, slTa = 0, slTc = 0, slTm = 0, slT0 = 0, slHold = 0;
  if (SL) {
    const ang = SL.ang * D2R, wmx = SL.rate * D2R; slA = SL.acc * D2R;
    slTc = ang / wmx - wmx / slA; slW = wmx;
    if (slTc < 0) { slTc = 0; slW = Math.sqrt(ang * slA); }
    slTa = slW / slA; slTm = 2 * slTa + slTc; slT0 = SL.t0; slHold = SL.hold;
  }
  const slewProf = (tt) => tt < 0 || tt > slTm ? 0 : (tt < slTa ? slA * tt : (tt < slTa + slTc ? slW : slW - slA * (tt - slTa - slTc)));
  const slewRate = (t) => SL ? slewProf(t - slT0) - slewProf(t - slT0 - slTm - slHold) : 0;

  // ------------------------------------------------------------ durum --------
  let lx = los0[0], ly = los0[1], lz = los0[2];
  let Oey = 0, Oaz = 0;                  // gimbal eylemsiz hızları (rad/s)
  let zE = 0, zA = 0;                    // LuGre kıl durumları
  let TmE = 0, TmA = 0, TappE = 0, TappA = 0, TnextE = 0, TnextA = 0;
  let I1e = 0, I2e = 0, I1a = 0, I2a = 0;
  let gFy = 0, gFz = 0, gMy = 0, gMz = 0;  // gyro süzgeç durumu, ölçülen
  let a = a0, e = e0;
  let satCount = 0, invalid = 0, maxRelE = 0, maxRelA = 0;
  let fEy0 = 0, fEz0 = G0;                // başlangıç (nominal) özgül kuvveti, E çerçevesinde: optik montajın statik sarkması

  // başlangıç: statik dengesizlik torkunu integratöre yükle, gimbal hızlarını eylemsiz kompanzasyona eşitle
  {
    const ca = Math.cos(a0), sa = Math.sin(a0), ce = Math.cos(e0), se = Math.sin(e0);
    // taban seviyede: R_LB = Rz(β); fL = (0,0,g)
    const fB = [0, 0, G0];                       // R_LB^T (0,0,g) = (0,0,g)
    const xEB = [ca * ce, sa * ce, se], yEB = [-sa, ca, 0], zEB = [-ca * se, -sa * se, ce];
    const fE = [xEB[2] * G0, 0, zEB[2] * G0];
    fEy0 = fE[1]; fEz0 = fE[2];
    const TiE = -(Ue[2] * fE[0] - Ue[0] * fE[2]);
    const fA = [ca * fB[0] + sa * fB[1], -sa * fB[0] + ca * fB[1], fB[2]];
    const UAx = Ua[0] + ce * Ue[0] - se * Ue[2], UAy = Ua[1] + Ue[1];
    const TiA = -(UAx * fA[1] - UAy * fA[0]);
    // durağanda e=0 → I1=0, u2 = ωi·I2, T = K·u2 (az: /cos e) = −Ti
    I2e = -TiE / (Ke * wie); I2a = -TiA * (CT.secant ? Math.max(ce, 0.1) : 1) / (Ka * wia);
    TmE = TappE = TnextE = -TiE; TmA = TappA = TnextA = -TiA;
    lpE.reset(wie * I2e); lpA.reset(wia * I2a);
    if (stab) {
      // başlangıçta döngü (g − c) = 0 tutar: y_E hızı c_y, z_E hızı c_z (kompanzasyon kapalıysa sıfır).
      // z_E hızı = −oAx·sin e + Ω_az·cos e  →  Ω_az = (c_z + oAx·sin e)/cos e  (e ≠ 0'da da geçici rejimsiz başlar)
      const cy0 = comp ? yr[0] * OmH[0] + yr[1] * OmH[1] + yr[2] * OmH[2] : 0;
      const cz0 = comp ? zr[0] * OmH[0] + zr[1] * OmH[1] + zr[2] * OmH[2] : 0;
      const oBx0 = cb * OmL[0] + sbt * OmL[1], oBy0 = -sbt * OmL[0] + cb * OmL[1];      // R_LB = Rz(β) → oB = R_LBᵀ·Ω_L
      const oAx0 = ca * oBx0 + sa * oBy0;
      Oey = cy0; Oaz = (cz0 + oAx0 * se) / Math.max(ce, 1e-6);
    }
  }

  const prog = Math.max(1, Math.floor(N / 60));
  let ir = 0, firstInvalidT = null;
  let wCmdY = 0, wCmdZ = 0;
  let L00, L01, L02, L10, L11, L12, L20, L21, L22;

  for (let k = 0; k < N; k++) {
    const t = k * dt;
    // ----------------------------------------------- 1) taban hareketi ------
    cmdCh.eval(t, cmdv);
    if (hasVib) vibCh.eval(t, vibv);
    if (hasTr) trCh.eval(t, trv);
    if (hasAcc) accCh.eval(t, accv);
    if (hasAccm) accmCh.eval(t, accmv);
    for (let i = 0; i < 3; i++) {
      let u = cmdv[i]; if (isLab) { if (u > thMax) u = thMax; else if (u < -thMax) u = -thMax; }   // hexapod strok sınırı (yalnız laboratuvar)
      hexO[i].step(u);
      if (hasVib) vibO[i].step(vibv[i]);
      if (hasTr) trO[i].step(trv[i]);
    }
    if (useMount && (hasTr || hasAccm)) {
      const amx = accmv[0] + trO[0].a, amy = accmv[1] + trO[1].a;
      mO[0].step(mnt.kappa * amy); mO[1].step(mnt.kappa * amx); mO[2].step(mnt.kappa * mnt.yaw * amy);
    }
    // roll ← y ve z ötelemesinden, pitch ← x ötelemesinden sallanma
    const rkR = kRock * (trO[1].x + trO[2].x), rkP = kRock * trO[0].x;
    const rkRv = kRock * (trO[1].v + trO[2].v), rkPv = kRock * trO[0].v;
    const rkRa = kRock * (trO[1].a + trO[2].a), rkPa = kRock * trO[0].a;
    const ph = hexO[0].x + vibO[0].x + mO[0].x + rkR, th = hexO[1].x + vibO[1].x + mO[1].x + rkP, ps = hexO[2].x + vibO[2].x + mO[2].x;
    const phd = hexO[0].v + vibO[0].v + mO[0].v + rkRv, thd = hexO[1].v + vibO[1].v + mO[1].v + rkPv, psd = hexO[2].v + vibO[2].v + mO[2].v;
    const phdd = hexO[0].a + vibO[0].a + mO[0].a + rkRa, thdd = hexO[1].a + vibO[1].a + mO[1].a + rkPa, psdd = hexO[2].a + vibO[2].a + mO[2].a;
    // ----------------------------------------------- 2) kinematik -----------
    const cph = Math.cos(ph), sph = Math.sin(ph), cth = Math.cos(th), sth = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps);
    const p = phd - psd * sth, q = thd * cph + psd * cth * sph, r = -thd * sph + psd * cth * cph;
    const pd = phdd - psdd * sth - psd * thd * cth;
    const qd = thdd * cph - thd * phd * sph + psdd * cth * sph - psd * thd * sth * sph + psd * cth * phd * cph;
    const rd = -thdd * sph - thd * phd * cph + psdd * cth * cph - psd * thd * sth * cph - psd * cth * phd * sph;
    {
      const r00 = cps * cth, r01 = cps * sth * sph - sps * cph, r02 = cps * sth * cph + sps * sph;
      const r10 = sps * cth, r11 = sps * sth * sph + cps * cph, r12 = sps * sth * cph - cps * sph;
      L00 = cb * r00 - sbt * r10; L01 = cb * r01 - sbt * r11; L02 = cb * r02 - sbt * r12;
      L10 = sbt * r00 + cb * r10; L11 = sbt * r01 + cb * r11; L12 = sbt * r02 + cb * r12;
      L20 = -sth; L21 = cth * sph; L22 = cth * cph;
    }
    let ca, sa, ce, se;
    if (stab) {
      const bx = L00 * lx + L10 * ly + L20 * lz, by = L01 * lx + L11 * ly + L21 * lz, bz = L02 * lx + L12 * ly + L22 * lz;
      se = clamp(bz, -1, 1); ce = Math.sqrt(bx * bx + by * by); ca = bx / ce; sa = by / ce;
      e = Math.asin(se); a = Math.atan2(by, bx);
    } else { a = a0; e = e0; ca = ca0; sa = sa0; ce = ce0; se = se0; }
    // E eksenleri (gövdede) ve laboratuvarda
    const xBx = ca * ce, xBy = sa * ce, xBz = se;
    const yBx = -sa, yBy = ca;                          // yBz = 0
    const zBx = -ca * se, zBy = -sa * se, zBz = ce;
    const xLx = L00 * xBx + L01 * xBy + L02 * xBz, xLy = L10 * xBx + L11 * xBy + L12 * xBz, xLz = L20 * xBx + L21 * xBy + L22 * xBz;
    const yLx = L00 * yBx + L01 * yBy, yLy = L10 * yBx + L11 * yBy, yLz = L20 * yBx + L21 * yBy;
    const zLx = L00 * zBx + L01 * zBy + L02 * zBz, zLy = L10 * zBx + L11 * zBy + L12 * zBz, zLz = L20 * zBx + L21 * zBy + L22 * zBz;
    if (!stab) { lx = xLx; ly = xLy; lz = xLz; }
    // taban eylemsiz hızı (gövde) ve A çerçevesi
    const oBx = p + (L00 * OmL[0] + L10 * OmL[1] + L20 * OmL[2]);
    const oBy = q + (L01 * OmL[0] + L11 * OmL[1] + L21 * OmL[2]);
    const oBz = r + (L02 * OmL[0] + L12 * OmL[1] + L22 * OmL[2]);
    const oAx = ca * oBx + sa * oBy, oAy = -sa * oBx + ca * oBy, oAz = oBz;
    let Oez, Oex;
    if (stab) { Oez = -oAx * se + Oaz * ce; Oex = oAx * ce + Oaz * se; }
    else { Oey = oAy; Oaz = oAz; Oez = -oAx * se + oAz * ce; Oex = oAx * ce + oAz * se; }
    const wE = Oey - oAy, wA = Oaz - oAz;             // bağıl hızlar (+y_E, +z_A etrafında)
    const etaE = -(e - e0); let etaA = a - a0; if (etaA > Math.PI) etaA -= TAU; else if (etaA < -Math.PI) etaA += TAU;
    // ----------------------------------------------- 3) LOS hatası ----------
    const lzr = lx * zr[0] + ly * zr[1] + lz * zr[2], lyr = lx * yr[0] + ly * yr[1] + lz * yr[2], lxr = lx * xr[0] + ly * xr[1] + lz * xr[2];
    const elR = Math.asin(clamp(lzr, -1, 1)), xelR = Math.atan2(lyr, lxr);
    const rot = Math.atan2(yLx * zr[0] + yLy * zr[1] + yLz * zr[2], yLx * yr[0] + yLy * yr[1] + yLz * yr[2]);
    // ----------------------------------------------- 4) doğrusal ivme ------
    // gimbal merkezinde (gövde): ötelenme + doğrudan + α×r + ω×(ω×r)
    const wxr0 = q * rpg[2] - r * rpg[1], wxr1 = r * rpg[0] - p * rpg[2], wxr2 = p * rpg[1] - q * rpg[0];
    const aBx = trO[0].a + accv[0] + accmL * accmv[0] + (qd * rpg[2] - rd * rpg[1]) + (q * wxr2 - r * wxr1);
    const aBy = trO[1].a + accv[1] + accmL * accmv[1] + (rd * rpg[0] - pd * rpg[2]) + (r * wxr0 - p * wxr2);
    const aBz = trO[2].a + accv[2] + accmL * accmv[2] + (pd * rpg[1] - qd * rpg[0]) + (p * wxr1 - q * wxr0);
    const aLx = L00 * aBx + L01 * aBy + L02 * aBz, aLy = L10 * aBx + L11 * aBy + L12 * aBz, aLz = L20 * aBx + L21 * aBy + L22 * aBz;
    const fLz = aLz + G0;
    const fEx = xLx * aLx + xLy * aLy + xLz * fLz, fEy = yLx * aLx + yLy * aLy + yLz * fLz, fEz = zLx * aLx + zLy * aLy + zLz * fLz;
    // ----------------------------------------------- 5) gyro + kontrol ------
    if (stab) {
      const gyT = Oey + epsE * Oex, gzT = Oez + epsX * Oex;
      gFy += kgy * (gyT - gFy); gFz += kgy * (gzT - gFz);
      if (k % m === 0) {
        gMy = sf * gFy + b0Y + gmY.step() + nStd * rG.gauss();
        gMz = sf * gFz + b0Z + gmZ.step() + nStd * rG.gauss();
        // FOG ekleri (v11)
        const gaY = Math.abs(gFy), gaZ = Math.abs(gFz); if (gaY > gMaxY) gMaxY = gaY; if (gaZ > gMaxZ) gMaxZ = gaZ;
        if (fogNL) { gMy += k3 * gFy * gFy * gFy - bNL * gFy; gMz += k3 * gFz * gFz * gFz - bNL * gFz; }
        if (kgR !== 0) { gMy += kgR * (fEy - fEy0); gMz += kgR * (fEz - fEz0); }
        if (gMy > FSr) { gMy = FSr; gSat++; } else if (gMy < -FSr) { gMy = -FSr; gSat++; }
        if (gMz > FSr) { gMz = FSr; gSat++; } else if (gMz < -FSr) { gMz = -FSr; gSat++; }
        if (lsbR > 0) { gMy = lsbR * Math.round(gMy / lsbR); gMz = lsbR * Math.round(gMz / lsbR); }
        if (latY) {
          latY[latI % latN] = gMy; latZ[latI % latN] = gMz;
          const lq = latI - nLat, lq0 = Math.floor(lq), lfr = lq - lq0;
          if (lq0 >= 0) { const a0i = lq0 % latN, a1i = (lq0 + 1) % latN; gMy = latY[a0i] + lfr * (latY[a1i] - latY[a0i]); gMz = latZ[a0i] + lfr * (latZ[a1i] - latZ[a0i]); }
          else { gMy = latY[0]; gMz = latZ[0]; }
          latI++;
        }
        let cy = 0, cz = 0;
        if (comp) { cy = yLx * OmH[0] + yLy * OmH[1] + yLz * OmH[2]; cz = zLx * OmH[0] + zLy * OmH[1] + zLz * OmH[2]; }
        // izleyici ve dönüş komutları
        wCmdY = 0; wCmdZ = slewRate(t);
        if (TR) {
          while (trQ.length && trQ[0].t <= t) {
            const q0 = trQ.shift();
            const gateR = TR.gate_px * IFOV;
            const lostNow = !q0.valid || Math.abs(q0.el) > gateR || Math.abs(q0.xel) > gateR;
            if (lostNow && !trLostState) trLost++;
            trLostState = lostNow;
            if (lostNow) continue;                      // kilit yokken son komut korunur
            trErrE = q0.el; trErrX = q0.xel;
            trIy += trErrE * Tf; trIz += trErrX * Tf;
            trWy = trK * (trErrE + trWi * trIy); trWz = -trK * (trErrX + trWi * trIz);
          }
          wCmdY += trWy; wCmdZ += trWz;
        }
        if (resTrack && t >= nextRT) {
          const fr = resTrack(t);
          if (inBand(fr)) { const nb = bqBP(fr, fctl, 1 / (2 * res.zeta)); rbE.setCoef(nb); rbA.setCoef(nb); resGt = 1; } else resGt = 0;
          nextRT = t + 0.05;
        }
        if (resOn) resG += kResG * (resGt - resG);
        // yükseklik: PII + (rezonans) + AGF ; çıkış bir kontrol periyodu gecikmeli
        {
          const err = wCmdY - (gMy - cy);
          I1e += err * dtc; const u1 = err + wie * I1e; I2e += u1 * dtc; let u2 = u1 + wie * I2e;
          if (resOn) u2 += gr * resG * rbE.step(u2);
          const u3 = lpE.step(u2);
          if (ffOn && ffHys > 0) { if (wEf > ffHys) sgE = 1; else if (wEf < -ffHys) sgE = -1; if (wAf > ffHys) sgA = 1; else if (wAf < -ffHys) sgA = -1; }
          let T = Ke * u3 + (ffOn ? (ffLu ? FF.eta * obsE.s0 * zhE : FF.eta * obsE.Fc * (ffHys > 0 ? sgE : Math.tanh(wEf / FF.w_ff))) : 0);
          if (T > EL.Tmax) { T = EL.Tmax; I2e -= u1 * dtc; satCount++; } else if (T < -EL.Tmax) { T = -EL.Tmax; I2e -= u1 * dtc; satCount++; }
          TappE = TnextE; TnextE = T;
        }
        {
          const err = wCmdZ - (gMz - cz);
          I1a += err * dtc; const u1 = err + wia * I1a; I2a += u1 * dtc; let u2 = u1 + wia * I2a;
          if (resOn) u2 += gr * resG * rbA.step(u2);
          const u3 = lpA.step(u2);
          let T = Ka * u3 / (CT.secant ? Math.max(ce, 0.1) : 1) + (ffOn ? (ffLu ? FF.eta * obsA.s0 * zhA : FF.eta * obsA.Fc * (ffHys > 0 ? sgA : Math.tanh(wAf / FF.w_ff))) : 0);
          if (T > AZ.Tmax) { T = AZ.Tmax; I2a -= u1 * dtc; satCount++; } else if (T < -AZ.Tmax) { T = -AZ.Tmax; I2a -= u1 * dtc; satCount++; }
          TappA = TnextA; TnextA = T;
        }
      }
      // akım döngüsü (birinci derece, ZOH girişte tam); adım boyunca etkiyen tork, adım başı ve sonu değerlerinin
      // ortalamasıdır (adım sonu değerini kullanmak Δt/2 faz öncülü üretir; V&V D1)
      const TmE0 = TmE, TmA0 = TmA;
      TmE += kcur * (TappE - TmE); TmA += kcur * (TappA - TmA);
      const TmEa = 0.5 * (TmE + TmE0), TmAa = 0.5 * (TmA + TmA0);
      if (ffOn) {
        wEf += kff * (wE - wEf); wAf += kff * (wA - wAf);
        if (ffLu) {   // LuGre gözlemcisi: kestirilen bağıl hızla kıl modeli (Canudas de Wit ve ark. 1995); v13.10: gözlemcinin kendi parametreleri
          const gE = obsE.Fc + (obsE.Fs - obsE.Fc) * Math.exp(-sq(wEf / obsE.ws));
          if (Math.abs(wEf) > 1e-15) { const zs = (wEf > 0 ? 1 : -1) * gE / obsE.s0; zhE = zs + (zhE - zs) * Math.exp(-obsE.s0 * Math.abs(wEf) * dt / gE); }
          const gA = obsA.Fc + (obsA.Fs - obsA.Fc) * Math.exp(-sq(wAf / obsA.ws));
          if (Math.abs(wAf) > 1e-15) { const zs = (wAf > 0 ? 1 : -1) * gA / obsA.s0; zhA = zs + (zhA - zs) * Math.exp(-obsA.s0 * Math.abs(wAf) * dt / gA); }
        }
      }
      // sürtünme (LuGre, tam z güncellemesi)
      let FfE = 0, FfA = 0;
      if (fricE) {
        const gE = fricE.Fc + (fricE.Fs - fricE.Fc) * Math.exp(-sq(wE / fricE.ws));
        if (Math.abs(wE) > 1e-15) { const zs = (wE > 0 ? 1 : -1) * gE / fricE.s0; zE = zs + (zE - zs) * Math.exp(-fricE.s0 * Math.abs(wE) * dt / gE); }
        FfE = fricE.s0 * zE;
        const gA = fricA.Fc + (fricA.Fs - fricA.Fc) * Math.exp(-sq(wA / fricA.ws));
        if (Math.abs(wA) > 1e-15) { const zs = (wA > 0 ? 1 : -1) * gA / fricA.s0; zA = zs + (zA - zs) * Math.exp(-fricA.s0 * Math.abs(wA) * dt / gA); }
        FfA = fricA.s0 * zA;
      }
      const TiE = -(Ue[2] * fEx - Ue[0] * fEz);
      const fBx = L00 * aLx + L10 * aLy + L20 * fLz, fBy = L01 * aLx + L11 * aLy + L21 * fLz;
      const fAx = ca * fBx + sa * fBy, fAy = -sa * fBx + ca * fBy;
      const UAx = Ua[0] + ce * Ue[0] - se * Ue[2], UAy = Ua[1] + Ue[1];
      const TiA = -(UAx * fAy - UAy * fAx);
      const TtE = TmEa - FfE - be * wE - ke * etaE - cogAe * Math.sin(EL.cogN * etaE) + TiE;
      const TtA = TmAa - FfA - ba * wA - ka * etaA - cogAa * Math.sin(AZ.cogN * etaA) + TiA;
      const Jaz = AZ.Ja + AZ.Jex * se * se + AZ.Jez * ce * ce;
      const Oey0 = Oey, Oaz0 = Oaz;
      Oey += TtE / Je * dt; Oaz += TtA / Jaz * dt;
      // LOS yönünü laboratuvara göre döndür (yalnız y_E, z_E bileşenleri). Adım içinde tork sabit → hız doğrusal:
      // açı, adımın ortalama hızıyla (yamuk) ilerletilir; bu, tork → açı yolunu ZOH için tam yapar (açık Euler'in
      // ωΔt/2 faz öncülünü giderir; V&V D1)
      const OeyM = 0.5 * (Oey + Oey0), OazM = 0.5 * (Oaz + Oaz0);
      const OezN = -oAx * se + OazM * ce;
      const wy = OeyM - (yLx * OmL[0] + yLy * OmL[1] + yLz * OmL[2]);
      const wz = OezN - (zLx * OmL[0] + zLy * OmL[1] + zLz * OmL[2]);
      lx += dt * (wz * yLx - wy * zLx); ly += dt * (wz * yLy - wy * zLy); lz += dt * (wz * yLz - wy * zLz);
      const nl = 1 / Math.sqrt(lx * lx + ly * ly + lz * lz); lx *= nl; ly *= nl; lz *= nl;
      if (doDr) {
        // döngü düşük frekansta (g − c) = 0 tutar: y_E, z_E eksenlerinde LOS'un laboratuvara göre hızına dünya dönüşü
        // artığı (Ω̂ − Ω)·{y_E, z_E} ve gyro bias'ı −b girer (θ/n → −1/s). Görüntü eksenlerine izdüşüm, yukarıdaki
        // LOS güncellemesiyle aynı: δl = Δt·(w_z·y_E − w_y·z_E); el ≈ δl·z_r, xel ≈ δl·y_r
        const ey = yLx * dOm[0] + yLy * dOm[1] + yLz * dOm[2], ez = zLx * dOm[0] + zLy * dOm[1] + zLz * dOm[2];
        const by = -(b0Y + gmY.v), bz = -(b0Z + gmZ.v);
        const yz = yLx * zr[0] + yLy * zr[1] + yLz * zr[2], zz = zLx * zr[0] + zLy * zr[1] + zLz * zr[2];
        const yy = yLx * yr[0] + yLy * yr[1] + yLz * yr[2], zy = zLx * yr[0] + zLy * yr[1] + zLz * yr[2];
        drEe += dt * (ez * yz - ey * zz); drEx += dt * (ez * yy - ey * zy);
        drBe += dt * (bz * yz - by * zz); drBx += dt * (bz * yy - by * zy);
      }
      const ae = Math.abs(wE), aa = Math.abs(wA); if (ae > maxRelE) maxRelE = ae; if (aa > maxRelA) maxRelA = aa;
    }
    // ----------------------------------------------- 6) esnek/optik modlar --
    const aEyB = -sa * pd + ca * qd, aEzB = -ca * se * pd - sa * se * qd + ce * rd;   // taban açısal ivmesi E'de
    gimY.step(gGim * aEyB); gimZ.step(gGim * aEzB);
    // optik alt montaj, yapıya etkiyen özgül kuvvetle (ivme − yerçekimi; eşdeğerlik ilkesi) yüklenir. Nominal statik
    // sarkma boresight'a gömülüdür; yalnız değişimi LOS'a girer (ör. LOS etrafında dönmede yerçekimi yönü döner).
    optY.step(gOpt * (fEy - fEy0)); optZ.step(gOpt * (fEz - fEz0));
    let cEl = 0, cXel = 0;
    if (cAmp > 0) {
      cEl = cAmp * (oscS[0] + CL.h2 * oscS[1] + CL.h3 * oscS[2]);
      cXel = 0.7 * cAmp * (oscS[3] + CL.h2 * oscS[4] + CL.h3 * oscS[5]);
      for (let j = 0; j < 6; j++) { const c0 = oscC[j], s0 = oscS[j]; oscC[j] = c0 * oscCd[j] - s0 * oscSd[j]; oscS[j] = s0 * oscCd[j] + c0 * oscSd[j]; }
      if ((k & 4095) === 0) for (let j = 0; j < 6; j++) { const nn = 1 / Math.hypot(oscC[j], oscS[j]); oscC[j] *= nn; oscS[j] *= nn; }
    }
    const mechEl = elR - gimY.x, mechXel = xelR + gimZ.x;
    const optEl = mechEl + optZ.x + cEl, optXel = mechXel + optY.x + cXel;
    // türetme artığı
    rotBuf[k % rotBufN] = rot;
    const rotDel = rotBuf[(k + 1) % rotBufN];
    const rotRes = derotOn ? rot - (1 + DR.sf) * rotDel : rot;
    // ----------------------------------------------- 7) ölçüm zinciri -------
    if (parK !== 0) {
      const ux = trO[0].x - parV[0], uy = trO[1].x - parV[1], uz = trO[2].x - parV[2];
      const dx = cb * ux - sbt * uy + L00 * parV[0] + L01 * parV[1] + L02 * parV[2];
      const dy = sbt * ux + cb * uy + L10 * parV[0] + L11 * parV[1] + L12 * parV[2];
      const dz = uz + L20 * parV[0] + L21 * parV[1] + L22 * parV[2];
      parE = -parK * (dx * zr[0] + dy * zr[1] + dz * zr[2]); parX = -parK * (dx * yr[0] + dy * yr[1] + dz * yr[2]);
    }
    const tgE = (airE ? airE(t) : 0) + floorK * phdd + parE, tgX = (airX ? airX(t) : 0) + floorK * psdd + parX;
    const relEl = optEl - tgE, relXel = optXel - tgX;
    if (doVideo && fi < nF) {
      if (t >= fStart && t < fEnd) {
        s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel; stt += t;
        oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++;
      } else if (t >= fEnd) {
        if (fn > 0) {
          const me = s1e / fn, mx = s1x / fn;
          V.t[fi] = stt / fn + vidLat; V.mEl[fi] = me; V.mXel[fi] = mx;
          V.vEl[fi] = Math.max(0, s2e / fn - me * me); V.vXel[fi] = Math.max(0, s2x / fn - mx * mx);
          V.oEl[fi] = Math.hypot(oce, ose) / fn; V.oXel[fi] = Math.hypot(ocx, osx) / fn;
          // odak düzlemi: piksel, distorsiyon, piksel kilitlenmesi, centroid gürültüsü
          const xp = mx / IFOVt + x0, yp = me / IFOVt + y0;
          const rr2 = (xp * xp + yp * yp) / rRef2, dd = 1 + k1 * rr2;
          const xd = xp * dd, yd = yp * dd;
          const ok = Math.abs(xd) < Nh / 2 - edge && Math.abs(yd) < Nv / 2 - edge;
          V.valid[fi] = ok ? 1 : 0; if (!ok) { invalid++; if (firstInvalidT == null) firstInvalidT = V.t[fi]; }
          V.x[fi] = xd + plA * Math.sin(TAU * xd) + cNoise * rM.gauss();
          V.y[fi] = yd + plA * Math.sin(TAU * yd) + cNoise * rM.gauss();
          if (TR) trQ.push({ t: fEnd + TR.lat_frames * Tf, valid: ok, el: (V.y[fi] - y0) * IFOV, xel: (V.x[fi] - x0) * IFOV });
          fi++; V.n = fi;
        }
        fStart = tOff + fi * Tf; fEnd = fStart + Tint;
        s1e = s2e = s1x = s2x = oce = ose = ocx = osx = 0; fn = 0; stt = 0;
        if (t >= fStart && t < fEnd) { s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel; stt += t;
          oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++; }
      }
    }
    if (doRoi && ri < nRoi) {
      if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rst += t; rn++; }
      else if (t >= rEnd) {
        if (rn > 0) { RO.t[ri] = rst / rn; RO.el[ri] = rsE / rn + roiNoise * rM.gauss(); RO.xel[ri] = rsX / rn + roiNoise * rM.gauss(); ri++; RO.n = ri; }
        rStart = ri / roiF; rEnd = rStart + TroiInt; rsE = rsX = 0; rn = 0; rst = 0;
        if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rst += t; rn++; }
      }
    }
    // IMU: 500 Hz AGF + senkron gecikmesi
    const bfR = imuLP[0].step(imuA && anyImu ? ph + imuA * rI.gauss() : ph), bfP = imuLP[1].step(imuA && anyImu ? th + imuA * rI.gauss() : th), bfY = imuLP[2].step(imuA && anyImu ? ps + imuA * rI.gauss() : ps);
    imuBuf[0][k % imuBufN] = bfR; imuBuf[1][k % imuBufN] = bfP; imuBuf[2][k % imuBufN] = bfY;
    // ----------------------------------------------- 8) kayıt ---------------
    if (k % recEvery === 0 && ir < nRec) {
      if (r_opt_el) r_opt_el[ir] = optEl;
      if (r_opt_xel) r_opt_xel[ir] = optXel;
      if (r_mech_el) r_mech_el[ir] = mechEl;
      if (r_mech_xel) r_mech_xel[ir] = mechXel;
      if (r_rel_el) r_rel_el[ir] = relEl;
      if (r_rel_xel) r_rel_xel[ir] = relXel;
      if (r_ac_el) r_ac_el[ir] = mechEl + (airAE ? airAE(t) : 0) + acN * rM.gauss();
      if (r_ac_xel) r_ac_xel[ir] = mechXel + (airAX ? airAX(t) : 0) + acN * rM.gauss();
      if (r_base_r) r_base_r[ir] = ph;
      if (r_base_p) r_base_p[ir] = th;
      if (r_base_y) r_base_y[ir] = ps;
      if (anyImu) {
        const kd = k - imuDel, k0 = Math.floor(kd), fr = kd - k0;
        for (let i = 0; i < 3; i++) {
          const b = imuBuf[i], v0 = b[((k0 % imuBufN) + imuBufN) % imuBufN], v1 = b[(((k0 + 1) % imuBufN) + imuBufN) % imuBufN];
          const gI = rM.gauss(), v = (k0 < 0 ? 0 : v0 + (v1 - v0) * fr) + imuN * gI;      // gI 'asd' kipinde kullanılmaz (rM akışı korunur)
          if (i === 0) { if (r_imu_r) r_imu_r[ir] = v; } else if (i === 1) { if (r_imu_p) r_imu_p[ir] = v; } else if (r_imu_y) r_imu_y[ir] = v;
        }
      }
      if (r_cmd_r) r_cmd_r[ir] = cmdv[0];
      if (r_cmd_p) r_cmd_p[ir] = cmdv[1];
      if (r_cmd_y) r_cmd_y[ir] = cmdv[2];
      if (r_enc_a) r_enc_a[ir] = etaA;
      if (r_enc_e) r_enc_e[ir] = e - e0;
      if (r_gyr_y) r_gyr_y[ir] = gMy;
      if (r_gyr_z) r_gyr_z[ir] = gMz;
      if (r_rot) r_rot[ir] = rot;
      if (r_rot_res) r_rot_res[ir] = rotRes;
      if (r_tq_e) r_tq_e[ir] = TmE;
      if (r_tq_a) r_tq_a[ir] = TmA;
      if (r_w_e) r_w_e[ir] = wE;
      if (r_w_a) r_w_a[ir] = wA;
      if (r_acc_e) r_acc_e[ir] = fEx;      // LOS boyunca özgül kuvvet (bilgi)
      if (r_acc_y) r_acc_y[ir] = aBy;
      if (r_trk_el) r_trk_el[ir] = trErrE;
      if (r_tr_x) r_tr_x[ir] = trO[0].x;
      if (r_tr_y) r_tr_y[ir] = trO[1].x;
      if (r_tr_z) r_tr_z[ir] = trO[2].x;
      if (r_par_el) r_par_el[ir] = parE;
      if (r_par_xel) r_par_xel[ir] = parX;
      if (doDr) { if (r_dre_el) r_dre_el[ir] = drEe; if (r_dre_xel) r_dre_xel[ir] = drEx; if (r_drb_el) r_drb_el[ir] = drBe; if (r_drb_xel) r_drb_xel[ir] = drBx; }
      ir++;
    }
    if (onProg && k % prog === 0) onProg(k / N);
  }
  for (const c of Object.keys(rec)) if (rec[c].length !== ir) rec[c] = rec[c].slice(0, ir);    // ayrılmış ama yazılmamış son örnek kalmasın
  if (RUNLOG) RUNLOG.push({ label: S.label, T: S.T, stab, comp, isLab, frames: V.n, invalid, firstInvalidT, tracker: !!TR, slew: !!S.slew });
  return {
    S, meta: { fs, T: S.T, N, fRec, nRec: ir, dt, IFOV, IFOVt, Tint, fps, a0, e0, beta, comp, stab, isLab,
      K: { el: Ke, az: Ka }, earthImg: d.earthImg, OmH, los0 },
    rec, video: V, roi: RO,
    stats: { satCount, invalidFrames: invalid, firstInvalidT, maxRelE, maxRelA, trackLost: trLost, gyroSat: gSat, gyroMax: Math.max(gMaxY, gMaxZ) },
  };
}
let RUNLOG = null;          // runTest süresince her koşunun geçerlilik özeti
function runSim(P, S, onProgress) { return simIter(P, S, onProgress); }
