// ============================================================================
// 07_budget.js — analitik jitter bütçesi (kapalı biçim), ölçüm belirsizliği ve TUR, dünya dönüşü, hexapod erişimi.
// Formüller Yöntem sekmesinde; V&V W grubu bağımsız ikinci bir uygulamayla doğrular.
// ============================================================================
// v13.8 (§8): gyro eksen kaçıklığı yalnız LOS ekseni etrafındaki baz dönmesini el/xel gyrolarına sızdırır (el/xel'deki hız
// döngüyle sıfırlanır): B1-04 = ε·σ_rot. Yatay LOS'ta σ_rot² = (cos a0·σ_roll)² + (sin a0·σ_pitch)² (serbestlik dereceleri bağımsız;
// axisMap ağırlıkları); yanal bakışta pitch, pruvaya bakışta roll. 'roll' tabanı v13.7'ye kadarki tanımdır (uyum kipi).
function epsRotInfo(P) {
  const sa = seaDOF(P).ang, basis = (P.wb.H && P.wb.H.epsBasis) || 'los';
  if (basis === 'roll') return { basis, sigma: sa[0].Aeq * D2R / Math.SQRT2, f: sa[0].fdom, dom: 'roll', wR: 1, wP: 0 };
  const wR = axisMap(P, 0).rotW, wP = axisMap(P, 1).rotW, cr = wR * sa[0].sigma, cp = wP * sa[1].sigma;
  const domR = Math.abs(cr) >= Math.abs(cp);
  return { basis, sigma: Math.hypot(cr, cp), f: domR ? sa[0].fdom : sa[1].fdom, dom: domR ? 'roll' : 'pitch', wR, wP };
}
// v13.9 (§8 K2): rastgele yürüyüş satırlarının wander metriği ('window' varsayılan; 'tau' = v13.8'e kadar ve uyum kipi)
function rwWindow(P) { return ((P.wb.H && P.wb.H.rwMetric) || 'window') !== 'tau'; }
function budgetRows(P) {
  const wb = P.wb, d = derive(P), H = wb.H, tau = wb.tau, AL = budgetAlloc(P), hS = seaDrrAssume(P);
  // deniz: eşdeğer sinüs genliği (Aeq = √2·σ) ve baskın frekans; 'dar' kipinde girilen eşdeğer sinüs genliği
  const SD = seaDOF(P), sa = SD.ang, ER = epsRotInfo(P), losB = ER.basis !== 'roll';
  const E96 = H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(tau);               // ARW·√τ (µrad)
  // v13.9 (§8 K2): wander penceresi metriği — T_w penceresinde en küçük kareler doğrusu çıkarılmış Wiener sürecinin beklenen RMS'i
  // σ·√(T_w/15) (ortalama çıkarılmış: σ·√(T_w/6)); sabit hız (bias, b0, kompanzasyon artığı) doğrusal trendle tamamen çıkar
  const rwWin = rwWindow(P), Tw = P.ana.Tw, E96w = H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(Tw / 15);
  const E99 = H.bias * Math.PI / 180 / 3600 * 1e6 * tau;                       // B·τ (µrad)
  const E103 = losB ? H.eps_mrad * 1e-3 * Math.SQRT2 * ER.sigma * 1e6          // ε·θ_rot (µrad genlik; RMS ε·σ_rot)
                    : H.eps_mrad * 1e-3 * sa[0].Aeq * Math.PI / 180 * 1e6;     // v13.7'ye kadar: ε·θ_roll
  const E107 = H.roll_res_mrad * 1e-3 * d.rot.ang * 1e6;                       // ölçüt noktasının (köşe ya da kenar) yer değiştirmesi (µrad RMS); kenar = FOVh/2 (v10)
  const s = wb.sea, v = wb.viv, VS = vivSpec(P), ship = VS.kind === 'wind';
  // B2-01: denizaltında hidrodinamik VIV; gemide rüzgâr kaynaklı girdap kopmasının direk modu
  // (EN 1991-1-4 yaklaşım 1, açısal genlik; H = bütçe varsayımı DRR). Gemide B2-02 (dalga çarpması) yoktur.
  const b201 = ship
    ? { id: 'B2-01', band: 'B2', name: 'Direk modu / rüzgâr girdap kopması (VIV) artığı' + (VS.present ? '' : (VS.on ? ' — işletme zarfında kilitlenme yok' : ' — rüzgâr VIV kapalı')), E: VS.present ? VS.A * R2D : 0, F: '° genlik', G: VS.f, H: VS.H, L: 'E', M: '', Q: AL['B2-01'], S: 'T2.1, T2.2, T2.3' }
    : { id: 'B2-01', band: 'B2', name: 'Mast eğilme modu / VIV artığı' + (v.on === false ? ' — VIV kapalı' : (VS.present ? '' : ' — işletme hız zarfında kilitlenme yok')), E: VS.present ? v.amp_deg : 0, F: '° genlik', G: v.fn, H: VS.H, L: 'E', M: '', Q: AL['B2-01'], S: 'T2.1, T2.2, T2.3' };
  const b202 = ship
    ? { id: 'B2-02', band: 'B2', name: 'Dalga çarpması (geçici) — gemi direğinde yok', E: 0, F: 'µrad RMS', G: 5, H: 0, L: 'E', M: '', Q: AL['B2-02'], S: 'T2.4' }
    : { id: 'B2-02', band: 'B2', name: 'Dalga çarpması (geçici)', E: 2, F: 'µrad RMS', G: 5, H: 0, L: 'E', M: '', Q: AL['B2-02'], S: 'T2.4' };
  // ek satırlar (v11, Q = 0: tahsis proje kararıdır): deniz ötelemesi ivmesi (6-DOF + kaldıraç kolu);
  // FOG: kalibrasyon sonrası sabit bias artığı + sıcaklık kayması (B1-06 gibi τ penceresinde), g-duyarlılığı × ivme
  const ext = [];
  if (wb.extRows !== false) {
    // B1-08 frekansı: ivme terimlerinin varyansla ağırlıklı RMS frekansı (v13.1; önceden 6-DOF'ta heave, dar kipte pitch merkezi);
    // B1-10: her ivme terimi kendi baskın frekansında integre edilir, terimler karesel toplanır (accInt)
    const acc = seaAccDirector(P), DPH = Math.PI / 180 / 3600, fa = acc.fa > 0 ? acc.fa : (SD.six ? SD.lin[2].fdom : sa[1].fdom);
    ext.push({ id: 'B1-08', band: 'B1', name: 'Deniz ötelemesi ivmesi (heave/surge/sway + kaldıraç kolu)' + (acc.eff > 0 ? '' : ' — profilde öteleme yok'), E: H.accSens * acc.eff, F: 'µrad RMS', G: fa, H: 0, L: 'E', M: '', Q: 0, S: 'T2.5', ext: true });
    ext.push({ id: 'B1-09', band: 'B1', name: 'Gyro sabit bias artığı + sıcaklık kayması (τ penceresinde' + (rwWin ? '; yalnız drift)' : ')'), E: (H.b0_res + Math.abs(H.tc_bias * H.dT)) * DPH * 1e6 * tau, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: rwWin ? 'D' : 'E', M: '', Q: 0, S: 'T0.7, T4.2', ext: true });
    ext.push({ id: 'B1-10', band: 'B1', name: 'Gyro g-duyarlılığı × deniz ivmesi', E: H.kg * DPH * acc.accInt / G0 * 1e6, F: 'µrad RMS', G: fa, H: 0, L: 'E', M: '', Q: 0, S: 'T2.5', ext: true });
  }
  const out = [
    { id: 'B1-01', band: 'B1', name: 'Baz roll artığı (deniz durumu)', E: sa[0].Aeq, F: '° genlik', G: sa[0].fdom, H: hS, L: 'E', M: 'G1', Q: AL['B1-01'], S: 'T1.1, T1.3' },
    { id: 'B1-02', band: 'B1', name: 'Baz pitch artığı (deniz durumu)', E: sa[1].Aeq, F: '° genlik', G: sa[1].fdom, H: hS, L: 'E', M: '', Q: AL['B1-02'], S: 'T1.1, T1.3' },
    { id: 'B1-03', band: 'B1', name: 'Baz yaw artığı (rota / yalpalama)', E: sa[2].Aeq, F: '° genlik', G: sa[2].fdom, H: hS, L: 'E', M: '', Q: AL['B1-03'], S: 'T1.1, T1.4' },
    { id: 'B1-04', band: 'B1', name: losB ? `Gyro eksen kaçıklığı × LOS ekseni etrafındaki baz dönmesi (${ER.dom})` : 'Gyro eksen kaçıklığı × baz hareketi', E: E103, F: 'µrad genlik', G: ER.f, H: 0, L: 'E', M: 'G1', Q: AL['B1-04'], S: 'T1.1' },
    rwWin ? { id: 'B1-05', band: 'B1', name: `Gyro ARW (${Tw} s wander penceresinde, doğrusal trend çıkarılmış)`, E: E96w, F: 'µrad RMS', G: 1 / Tw, H: 0, L: 'E', M: '', Q: AL['B1-05'], S: 'T0.6, T0.2' }
          : { id: 'B1-05', band: 'B1', name: 'Gyro ARW (τ penceresinde)', E: E96, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: 'E', M: '', Q: AL['B1-05'], S: 'T0.6, T0.2' },
    { id: 'B1-06', band: 'B1', name: 'Gyro bias kararsızlığı (τ penceresinde' + (rwWin ? '; yalnız drift)' : ')'), E: E99, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: rwWin ? 'D' : 'E', M: '', Q: AL['B1-06'], S: 'T0.6' },
    { id: 'B1-07', band: 'B1', name: 'Sürtünme / hız işaret değişimi', E: 3, F: 'µrad RMS', G: 0.25, H: 0, L: 'E', M: '', Q: AL['B1-07'], S: 'T1.6' },
    b201,
    b202,
    { id: 'B2-03', band: 'B2', name: 'Doğrusal ivme × gimbal kütle dengesizliği', E: 2, F: 'µrad RMS', G: 8, H: 0, L: 'E', M: '', Q: AL['B2-03'], S: 'T2.5' },
    { id: 'B2-04', band: 'B2', name: 'Kablo / keçe torku dalgalanması', E: 1.5, F: 'µrad RMS', G: 2, H: 0, L: 'E', M: '', Q: AL['B2-04'], S: 'T1.6, T2.1' },
    { id: 'B2-05', band: 'B2', name: 'Gyro gürültüsü (kapalı döngü bandında)', E: 0.5, F: 'µrad RMS', G: 10, H: 0, L: 'E', M: '', Q: AL['B2-05'], S: 'T0.2, T0.6' },
    { id: 'B2-06', band: 'B2', name: 'Platform çevresel titreşimi — yapı yolu', E: 2, F: 'µrad RMS', G: 15, H: 0, L: 'E', M: '', Q: AL['B2-06'], S: 'T3.1' },
    { id: 'B3-01', band: 'B3', name: 'Yardımcı makine titreşimi — yapı yolu', E: 3, F: 'µrad RMS', G: 50, H: 0, L: 'E', M: '', Q: AL['B3-01'], S: 'T3.1, T3.3' },
    { id: 'B3-02', band: 'B3', name: 'Kriyo-soğutucu mikrofoniği', E: 1.5, F: 'µrad RMS', G: 60, H: 0, L: 'E', M: '', Q: AL['B3-02'], S: 'T3.4' },
    { id: 'B3-03', band: 'B3', name: 'Optik alt montaj modları', E: 2, F: 'µrad RMS', G: 120, H: 0, L: 'E', M: '', Q: AL['B3-03'], S: 'T3.5' },
    { id: 'B3-04', band: 'B3', name: 'Gimbal yapısal rezonansı artığı', E: 1.5, F: 'µrad RMS', G: 180, H: 0, L: 'E', M: '', Q: AL['B3-04'], S: 'T2.1, T3.3' },
    { id: 'R-01', band: 'B1', name: 'Görüntü rotasyonu — ' + (d.rot.ref === 'corner' ? 'alan köşesi' : 'alan kenarı'), E: E107, F: 'µrad RMS', G: ER.f, H: 0, L: 'H', M: '', Q: wb.k_roll * d.IFOV * 1e6, S: 'T1.5' },
  ];
  // ek satırlar B1 bandının sonuna (B1-07'nin ardına) yerleşir
  if (ext.length) out.splice(out.findIndex(r => r.id === 'B1-07') + 1, 0, ...ext);
  return out;
}
// deniz frekansında DRR varsayımı (dB): B1-01…B1-03'ün analitik tahmini σ·10^(H/20); örnek DUT'un döngüsünden bağımsız bir
// bütçe varsayımıdır (varsayılan −80 dB)
function seaDrrAssume(P) { const v = P.wb.H.drrSea_dB; return v != null && isFinite(v) ? v : -80; }
// Deniz hareketinin bastırılması (B1-01…B1-03): gerekli DRR = 20·log10(tahsis/σ), bütçe varsayımı ve örnek DUT'un analitik
// döngü modeli. LOS eksenine izdüşüm axisMap ile (yanal bakışta roll → el, yaw → xel, pitch → LOS ekseni etrafında, yani
// görüntü rotasyonu). Spektrum ağırlıklı artık: σ·√(∫S|DRR|²df / ∫S df), deniz biçimi S (dar: log-Gauss, 6-DOF: bant).
function seaDrrInfo(P) {
  const d = derive(P), SD = seaDOF(P), AL = budgetAlloc(P), hS = seaDrrAssume(P), ids = ['B1-01', 'B1-02', 'B1-03'];
  return SD.ang.map((q, ax) => {
    const m = axisMap(P, ax), loop = m.los === 'el' ? d.loopEl : (m.los === 'xel' ? d.loopAz : null), al = AL[ids[ax]] * 1e-6;
    let dom = NaN, wres = NaN;
    if (loop && q.active) {
      dom = db(cabs(loop.drr(TAU * q.fdom)));
      let s0 = 0, s1 = 0;
      for (let f = q.fdom / 20; f <= q.fdom * 20; f *= 1.01) { const w = q.shape(f) * f; s0 += w; s1 += w * sq(cabs(loop.drr(TAU * f))); }
      wres = s0 > 0 ? q.sigma * Math.sqrt(s1 / s0) : NaN;
    }
    return { key: q.key, row: ids[ax], los: m.los, f: q.fdom, sigma: q.sigma, active: q.active, alloc: al,
      req: q.active ? 20 * Math.log10(al / q.sigma) : NaN, assume: hS, est: q.sigma * Math.pow(10, hS / 20), dom, wres };
  });
}
// measured: {id: µrad RMS} — doldurulursa "Kullanılan" (K) ölçülen değere geçer
function computeBudget(P, measured, opt) {
  opt = opt || {};
  const wb = P.wb, d = derive(P), T = d.Tint, ff = d.fps, IF = d.IFOV * 1e6;
  const rows = budgetRows(P).map(r => Object.assign({}, r));
  const eis = wb.eis, srcOff = { 'B2-01': !sourceActive(P, 'viv'), 'B2-02': !sourceActive(P, 'slap') };
  for (const r of rows) {
    const base = r.F === '° genlik' ? r.E * Math.PI / 180 * 1e6 / Math.SQRT2 : r.F === 'µrad genlik' ? r.E / Math.SQRT2 : r.F === '° RMS' ? r.E * Math.PI / 180 * 1e6 : r.E;
    r.I = base * Math.pow(10, r.H / 20);
    // kaynağı bu platformda olmayan satıra (VIV kapalı; gemide dalga çarpması) ölçüm aktarılmaz
    r.J = measured && measured[r.id] != null && isFinite(measured[r.id]) && !srcOff[r.id] ? measured[r.id] : null;
    r.K = r.J != null ? r.J : r.I;
    r.N = r.G <= 0 ? 1 : sq(Math.sin(Math.PI * r.G * T) / (Math.PI * r.G * T));
    r.O = r.K * Math.sqrt(r.N); r.Pp = r.K * Math.sqrt(Math.max(0, 1 - r.N));
    r.status = (r.J != null ? 'Ölçüm: ' : 'Tahmin: ') + (r.Q <= 0 ? 'tahsis yok' : (r.K <= r.Q ? 'OK' : 'AŞIM'));
    r.AA = r.Q * Math.sqrt(r.N); r.AB = r.Q * Math.sqrt(Math.max(0, 1 - r.N));
    r.AC = r.G <= 0 ? 0 : Math.abs(r.G - Math.round(r.G / ff) * ff);
    r.AD = r.AC <= 0 ? 1 : (eis.fc <= 0 ? 1 - eis.eta : Math.sqrt(1 + sq((1 - eis.eta) * r.AC / eis.fc)) / Math.sqrt(1 + sq(r.AC / eis.fc)));
    r.AE = r.O * r.AD; r.AG = r.AC <= 0 ? 1 : 1 - eis.eta; r.AH = r.O * r.AG;
  }
  // gruplu "etkin kare" sütunları (U, V, W, X, Y, Z, AF, AI)
  const grp = (key) => {
    const out = new Map();
    for (const r of rows) {
      if (r.L !== 'E') { r['_' + key] = 0; continue; }
      if (!r.M) { r['_' + key] = sq(r[key]); continue; }
      if (!out.has(r.M)) { const sum = rows.filter(q => q.M === r.M && q.L === 'E').reduce((s, q) => s + q[key], 0); out.set(r.M, true); r['_' + key] = sq(sum); }
      else r['_' + key] = 0;
    }
  };
  for (const k of ['O', 'Pp', 'K', 'Q', 'AA', 'AB', 'AE', 'AH']) grp(k);
  const sumB = (k, b) => Math.sqrt(rows.filter(r => !b || r.band === b).reduce((s, r) => s + r['_' + k], 0));
  const bands = {};
  for (const b of ['B1', 'B2', 'B3']) bands[b] = { wander: sumB('O', b), smear: sumB('Pp', b), los: sumB('K', b), alloc: sumB('Q', b) };
  const tot = { wander: sumB('O'), smear: sumB('Pp'), los: sumB('K'), alloc: sumB('Q') };
  const reqW = d.req.wander * 1e6, reqS = d.req.smear * 1e6;
  const E96 = wb.H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(wb.tau), E99 = wb.H.bias * Math.PI / 180 / 3600 * 1e6 * wb.tau;
  const E119 = wb.earth.Omega * 1e6 * wb.earth.delta_deg * D2R, E120 = E119 * wb.tau;
  // v11: FOG sabit bias artığı + sıcaklık kayması da τ penceresinde doğrusal kayma üretir (ek satır; uyum kipinde 0)
  const Eb0 = wb.extRows !== false ? (wb.H.b0_res + Math.abs(wb.H.tc_bias * wb.H.dT)) * Math.PI / 180 / 3600 * 1e6 * wb.tau : 0;
  const reg = eis.reg_px * IF;
  const out = {
    rows, bands, tot,
    wander: tot.wander, smear: tot.smear, los: tot.los, reqW, reqS,
    wanderUse: tot.wander / reqW, smearUse: tot.smear / reqS,
    wanderPx: tot.wander / IF, smearPx: tot.smear / IF, radial: Math.SQRT2 * tot.wander, radialPx: Math.SQRT2 * tot.wander / IF,
    mtfNyq: Math.exp(-sq(Math.PI) * sq(tot.smear) / (2 * sq(IF))), mtfHalf: Math.exp(-sq(Math.PI) * sq(tot.smear) / (8 * sq(IF))),
    mtfReq: Math.exp(-sq(Math.PI) * sq(reqS) / (2 * sq(IF))),
    peak: wb.k_conf * tot.wander,
    drift: Math.sqrt(sq(E96) + sq(E99 + Eb0 + E120)), driftReq: d.req.drift * 1e6, E96, E99, E119, E120, Eb0,
    rwWin: rwWindow(P), E96w: wb.H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(P.ana.Tw / 15),
    eisWander: Math.sqrt(rows.reduce((s, r) => s + r._AE, 0) + sq(reg)),
    eisBand: Object.fromEntries(['B1', 'B2', 'B3'].map(b => [b, Math.sqrt(rows.filter(r => r.band === b).reduce((s, r) => s + r._AE, 0))])),
    eisLock: Math.sqrt(rows.reduce((s, r) => s + r._AH, 0) + sq(reg)),
    allocW: sumB('AA'), allocS: sumB('AB'),
    reqDRR: 20 * Math.log10(rows[0].Q / (seaDOF(P).ang[0].Aeq * Math.PI / 180 * 1e6 / Math.SQRT2)),
  };
  const top = rows.filter(r => r.L === 'E').reduce((a, r) => (r._AE > a._AE ? r : a), rows[0]);
  out.eisTop = top.id + (top.M ? ' (' + top.M + ')' : ''); out.eisTopShare = top._AE / sq(out.eisWander);
  return out;
}
// FOG parametrelerinin kapalı biçim etkileri (Model sekmesi paneli). Doğrudan stabilizasyonda gyro iç gimbaldedir: gemi
// hızını değil artık LOS hızını ölçer; ölçek hatası kazancı ölçekler (jitter'a etkisi ihmal edilebilir), dönüş ve izlemede
// pointing hatası üretir. Gecikme döngü faz payını, bias ve sıcaklık kayması drift'i, g-duyarlılığı ve kuantizasyon jitter'ı etkiler.
// Kübik ölçek doğrusalsızlığı modelinde (IEEE 952 tanımı: en küçük kareler doğrusundan en büyük sapma = S_nl·FS) ω hızında
// etkin ölçek hatası (ppm): S_f − 1,5·S_nl + 2,5·S_nl·(ω/FS)². Küçük hızlarda doğrusalsızlık −1,5·S_nl'lik bir ölçek hatası
// gibi davranır (en küçük kareler doğrusunun eğimi büyük hızlardaki kübik terimle belirlenir). ⟨ω²⟩ verilirse profil ortalaması.
function fogScaleEff(G, w2) {
  const FS = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R, nl = G.sfnl_ppm || 0;
  return (G.sf_ppm || 0) - 1.5 * nl + 2.5 * nl * (w2 || 0) / (FS * FS);
}
// yamuk hız profilinde (en büyük hız w, ivme a, açı θ; rad) ⟨ω²⟩ = ∫ω³dt / ∫ω dt
function slewW2(ang, rate, acc) {
  let tc = ang / rate - rate / acc, w = rate; if (tc < 0) { tc = 0; w = Math.sqrt(ang * acc); }
  return (w ** 4 / (2 * acc) + w ** 3 * tc) / ang;
}
function fogInfo(P) {
  const G = P.dut.gyro, d = derive(P), tau = P.wb.tau, ctl = P.dut.ctl;
  const P0 = cloneParams(P); P0.dut.gyro.lat_ms = 0; const d0 = derive(P0);
  const acc = seaAccDirector(P), sd = seaDOF(P), fa = acc.fa > 0 ? acc.fa : (sd.six ? sd.lin[2].fdom : sd.ang[1].fdom);
  const Tcal = G.Tcal != null ? G.Tcal : 20, slewRate = 30 * D2R, range = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R;
  // dönüş (T1.8 profili: 10° @ 30°/s, 200°/s²) etkin ölçek hatası; sıcaklıkla ölçek kayması (T_op − T_cal) eklenir
  const tcS = (G.tcSF || 0) * ((G.Top != null ? G.Top : Tcal) - Tcal), w2 = slewW2(10 * D2R, slewRate, 200 * D2R);
  const sfEff = (fogScaleEff(G, w2) + tcS) * 1e-6, sfWorst = (Math.abs(G.sf_ppm || 0) + Math.abs(tcS) + 1.5 * Math.abs(G.sfnl_ppm || 0)) * 1e-6;
  const dtc = 1 / ctl.fctl, lsbR = (G.lsb_dph || 0) * DEGPH;
  return {
    pm: { el: d.loopEl.pm, az: d.loopAz.pm, el0: d0.loopEl.pm, az0: d0.loopAz.pm, gmEl: d.loopEl.gm, gmEl0: d0.loopEl.gm, fcEl: d.loopEl.fcx, fcAz: d.loopAz.fcx },
    latPhase: { el: 360 * d.loopEl.fcx * (G.lat_ms || 0) * 1e-3, az: 360 * d.loopAz.fcx * (G.lat_ms || 0) * 1e-3 },
    slew: { s10: sfEff * 10 * D2R, s90: sfEff * 90 * D2R, w10: sfWorst * 10 * D2R, w90: sfWorst * 90 * D2R, eff: sfEff * 1e6, worst: sfWorst * 1e6, sf: G.sf_ppm || 0, nl: G.sfnl_ppm || 0, tcS },
    range: { range, slewRate, ok: slewRate < range },
    bias: { b0: G.bias0 * DEGPH * tau, tcCold: Math.abs((G.tcBias || 0) * (-20 - Tcal)) * DEGPH * tau, tcHot: Math.abs((G.tcBias || 0) * (55 - Tcal)) * DEGPH * tau },
    gsens: { rate: (G.kg || 0) * DEGPH * acc.eff / G0, angle: (G.kg || 0) * DEGPH * acc.accInt / G0, acc: acc.eff, f: fa },
    lsb: { lsbR, angleTau: lsbR / Math.sqrt(12) * Math.sqrt(dtc * tau) },
    bw: { fbw: G.fbw, phaseEl: Math.atan(d.loopEl.fcx / G.fbw) * R2D },
  };
}
function uncertaintySheet(P, raw) {
  const wb = P.wb, ti = turInfo(P), u = wb.unc;
  const fmax = wb.hex.fbw, dt = wb.chain.dt_sync_ms;
  const Tmin = u.Nper / u.fmin, Tseg = u.perSeg / u.fmin, nd = Math.max(1, Math.floor(2 * u.Trec / Tseg - 1));
  const r = raw == null ? u.rawExample : raw;
  return Object.assign(ti, {
    inflW: Math.sqrt(1 + sq(ti.uv / (derive(P).req.wander * 1e6))) - 1, inflS: Math.sqrt(1 + sq(ti.uh / (derive(P).req.smear * 1e6))) - 1,
    raw: r, corrected: Math.sqrt(Math.max(0, r * r - ti.uvAdd * ti.uvAdd)),     // v13.6: yalnız toplanır taban düşülür (U-05 çarpımsal)
    phase: 360 * fmax * dt / 1000, diffErr: 2 * Math.sin(Math.PI * fmax * dt / 1000),
    // v13.6: kompanzasyonsuz toplam gecikme = senkron kayması + IMU süzgecinin grup gecikmesi √2/(2π·f_IMU) (ikinci derece Butterworth)
    gd: Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw), phaseTot: 360 * fmax * (dt / 1000 + Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw)),
    diffErrTot: 2 * Math.sin(Math.PI * fmax * (dt / 1000 + Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw))),
    // v13.6: Welch (Hann, %50 örtüşme) ardışık segmentler ilişkili: ρ = 1/6 → varyans çarpanı 1 + 2ρ²(1 − 1/n_d) (Welch 1967; Harris 1978)
    Tmin, Tseg, df: 1 / Tseg, Trec: u.Trec, recOk: u.Trec >= Tmin, nd, epsR0: 1 / Math.sqrt(nd), epsR: Math.sqrt((1 + 2 / 36 * (1 - 1 / nd)) / nd), frames: u.Trec * derive(P).fps, coh: u.coh,
  });
}
function earthSheet(P) {
  const wb = P.wb, d = derive(P), E = wb.earth, phi = E.lat * D2R, ep = E.el * D2R, Om = E.Omega * 1e6;
  const comp = Om * E.delta_deg * D2R;
  // v13.7: hedefin alandan çıkışı benzetimin geçerlilik kuralıyla (|x_d| < N/2 − kenar payı)
  const eg = (P.ana && P.ana.edgeMargin_px) || 0;
  const exitT = (h, v) => Math.min(h > 0 ? (d.Nh / 2 - eg) * d.IFOV * 1e6 / h : 1e9, v > 0 ? (d.Nv / 2 - eg) * d.IFOV * 1e6 / v : 1e9);
  const tab = [];
  for (let a = 0; a < 360; a += 30) {
    const al = a * D2R;
    const h = Om * Math.abs(Math.sin(phi) * Math.cos(ep) - Math.cos(phi) * Math.cos(al) * Math.sin(ep)), v = Om * Math.abs(Math.cos(phi) * Math.sin(al)),
      r = Om * Math.abs(Math.cos(phi) * Math.cos(al) * Math.cos(ep) + Math.sin(phi) * Math.sin(ep));
    tab.push({ az: a, h, v, r, max: Math.max(h, v), px2: Math.max(h, v) * 120 / (d.IFOV * 1e6), pxRec: Math.max(h, v) * wb.unc.Trec / (d.IFOV * 1e6) });
  }
  const h = d.earthImg.h * 1e6, v = d.earthImg.v * 1e6;
  return { Om, vert: Om * Math.sin(phi), horiz: Om * Math.cos(phi), h, v, r: d.earthImg.r * 1e6, comp,
    off: { drift: Math.max(h, v) * wb.tau, exit: exitT(h, v), pxH: h * wb.unc.Trec / (d.IFOV * 1e6), pxV: v * wb.unc.Trec / (d.IFOV * 1e6), px2: Math.max(h, v) * 120 / (d.IFOV * 1e6) },
    on: { drift: comp * wb.tau, exit: exitT(comp, comp), pxH: comp * wb.unc.Trec / (d.IFOV * 1e6), px2: comp * 120 / (d.IFOV * 1e6) }, tab };
}
function hexReachTable(P) {
  const d = derive(P), freqs = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 50, 100];
  return freqs.map(f => ({ f, deg: d.reach(f), urad: d.reach(f) * D2R * 1e6, lim: d.reachLim(f), Ww: Ww(f, d.Tint),
    band: f > P.wb.hex.fbw ? 'f_bw ÜSTÜ' : (f > P.wb.hex.rel_ratio * P.wb.hex.fbw ? 'güvenilir bant üstü' : 'OK'), nyq: f > d.fps / 2 ? 'Nyquist üstü' : 'OK' }));
}
// İşletme ayrıştırması: her bütçe satırı için izole kaynak koşusu + tüm kaynaklar birlikte
function opDecomposition(P, o, prog) {
  o = o || {};
  const d = derive(P), T = o.T || 600, seed = o.seed == null ? 11 : o.seed;
  const losOn = !!(P.ana && P.ana.los && P.ana.los.on !== false);
  const rows = {}; let k = 0; const N = OP_ROWS.length + 1 + (losOn ? 1 : 0);
  let gyro = null;
  for (const row of OP_ROWS) {
    if (row.ext && P.wb.extRows === false) { k++; continue; }          // ek satırlar kapalı (v10 uyumu)
    if (row.same && rows[row.same]) { rows[row.id] = Object.assign({}, rows[row.same]); k++; continue; }
    // satırın kaynağı bu platformda yoksa (VIV kapalı / kilitlenme yok; gemide dalga çarpması) koşu gereksiz, katkı sıfır
    if (row.src.length && row.src.every(s => !sourceActive(P, s))) {
      rows[row.id] = { id: row.id, el: 0, xel: 0, wEl: 0, sEl: 0, wXel: 0, sXel: 0, pdeEl: 0, pdeXel: 0, hp1El: 0, hp1Xel: 0, rotRes: null, edge: NaN, p99El: 0, off: true }; k++; continue;
    }
    const R = runSim(P, rowScenario(P, row, { T, seed }), (p) => prog && prog((k + p) / N)); k++;
    const M = losMetrics(R, P, { skip: 20 });
    const rec = { id: row.id, el: M.rms.el, xel: M.rms.xel, wEl: M.video ? M.video.wander.el : NaN, sEl: M.video ? M.video.smear.el : NaN,
      wXel: M.video ? M.video.wander.xel : NaN, sXel: M.video ? M.video.smear.xel : NaN,
      pdeEl: M.video ? M.video.pde.el.rms : NaN, pdeXel: M.video ? M.video.pde.xel.rms : NaN, hp1El: M.band ? M.band.el.hp1 : NaN, hp1Xel: M.band ? M.band.xel.hp1 : NaN,
      rotRes: M.rotRes, edge: M.rotRes != null ? d.rot.of(M.rotRes) : NaN, p99El: M.p99 ? M.p99.el : NaN };
    if (losOn && M.psd) Object.assign(rec, losRowFields(P, M.psd));       // v12: proje bantları ve pozlama içi katkı (kaynak tablosu)
    rows[row.id] = rec;
    if (row.id === 'B1-01' || row.id === 'B1-04') rows[row.id]._series = Float64Array.from(R.rec.opt_el.subarray(20000));
  }
  // "bütçe karşılığı" (el ekseni): satır tanımına uygun metrik
  for (const id of Object.keys(rows)) {
    const r = rows[id];
    // v13.9: B1-05 wander penceresi metriğinde videonun wander'ıyla (T_w, doğrusal trend), B1-06 τ penceresinde (PDE) karşılaştırılır
    const w5 = id === 'B1-05' && rwWindow(P);
    r.cmp = w5 ? r.wEl : (id === 'B1-05' || id === 'B1-06' ? r.pdeEl : (id === 'B2-05' ? r.hp1El : (id === 'R-01' ? r.edge : (id === 'H7' ? r.pdeEl : r.el))));
    r.cmpXel = w5 ? r.wXel : (id === 'B1-05' || id === 'B1-06' || id === 'H7' ? r.pdeXel : (id === 'B2-05' ? r.hp1Xel : (id === 'R-01' ? NaN : r.xel)));
  }
  // G1 korelasyon katsayısı (aynı tohum, el ekseni)
  const a = rows['B1-01']._series, b = rows['B1-04']._series;
  let rho = NaN; if (a && b) { const n = Math.min(a.length, b.length); const da = detrend(a.subarray(0, n), 'linear'), dbb = detrend(b.subarray(0, n), 'linear'); let s = 0; for (let i = 0; i < n; i++) s += da[i] * dbb[i]; rho = s / (n * aRms(da) * aRms(dbb)); }
  delete rows['B1-01']._series; delete rows['B1-04']._series;
  // tüm kaynaklar birlikte
  const Rall = runSim(P, opScenario(P, { T, seed, fs: 4000, derot: true }), (p) => prog && prog((k + p) / N));
  const Mall = losMetrics(Rall, P, { skip: 20 });
  const pw = psdWeighting(Mall.psd.f, Mall.psd.el, d.Tint), pwx = psdWeighting(Mall.psd.f, Mall.psd.xel, d.Tint);
  // EIS (gerçek kare dizisine)
  const V = sliceVideo(Rall.video, 20), fsr = frameSeries(V, 'true'), perWin = Math.round(P.ana.Tw * V.fps), rng = new RNG(seedOf(P, 77));
  const eE = applyEIS(fsr.el, null, V.fps, P.wb.eis.fc, P.wb.eis.eta, P.wb.eis.reg_px * d.IFOV, rng);
  const eL = applyEIS(fsr.el, null, V.fps, 0, P.wb.eis.eta, P.wb.eis.reg_px * d.IFOV, rng);
  const all = { M: Mall, pw, pwx, eis: windowedWander(eE, null, perWin, P.ana.detrend).rms, eisLock: windowedWander(eL, null, perWin, P.ana.detrend).rms,
    rss: Math.sqrt(['B1-01', 'B1-02', 'B1-03', 'B1-04', 'B1-07', 'B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-06', 'B3-01', 'B3-02', 'B3-03', 'B3-04'].reduce((s, id) => s + sq(rows[id].el), 0) + sq(rows['B1-05'].el) + sq(rows['B1-06'].el)
      + (rows['B1-08'] ? sq(rows['B1-08'].el) : 0)) };   // v11: deniz ötelemesi satırı (uyum kipinde yok)
  // çizim verisi: PSD ve kümülatif
  const lp = logDecimPSD(Mall.psd.f, scaleArr(Mall.psd.el, 1e12), 160, 0.03), lpx = logDecimPSD(Mall.psd.f, scaleArr(Mall.psd.xel, 1e12), 160, 0.03);
  all.psdPlot = { el: lp, xel: lpx };
  const tr = Rall.rec.opt_el, n0 = 20000, nn = Rall.meta.nRec;
  const tt = [], yy = []; for (let i = n0; i < nn; i += 5) { tt.push(i / 1000); yy.push(tr[i] * 1e6); }
  all.tsPlot = decim(tt, detrend(yy, 'linear'), 3000);
  all.R = Rall;
  // v12: proje LOS kalıntı gereksinimleri — tüm kaynaklar birlikte, takip öncesi (yukarıdaki koşu) ve dış kamera takip
  // döngüsüyle (aynı tohum, ek koşu)
  let req = null;
  if (losOn) {
    const L = P.ana.los, lim = losLimits(P);
    const mPre = losReqMetrics(P, Rall.rec.opt_el, Rall.rec.opt_xel, Rall.meta.fRec, { skip: 20 });
    const tk = trkModel(P);
    req = { pre: losSummary(mPre), post: null, checksPre: losChecks(mPre, lim, L), checksPost: null, trkStable: tk.stable };
    if (tk.stable) {      // kararsız takip döngüsünde (faz payı ≤ 0) takip sonrası koşu anlamsızdır
      const St = opScenario(P, { T, seed, fs: 4000, derot: true }); St.tracker = { bw: L.trk.bw, lat_frames: L.trk.lat_frames, gate_px: L.trk.gate_px };
      const Rt = runSim(P, St, (p) => prog && prog((k + 1 + p) / N));
      const mPost = losReqMetrics(P, Rt.rec.opt_el, Rt.rec.opt_xel, Rt.meta.fRec, { skip: 20 });
      req.post = losSummary(mPost, { lost: (Rt.stats && Rt.stats.trackLost) || 0 }); req.checksPost = losChecks(mPost, lim, L);
    }
    // v13.17 (§14 K2 c): dalga çarpması seyrek geçişler üretir ve PPV / P99,73'ü belirler. Aynı tohumla, yalnız çarpma kapalı iki ek koşu
    // (takip öncesi / sonrası) bilgi olarak raporlanır; diğer kaynakların rastgele akışları aynıdır (kaynak başına ayrı üreteç). Pencere
    // dışlama uygulanamaz: λ·T_w = 0,1 · 60 = 6 olayda olaysız pencere olasılığı e^−6 ≈ %0,25.
    if (sourceActive(P, 'slap') && P.env.slap.A > 0 && o.noSlap !== false) {
      const brief = (m) => { const q = losSummary(m); return { sEl: q.sEl, sXel: q.sXel, sVec: q.sVec, ppEl: q.ppEl, ppXel: q.ppXel, rEl: q.rEl, rXel: q.rXel, p9973: q.p9973, gauss: q.gauss }; };
      const Sn = opScenario(P, { T, seed, fs: 4000, derot: true, src: { slap: false } });
      const Rn = runSim(P, Sn, null);
      req.noSlap = { pre: brief(losReqMetrics(P, Rn.rec.opt_el, Rn.rec.opt_xel, Rn.meta.fRec, { skip: 20 })), post: null };
      if (tk.stable) {
        const Sn2 = opScenario(P, { T, seed, fs: 4000, derot: true, src: { slap: false } }); Sn2.tracker = { bw: L.trk.bw, lat_frames: L.trk.lat_frames, gate_px: L.trk.gate_px };
        const Rn2 = runSim(P, Sn2, null);
        req.noSlap.post = brief(losReqMetrics(P, Rn2.rec.opt_el, Rn2.rec.opt_xel, Rn2.meta.fRec, { skip: 20 }));
      }
    }
  }
  return { rows, rho, all, T, seed, req };
}
