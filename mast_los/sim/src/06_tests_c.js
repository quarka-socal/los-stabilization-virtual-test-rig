// ============================================================================
// 06_tests_c.js — B2 (1–20 Hz), B3 (> 20 Hz) ve B4 (kalıcı etkiler) testleri
// ============================================================================
// Hidrodinamik VIV taraması: hıza göre f_v, K0 = f_v/f_n ve T2.2 aday frekansları
// v13.4: kolimatör uygunluğu — testlerin komut profillerinden göz bebeği kayması (Model paneli ve kılavuz §5; testler
// kendi koşularının senaryosuyla aynı hesabı yapar). Senaryolar testlerdekiyle aynı biçim ve tohumla kurulur; benzetim koşulmaz.
const COLLX_CACHE = new Map();
// v13.5 (kullanıcı kararı): T2.5 6-DOF öteleme segmentleri — 2 m/s², 2 ve 3 Hz (40 ve 60 periyot; önceden 1 ve 2 Hz, 30 ve 40)
const T25_FQ = [{ f: 2, a: 2, nper: 40 }, { f: 3, a: 2, nper: 60 }];
function collExcursions(P) {
  const key = JSON.stringify([P.wb, P.dut.geom, P.dut.L_pg, P.lab]);
  if (COLLX_CACHE.has(key)) return COLLX_CACHE.get(key);
  const d = derive(P), out = [], add = (id, label, S) => out.push(Object.assign(pupilExcursion(P, S), { id, label, qc: S.seaQc, e1: S.seaE1 }));
  // T0.1: stab OFF, ±%40 alan ızgarası (yaw ve roll adımları), pivot göz bebeğinde
  { const mapX = axisMap(P, 2), mapY = axisMap(P, 0), kR = [{ t: 0, v: 0 }], kY = [{ t: 0, v: 0 }]; let t = 2;
    for (const gy of [-0.4, 0.4]) for (const gx of [-0.4, 0.4]) { kR.push({ t, v: gy * d.FOVv * D2R / mapY.w }); kY.push({ t, v: gx * d.FOVh * D2R / mapX.w }); t += 6; }
    add('T0.1', 'ızgara ±%40 alan, stab OFF', labScenario(P, { T: t + 1, stab: false, cmd: [{ type: 'steps', axis: 0, knots: kR, trans: 1 }, { type: 'steps', axis: 2, knots: kY, trans: 1 }] })); }
  // T0.3: uç poz ±θ_test üç eksende, stab ON
  { const th = P.wb.hex.theta_test * D2R;
    for (const sg of [1, -1]) add('T0.3', `uç poz ${sg > 0 ? '+' : '−'}θ_test (${P.wb.hex.theta_test}°), stab ON`, labScenario(P, { T: 8, stab: true, cmd: [0, 1, 2].map(i => ({ type: 'steps', axis: i, knots: [{ t: 0, v: 0 }, { t: 1, v: sg * th }], trans: 4 })) })); }
  // T2.1: süpürme başı (1 Hz, erişim genliği), roll ve yaw ayrı, stab ON
  for (const ax of [0, 2]) add('T2.1', `${AXN[ax]} süpürmesi (1 Hz'de ${fmt(d.reach(1), 2)}°), stab ON`,
    labScenario(P, { T: 70, stab: true, cmd: [{ type: 'chirp', axis: ax, f0: 1, f1: Math.min(20, P.wb.hex.fbw), octPerMin: 1, ampFn: (f) => d.reach(f) * D2R, t0: 2, ramp: 2 }] }));
  // T2.2: VIV tonu (f_n, açısal + öteleme)
  { const VS = vivSpec(P); if (VS.present) { const tn = windTone(P, VS, VS.f, 1, 21, 2); add('T2.2', `VIV tonu ${fmt(VS.f, 2)} Hz${VS.lin ? ' (açısal + öteleme)' : ''}`, labScenario(P, { T: 23, stab: true, cmd: tn.cmd, trans: tn.trans })); } }
  // T1.3 ve T2.3: deniz profili (tohum 1301) + kaldıraç kolu / 6-DOF ötelemesi; T2.3'te VIV tonu
  add('T1.3', 'deniz profili + öteleme (tohum 1301)', seaLabScenario(P, { T: 620, seed: 1301 }));
  if (vivSpec(P).present) add('T2.3', 'deniz profili + VIV tonu', seaLabScenario(P, { T: 620, seed: 1301, viv: true }));
  // T2.5: öteleme segmentleri (T25_FQ: 2 ve 3 Hz, 2 m/s², strokla sınırlı), x / y / z
  if (P.wb.extRows !== false) for (let ax = 0; ax < 3; ax++) {
    const sgT = segSines(T25_FQ.map(q => ({ axis: ax, f: q.f, A: Math.min(q.a / sq(TAU * q.f), 0.9 * P.lab.hexStroke), nper: q.nper })));
    add('T2.5', 'öteleme ' + 'xyz'[ax] + ` (${T25_FQ.map(q => q.f).join(' ve ')} Hz, 2 m/s²)`, labScenario(P, { T: sgT.T, stab: true, cmd: [], trans: sgT.cmd }));
  }
  if (COLLX_CACHE.size > 6) COLLX_CACHE.clear();
  COLLX_CACHE.set(key, out);
  return out;
}
// v13.3: işletme hız zarfında VIV oluşmadığında test metni (T2.1–T2.3, T4.2)
function vivNoRiskTxt(P) {
  const v = P.wb.viv, rk = vivRisk(P), hi = isFinite(rk.hi) ? fmt(rk.hi, 2) : '∞';
  return `İşletme hız zarfında (${fmt(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${fmt(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn) riskli ya da sınırda hız yok: K0 ${fmt(rk.K0a, 2)}–${fmt(rk.K0b, 2)}, tarama bandı (paylı) ${fmt(rk.lo, 2)}–${hi}; VIV oluşmaz, B2-01 = 0.`;
}
// v13.3: hızlar işletme zarfından (U_min–U_max, kn; ızgara noktaları + uçlar; varsayılan 2–12 kn önceki tabloyla aynı);
// K0 üst sınırı kütle oranıyla ölçeklenir (vivMass; m* ≤ 0,54 → sınırsız)
function vivSpeeds(P) {
  const v = P.wb.viv, a = Math.min(v.Umin_kn, v.Umax_kn), b = Math.max(v.Umin_kn, v.Umax_kn), grid = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 25, 30];
  return Array.from(new Set(grid.filter(k => k >= a - 1e-9 && k <= b + 1e-9).concat([a, b]).map(k => Math.round(k * 100) / 100))).sort((x, y) => x - y);
}
function vivTable(P) {
  const v = P.wb.viv, hx = P.wb.hex, d = derive(P), speeds = vivSpeeds(P), M = vivMass(P), hiR = M.inf ? Infinity : M.k0hi;
  return speeds.map(kn => {
    const V = kn * 0.514444, Re = V * v.D / v.nu, fv = v.St * V / v.D, K0 = fv / v.fn, Ur = V / (v.fn * v.D);
    const scr = (K0 >= v.K0_lo && K0 <= hiR) ? 'TARAMA: RİSK' : ((K0 >= v.K0_lo * (1 - v.margin) && K0 <= hiR * (1 + v.margin)) ? 'Sınırda' : 'Düşük');
    const reach = Math.min(hx.theta_max, hx.omega_max / (TAU * fv), hx.alpha_max / sq(TAU * fv));
    return { kn, V, Re, fv, K0, Ur, scr, reWarn: v.section === 'Dairesel' && Re > v.Re_crit, reach, prod: reach >= v.amp_deg,
      band: fv > hx.fbw ? 'f_bw üstü' : (fv > hx.rel_ratio * hx.fbw ? 'Güvenilir bant üstü' : 'OK'), nyq: fv > d.fps / 2 ? 'Nyquist üstü' : 'OK', dwell: scr !== 'Düşük' };
  });
}
// Gemi direği: görünür rüzgâr hızına göre girdap kopma frekansı ve kilitlenme taraması (EN 1991-1-4 Ek E)
function windVivTable(P) {
  const W = P.wb.wviv, w = windVivCalc(P), hx = P.wb.hex;
  const us = Array.from(new Set([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40].concat([w.vcrit]).map(u => Math.round(u * 100) / 100))).sort((a, b) => a - b);
  return us.map(U => {
    const Re = U * W.D / W.nu, fs = W.St * U / W.D, r = U / w.vcrit;
    const lock = U >= w.lock[0] - 1e-9 && U <= w.lock[1] + 1e-9, env = U <= W.Umax;
    return { U, kn: U / 0.514444, Re, fs, r, lock, env, isCrit: Math.abs(U - Math.round(w.vcrit * 100) / 100) < 1e-9,
      regime: Re < 3e5 ? 'alt-kritik' : (Re < 5e5 ? 'kritik geçiş' : (Re <= 5e6 ? 'süperkritik' : 'transkritik')),
      scr: lock ? (env ? 'KİLİTLENME' : 'kilitlenme (zarf dışı)') : (r < 1 ? 'f_s < f_n' : 'f_s > f_n'),
      reach: Math.min(hx.theta_max, hx.omega_max / (TAU * W.fn), hx.alpha_max / sq(TAU * W.fn)) };
  });
}
// Etkin VIV kaynağının test bandı ve dwell adayları. Denizaltı: VIV taraması (hıza göre f_v adayları) ve f_n
// (kilitlenmede yanıt yapının kendi frekansındadır; v13.2: f_n aday listesinin dışında kalsa da banda girer — T2.2
// zaten f_n'de dwell yapar); gemi: havada kilitlenme yapının kendi modunda olur (f_v → f_n); bant, f_n'nin
// belirsizliğidir (±ftol: mesnet esnekliği, tepe kütlesi, sıcaklık)
function vivBand(P) {
  const VS = vivSpec(P);
  if (VS.kind === 'hydro') {
    const vt = vivTable(P).filter(r => r.dwell), fn = P.wb.viv.fn, fv = vt.map(r => r.fv), M = vivMass(P), rk = vivRisk(P);
    // v13.3: kütle oranıyla kilitlenmede alt dal frekansı f*_alt·f_n de adaydır (hafif mastta f_n'nin üstüne kayar);
    // yalnız zarfta erişilebiliyorsa (vivRisk.lock: en yüksek hızın f_v'si, paylı, f_n,vak'a ulaşıyor)
    const flock = rk.lock ? M.flock : null;
    const cand = Array.from(new Set(fv.concat([fn]).concat(flock ? [flock] : []))).sort((a, b) => a - b);
    let fLo = cand[0], fHi = cand[cand.length - 1];
    // tek aday (tarama riski yok, yalnız f_n): bant H1 çözünürlüğünün (≈ 0,12 Hz) en az iki katı genişlikte
    if (fHi - fLo < 0.25) { const fc = 0.5 * (fLo + fHi); fLo = fc - 0.125; fHi = fc + 0.125; }
    return { VS, fLo, fHi, cand, fv, nRisk: vt.length, flock, flockAll: M.flock, rk };
  }
  const t = P.wb.wviv.ftol;
  return { VS, fLo: VS.f * (1 - t), fHi: VS.f * (1 + t), cand: [VS.f * (1 - t), VS.f, VS.f * (1 + t)] };
}
// T2.1 — açısal sinüs süpürme (1 → 20 Hz, 1 oktav/dk), stab ON ve OFF
TESTS['T2.1'] = function (P, ctx, prog) {
  const d = derive(P), f0 = 1, f1 = Math.min(20, P.wb.hex.fbw), opm = 1;
  const runs = [], PX21 = []; let k = 0;
  const axes = [0, 2], resCfg = !!P.dut.ctl.res.on;
  const confs = resCfg ? [{ stab: true, feat: true }, { stab: true, feat: false }, { stab: false, feat: false }] : [{ stab: true, feat: false }, { stab: false, feat: false }];
  // Test tanımı: eksen başına 3 süpürme. Yapılandırılmış DUT (stab ON) 3 ardışık süpürmeyle koşulur ve H1 üçünün
  // üzerinden ortalanır; karşılaştırma koşuları (dar bant kapalı, stab OFF) tek süpürmedir.
  const nswOf = (cf) => (cf.stab && (cf.feat || !resCfg)) ? 3 : 1;
  const wTot = axes.length * confs.reduce((s, cf) => s + nswOf(cf), 0);
  let wDone = 0;
  for (const ax of axes) for (const cf of confs) {
    const stab = cf.stab, Pc = (resCfg && !cf.feat) ? cloneParams(P) : P;
    if (Pc !== P) Pc.dut.ctl.res.on = false;
    const ampFn = stab ? (f) => d.reach(f) * D2R : (f) => Math.min(d.reach(f), 0.9 * d.stabOffMax) * D2R;
    const nsw = nswOf(cf), Tsw = makeComponent({ type: 'chirp', axis: ax, f0, f1, octPerMin: opm, ampFn, t0: 0, ramp: 2 }, 1000, makeRngFactory(1)).T, gap = 4;
    const cmd = [], chs = [];
    for (let q = 0; q < nsw; q++) {
      const c = { type: 'chirp', axis: ax, f0, f1, octPerMin: opm, ampFn, t0: 2 + q * (Tsw + gap), ramp: 2 };
      cmd.push(c); chs.push(makeComponent(c, 1000, makeRngFactory(1)));
    }
    const T = 2 + nsw * (Tsw + gap) + 2;
    const S = labScenario(P, { label: 'T2.1', T, fs: 2000, stab, seed: 2100 + ax + (stab ? 0 : 10) + (cf.feat ? 0 : 20), cmd,
      resTrack: (t) => { for (const c of chs) { const fq = c.freqAt(t); if (fq) return fq; } return 0; },          // adaptif rezonans kontrolcü (açıksa) süpürmeyi izler
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y'] } });
    if (stab && (cf.feat || !resCfg)) PX21.push(Object.assign(pupilExcursion(P, S), { run: AXN[ax] + ' süpürmesi' }));     // v13.4: göz bebeği
    const R = runSim(Pc, S, (p) => prog && prog((wDone + p * nsw) / wTot)); k++; wDone += nsw;
    const map = axisMap(P, ax), imuCh = ['imu_r', 'imu_p', 'imu_y'][ax];
    // video: IMU'yu kare zamanlarına örnekle
    const v = videoAngles(R, ctx);
    const xin = sampleAt(R, imuCh, v.t), yv = map.los === 'el' ? v.el : v.xel;
    const hv = tfH1(xin, yv, R.video.fps, 512);
    const xa = Float64Array.from(R.rec[imuCh]), ya = Float64Array.from(R.rec[map.los === 'el' ? 'ac_el' : 'ac_xel']);
    const ha = tfH1(xa, ya, R.meta.fRec, 8192);
    runs.push({ ax, stab, feat: cf.feat, hv, ha, los: map.los, w: Math.abs(map.w), nsw });
  }
  // değerlendirme: VIV bandında (aday f_v; gemide f_n ± ftol) γ² ≥ eşik noktalarda DRR ≤ gerekli
  const VB = vivBand(P), VS = VB.VS, ship = VS.kind === 'wind', fLo = VB.fLo, fHi = VB.fHi;
  const req = db(budgetAlloc(P)['B2-01'] * 1e-6 / (VS.A / Math.SQRT2));
  const coh = P.wb.unc.coh;
  let ok = true, nvalid = 0, nlow = 0;
  const worst = { el: -Infinity, xel: -Infinity }, worstF = { el: NaN, xel: NaN };
  // koheransı düşük bant noktaları için üst sınır: |H1| ≤ √(S_yy/S_xx) (γ² ≤ 1); yalnız bantta geçerli
  // nokta hiç yoksa kullanılır (sürtünme harmonikleri ve izleyen dar bant kontrol koheransı düşürebilir)
  const worstB = { el: -Infinity, xel: -Infinity }, worstBF = { el: NaN, xel: NaN };
  const on = runs.filter(r => r.stab && (r.feat || !resCfg)), base = runs.filter(r => r.stab && !r.feat), resonances = [];
  for (const r of on) {
    const h = r.ha;
    for (let i = 0; i < h.f.length; i++) {
      const f = h.f[i]; if (f < fLo || f > fHi) continue;
      if (h.coh[i] < coh) { nlow++; const gb = db(Math.sqrt(h.Pyy[i] / h.Pxx[i]) / r.w); if (gb > worstB[r.los]) { worstB[r.los] = gb; worstBF[r.los] = f; } continue; }
      nvalid++;
      const g = db(h.mag[i] / r.w); if (g > worst[r.los]) { worst[r.los] = g; worstF[r.los] = f; }
      if (g > req && r.los === 'el') ok = false;
    }
  }
  const boundMode = nvalid === 0 && nlow > 0;              // bantta geçerli nokta yok → yalnız üst sınır
  if (boundMode) ok = worstB.el <= req;
  // rezonans tepeleri (1–20 Hz, ≥ 3 dB belirginlik) — dar bant özelliği kapalı taban döngüde aranır
  for (const r of base) {
    const h = r.ha, fs = [], gs = []; for (let i = 0; i < h.f.length; i++) if (h.f[i] >= 1 && h.f[i] <= 20 && h.coh[i] >= coh) { fs.push(h.f[i]); gs.push(db(h.mag[i] / r.w)); }
    for (let i = 2; i < gs.length - 2; i++) if (gs[i] > gs[i - 1] && gs[i] > gs[i + 1] && gs[i] - Math.min(gs[i - 2], gs[i + 2]) > 3) resonances.push({ ax: r.ax, f: fs[i], g: gs[i] });
  }
  ctx.res = resonances;
  const offG = runs.filter(r => !r.stab).map(r => { let s = 0, c = 0; for (let i = 0; i < r.ha.f.length; i++) if (r.ha.f[i] >= 1 && r.ha.f[i] <= 10 && r.ha.coh[i] > 0.9) { s += db(r.ha.mag[i] / r.w); c++; } return c ? s / c : NaN; });
  // VIV yoksa (kapalı ya da gemide işletme zarfında kilitlenme yok): bant kabulü yok; süpürme 1–20 Hz bastırmasını ve
  // rezonansları yine karakterize eder
  const vivOn = VS.present;
  const offTxt = ship ? (VS.on ? `Rüzgâr VIV'i işletme zarfında oluşmaz (v_crit = ${fmt(VS.w.vcrit, 1)} m/s > 1,25·U_max = ${fmt(1.25 * P.wb.wviv.Umax, 1)} m/s): bant kabulü uygulanmaz, değerler bilgi amaçlı. `
    : 'Rüzgâr VIV etkisi kapalı: bant kabulü uygulanmaz, değerler bilgi amaçlı. ') : (VS.on ? vivNoRiskTxt(P) + ' Bant kabulü uygulanmaz, değerler bilgi amaçlı. ' : 'VIV kapalı: VIV bandı kabulü uygulanmaz, değerler bilgi amaçlı. ');
  const ampLbl = ship ? fmt(VS.A * R2D, 3).replace('.', ',') : String(P.wb.viv.amp_deg).replace('.', ',');
  const noPts = nvalid === 0 && nlow === 0;
  const bandTxt = ship ? `Rüzgâr VIV bandında (f_n ± %${fmt(100 * P.wb.wviv.ftol, 0)}: ${fmt(fLo)}–${fmt(fHi)} Hz)` : `VIV bandında (${fmt(fLo)}–${fmt(fHi)} Hz${VB.nRisk === 0 ? '; taramada riskli hız yok, yalnız f_n çevresi' : ''})`;
  const fnV = VS.f, fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');
  const res = mkResult('T2.1', {
    status: !vivOn || noPts ? 'BİLGİ' : (boundMode ? (ok ? 'OK' : 'BİLGİ') : stat(ok)),
    measured: (vivOn ? '' : offTxt) + bandTxt + (boundMode
      ? ` γ² ≥ ${coh} nokta yok (${nlow} düşük koheranslı nokta); koherans üst sınırı: roll→el DRR ≤ ${fmt(worstB.el, 1)} dB @ ${fmt(worstBF.el, 2)} Hz (gerekli ${fmt(req, 1)} dB)${vivOn ? (ok ? ' → sınır gereksinimi sağlıyor' : ' → karar verilemez; bant kabulü T2.2 dwell\'iyle') : ''}; yaw→xel ≤ ${fmt(worstB.xel, 1)} dB (bilgi); ${resonances.length} rezonans adayı`
      : ` γ² ≥ ${coh} noktalarda en kötü DRR: roll→el ${fmt(worst.el, 1)} dB @ ${fmt(worstF.el, 2)} Hz (gerekli ${fmt(req, 1)} dB); yaw→xel ${fmt(worst.xel, 1)} dB (bilgi); ${resonances.length} rezonans adayı`),
    kv: [[`Gerekli DRR (B2-01: ${ampLbl}° → ${fA(budgetAlloc(P)['B2-01'])} µrad)`, vivOn ? fmt(req, 2) + ' dB' : '— (VIV yok)'], ['Geçerli nokta sayısı (γ² ≥ ' + coh + ')', String(nvalid) + (boundMode ? ` (bantta ${nlow} nokta eşiğin altında: üst sınır √(S_yy/S_xx) raporlandı)` : '')],
         ...(nlow > 0 && !boundMode ? [['Bantta koherans eşiğinin altında kalan nokta (karara girmez)', `${nlow}; üst sınır roll→el ≤ ${fmt(worstB.el, 1)} dB @ ${fmt(worstBF.el, 2)} Hz (koherans üst sınırı) — bu kısım T2.2 dwell'iyle doğrulanır`]] : []),
         ['Dar bant (adaptif rezonans) kontrol', P.dut.ctl.res.on ? `açık, ${P.dut.ctl.res.fmin}–${P.dut.ctl.res.fmax} Hz bandında süpürme frekansını izler (ideal frekans kestirimi)` : 'kapalı'],
         ['Stab OFF ortalama kazanç (1–10 Hz)', offG.map((g, i) => AXN[axes[i]] + ' ' + fmt(g, 2) + ' dB').join(', ')],
         ['Rezonans adayları', resonances.length ? resonances.map(r => `${AXN[r.ax]} ${fmt(r.f, 2)} Hz (${fmt(r.g, 1)} dB)`).join(', ') : 'yok (1–20 Hz)'],
         ['Süpürme', `${f0} → ${f1} Hz, ${opm} oktav/dk; stab ON genliği hexapod erişimi, stab OFF ≤ ${fmt(0.9 * d.stabOffMax, 2)}°; yapılandırılmış DUT eksen başına 3 süpürme (H1 üçünün ortalaması), karşılaştırma koşuları 1 süpürme`]],
    notes: [...(vivOn ? [] : [ship ? 'Gemi direğinde rüzgâr VIV\'i bu ayarlarla oluşmuyor; süpürme DUT\'un 1–20 Hz bozucu bastırmasını ve rezonans adaylarını (platform titreşimi, T3.1) yine karakterize eder.'
              : (VS.on ? 'İşletme hız zarfında VIV oluşmuyor' : 'VIV kapalı') + '; süpürme DUT\'un 1–20 Hz bozucu bastırmasını ve rezonans adaylarını (platform titreşimi, T3.1) yine karakterize eder.']),
            ...(boundMode ? ['Bantta koherans eşiğini geçen nokta kalmadı. Süpürme bu bandın üçte birindeyken sürtünmenin ürettiği 3. harmonik bu banda düşer; süpürmeyi izleyen dar bant kontrol temel bileşeni çok bastırdığı için bu girdiyle ilişkisiz içerik baskın olur ve γ² ≈ 0,7\'ye iner (aynı koşu sürtünmesiz ya da izlemesiz sabit dar bantla γ² ≈ 0,94–0,99 verir). Bu durumda yalnız üst sınır raporlanır: |H1| ≤ √(S_yy/S_xx). Sınır gereksinimin üstündeyse süpürme karar veremez; kabul T2.2\'nin durağan dwell\'iyle verilir.'] : []),
            ...(ship ? [`Gemi direği: havada kilitlenme, yapının kendi modunda (f_n = ${fmt(VS.f, 2)} Hz) olur; bant, f_n'nin belirsizliğidir (mesnet esnekliği, tepe kütlesi). Süpürme yalnız açısal yolu ölçer; direk tepesi ötelemesinin LOS'a etkisi (dengesizlik torku, optik montaj esnemesi) T2.2'nin açısal + öteleme dwell'inde ölçülür.`] : []),
            'H1 = S_xy/S_xx: girdi IMU, çıktı video (≤ 25 Hz) ve otokolimatör (≤ 500 Hz). Koherans eşiğinin altındaki noktalar raporlanmaz.',
            ship ? `Süpürme genliği hexapod erişimi kadar büyüktür (${fmt(VS.f, 1)} Hz'de ≈ ${fmt(d.reach(VS.f), 2)}°), rüzgâr VIV genliği ise ${ampLbl}°. Sürtünme genlikten bağımsız bir tork olduğu için küçük genlikte DRR kötüleşir: kabulü gerçek genlikteki dwell (T2.2) belirler.`
              : `Süpürme genliği hexapod erişimi kadar büyüktür (f_n = ${fcm(fnV, 1)} Hz'de ≈ ${fcm(d.reach(fnV), 2)}°), VIV genliği ise ${ampLbl}°. Sürtünme genlikten bağımsız bir tork olduğu için küçük genlikte DRR kötüleşir: kabulü gerçek genlikteki dwell (T2.2) belirler.`,
            ...(!ship ? [`Bant, taramanın aday f_v değerlerini${VB.flock ? ', ' : ' ve '}f_n'yi${VB.flock ? ` ve kütle oranının verdiği alt dal frekansını (m* = ${fcm(P.wb.viv.mstar, 2)}: f*·f_n = ${fcm(VB.flock, 2)} Hz)` : ''} kapsar: kilitlenmede yanıt yapının kendi modundadır, hafif mastta frekansı f_n'nin üstüne kayar${VB.nRisk === 0 ? '; taramada riskli ya da sınırda hız yok, bant yalnız f_n çevresidir' : ''}.` +
              (VB.flockAll && !VB.flock && VS.present ? ` Kütle oranının alt dal frekansı (f*·f_n = ${fcm(VB.flockAll, 2)} Hz) zarfta erişilmez: alt dala geçişte yanıt vakumdaki doğal frekanstan (f_n,vak = ${fcm(VB.rk.fvac, 2)} Hz) geçer, en yüksek hızdaki f_v ise payıyla ${fcm(VB.rk.fvMax * (1 + P.wb.viv.margin), 2)} Hz'dir; aday değildir.` : '')] : []),
            ...(!ship && VS.lin ? ['Süpürme yalnız açısal yolu ölçer; mast başı ötelemesinin LOS\'a etkisi (dengesizlik torku, optik montaj esnemesi) T2.2\'nin açısal + öteleme dwell\'inde ölçülür.'] : []),
            'f > video Nyquist bölgesinde yalnız yüksek hızlı kanal geçerlidir; f > f_bw/2\'de hexapod çıkışı komuttan sapar, bu yüzden girdi IMU\'dan alınır.'],
  });
  const ser = [];
  for (const r of runs) {
    if (r.ax !== 0 && !(r.stab && (r.feat || !resCfg))) continue;      // yaw: yalnız yapılandırılmış ON
    const h = r.ha, sel = []; for (let i = 0; i < h.f.length; i++) if (h.f[i] >= 0.8 && h.f[i] <= 22 && h.coh[i] >= coh) sel.push(i);
    const tag = r.stab ? (resCfg ? (r.feat ? 'ON' : 'ON, dar bant kapalı') : 'ON') : 'OFF';
    ser.push({ name: `${AXN[r.ax]}→${r.los} ${tag}`, x: Float32Array.from(sel.map(i => h.f[i])), y: Float32Array.from(sel.map(i => db(h.mag[i] / r.w))) });
  }
  const fa = logspace(1, 20, 60), RS = P.dut.ctl.res;
  const baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RS, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
  const mdl = (f) => {
    if (!RS.on) return baseL.drr(TAU * f);
    const fr = RS.adaptive ? f : RS.f;
    return (fr >= RS.fmin && fr <= RS.fmax) ? loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, fr).drr(TAU * f) : baseL.drr(TAU * f);
  };
  ser.push({ name: 'Model el (doğrusal)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(mdl(f))))) });
  res.plots.push({ title: 'H1 — bozucu bastırma (γ² ≥ eşik noktalar)', xLabel: 'Hz', yLabel: 'dB', xLog: true, series: ser, refLines: isFinite(req) ? [{ y: req, label: 'Gerekli DRR (B2-01)' }] : [] });
  const r0 = runs[0];
  res.plots.push({ title: 'Koherans (roll, stab ON)', xLabel: 'Hz', yLabel: 'γ²', xLog: true,
    series: [{ name: 'video', x: Float32Array.from(r0.hv.f.subarray(1)), y: Float32Array.from(r0.hv.coh.subarray(1)) }, { name: 'otokolimatör', x: Float32Array.from(r0.ha.f.subarray(1, 400)), y: Float32Array.from(r0.ha.coh.subarray(1, 400)) }],
    refLines: [{ y: coh, label: 'eşik' }] });
  // v13.4: göz bebeği ↔ kolimatör demeti (yapılandırılmış DUT, stab ON süpürmeleri; en büyük genlik süpürmenin başında, 1 Hz)
  if (PX21.length) { const W = PX21.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// T2.2 (açısal + öteleme tonu) — gemi direği (rüzgâr VIV) ve v13.3'ten beri denizaltı mastı (mast başı ötelemesi açıkken):
// modun LOS referans noktasında doğurduğu açısal hareket + aynı fazda öteleme (hexapod), VIV adaylarında ve T2.1
// rezonanslarında; dar bant kontrol OFF/ON. f_n'de yapılandırılmış DUT ayrıca yalnız açısal uyarımla koşulur: ötelemenin payı
// ayrılır. Denizaltı adayları: tarama f_v'leri, f_n ve kütle oranının alt dal frekansı f*·f_n; gemi: f_n ve f_n ± ftol.
function t22Tone(P, ctx, prog) {
  const VB = vivBand(P), VS = VB.VS, ship = VS.kind === 'wind', W = P.wb.wviv, v = P.wb.viv, w = VS.w;
  if (!VS.present) return mkResult('T2.2', { status: 'BİLGİ',
    measured: ship ? (VS.on ? `Rüzgâr VIV'i işletme zarfında oluşmaz: v_crit = ${fmt(w.vcrit, 1)} m/s > 1,25·U_max = ${fmt(1.25 * W.Umax, 1)} m/s (EN 1991-1-4 E.1.2(2)); dwell uygulanmaz, B2-01 = 0 ve bütçeye ölçüm aktarılmaz.`
      : 'Rüzgâr VIV etkisi kapalı: dwell uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.')
      : (VS.on ? vivNoRiskTxt(P) + ' Dwell uygulanmaz; bütçeye ölçüm aktarılmaz.' : 'VIV kapalı: VIV dwell testi uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.'),
    notes: [ship ? 'Model sekmesinde rüzgâr VIV\'i açıkken ve kritik hız işletme zarfının içindeyken test koşulur.'
      : 'Model sekmesinde VIV açıkken ve işletme hız zarfında riskli ya da sınırda hız varken test koşulur.'] });
  const freqs = Array.from(new Set(VB.cand.concat((ctx.res || []).map(r => r.f)).map(f => Math.round(f * 100) / 100))).sort((a, b) => a - b);
  const cfgOn = !!P.dut.ctl.res.on, out = [], nTot = 2 * freqs.length + 1;
  let k = 0;
  const dwell = (P2, f, lin, seed) => {
    const VSx = lin ? VS : Object.assign({}, VS, { lin: false });
    const ramp = Math.max(1.0, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core;
    const tn = windTone(P2, VSx, f, t0, t1, ramp);
    const seg = { axis: Math.abs(VS.roll) >= Math.abs(VS.pitch) ? 0 : 1, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f };
    const Sd = labScenario(P2, { label: 'T2.2', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed }), px = pupilExcursion(P2, Sd);   // v13.4: göz bebeği
    const R = runSim(P2, Sd, (p) => prog && prog((k + p) / nTot)); k++;
    const fit = fitSegments(P2, R, [seg], ctx)[0];
    const vEl = fit.fe ? fit.fe.A / Math.SQRT2 : NaN, vXel = fit.fx ? fit.fx.A / Math.SQRT2 : NaN;
    // yol ayrımı (T2.5 ile aynı): ayna (otokolimatör) = gimbal yolu (açısal artık + dengesizlik torku; gyro'nun gördüğü);
    // video − ayna (fazör farkı) = optik alt montaj esnemesi (gyro görmez, dar bant kontrol bastıramaz)
    const ph = (a, b) => (a && b) ? Math.hypot(a.a - b.a, a.b - b.b) / Math.SQRT2 : NaN;
    const mEl = fit.ae ? fit.ae.A / Math.SQRT2 : NaN, mXel = fit.ax ? fit.ax.A / Math.SQRT2 : NaN;
    return { f, A: tn.A, y: tn.y, acc: tn.acc, limited: tn.limited, vEl, vXel, vid: Math.max(vEl, vXel), tru: Math.max(fit.te.A, fit.tx.A) / Math.SQRT2,
      mEl, mXel, oEl: ph(fit.fe, fit.ae), oXel: ph(fit.fx, fit.ax), drr: drrOf(fit.fe, fit.fin), px,
      // v13.4: hexapod iletimi τ = θ_ölç / θ_komut (IMU sinüs uydurması, baskın eksen); artık gerçekleşen uyarımdadır
      tau: fit.fin && tn.A > 0 ? fit.fin.A / (tn.A * Math.abs(seg.axis === 0 ? VS.roll : VS.pitch)) : NaN };
  };
  for (const resOn of [false, true]) for (const f of freqs) {
    const P2 = cloneParams(P); P2.dut.ctl.res.on = resOn;
    out.push(Object.assign(dwell(P2, f, true, 2200 + k), { resOn }));
  }
  const angOnly = VS.lin ? dwell(P, VS.f, false, 2290) : null;
  const lim = budgetAlloc(P)['B2-01'] * 1e-6, cur = out.filter(o => o.resOn === cfgOn), worst = Math.max(...cur.map(o => o.vid));
  const ok = worst <= lim;
  const near = (o) => Math.abs(o.f - Math.round(VS.f * 100) / 100) < 0.006;
  const atFn = out.find(o => !o.resOn && near(o)), atFnOn = out.find(o => o.resOn && near(o)), atCfg = cfgOn ? atFnOn : atFn;
  const bAng = (o) => db(o.vid / (o.A / Math.SQRT2));
  // hexapod erişimi (θ/ω/α) ya da öteleme stroku VIV adaylarında uyarımı küçültüyorsa test tanımlandığı gibi üretilemez:
  // GEÇERSİZ (v13.2). Yalnız rezonans adayında sınırlıysa bilgi olarak işaretlenir.
  const candR = VB.cand.map(f => Math.round(f * 100) / 100), isCand = (o) => candR.some(c => Math.abs(c - o.f) < 0.006);
  const limC = out.filter(o => !o.resOn && o.limited && isCand(o)), limR = out.filter(o => !o.resOn && o.limited && !isCand(o));
  const RSc = P.dut.ctl.res, outBand = freqs.filter(f => f < RSc.fmin || f > RSc.fmax);
  // dar bant kontrol f_n'de artığı büyüttüyse (ör. yandan rüzgâr): yol ayrımıyla açıklanır
  const worse = atFnOn.vid > atFn.vid * 1.05, axW = atFnOn.vXel >= atFnOn.vEl ? 'Xel' : 'El';
  const pathTxt = (o) => `ayna el ${urad(o.mEl)} / xel ${urad(o.mXel)} · video − ayna el ${urad(o.oEl)} / xel ${urad(o.oXel)}`;
  const fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');
  // denizaltı: aday etiketi (f_n, alt dal), doğrusal model, bütçe tahmini (eski denizaltı dwell'iyle aynı bilgiler)
  const flockR = VB.flock ? Math.round(VB.flock * 100) / 100 : null;
  const tag = (f) => ship ? '' : (Math.abs(f - Math.round(VS.f * 100) / 100) < 0.006 ? ' (f_n)' : (flockR && Math.abs(f - flockR) < 0.006 ? ' (alt dal f*·f_n)' : ''));
  let subKv = [], subNotes = [];
  if (!ship) {
    const baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RSc, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
    const linFn = db(cabs(baseL.drr(TAU * v.fn))), est = VS.A / Math.SQRT2 * Math.pow(10, VS.H / 20), M = vivMass(P), rk = VS.risk;
    const drrOff = db(atFn.vid / (atFn.A / Math.SQRT2));
    subKv = [[`Doğrusal model (dar bant kapalı taban döngü) DRR @ f_n = ${v.fn} Hz`, `${fmt(linFn, 1)} dB; ölçülen (OFF, açısal + öteleme) ${fmt(drrOff, 1)} dB`],
      ['Uyarımın kaynağı (senaryo, denizaltı)', `θ = ${fmt(VS.A * R2D, 3)}° (f_n = ${fmt(v.fn, 2)} Hz) · mast başı ötelemesi y = θ·L/κ = ±${fmt(VS.y * 1e3, 2)} mm (L = ${v.L} m, κ = ${v.kth}), ${fmt(sq(TAU * v.fn) * VS.y, 3)} m/s²` +
        (M.on ? ` · kütle oranı m* = ${v.mstar}: ${M.inf ? 'm* ≤ 0,54, kilitlenme üst sınırı yok' : `f*_alt = ${fmt(M.fstar, 3)} → K0 üst ${fmt(M.k0hi, 2)}, alt dal ${fmt(M.flock, 2)} Hz` + (VB.flock ? '' : ` (zarfta erişilmez: en yüksek hızda f_v·(1 + pay) ${fmt(rk.fvMax * (1 + v.margin), 2)} Hz < f_n,vak ${fmt(rk.fvac, 2)} Hz; aday değil)`)}` : '') +
        ` · hız zarfı ${fmt(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${fmt(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn (K0 ${fmt(rk.K0a, 2)}–${fmt(rk.K0b, 2)})`],
      ['Eksenler', 'ileri harekette akış pruvadan: kuvvet ve öteleme y (iskele) yönünde, dönme roll (−x); açı ve öteleme aynı modda, aynı fazda']];
    subNotes = ['ON: uyarlanır dar bantlı (rezonans) kontrolcü, dwell frekansına ayarlı, +' + RSc.gain_dB + ' dB (çalışma bandı ' + RSc.fmin + '–' + RSc.fmax + ' Hz; dışında devreye girmez). Analitik bütçe tahmini yalnız açısal yolu içerir (' + fcm(VS.H, 0) + ' dB varsayımıyla ' + fcm(est * 1e6, 2) + ' µrad) ve B2-01 tahsisini (' + fA(lim * 1e6) + ' µrad) ' +
        (est <= lim ? 'aşmaz.' : 'aşar; ' + (atFnOn.vid <= lim ? 'f_n\'de bu açığı dar bant kontrol kapatır.' : (v.fn < RSc.fmin || v.fn > RSc.fmax ? 'f_n dar bant kontrolün çalışma bandının dışında olduğu için açık kapanmaz.' : 'dar bant kontrol de f_n\'de açığı kapatamıyor.'))),
      (isFinite(atFn.drr) && drrOff > linFn + 1 ? `Kapalıyken artık, doğrusal modelin verdiği ${fcm(linFn, 1)} dB'den (f_n = ${fcm(v.fn, 2)} Hz) kötüdür (ölçülen ${fcm(drrOff, 1)} dB): ${String(v.amp_deg).replace('.', ',')}° genlikte bağıl hız her periyotta iki kez sıfırdan geçer ve sürtünme geçişleri tonda temel bileşen üretir.`
        : `Kapalıyken ölçülen DRR (${fcm(drrOff, 1)} dB) doğrusal modele (${fcm(linFn, 1)} dB, f_n = ${fcm(v.fn, 2)} Hz) yakındır.`),
      'Bütçeye f_n\'deki ölçüm geçer (senaryo frekansı); kabul bütün VIV adaylarının en kötüsüyle verilir. Akış yönündeki titreşim (2·f_v, pitch + x) modellenmez.'];
  }
  // v13.4: hexapod iletimi — dwell frekanslarında en düşük τ; < 0,98 ise artık o oranda eksik ölçülür (bilgi; sonuç ölçeklenmez)
  const tauRows = out.filter(o => isFinite(o.tau)), tauMin = tauRows.length ? tauRows.reduce((a, b) => (b.tau < a.tau ? b : a)) : null;
  const tauRow = tauMin ? [['Hexapod iletimi τ = θ_ölç / θ_komut (IMU), dwell frekanslarında en düşük', `${fmt(tauMin.tau, 3)} @ ${fmt(tauMin.f, 2)} Hz (analitik 1/√(1 + (f/f_bw)⁴) = ${fmt(1 / Math.sqrt(1 + Math.pow(tauMin.f / P.wb.hex.fbw, 4)), 3)}; f_bw = ${P.wb.hex.fbw} Hz)` + (tauMin.tau < 0.98 ? ' — artık bu oranda eksik ölçülür' : '')]] : [];
  const tauNote = tauMin && tauMin.tau < 0.98 ? [`Hexapod ${fmt(tauMin.f, 2)} Hz'de komutun ancak %${fmt(100 * tauMin.tau, 1)}'ini iletiyor (f_bw = ${P.wb.hex.fbw} Hz): artık ve bütçeye geçen değer bu oranda eksiktir. Genliği IMU'ya göre eşitleyin (sürüş düzeltmesi) ya da sonucu 1/τ ile ölçekleyin.`] : [];
  const res = mkResult('T2.2', {
    status: limC.length ? 'GEÇERSİZ' : stat(ok), measured: (limC.length ? `Hexapod erişimi VIV uyarımını ${limC.map(o => fmt(o.f, 2)).join(', ')} Hz'de küçültüyor (θ/ω/α ya da öteleme stroku): sonuç GEÇERSİZ. ` : '') +
      `Tondaki artık (yapılandırılmış DUT, dar bant kontrol ${cfgOn ? 'ON' : 'OFF'}; el ve xel'in büyüğü): en kötü ${urad(worst)} µrad RMS (tahsis ${urad(lim, 1)}); f_n = ${fmt(VS.f, 2)} Hz'de OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad` +
      (angOnly ? `; yalnız açısal uyarımla ${urad(angOnly.vid)} µrad (öteleme payı)` : ''),
    kv: freqs.map(f => { const a = out.find(o => o.f === f && !o.resOn), b = out.find(o => o.f === f && o.resOn);
      return [`${fmt(f, 2)} Hz${tag(f)} · θ ${fmt(a.A * R2D, 3)}°${VS.lin ? ` · öteleme ±${fmt(a.y * 1e3, ship ? 1 : 2)} mm (${fmt(a.acc, 2)} m/s²)` : ''}${a.limited ? ' (hexapod erişimiyle sınırlı)' : ''}`,
        `OFF el ${urad(a.vEl)} / xel ${urad(a.vXel)} µrad · ON el ${urad(b.vEl)} / xel ${urad(b.vXel)} µrad (açısal DRR karşılığı ${fmt(bAng(b), 1)} dB)`]; })
      .concat(angOnly ? [[`${fmt(VS.f, 2)} Hz, yalnız açısal (öteleme yok), yapılandırılmış DUT`, `el ${urad(angOnly.vEl)} / xel ${urad(angOnly.vXel)} µrad → öteleme yolu karesel ${urad(Math.sqrt(Math.max(0, sq(atCfg.vid) - sq(angOnly.vid))))} µrad`]] : [])
      .concat([[`${fmt(VS.f, 2)} Hz yol ayrımı (µrad RMS): ayna = gimbal yolu (açısal artık + dengesizlik torku), video − ayna = optik alt montaj`, `OFF: ${pathTxt(atFn)} → ON: ${pathTxt(atFnOn)}`],
               ['Dar bant kontrol çalışma bandı', `${RSc.fmin}–${RSc.fmax} Hz: ${outBand.length ? 'bandın DIŞINDAKİ dwell frekansları ' + outBand.map(f => fmt(f, 2)).join(', ') + ' Hz (ON = OFF)' : 'bütün dwell frekansları bant içinde'}`]])
      .concat(ship ? [['Uyarımın kaynağı (EN 1991-1-4 Ek E, yaklaşım 1)', `v_crit = ${fmt(w.vcrit, 2)} m/s (${fmt(w.vcrit / 0.514444, 1)} kn), Re = ${fmt(w.Re / 1e5, 2)}·10⁵ (${w.regime}), c_lat = ${fmt(w.clat, 3)}, Sc = ${fmt(w.Sc, 1)}, K_W = ${fmt(w.Kw, 3)} → y_F = ${fmt(w.yF * 1e3, 2)} mm, θ = κ·y/l = ${fmt(w.thCalc * R2D, 4)}°${w.meas ? ` (Model: ölçülmüş genlik ${W.amp_deg}° kullanıldı)` : ''}`],
               ['Rüzgâr yönü ve eksenler', `β = ${W.beta}° (pruvadan): dönme roll ${fmt(VS.roll, 2)} · pitch ${fmt(VS.pitch, 2)}; öteleme x ${fmt(VS.tx, 2)} · y ${fmt(VS.ty, 2)}${VS.lin ? '' : ' (öteleme kapalı)'}`]] : subKv).concat(tauRow),
    notes: [ship ? 'Rüzgâr kuvvetinin kendisi değil, direk modunun direktör tabanında doğurduğu hareket yeniden üretilir: hexapod açısal sinüs + aynı fazda öteleme. Laboratuvarda sonsuzdaki hedefin görüntüsü ötelemeyle kaymaz; öteleme LOS\'a gimbal kütle dengesizliği torku ve optik alt montajın esnemesiyle girer.'
              : 'Hidrodinamik kuvvet değil, mast modunun mast başında doğurduğu hareket yeniden üretilir: hexapod roll sinüsü + aynı fazda y ötelemesi (konsol mast: y = θ·L/κ). Laboratuvarda sonsuzdaki hedefin görüntüsü ötelemeyle kaymaz; öteleme LOS\'a gimbal kütle dengesizliği torku ve optik alt montajın esnemesiyle girer.',
            ship ? 'Dwell frekansları f_n ve f_n ± ' + fmt(100 * W.ftol, 0) + ' % (direk modunun belirsizliği) ile T2.1\'in rezonans adaylarıdır; her frekansta 60 s. ON: uyarlanır dar bant (rezonans) kontrolcü dwell frekansına ayarlı (çalışma bandı ' + P.dut.ctl.res.fmin + '–' + P.dut.ctl.res.fmax + ' Hz; dışında devreye girmez).'
              : 'Dwell frekansları VIV taramasının adayları (f_v), f_n' + (VB.flock ? ', kütle oranının verdiği alt dal frekansı f*·f_n = ' + fcm(VB.flock, 2) + ' Hz' : '') + ' ve T2.1\'in rezonans adaylarıdır; her frekansta 60 s.',
            ship ? 'Artık, LOS\'un el ve xel bileşenlerinin büyüğüdür: rüzgâr yönüne göre direk iki eksende de salınabilir. "Açısal DRR karşılığı" yalnız bilgi amaçlıdır; öteleme yolunun katkısını da içerir.'
              : 'Artık, LOS\'un el ve xel bileşenlerinin büyüğüdür. "Açısal DRR karşılığı" yalnız bilgi amaçlıdır; öteleme yolunun katkısını da içerir.',
            'Yol ayrımı (T2.5 ile aynı yöntem): referans aynası (otokolimatör) gimbalın mekanik açısını, yani gyro\'nun algıladığı yolu (açısal artık + dengesizlik torku) ölçer; video − ayna fazör farkı optik alt montaj esnemesidir. Bu esnemeyi gyro görmez, dar bant kontrol de bastıramaz.',
            ...subNotes,
            ...(worse ? [`Dar bant kontrol f_n'de artığı büyüttü (OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad). Yol ayrımı nedenini gösterir: kontrol gimbal yolunu bastırır (ayna ${axW.toLowerCase()} ${urad(atFn['m' + axW])} → ${urad(atFnOn['m' + axW])} µrad), optik montaj yolu değişmez (${urad(atFn['o' + axW])} → ${urad(atFnOn['o' + axW])} µrad). OFF'ta iki yol ters fazda kısmen birbirini götürüyordu; ON'da optik yol açıkta kalır. Kabul ve bütçe yapılandırılmış DUT'un (ON) değerini kullanır; düzeltme optik montajın rijitliğinde ya da dengelenmesindedir, kontrolde değil.`] : []),
            ...(limC.length || limR.length ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²) ya da öteleme stroku (±${fmt(P.lab.hexStroke * 1e3, 0)} mm) uyarımı ${limC.concat(limR).map(o => fmt(o.f, 2)).join(', ')} Hz'de küçülttü (mod biçimi korunarak açı ve öteleme aynı oranda). ${limC.length ? 'VIV adaylarında uyarım üretilemediği için sonuç GEÇERSİZ: daha büyük erişimli düzenek gerekir.' : 'Yalnız rezonans adayı etkilendi: o frekanstaki artık iyimser olabilir (bilgi).'}`] : []), ...tauNote],
    fill: { 'B2-01': atCfg.vid },
  });
  res.plots.push({ title: (ship ? 'Rüzgâr VIV dwell' : 'VIV dwell (açısal + mast başı ötelemesi)') + ': tondaki artık (el ve xel\'in büyüğü)', xLabel: 'Hz', yLabel: 'µrad RMS',
    series: [{ name: 'dar bant OFF', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && !o.resOn).vid * 1e6)), dots: true },
             { name: 'dar bant ON', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && o.resOn).vid * 1e6)), dots: true }],
    refLines: [{ y: lim * 1e6, label: 'B2-01 tahsisi' }] });
  // v13.4: göz bebeği ↔ kolimatör demeti — dwell'lerin en kötüsü (öteleme ve açısal yürüme)
  { const W = out.map(o => Object.assign({}, o.px, { run: fmt(o.f, 2) + ' Hz' })).reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü dwell ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
}
// T2.2 — VIV ve rezonans frekanslarında sinüs dwell; dar bantlı kontrol OFF/ON
TESTS['T2.2'] = function (P, ctx, prog) {
  const VS0 = vivSpec(P);
  // gemi ve (v13.3) mast başı ötelemesi açık denizaltı: açısal + öteleme tonu; öteleme kapalı denizaltı: yalnız açısal (eski biçim)
  if (isShip(P) || (VS0.lin && VS0.present)) return t22Tone(P, ctx, prog);
  if (!VS0.present) return mkResult('T2.2', { status: 'BİLGİ',
    measured: VS0.on ? vivNoRiskTxt(P) + ' Dwell uygulanmaz; bütçeye ölçüm aktarılmaz.' : 'VIV kapalı: VIV dwell testi uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.',
    notes: [VS0.on ? 'İşletme hız zarfında K0 tarama bandına girmiyor (Model → Hidrodinamik VIV: hız zarfı, f_n, D, St, kütle oranı). Zarf değişirse test koşulur.'
      : 'Hidrodinamik VIV kapalı (ör. mast durgun suda ya da girdap kopması bastırılmış). Model sekmesinde VIV açılınca test koşulur.'] });
  const d = derive(P), v = P.wb.viv, VS = vivSpec(P), VBo = vivBand(P);
  const freqs = Array.from(new Set(VBo.cand.concat((ctx.res || []).map(r => r.f)).map(f => Math.round(f * 100) / 100))).sort((a, b) => a - b);
  const A = v.amp_deg * D2R, out = [];
  // VIV adayları (tarama f_v'leri, f_n ve v13.3'te kütle oranının alt dal frekansı): hexapod erişimi uyarımı küçültürse test
  // tanımlandığı gibi üretilemez (v13.2)
  const candR = VBo.cand.map(f => Math.round(f * 100) / 100), isCand = (f) => candR.some(c => Math.abs(c - f) < 0.006);
  let k = 0;
  const PXo = [];
  for (const resOn of [false, true]) for (const f of freqs) {
    const P2 = cloneParams(P); P2.dut.ctl.res.on = resOn;
    const Ar = Math.min(A, d.reach(f) * D2R);
    const sg = segSines([{ axis: 0, f, A: Ar, nper: Math.round(60 * f) }]);
    const Sd = labScenario(P2, { label: 'T2.2', T: sg.T, fs: 2000, cmd: sg.cmd, resF: f, seed: 2200 + k });
    if (resOn) PXo.push(Object.assign(pupilExcursion(P2, Sd), { run: fmt(f, 2) + ' Hz' }));       // v13.4: göz bebeği
    const R = runSim(P2, Sd, (p) => prog && prog((k + p) / (2 * freqs.length))); k++;
    const fit = fitSegments(P2, R, sg.segs, ctx)[0];
    out.push({ f, resOn, A: Ar, limited: Ar < A * (1 - 1e-9), vid: fit.fe.A / Math.SQRT2, ac: fit.ae ? fit.ae.A / Math.SQRT2 : NaN, tru: fit.te.A / Math.SQRT2, drr: drrOf(fit.fe, fit.fin) });
  }
  // analitik bütçe tahmini (bütçe varsayımı wb.viv.drr_dB, v13.2 parametre) ve dar bant kapalı taban döngünün doğrusal DRR'ı @ f_n
  const lim = budgetAlloc(P)['B2-01'] * 1e-6, cfgOn = !!P.dut.ctl.res.on, est = A / Math.SQRT2 * Math.pow(10, VS.H / 20);
  const RSc = P.dut.ctl.res, baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RSc, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
  const linFn = db(cabs(baseL.drr(TAU * v.fn))), fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');      // düz yazı: virgül, eksi işareti
  const cur = out.filter(o => o.resOn === cfgOn), worst = Math.max(...cur.map(o => o.vid));
  const ok = worst <= lim;
  const atFn = out.find(o => !o.resOn && Math.abs(o.f - v.fn) < 0.01), atFnOn = out.find(o => o.resOn && Math.abs(o.f - v.fn) < 0.01);
  const limC = out.filter(o => !o.resOn && o.limited && isCand(o.f)), limR = out.filter(o => !o.resOn && o.limited && !isCand(o.f));
  const outBand = freqs.filter(f => f < RSc.fmin || f > RSc.fmax);
  const offWorse = isFinite(atFn.drr) && atFn.drr > linFn + 1;
  const res = mkResult('T2.2', {
    status: limC.length ? 'GEÇERSİZ' : stat(ok), measured: (limC.length ? `Hexapod erişimi VIV genliğini (${String(v.amp_deg).replace('.', ',')}°) ${limC.map(o => fmt(o.f, 2)).join(', ')} Hz'de küçültüyor: sonuç GEÇERSİZ. ` : '') +
      `Tondaki artık (yapılandırılmış DUT, dar bant kontrol ${cfgOn ? 'ON' : 'OFF'}): en kötü ${urad(worst)} µrad RMS (tahsis ${urad(lim, 1)}); f_n = ${v.fn} Hz'de OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad`,
    kv: freqs.map(f => { const a = out.find(o => o.f === f && !o.resOn), b = out.find(o => o.f === f && o.resOn);
      return [`${fmt(f, 2)} Hz${a.limited ? ` (hexapod erişimiyle sınırlı: θ ${fmt(a.A * R2D, 3)}°)` : ''}`, `OFF ${urad(a.vid)} µrad (DRR ${fmt(a.drr, 1)} dB) · ON ${urad(b.vid)} µrad (DRR ${fmt(b.drr, 1)} dB)`]; })
      .concat([['Dar bant kontrol çalışma bandı', `${RSc.fmin}–${RSc.fmax} Hz: ${outBand.length ? 'bandın DIŞINDAKİ dwell frekansları ' + outBand.map(f => fmt(f, 2)).join(', ') + ' Hz (ON = OFF)' : 'bütün dwell frekansları bant içinde'}`],
               [`Doğrusal model (dar bant kapalı taban döngü) DRR @ f_n = ${v.fn} Hz`, `${fmt(linFn, 1)} dB; ölçülen (OFF) ${fmt(atFn.drr, 1)} dB`]]),
    notes: [`Hidrodinamik kuvvet değil, mast başında doğurduğu açısal hareket (${String(v.amp_deg).replace('.', ',')}°, roll) yeniden üretilir; mast başı ötelemesi kapalı (Model → Hidrodinamik VIV; yalnız açısal yol). Dwell frekansları VIV taramasının adayları (Model → VIV), f_n ve T2.1'in rezonans adaylarıdır.`,
            'ON: uyarlanır dar bantlı (rezonans) kontrolcü, dwell frekansına ayarlı, +' + RSc.gain_dB + ' dB (çalışma bandı ' + RSc.fmin + '–' + RSc.fmax + ' Hz; dışında devreye girmez). Analitik bütçe tahmini (' + fcm(VS.H, 0) + ' dB varsayımıyla ' + fcm(est * 1e6, 2) + ' µrad) B2-01 tahsisini (' + fA(lim * 1e6) + ' µrad) ' +
              (est <= lim ? 'aşmaz.' : 'aşar; ' + (atFnOn.vid <= lim ? 'f_n\'de bu açığı dar bant kontrol kapatır.' : (v.fn < RSc.fmin || v.fn > RSc.fmax ? 'f_n dar bant kontrolün çalışma bandının dışında olduğu için açık kapanmaz.' : 'dar bant kontrol de f_n\'de açığı kapatamıyor.'))),
            offWorse ? `Kapalıyken artık, doğrusal modelin verdiği ${fcm(linFn, 1)} dB'den (f_n = ${fcm(v.fn, 2)} Hz) kötüdür (ölçülen ${fcm(atFn.drr, 1)} dB): ${String(v.amp_deg).replace('.', ',')}° genlikte bağıl hız her periyotta iki kez sıfırdan geçer ve sürtünme geçişleri tonda temel bileşen üretir.`
              : `Kapalıyken ölçülen DRR (${fcm(atFn.drr, 1)} dB) doğrusal modele (${fcm(linFn, 1)} dB, f_n = ${fcm(v.fn, 2)} Hz) yakındır: bu genlikte sürtünme geçişlerinin tondaki payı küçüktür.`,
            ...(limC.length || limR.length ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²) uyarımı ${limC.concat(limR).map(o => fmt(o.f, 2)).join(', ')} Hz'de küçülttü. ${limC.length ? 'VIV adaylarında uyarım üretilemediği için sonuç GEÇERSİZ: daha büyük erişimli düzenek gerekir.' : 'Yalnız rezonans adayı etkilendi: küçük genlikte doğrusal artık küçülür, sürtünme payı kalır; o frekanstaki artık iyimser olabilir (bilgi).'}`] : [])],
    fill: { 'B2-01': cfgOn ? atFnOn.vid : atFn.vid },
  });
  res.plots.push({ title: 'VIV dwell: tondaki artık', xLabel: 'Hz', yLabel: 'µrad RMS',
    series: [{ name: 'dar bant OFF', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && !o.resOn).vid * 1e6)), dots: true },
             { name: 'dar bant ON', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && o.resOn).vid * 1e6)), dots: true }],
    refLines: [{ y: lim * 1e6, label: 'B2-01 tahsisi' }] });
  if (PXo.length) { const W = PXo.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü dwell ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// T2.3 — kombine: deniz profili + VIV tonu (doğrusallık sınavı)
TESTS['T2.3'] = function (P, ctx, prog) {
  const VS = vivSpec(P), ship = VS.kind === 'wind';
  if (!VS.present) return mkResult('T2.3', { status: 'BİLGİ',
    measured: ship ? (VS.on ? 'Rüzgâr VIV\'i işletme zarfında oluşmaz (v_crit > 1,25·U_max): deniz profili + VIV doğrusallık sınaması uygulanmaz.' : 'Rüzgâr VIV etkisi kapalı: deniz profili + VIV doğrusallık sınaması uygulanmaz.')
      : (VS.on ? vivNoRiskTxt(P) + ' Deniz profili + VIV doğrusallık sınaması uygulanmaz.' : 'VIV kapalı: deniz profili + VIV doğrusallık sınaması uygulanmaz.'),
    notes: ['Deniz profilinin tek başına artığı T1.3\'te ölçülür. Model sekmesinde VIV açılınca test koşulur.'] });
  const d = derive(P);
  // ayrı koşular (aynı tohum): yalnız deniz, yalnız ton; sonra kombine
  const Sse = seaLabScenario(P, { T: 620, seed: 1301 });
  const Rse = runSim(P, Sse, (p) => prog && prog(p / 3));
  let Rto, toneFit;
  if (!ship && !VS.lin) {
    // v13.2: dar bant kontrol tona ayarlı (resF = f_n), kombine koşudaki (seaLabScenario, viv) ve T2.2'deki gibi —
    // önceden varsayılan merkez frekansında (res.f) kalıyordu ve f_n ≠ res.f iken RSS'i şişiriyordu
    const sg = segSines([{ axis: 0, f: P.wb.viv.fn, A: P.wb.viv.amp_deg * D2R, nper: Math.round(60 * P.wb.viv.fn) }]);
    Rto = runSim(P, labScenario(P, { label: 'T2.3 ton', T: sg.T, fs: 2000, cmd: sg.cmd, resF: P.wb.viv.fn, seed: 2301 }), (p) => prog && prog((1 + p) / 3));
    toneFit = fitSegments(P, Rto, sg.segs, ctx)[0];
  } else {      // gemi ve (v13.3) denizaltı: VIV tonu (açısal + öteleme), T2.2 ile aynı biçim
    const f = VS.f, ramp = Math.max(1.0, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core, tn = windTone(P, VS, f, t0, t1, ramp);
    Rto = runSim(P, labScenario(P, { label: 'T2.3 ton', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed: 2301 }), (p) => prog && prog((1 + p) / 3));
    toneFit = fitSegments(P, Rto, [{ axis: Math.abs(VS.roll) >= Math.abs(VS.pitch) ? 0 : 1, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f }], ctx)[0];
  }
  const Sco = seaLabScenario(P, { T: 620, seed: 1301, viv: true });
  const PX = pupilExcursion(P, Sco), PXt = pupilTxt(P, PX);      // v13.4: göz bebeği ↔ kolimatör demeti (deniz + VIV)
  // v13.2: hexapod θ/ω/α sınırı (deniz profili + VIV tonu) aşılıyorsa ya da gemide ton erişimle küçültüldüyse test
  // tanımlandığı gibi üretilemez: GEÇERSİZ (T1.3 ve T2.2 ile aynı kural)
  const tnL = (ship || VS.lin) ? windTone(P, VS, VS.f, 10, null, 5) : null, limCo = hexLimitCheck(P, Sco), limTone = tnL ? tnL.limited : false;
  const trPk = transPeak(P, Sco), limTr = trPk > P.lab.hexStroke * (1 + 1e-3);      // v13.3: deniz + ton ötelemesi strok içinde mi (ölçekli deniz tepesi tam strokta; 0,1 mm sayısal pay)
  const invalid = limCo.clipFrac > 0 || limTone || limTr;
  const Rco = runSim(P, Sco, (p) => prog && prog((2 + p) / 3));
  const mSe = profileMetrics(P, Rse, ctx, 20), mCo = profileMetrics(P, Rco, ctx, 20);
  // değerlendirilen eksen: denizaltında el (roll → el); gemide tonun büyük olduğu eksen (rüzgâr yönüne bağlı)
  const ax = ((ship || VS.lin) && toneFit.fx && toneFit.fe && toneFit.fx.A > toneFit.fe.A) ? 'xel' : 'el';
  const tone = (ax === 'el' ? toneFit.fe : toneFit.fx).A / Math.SQRT2;
  const rss = Math.hypot(mSe.wander[ax], tone), comb = mCo.wander[ax], dev = comb / rss - 1;
  const al = budgetAlloc(P), rssOf = (ids) => Math.sqrt(ids.reduce((s, k) => s + sq(al[k]), 0));
  // B1 tahsis toplamı (G1 grubu B1-01 + B1-04 doğrusal toplanır)
  const b1 = Math.sqrt(sq(al['B1-01'] + al['B1-04']) + ['B1-02', 'B1-03', 'B1-05', 'B1-06', 'B1-07'].reduce((s, k) => s + sq(al[k]), 0));
  const b2 = rssOf(['B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-05', 'B2-06']);
  const limWb = Math.sqrt(Math.max(0, sq(b1) + sq(b2) - sq(al['B2-06']))) * 1e-6;
  const ok = Math.abs(dev) <= 0.2 && comb <= limWb;
  const res = mkResult('T2.3', {
    // v13.3: GEÇERSİZ'in bütün nedenleri birlikte yazılır (ton erişimle küçültüldü; deniz + ton θ/ω/α sınırını aştı; öteleme stroku aştı)
    status: invalid ? 'GEÇERSİZ' : stat(ok), measured: (invalid ? [limTone ? `VIV tonu hexapod erişimiyle küçültüldü (${fmt(VS.A * R2D, 3)}° → ${fmt(tnL.A * R2D, 3)}° @ ${fmt(VS.f, 2)} Hz)` : '',
        limCo.clipFrac > 0 ? `deniz profili + VIV tonu hexapodun θ/ω/α sınırlarını aşıyor (aşım süresi oranı %${fmt(limCo.clipFrac * 100, 1)})` : '',
        limTr ? `deniz + VIV ötelemesi hexapod strokunu aşıyor (tepe ${fmt(trPk * 1e3, 1)} mm > ±${fmt(P.lab.hexStroke * 1e3, 0)} mm)` : ''].filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase()) + ': sonuç GEÇERSİZ. ' : '') +
      `Kombine artık ${urad(comb)} µrad; ayrı testlerin RSS'i ${urad(rss)} µrad → sapma ${fmt(dev * 100, 1)} % (sınır ±20 %); tahsis sınırı ${urad(limWb, 1)} µrad`,
    kv: ship ? [[`Yalnız deniz profili (wander ${ax})`, urad(mSe.wander[ax]) + ' µrad'], [`Yalnız rüzgâr VIV tonu (${fmt(VS.f, 2)} Hz, açısal${VS.lin ? ' + öteleme' : ''}; artık RMS, ${ax})`, urad(tone) + ' µrad'], ['RSS', urad(rss) + ' µrad'],
                 [`Kombine (wander ${ax})`, urad(comb) + ' µrad'], ['Sapma', fmt(dev * 100, 2) + ' %'], ['Kabul (B1⊕B2 açısal tahsis; B2-06 hariç)', urad(limWb, 1) + ' µrad']]
      : [[`Yalnız deniz profili (wander ${ax})`, urad(mSe.wander[ax]) + ' µrad'], [`Yalnız VIV tonu (f_n = ${fmt(P.wb.viv.fn, 2)} Hz${VS.lin ? ', açısal + mast başı ötelemesi' : ''}; artık RMS, ${ax})`, urad(tone) + ' µrad'], ['RSS', urad(rss) + ' µrad'],
         [`Kombine (wander ${ax})`, urad(comb) + ' µrad'], ['Sapma', fmt(dev * 100, 2) + ' %'], ['Kabul (B1⊕B2 açısal tahsis; B2-06 hariç)', urad(limWb, 1) + ' µrad']],
    notes: ['Sürtünme, doygunluk ve kazanç programlama süperpozisyonu bozabilir. Sapma büyükse doğrusal (RSS) bütçe geçersizdir.',
            dev < -0.2 ? 'Kombine < RSS: deniz hareketi gimbalı sürekli kayma rejiminde tutar; tonun tek başına ürettiği sürtünme yön değişimleri (ve onların tondaki temel bileşeni) kaybolur. Ayrı testler bu DUT için muhafazakârdır, ama RSS bütçesi de doğru değildir.'
              : dev > 0.2 ? 'Kombine > RSS: katkılar etkileşiyor (doygunluk, kazanç programlama ya da büyük genlikte sürtünme). Doğrusal bütçe iyimserdir.'
              : (ship ? 'Sapma sınır içinde: bu DUT ve uyarım düzeyinde doğrusal toplama (RSS) savunulabilir.' : `Sapma sınır içinde: bu DUT ve uyarım düzeyinde doğrusal toplama (RSS) savunulabilir. Dar bant kontrol kapatılırsa (Model) ${fmt(P.wb.viv.fn, 2).replace('.', ',')} Hz artığı sürtünme baskın hale gelir ve sapma büyür.`),
            ...(ship ? ['Gemi: rüzgâr VIV tonu açısal hareket ve aynı fazda direk tepesi ötelemesiyle uygulanır (T2.2 ile aynı biçim); değerlendirilen eksen tonun büyük olduğu eksendir.']
              : (VS.lin ? ['Denizaltı: VIV tonu roll ve aynı fazda mast başı ötelemesiyle (y = θ·L/κ) uygulanır (T2.2 ile aynı biçim).'] : [])),
            ...(Sco.seaQ != null && (ship || VS.lin) ? [`Deniz ötelemesi ile tonun ötelemesi aynı hexapod strokunu paylaşır: deniz ötelemesi tona yer bırakacak biçimde ölçeklenir (q = ${fmt(Sco.seaQ, 3)}; talep ±${fmt(Sco.seaDemand, 2)} m); birleşik tepe ${fmt(trPk * 1e3, 1)} mm (strok ±${fmt(P.lab.hexStroke * 1e3, 0)} mm).`] : []),
            ...(invalid ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²${ship ? `, öteleme stroku ±${fmt(P.lab.hexStroke * 1e3, 0)} mm` : ''}) birleşik uyarımı üretemiyor (roll tepesi ${fmt(limCo.axes[0].peakDeg, 2)}°, ${fmt(limCo.axes[0].peakRate, 1)}°/s, ${fmt(limCo.axes[0].peakAcc, 0)}°/s²): doğrusallık sınaması gerçek uyarım düzeyinde yapılamaz.`] : [])],
  });
  res.kv.push(PXt.kv); if (PXt.note) res.notes.push(PXt.note); res.num = Object.assign({}, res.num || {}, { pupil: PX });
  // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırıldıysa bilgi
  if (Sco.seaQc != null && Sco.seaQc < 1 - 1e-9) res.notes.push(`Deniz ötelemesi kolimatör demetine sığacak biçimde ×${fmt(Sco.seaQc, 3)} küçültüldü (v13.5; ölçeksiz kayma ${fmt((Sco.seaE1 || 0) * 1e3, 1)} mm, sınır ${fmt(PX.eFree * 1e3, 1)} mm). Ötelemenin işletme ivmesindeki etkisi T2.5'te ölçülür.`);
  return pupilRule(P, res, PX);      // v13.5: gerçek vinyetlemede GEÇERSİZ
};
// T2.4 — geçici darbe (dalga çarpması temsili)
TESTS['T2.4'] = function (P, ctx, prog) {
  const d = derive(P), hx = P.wb.hex, Tps = [0.05, 0.1, 0.2];
  // v13.12 (§12): değerlendirme penceresi oturma gereksinimine uyar — gereksinim 2,4 s'den uzunsa darbe aralığı ve pencere uzatılır
  // (önce pencere 2,5 s'de sabitti; daha uzun bir gereksinimde oturmayan darbe için karar verilemiyor, sonuç AŞIM çıkıyordu)
  const rqS = P.ana.req.shockSettle_ms != null ? P.ana.req.shockSettle_ms * 1e-3 : 0, Wn = Math.max(2.5, rqS + Math.max(...Tps) + 0.6), gapE = Wn + 0.5;
  const mkEvents = (scale) => { const ev = [], meta = []; let t = 3;
    for (const Tp of Tps) {
      const Amax = pulseAmpDeg(P, Tp) * scale * D2R;      // v13.14: genlik kuralı pulseAmpDeg (wb.hex.pulseRule)
      for (let i = 0; i < 10; i++) { ev.push({ t0: t, Tp, A: Amax * (i % 2 ? -1 : 1) }); meta.push({ t0: t, Tp, A: Amax }); t += gapE; }
    }
    return { ev, meta, T: t + 2 }; };
  // (a) durgun gimbal (test tanımı: "eksen başına 10 darbe") — el (roll) ve az (yaw) eksenleri
  const E1 = mkEvents(0.9);
  const pulseStats = (R, chName) => {
    const tr = recT(R), fr = R.meta.fRec;
    // darbe öncesi pencerelerin tümünden doğrusal kayma (dünya dönüşü / bias rampası) kestirilip çıkarılır
    const y = Float64Array.from(R.rec[chName]);
    let st = 0, sy = 0, stt = 0, sty = 0, nq = 0;
    for (const m of E1.meta) { const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05); for (let i = b0; i < b1; i++) { st += tr[i]; sy += y[i]; stt += tr[i] * tr[i]; sty += tr[i] * y[i]; nq++; } }
    const slp = (nq * sty - st * sy) / Math.max(1e-30, nq * stt - st * st), ic = (sy - slp * st) / Math.max(1, nq);
    for (let i = 0; i < y.length; i++) y[i] -= ic + slp * tr[i];
    // 10 ms kayan ortalama (oturma tespiti için)
    const wv = Math.round(0.01 * fr), ys = new Float64Array(y.length);
    { let acc = 0; for (let i = 0; i < y.length; i++) { acc += y[i]; if (i >= wv) acc -= y[i - wv]; ys[i] = acc / Math.min(i + 1, wv); } }
    let nv = 0, nn = 0, nvs = 0;
    for (const m of E1.meta) { const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05), bm = aMean(y, b0, b1), bms = aMean(ys, b0, b1);
      for (let i = b0; i < b1; i++) { nv += sq(y[i] - bm); nvs += sq(ys[i] - bms); nn++; } }
    const varFloor = nv / Math.max(1, nn - E1.meta.length), sdFloorS = Math.sqrt(nvs / Math.max(1, nn - E1.meta.length));
    const per = Tps.map(Tp => ({ Tp, pk: [], st: [], en: [], A: 0 }));
    for (const m of E1.meta) {
      const [i0, i1] = idxRange(tr, m.t0 - 0.5, m.t0 + Wn);
      const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05), base = aMean(y, b0, b1), baseS = aMean(ys, b0, b1);
      let pk = 0, ipk = i0; for (let i = i0; i < i1; i++) { const v = Math.abs(y[i] - base); if (v > pk) { pk = v; ipk = i; } }
      const thr = Math.max(0.1 * pk, 3 * sdFloorS);
      let tset = 0; for (let i = i1 - 1; i > ipk; i--) if (Math.abs(ys[i] - baseS) > thr) { tset = tr[i] - (m.t0 + m.Tp); break; }
      if (tset > (m.t0 + Wn - 0.1) - (m.t0 + m.Tp)) tset = Infinity;      // değerlendirme penceresinde (varsayılan 2,5 s) oturmadı
      let en = 0; for (let i = i0; i < i1; i++) en += sq(y[i] - base) / fr;
      en = Math.max(0, en - varFloor * (i1 - i0) / fr);             // taban enerjisi çıkarılır
      const p = per.find(q => q.Tp === m.Tp); p.pk.push(pk); p.st.push(Math.max(0, tset)); p.en.push(en); p.A = m.A;
    }
    return { tr, fr, y, per, drift: slp, sdFloorS };
  };
  const R = runSim(P, labScenario(P, { label: 'T2.4 roll', T: E1.T, fs: 4000, cmd: [{ type: 'halfsine', axis: 0, events: E1.ev }], seed: 2401,
    rec: { fs: 1000, ch: ['opt_el', 'ac_el', 'imu_r'] } }), (p) => prog && prog(p / 4));
  const Ry = runSim(P, labScenario(P, { label: 'T2.4 yaw', T: E1.T, fs: 4000, cmd: [{ type: 'halfsine', axis: 2, events: E1.ev }], seed: 2403,
    rec: { fs: 1000, ch: ['opt_xel', 'ac_xel', 'imu_y'] } }), (p) => prog && prog((1 + p) / 4));
  const PE = pulseStats(R, 'ac_el'), PX = pulseStats(Ry, 'ac_xel');
  const tr = PE.tr, fr = PE.fr, y = PE.y, per = PE.per, driftAC = PE.drift, sdFloorS = PE.sdFloorS;
  const sl = P.env.slap, EA2 = sq(sl.A * URAD);
  const opRms = Math.sqrt(sl.rate * EA2 * aMean(per.map(p => aMean(p.en) / sq(p.A))));
  // (b) işletme benzeri: aynı darbeler deniz profili üzerinde; aynı profil darbesiz tekrarlanır, fark darbenin katkısıdır
  const E2 = mkEvents(0.8);
  const Ssea = (withP) => { const S = seaLabScenario(P, { T: E2.T, seed: 2402, extra: { fs: 4000, rec: { fs: 1000, ch: ['ac_el', 'imu_r'] } } });
    if (withP) S.cmd = S.cmd.concat([{ type: 'halfsine', axis: 0, events: E2.ev }]); return S; };
  const Rw = runSim(P, Ssea(true), (p) => prog && prog((2 + p) / 4)), Rn = runSim(P, Ssea(false), (p) => prog && prog((3 + p) / 4));
  const tr2 = recT(Rw), dy = new Float64Array(Rw.meta.nRec); for (let i = 0; i < dy.length; i++) dy[i] = Rw.rec.ac_el[i] - Rn.rec.ac_el[i];
  const per2 = Tps.map(Tp => ({ Tp, en: [], pk: [], A: 0 }));
  for (const m of E2.meta) { const [i0, i1] = idxRange(tr2, m.t0 - 0.5, m.t0 + Wn); let en = 0, pk = 0; for (let i = i0; i < i1; i++) { en += sq(dy[i]) / fr; pk = Math.max(pk, Math.abs(dy[i])); }
    const p = per2.find(q => q.Tp === m.Tp); p.en.push(en); p.pk.push(pk); p.A = m.A; }
  const opRmsSea = Math.sqrt(sl.rate * EA2 * aMean(per2.map(p => aMean(p.en) / sq(p.A))));
  const rq = P.ana.req, hasReq = rq.shockPeak_urad != null || rq.shockSettle_ms != null;
  const both = per.concat(PX.per);
  const pkMax = Math.max(...both.map(p => Math.max(...p.pk)));
  const nUns = both.reduce((s, p) => s + p.st.filter(v => !isFinite(v)).length, 0), nAll = both.reduce((s, p) => s + p.st.length, 0);
  const fin = (a) => a.filter(isFinite), stMax = Math.max(0, ...both.map(p => Math.max(0, ...fin(p.st))));
  const stTxt = (p) => { const f = fin(p.st), u = p.st.length - f.length; return (f.length ? `ortanca ${fmt(aPctAbs(Float64Array.from(f), 50) * 1e3, 0)} ms` : '—') + (u ? `, ${u}/${p.st.length} darbe ${fmt(Wn - 0.1, 1).replace('.', ',')} s içinde oturmadı` : ''); };
  const ok = hasReq ? ((rq.shockPeak_urad == null || pkMax <= rq.shockPeak_urad * 1e-6) && (rq.shockSettle_ms == null || (nUns === 0 && stMax <= rq.shockSettle_ms * 1e-3))) : null;
  const shipT = isShip(P);      // gemi direği: dalga çarpması kaynağı yok — test geçici yanıtı karakterize eder, B2-02'ye aktarılmaz
  const res = mkResult('T2.4', {
    status: hasReq ? stat(ok) : 'BİLGİ',
    measured: (shipT ? 'Gemi direği: dalga çarpması yok (B2-02 aktarılmaz); darbeler geçici yanıt karakterizasyonudur. ' : '') + `Tepe hata en büyük ${urad(pkMax, 1)} µrad; oturma en uzun ${fmt(stMax * 1e3, 0)} ms` + (nUns ? ` (${nUns}/${nAll} darbe ${fmt(Wn - 0.1, 1).replace('.', ',')} s içinde oturmadı: küçük darbelerde ön-kayma/stiction)` : '') + ` (el ve az eksenleri, eksen başına ${E1.meta.length} darbe); işletme kestirimi B2-02: durgun gimbal ${urad(opRms)} / deniz profili üzerinde ${urad(opRmsSea)} µrad RMS (tahsis ${BUDGET_ALLOC['B2-02']})`,
    kv: per.map(p => [`roll→el, T_p = ${p.Tp * 1e3} ms, A = ${fmt(p.A * R2D, 3)}°`, `tepe ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad), oturma ${stTxt(p)}`])
      .concat(PX.per.map(p => [`yaw→xel, T_p = ${p.Tp * 1e3} ms`, `tepe ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad), oturma ${stTxt(p)}`]))
      .concat(per2.map(p => [`Deniz profili üzerinde (roll), T_p = ${p.Tp * 1e3} ms`, `tepe (fark) ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad)`]))
      .concat([['Oturma eşiği', `max(%10 tepe, 3σ taban) — σ taban (10 ms ortalama) ${urad(sdFloorS, 2)} µrad`],
               ['Çıkarılan doğrusal kayma (durgun koşu)', `${fmt(driftAC * 1e6, 2)} µrad/s${P.wb.earth.comp ? '' : ' — dünya dönüşü kompanzasyonu kapalı'}`],
               ['Dalga çarpması istatistiği (örnek)', `λ = ${sl.rate}/s, T_p ∈ [${sl.Tmin * 1e3}, ${sl.Tmax * 1e3}] ms, A_RMS = ${fmt(sl.A, 0)} µrad`],
               ['Gereksinim (tepe / oturma)', hasReq ? `${rq.shockPeak_urad ?? '—'} µrad / ${rq.shockSettle_ms ?? '—'} ms` : 'girilmedi (Model → Proje gereksinimleri)']]),
    notes: [...(shipT ? ['Gemi direği: mast başı sudan yüksekte olduğu için dalga çarpması yoktur; B2-02 sıfırdır ve "işletme kestirimi" satırı yalnız denizaltı darbe istatistiğiyle (Model: işletme ortamı) hesaplanmış bilgi amaçlı bir sayıdır. Gemide geçici olaylar (baş vurması sonrası gövde kırbaçlanması, top atışı şoku) gemi verisiyle ayrıca tanımlanmalıdır.'] : []),
            'RMS değil tepe ve toparlanma izlenir; tepe ve oturma eşikleri proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).',
            'İşletme kestirimi: ölçülen darbe yanıtı enerjisi + Poisson darbe modeli (Campbell teoremi, σ² = λ·E[∫h²dt]); yanıtın genlikle doğrusal ölçeklendiği varsayılır. Durgun koşuda taban gürültüsü enerjisi çıkarıldı.',
            'Laboratuvarda gimbal darbe öncesi durgundur: her darbe bir sürtünme yön değişimi tetikler. Deniz profili üzerinde gimbal kayma rejimindedir; iki kestirimin farkı sürtünmenin payıdır. Simülasyonda iki koşu aynı gürültü gerçekleşmesini paylaşır; gerçek testte fark √2 × taban gürültüsü taşır ve enerjisi çıkarılmalıdır.'],
    fill: shipT ? {} : { 'B2-02': opRmsSea },
  });
  const [j0, j1] = idxRange(tr, E1.meta[10].t0 - 0.3, E1.meta[10].t0 + 1.5);
  const dd = decim(Array.from(tr.subarray(j0, j1)), Array.from(y.subarray(j0, j1), v => v * 1e6));
  const [k0, k1] = idxRange(tr2, E2.meta[10].t0 - 0.3, E2.meta[10].t0 + 1.5);
  const de = decim(Array.from(tr2.subarray(k0, k1), t => t - E2.meta[10].t0 + E1.meta[10].t0), Array.from(dy.subarray(k0, k1), v => v * 1e6 * E1.meta[10].A / E2.meta[10].A));
  const dz = decim(Array.from(tr.subarray(j0, j1)), Array.from(PX.y.subarray(j0, j1), v => v * 1e6));
  res.plots.push({ title: 'Darbe yanıtı (T_p = 100 ms), otokolimatör', xLabel: 's', yLabel: 'µrad',
    series: [{ name: 'roll→el, durgun gimbal', x: dd.x, y: dd.y }, { name: 'yaw→xel, durgun gimbal', x: dz.x, y: dz.y }, { name: 'roll→el, deniz profili üzerinde (fark, ölçekli)', x: de.x, y: de.y }] });
  return res;
};
// T2.5 — doğrusal ivme kuplajı (pivot ofseti)
TESTS['T2.5'] = function (P, ctx, prog) {
  const d = derive(P), h = P.lab.pivotHull, stroke = P.lab.hexStroke;
  const aOp = P.env.lat.a_rms * Math.SQRT2;                         // işletme yanal ivme genliği (m/s²)
  const freqs = [0.5, 1, 2, 5, 8];
  const list = freqs.map(f => { const th = Math.min(aOp / (sq(TAU * f) * h), d.reach(f) * D2R, stroke / h); return { axis: 0, f, A: th, nper: Math.max(10, Math.round(10 * f)) }; });
  const sg = segSines(list);
  const fitsP = [], ext6 = P.wb.extRows !== false, nRun = ext6 ? 5 : 2;
  const PXs = [];      // v13.4: göz bebeği ↔ kolimatör demeti (her koşu; en kötüsü raporlanır)
  for (const [k, hh] of [[0, 0], [1, h]]) {
    const Sp = labScenario(P, { label: 'T2.5', T: sg.T, fs: 2000, cmd: sg.cmd, pivotH: hh, seed: 2501 });
    PXs.push(Object.assign(pupilExcursion(P, Sp), { run: hh ? `pivot ${h} m aşağıda` : 'pivot göz bebeğinde' }));
    const R = runSim(P, Sp, (p) => prog && prog((k + p) / nRun));
    fitsP.push(fitSegments(P, R, sg.segs, ctx));
  }
  // v11 — 6-DOF öteleme ivme duyarlılığı ("ivme eşdeğeri"): deniz ötelemesinin laboratuvarda tam üretilemeyen ivmesi
  // (SS5 heave ±1,2 m; strok ±0,10 m) daha yüksek frekansta küçük strokla uygulanır. Pivot göz bebeğinde (açısal hareket
  // yok); x (surge), y (sway), z (heave) ekseninde T25_FQ frekanslarında (v13.5: 2 ve 3 Hz; 2 m/s²). Optik LOS (video) yanıtı =
  // optik montaj esnemesi (yarı statik, frekanstan bağımsız) + dengesizlik torku (döngü bastırması frekansla azalır): düşük
  // frekansa taşıma muhafazakârdır. İşletme kestirimi: en düşük frekansın duyarlılığı × direktördeki deniz ivmesi RMS'i (eksen başına).
  let tr6 = null;
  if (ext6) {
    // v13.5 (kullanıcı kararı): segmentler 2 ve 3 Hz (önceden 1 ve 2 Hz) — aynı 2 m/s² ivme 12,7 / 5,6 mm genlikle üretilir ve göz
    // bebeği kolimatör demetinde kalır (1 Hz'de ±50,7 mm demetten taşıyordu). Deniz frekansına taşıma 2 Hz'den yapılır.
    const acc = seaAccDirector(P), fq = T25_FQ, segs6 = [];
    for (let ax = 0; ax < 3; ax++) {
      const sgT = segSines(fq.map(q => ({ axis: ax, f: q.f, A: Math.min(q.a / sq(TAU * q.f), 0.9 * stroke), nper: q.nper })));
      const St = labScenario(P, { label: 'T2.5 öteleme ' + 'xyz'[ax], T: sgT.T, fs: 2000, cmd: [], trans: sgT.cmd, seed: 2510 + ax });
      PXs.push(Object.assign(pupilExcursion(P, St), { run: 'öteleme ' + 'xyz'[ax] }));
      const R = runSim(P, St, (p) => prog && prog((2 + ax + p) / nRun));
      const v = videoAngles(R, ctx), tr = recT(R);
      for (const s of sgT.segs) {
        const [j0, j1] = idxRange(v.t, s.c0, s.c1), [i0, i1] = idxRange(tr, s.c0, s.c1);
        const fe = sineFit(v.t, v.el, s.f, { i0: j0, i1: j1, valid: v.ok }), fx = sineFit(v.t, v.xel, s.f, { i0: j0, i1: j1, valid: v.ok });
        const me = sineFit(tr, R.rec.ac_el, s.f, { i0, i1 }), mx = sineFit(tr, R.rec.ac_xel, s.f, { i0, i1 });
        const a = sq(TAU * s.f) * s.A;
        // yol ayrımı: ayna (otokolimatör) mekanik LOS'u = dengesizlik yolu; video − ayna (fazör farkı) = optik montaj yolu
        segs6.push({ ax, f: s.f, a, x: s.A, el: fe.A / a, xel: fx.A / a, seEl: fe.seA / a, seXel: fx.seA / a, mEl: me.A / a, mXel: mx.A / a,
          oEl: Math.hypot(fe.a - me.a, fe.b - me.b) / a, oXel: Math.hypot(fx.a - mx.a, fx.b - mx.b) / a });
      }
    }
    // İşletme kestirimi (muhafazakâr): optik yol yarı statik (en düşük ölçüm frekansındaki değer); dengesizlik yolu iki
    // frekanstan S ∝ f^n (0 ≤ n ≤ 1) ile deniz frekansına taşınır; iki yol doğrusal toplanır (faz bilinmiyor → aynı işaret).
    // Tek frekanstaki toplam duyarlılık iki yolun kısmi sönümlemesini taşır ve iyimser olabilir (bilgi olarak verilir).
    const pick = (ax, f) => segs6.find(r => r.ax === ax && r.f === f), accAx = [acc.x, acc.y, acc.z], sd6 = seaDOF(P);
    // deniz frekansı (eksen başına): o eksene ivme katan terimlerin (öteleme, kaldıraç kolu) en yüksek baskın frekansı (muhafazakâr)
    const fOp = [0, 1, 2].map(ax => Math.max(...[sd6.lin[ax].active ? sd6.lin[ax].fdom : 0, ...acc.terms[ax].map(t => (t.v > 0 ? t.f : 0))].filter(v => v > 0), 0.01));
    const pred = (key, mkey, okey, AA) => Math.hypot(...[0, 1, 2].map(ax => {
      const r1 = pick(ax, fq[0].f), r2 = pick(ax, fq[1].f);
      const n = clamp(Math.log(Math.max(r2[mkey], 1e-15) / Math.max(r1[mkey], 1e-15)) / Math.log(fq[1].f / fq[0].f), 0, 1);
      return (r1[okey] + r1[mkey] * Math.pow(Math.min(1, fOp[ax] / fq[0].f), n)) * (AA || accAx)[ax];
    }));
    const predEl = pred('el', 'mEl', 'oEl'), predXel = pred('xel', 'mXel', 'oXel');
    // bilgi: bir eksendeki ivme terimleri tam ilişkili (aynı fazda) olsaydı (model serbestlik derecelerini bağımsız üretir)
    const upAx = [acc.corrUp.x, acc.corrUp.y, acc.corrUp.z], corrGain = acc.eff > 0 ? acc.corrUp.eff / acc.eff : 1;
    const predElUp = pred('el', 'mEl', 'oEl', upAx), predXelUp = pred('xel', 'mXel', 'oXel', upAx);
    const dirEl = Math.hypot(...[0, 1, 2].map(ax => pick(ax, fq[0].f).el * accAx[ax])), dirXel = Math.hypot(...[0, 1, 2].map(ax => pick(ax, fq[0].f).xel * accAx[ax]));
    tr6 = { segs: segs6, acc, predEl, predXel, dirEl, dirXel, fLo: fq[0].f, fOp, predElUp, predXelUp, corrGain };
  }
  // v13.4: hexapod iletimi τ = θ_ölç / θ_komut (IMU sinüs uydurması, iki pivot koşusunun ortalaması). Duyarlılık gerçekleşen
  // ivmeye bölünür; işletme düzeyindeki fark komut (= hedef) düzeyine 1/τ ile ölçeklenir. Önceden komut ivmesine bölünüyordu:
  // f_bw'ye yakın frekansta (8 Hz) hexapod uyarımı eksik iletince fark ve duyarlılık eksik çıkıyordu (f_bw = 20 Hz'de %1,3,
  // 10 Hz'de %16; probe/k6/tests.js K2).
  const rows = sg.segs.map((s, i) => {
    const a = fitsP[0][i].ae || fitsP[0][i].fe, b = fitsP[1][i].ae || fitsP[1][i].fe;
    const diffLab = Math.hypot(b.a - a.a, b.b - a.b) / Math.SQRT2;       // vektörel fark RMS (gerçekleşen hareketle)
    const fi = [fitsP[0][i].fin, fitsP[1][i].fin].filter(q => q && q.A > 0), tau = fi.length ? fi.reduce((x, q) => x + q.A, 0) / fi.length / s.A : 1;
    const accCmd = sq(TAU * s.f) * s.A * h, acc = accCmd * tau, rr = s.f / P.wb.hex.fbw;
    return { f: s.f, A: s.A, tau, tauA: 1 / Math.sqrt(1 + rr * rr * rr * rr), accCmd, acc, diffLab, diff: diffLab / tau, sens: diffLab / (acc / Math.SQRT2) };
  });
  const r8 = rows[rows.length - 1];
  const ok = r8.diff <= budgetAlloc(P)['B2-03'] * 1e-6;
  const tauTxt = Math.abs(1 - r8.tau) > 0.005 ? ` (hexapod iletimi τ = ${fmt(r8.tau, 3)}: laboratuvar farkı ${urad(r8.diffLab)} µrad komut düzeyine ölçeklendi)` : '';
  const res = mkResult('T2.5', {
    status: stat(ok), measured: `İşletme ivme düzeyinde (8 Hz, ${fmt(aOp, 2)} m/s² genlik) artık farkı ${urad(r8.diff)} µrad RMS (tahsis ${fA(budgetAlloc(P)['B2-03'])}); duyarlılık ${fmt(r8.sens * 1e6, 3)} µrad/(m/s²)` + tauTxt,
    kv: rows.map(r => [`${r.f} Hz, θ = ${fmt(r.A * R2D, 3)}°`, `ivme ${fmt(r.acc, 3)} m/s² (komut ${fmt(r.accCmd, 3)}, τ = ${fmt(r.tau, 3)}) → fark ${urad(r.diffLab, 3)} µrad RMS (${fmt(r.sens * 1e6, 3)} µrad per m/s² RMS)`])
      .concat([['Hexapod iletimi τ = θ_ölç / θ_komut (IMU), ölçülen ↔ analitik 1/√(1 + (f/f_bw)⁴)', rows.map(r => `${r.f} Hz ${fmt(r.tau, 3)} ↔ ${fmt(r.tauA, 3)}`).join(' · ') + ` (f_bw = ${P.wb.hex.fbw} Hz)`],
        ['Pivotlar', `göz bebeği / ${h} m aşağıda (ölçekli gövde dönme merkezi)`], ['Öteleme stroku sınırı', `r·θ ≤ ${stroke * 1e3} mm`]]),
    notes: ['Aynı açısal girdi iki pivotta uygulanır; fark, gimbal kütle dengesizliğinin (T = m·r × a) doğrusal ivmeye duyarlılığıdır.', 'Gerçek mastta dönme merkezi metrelerce aşağıdadır; duyarlılık işletme ivme spektrumuyla çarpılarak B2-03 kestirilir.'],
    fill: { 'B2-03': r8.sens * P.env.lat.a_rms },
  });
  res.plots.push({ title: 'İvme duyarlılığı', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, series: [{ name: 'fark / ivme', x: Float32Array.from(rows.map(r => r.f)), y: Float32Array.from(rows.map(r => r.sens * 1e6)), dots: true }] });
  if (tr6) {
    const AXL = ['x (surge)', 'y (sway)', 'z (heave)'], A6 = tr6.acc, sd = seaDOF(P);
    res.kv.push(...tr6.segs.map(r => [`Öteleme ${AXL[r.ax]}, ${r.f} Hz, ±${fmt(r.x * 1e3, 1)} mm (${fmt(r.a, 2)} m/s²)`, `optik LOS el ${fmt(r.el * 1e6, 3)} / xel ${fmt(r.xel * 1e6, 3)} µrad per m/s² (±${fmt(2 * r.seEl * 1e6, 3)}) · yollar: ayna (dengesizlik) el ${fmt(r.mEl * 1e6, 3)} / xel ${fmt(r.mXel * 1e6, 3)}, optik montaj (video − ayna) el ${fmt(r.oEl * 1e6, 3)} / xel ${fmt(r.oXel * 1e6, 3)}`]),
      ['Direktördeki deniz ivmesi RMS (x / y / z)', `${fmt(A6.x, 3)} / ${fmt(A6.y, 3)} / ${fmt(A6.z, 3)} m/s²` + (sd.rOn ? (A6.r[0] === 0 && A6.r[1] === 0 ? ` (kaldıraç kolu h = ${fmt(A6.h, 1)} m: x ${fmt(A6.lever[0], 3)}, y ${fmt(A6.lever[1], 3)} m/s²)` : ` (kaldıraç kolu r = (${A6.r.map(v => fmt(v, 1)).join(', ')}) m: x ${fmt(A6.lever[0], 3)}, y ${fmt(A6.lever[1], 3)}, z ${fmt(A6.lever[2], 3)} m/s²)`) : '') + (sd.six ? '; 6-DOF profil' : '; dar profil (yalnız açısal + kaldıraç kolu)')],
      ['İşletme kestirimi B1-08 (yollar ayrı taşınıp doğrusal toplandı, muhafazakâr)', `el ${urad(tr6.predEl)} / xel ${urad(tr6.predXel)} µrad RMS (deniz frekansı x/y/z ${tr6.fOp.map(f => fmt(f, 2)).join(' / ')} Hz)`],
      ['Bilgi: ' + tr6.fLo + ' Hz toplam duyarlılığı × ivme (yol ayrımı olmadan)', `el ${urad(tr6.dirEl)} / xel ${urad(tr6.dirXel)} µrad RMS — iki yol bu frekansta kısmen birbirini söndürebilir; iyimser olabilir`]);
    if (tr6.corrGain > 1.0001) res.kv.push(['Bilgi: serbestlik dereceleri tam ilişkili olsaydı (bir eksendeki terimler aynı fazda)', `ivme |a| ${fmt(A6.corrUp.eff, 3)} m/s² (×${fmt(tr6.corrGain, 2)}); B1-08 kestirimi el ${urad(tr6.predElUp)} / xel ${urad(tr6.predXelUp)} µrad RMS. Model serbestlik derecelerini bağımsız üretir (çapraz spektrum yok); gerçek gemide roll–sway–yaw ve pitch–heave–surge faz ilişkilidir, ters fazda değer bağımsız tahminin de altına inebilir`]);
    res.notes.push('6-DOF öteleme ("ivme eşdeğeri"): kolimatör hedefi sonsuzda olduğu için öteleme LOS\'u geometrik olarak değiştirmez; etkisi ivme üzerindendir. Deniz ötelemesi laboratuvarda tam üretilemediğinden (strok ' + fmt(stroke * 1e3, 0) + ' mm) aynı ivme daha yüksek frekansta küçük strokla uygulanır (v13.5: ' + T25_FQ.map(q => q.f).join(' ve ') + ' Hz; genlik göz bebeğini kolimatör demetinde tutar). İki yol farklı frekans bağımlılığı taşır: optik montaj esnemesi yarı statiktir (frekanstan bağımsız), dengesizlik torkunun döngü bastırması frekansla değişir. Bu yüzden yollar ayrılır: ayna (otokolimatör) mekanik LOS\'u yani dengesizlik yolunu, video − ayna fazör farkı optik montaj yolunu verir. Her yol kendi frekans bağımlılığıyla deniz frekansına taşınır ve doğrusal toplanır. Tek frekanstaki toplam duyarlılık iki yolun kısmi sönümlemesini içerir; deniz frekansında sönümleme değiştiği için iyimser olabilir. Kestirim, işletme benzetimindeki B1-08 satırıyla Bütçe sekmesinde karşılaştırılır.');
    res.fill['B1-08'] = tr6.predEl;
    res.num = Object.assign({}, res.num || {}, { tr6: { predEl: tr6.predEl, predXel: tr6.predXel, predElUp: tr6.predElUp, predXelUp: tr6.predXelUp, corrGain: tr6.corrGain, fOp: tr6.fOp, dirEl: tr6.dirEl, dirXel: tr6.dirXel, acc: { x: A6.x, y: A6.y, z: A6.z, eff: A6.eff }, segs: tr6.segs } });
    const sr = [0, 1, 2].map(ax => ({ name: AXL[ax] + ' → el', x: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.f)), y: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.el * 1e6)), dots: true }))
      .concat([0, 1, 2].map(ax => ({ name: AXL[ax] + ' → xel', x: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.f)), y: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.xel * 1e6)), dots: true })));
    res.plots.push({ title: '6-DOF öteleme ivme duyarlılığı (optik LOS, video)', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, series: sr });
  }
  // v13.4: göz bebeği ↔ kolimatör demeti — koşuların en kötüsü (öteleme segmentleri yanal ise baskın)
  { const W = PXs.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü koşu: ' + W.run, Wt.kv[1] + ' · koşular: ' + PXs.map(x => `${x.run} ${fmt(x.eMax * 1e3, 1)} mm`).join(', ')]);
    if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// bant sınırlı yer değiştirme serisi: ivme spektrumu düz (f1–f2), RMS ivmeye normalize
// Bant sınırlı ivme profilinden yer değiştirme dizisi (shaker sürüşü). m = 0: ideal bant; m ≥ 1: işletme
// modelindeki 'noise' bileşeniyle aynı spektral biçim (m adet 2. derece Butterworth YG(f1) ve AG(f2) kesiti).
function bandDispSeries(f1, f2, aRms, T, fsg, rng, m) {
  const n = Math.ceil((T + 2) * fsg), N = nextPow2(n);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const f = k * fsg / N; let w = 1;
    if (!m) { if (f < f1 || f > f2) continue; } else { const a = Math.pow(f / f1, 4), b = Math.pow(f / f2, 4); w = Math.pow(a / (1 + a) / (1 + b), m); }
    const s = Math.sqrt(w * fsg * N / 2) / Math.SQRT2; const xr = s * rng.gauss(), xi = s * rng.gauss(); const w2 = sq(TAU * f); re[k] = -xr / w2; im[k] = -xi / w2; re[N - k] = re[k]; im[N - k] = -im[k]; }
  // ivme RMS (Parseval): Σ|A_k|² ... doğrudan zaman alanında ölç
  const ar = new Float64Array(N), ai = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) { const f = k * fsg / N, w2 = sq(TAU * f); ar[k] = -re[k] * w2; ai[k] = -im[k] * w2; ar[N - k] = ar[k]; ai[N - k] = -ai[k]; }
  fft(re, im, true); fft(ar, ai, true);
  let s2 = 0; for (let i = 0; i < n; i++) s2 += sq(ar[i] / N);
  const g = aRms / Math.sqrt(s2 / n), d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = re[i] / N * g;
  return d;
}
function shakerScenario(P, o) {
  const axis = o.axis, T = o.T || 60, rng = new RNG(hash32(3100 + axis, seedOf(P, o.seed || 1)));
  const trans = [];
  if (o.mode === 'sweep') {
    const A = 0.254e-3;                // MIL-STD-167-1A Type I keşif titreşimi: 0,010 in tek genlik
    trans.push({ type: 'chirp', axis, f0: 4, f1: 33, octPerMin: o.opm || 1, ampFn: () => A, t0: 2, ramp: 2 });
  } else if (o.mode === 'platform') {
    const fsg = 1600, env = P.env;
    const dPlat = bandDispSeries(env.plat.f1, env.plat.f2, env.plat.a_rms, T, fsg, rng, 2);   // işletmedeki 'plat' ile aynı biçim
    const dHf = bandDispSeries(env.hf.f1, env.hf.f2, env.hf.acc_rms, T, fsg, rng, 1);          // işletmedeki 'hfl' ile aynı biçim
    for (let i = 0; i < dPlat.length; i++) dPlat[i] += dHf[i];
    trans.push({ type: 'series', axis, data: rampSeries(dPlat, fsg, 2), fs: fsg });
    trans.push({ type: 'sine', axis, A: env.aux.a / sq(TAU * env.aux.f), f: env.aux.f, ph: 0.3, t0: 0, ramp: 2 });
  }                                    // mode 'off': taban koşusu (shaker kapalı)
  return labScenario(P, { label: 'T3.1', T: o.mode === 'sweep' ? 190 : T, fs: 4000, hexActive: false, trans, rocking: o.rocking,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y'] }, seed: 3100 + axis + (o.mode === 'off' ? 7 : 0) });
}
// Direk tepesi açısal hareketinin (direk modu, yapı yolu) açısal uyarıcıyla yeniden üretimi — öneri koşusu
function mastAngScenario(P, o) {
  o = o || {};
  const env = P.env, accMount = [];
  for (let i = 0; i < 3; i++) accMount.push({ type: 'noise', axis: i, rms: env.plat.a_rms, hp: env.plat.f1, hp2: env.plat.f1, lp: env.plat.f2, lp2: env.plat.f2, stream: 'plat' + i, t0: 0, ramp: 2 });
  return labScenario(P, { label: 'T3.1 açısal', T: o.T || 60, fs: 4000, hexActive: false, accMount, mount: true, accMountLinear: false,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y'] }, seed: 3150 });
}
// T3.1 — öteleme titreşimi (shaker, 3 eksen ayrı)
TESTS['T3.1'] = function (P, ctx, prog) {
  const d = derive(P), runs = []; let k = 0; const angOn = P.dut.mount.kappa > 0, nTot = angOn ? 7 : 6;
  const step = (S) => { const R = runSim(P, S, (p) => prog && prog((k + p) / nTot)); k++; return R; };
  const met = (R) => losMetrics(R, P, { skip: 3, nseg: 8192 });
  const Rb = step(shakerScenario(P, { axis: 1, mode: 'off' })), Mb = met(Rb);
  for (const axis of [0, 1, 2]) { const R = step(shakerScenario(P, { axis, mode: 'platform', rocking: P.lab.rocking.controlled })); runs.push({ axis, R, M: met(R) }); }
  const Rang = angOn ? step(mastAngScenario(P)) : null, Mang = angOn ? met(Rang) : null;
  const Rfree = step(shakerScenario(P, { axis: 1, mode: 'platform', rocking: P.lab.rocking.free })), Mfree = met(Rfree);
  const Rsw = step(shakerScenario(P, { axis: 1, mode: 'sweep', rocking: P.lab.rocking.controlled }));
  const ex = (a, b) => Math.sqrt(Math.max(0, a * a - b * b));            // taban karesel olarak çıkarılır
  const f1 = P.env.plat.f1, f2 = P.env.plat.f2, fN = 0.5 * 1000;
  const bnd = (M, c) => bandRms(M.psd.f, M.psd[c], f1, f2);
  // B2-06 ⊕ B3 toplamı yalnız bu kalemlerin bandında (≥ f1 = 4 Hz) değerlendirilir: tabanın 1 Hz altındaki içeriği
  // (gyro ARW rastgele yürüyüşü, B1-05) bu tahsisin parçası değildir ve gerçekleşmeden gerçekleşmeye büyük değişir
  const hiB = (M, c) => bandRms(M.psd.f, M.psd[c], f1, fN);
  const acPsd = (R, c) => welch(detrend(Float64Array.from(R.rec[c].subarray(3000)), 'linear'), 1000, 8192);
  const acB = (R, c) => { const w = acPsd(R, c); return bandRms(w.f, w.P, f1, fN); };
  const acR = (R, c) => aRms(detrend(Float64Array.from(R.rec[c].subarray(3000)), 'linear'));
  const tot = {}, acTot = {}, b206 = {}, lin = {}, ang = {}, totFull = {};
  for (const c of ['el', 'xel']) {
    lin[c] = Math.sqrt(runs.reduce((s, r) => s + sq(ex(hiB(r.M, c), hiB(Mb, c))), 0));
    ang[c] = angOn ? ex(hiB(Mang, c), hiB(Mb, c)) : 0;
    tot[c] = Math.sqrt(sq(hiB(Mb, c)) + sq(lin[c]) + sq(ang[c]));
    totFull[c] = Math.sqrt(sq(Mb.rms[c]) + runs.reduce((s, r) => s + sq(ex(r.M.rms[c], Mb.rms[c])), 0) + (angOn ? sq(ex(Mang.rms[c], Mb.rms[c])) : 0));
    const ab = acB(Rb, 'ac_' + c);
    acTot[c] = Math.sqrt(sq(ab) + runs.reduce((s, r) => s + sq(ex(acB(r.R, 'ac_' + c), ab)), 0) + (angOn ? sq(ex(acB(Rang, 'ac_' + c), ab)) : 0));
    b206[c] = Math.sqrt(runs.reduce((s, r) => s + sq(ex(bnd(r.M, c), bnd(Mb, c))), 0) + (angOn ? sq(ex(bnd(Mang, c), bnd(Mb, c))) : 0));
  }
  const al = budgetAlloc(P), b3 = Math.sqrt(['B3-01', 'B3-02', 'B3-03', 'B3-04'].reduce((s, q) => s + sq(al[q]), 0));
  const lim = Math.sqrt(sq(al['B2-06']) + sq(b3)) * 1e-6;
  const ok = Math.max(tot.el, tot.xel) <= lim;
  ctx.T31 = { runs, tot, acTot, Rb };
  const pw = psdWeighting(runs[1].M.psd.f, runs[1].M.psd.el, d.Tint);
  const res = mkResult('T3.1', {
    status: stat(ok), measured: `B2-06 ⊕ B3 LOS (≥ ${f1} Hz; taban + 3 öteleme ekseni${angOn ? ' + direk açısal yolu' : ''}): optik el ${urad(tot.el)} / xel ${urad(tot.xel)} µrad; ayna kanalı el ${urad(acTot.el)} / xel ${urad(acTot.xel)} µrad (sınır ${urad(lim, 1)})`,
    kv: [['Taban (shaker kapalı: soğutucu, gyro, ölçüm zinciri), ≥ ' + f1 + ' Hz / tüm bant', `optik el ${urad(hiB(Mb, 'el'))} / ${urad(Mb.rms.el)} · xel ${urad(hiB(Mb, 'xel'))} / ${urad(Mb.rms.xel)} µrad`]]
      .concat(runs.map(r => [`Shaker ekseni ${'xyz'[r.axis]} (tabanın üstünde, ≥ ${f1} Hz)`, `optik el ${urad(ex(hiB(r.M, 'el'), hiB(Mb, 'el')))} / xel ${urad(ex(hiB(r.M, 'xel'), hiB(Mb, 'xel')))} µrad; otokolimatör el ${urad(ex(acB(r.R, 'ac_el'), acB(Rb, 'ac_el')))} µrad`]))
      .concat([['Tüm bant toplamı (bilgi; B1 gyro yürüyüşü dahil)', `optik el ${urad(totFull.el)} / xel ${urad(totFull.xel)} µrad`]])
      .concat([angOn ? ['Direk modu açısal yolu (açısal uyarıcı, öneri)', `optik el ${urad(ang.el)} / xel ${urad(ang.xel)} µrad; uyarım roll ${urad(aRms(Float64Array.from(Rang.rec.base_r.subarray(3000))), 1)} µrad RMS`]
                     : ['Direk modu açısal yolu', 'modelde kapalı (κ = 0): bütçede karşılığı olan yollar öteleme yollarıdır (Model → DUT → direk modu)'],
               ['B2-06 (4–33 Hz bandı, taban çıkarılmış)' + (angOn ? ': öteleme / açısal / toplam' : ', el / xel'), angOn ? `${urad(Math.sqrt(runs.reduce((s, r) => s + sq(ex(bnd(r.M, 'el'), bnd(Mb, 'el'))), 0)))} / ${urad(ex(bnd(Mang, 'el'), bnd(Mb, 'el')))} / ${urad(b206.el)} µrad (el)` : `${urad(b206.el)} / ${urad(b206.xel)} µrad`],
               ['Fikstür sallanması (y ekseni): bastırılmış ' + P.lab.rocking.controlled + ' / serbest ' + P.lab.rocking.free + ' µrad/mm',
                 `taban roll ${urad(aRms(detrend(Float64Array.from(runs[1].R.rec.base_r.subarray(3000)), 'linear')), 2)} / ${urad(aRms(detrend(Float64Array.from(Rfree.rec.base_r.subarray(3000)), 'linear')), 2)} µrad RMS → optik LOS el ${urad(runs[1].M.rms.el, 2)} / ${urad(Mfree.rms.el, 2)} µrad (stab ON'da DRR sallanmayı bastırır; stab OFF ölçümde doğrudan görünür)`],
               ['Wander / smear (y ekseni, PSD ağırlığı)', urad(pw.wander) + ' / ' + urad(pw.smear) + ' µrad'],
               ['Profil', 'Ölçülmüş platform PSD\'si (örnek): 4–33 Hz rastgele + 50 Hz yardımcı makine tonu + 60–400 Hz geniş bant']]),
    notes: ['Sonsuzdaki hedefte öteleme görüntüyü kaydırmaz; sallanma (rocking) kaydırır. Numune açısal hareketi ağırlık merkezi ve çok noktalı kontrolle bastırılır, kalan ölçülür (Honlet & Wehrenberg 2015).',
            'Shaker fikstürü rijittir: direk yapısı platform titreşimini direk tepesinde açısal harekete de çeviriyorsa (Model → direk modu κ > 0) bu yol shaker testinde oluşmaz. Ölçülmüş direk tepesi açısal PSD\'si açısal uyarıcıyla oynatılmalı (κ > 0 iken öneri koşusu eklenir) ya da analizle kapatılmalıdır; aksi halde B2-06 eksik doğrulanır.',
            'Taban koşusu (shaker kapalı) karesel olarak çıkarıldı: soğutucu ve gyro gürültüsü her koşuda bulunur, eksenler toplanırken bir kez sayılmalıdır.',
            'Kabul toplamı bant sınırlıdır (≥ 4 Hz, platform profilinin alt kenarı): B2-06 ⊕ B3 tahsisi tabanın düşük frekanslı gyro yürüyüşünü (B1-05) içermez. Tüm bant toplamı bilgi olarak verilir; 60 s kayıtta bu yürüyüş gerçekleşmeden gerçekleşmeye birkaç µrad değişir ve önceki sürümde bir tohum tekrarında yalnız bu yüzden sınır aşılıyordu.',
            'Referans aynası mekanik açıyı ölçer: optik içi hareket (soğutucu, optik alt montaj) aynada görünmez — ayna ile optik LOS farkına bakın.'],
    fill: { 'B2-06': b206.el },
  });
  const mE = runs[1].M;
  const sel = (f, P0) => { const xs = [], ys = []; for (let i = 1; i < f.length; i++) if (f[i] >= 2 && f[i] <= 500) { xs.push(f[i]); ys.push(P0[i] * 1e12); } return { x: Float32Array.from(xs), y: Float32Array.from(ys) }; };
  const pac = welch(detrend(Float64Array.from(runs[1].R.rec.ac_el.subarray(3000)), 'linear'), 1000, 8192);
  const a1 = sel(mE.psd.f, mE.psd.el), a2 = sel(pac.f, pac.P), a0 = sel(Mb.psd.f, Mb.psd.el);
  const psdSer = [{ name: 'Optik LOS, shaker y', x: a1.x, y: a1.y }, { name: 'Otokolimatör, shaker y', x: a2.x, y: a2.y }];
  if (angOn) { const a3 = sel(Mang.psd.f, Mang.psd.el); psdSer.push({ name: 'Optik LOS, açısal yol', x: a3.x, y: a3.y }); }
  psdSer.push({ name: 'Taban (shaker kapalı)', x: a0.x, y: a0.y });
  res.plots.push({ title: 'LOS PSD (el): shaker y ekseni ve taban', xLabel: 'Hz', yLabel: 'µrad²/Hz', xLog: true, yLog: true, series: psdSer });
  // süpürme: LOS / ivme aktarımı
  const tr = recT(Rsw), sch = makeComponent({ type: 'chirp', axis: 1, f0: 4, f1: 33, octPerMin: 1, ampFn: () => 1, t0: 2, ramp: 2 }, 1000, makeRngFactory(1));
  const fx = [], gy = [];
  for (let t0 = 4; t0 < 186; t0 += 2) {
    const fc = sch.freqAt(t0 + 1); if (!fc) continue;
    const [i0, i1] = idxRange(tr, t0, t0 + 2);
    const fit = sineFit(tr, Rsw.rec.opt_el, fc, { i0, i1 }); if (!fit) continue;
    fx.push(fc); gy.push(fit.A / (sq(TAU * fc) * 0.254e-3) * 1e6);
  }
  res.plots.push({ title: 'MIL-STD-167-1A Type I keşif süpürmesi (0,254 mm), y ekseni: LOS / ivme', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, yLog: true,
    series: [{ name: 'el', x: Float32Array.from(fx), y: Float32Array.from(gy), dots: true }] });
  return res;
};
// T3.2 — titreşim altında MTF
TESTS['T3.2'] = function (P, ctx, prog) {
  const d = derive(P);
  if (!ctx.T31) TESTS['T3.1'](P, ctx, prog);
  const rng = new RNG(seedOf(P, 3201)), nM = 3;
  // Test tanımı: statik ve titreşimli, her biri ≥ 3 ölçüm. Statik = shaker kapalı taban koşusu (soğutucu vb. kare içi
  // jitter'ı her iki ölçümde de vardır ve oranda sadeleşir). Kayıt 3 eşit parçaya bölünür; her parça bir eğik kenar ölçümüdür.
  const mtfSeg = (Rr) => {
    const V = sliceVideo(Rr.video, 3), n = V.n, L = Math.floor(n / nM), o = [];
    for (let q = 0; q < nM; q++) {
      let se = 0, sx = 0, ve = 0, vx = 0; for (let i = q * L; i < (q + 1) * L; i++) { se += V.oEl[i]; sx += V.oXel[i]; ve += V.vEl[i]; vx += V.vXel[i]; }
      o.push({ el: se / L * (1 + 0.01 * rng.gauss()), xel: sx / L * (1 + 0.01 * rng.gauss()), smEl: Math.sqrt(ve / L), smXel: Math.sqrt(vx / L) });   // eğik kenar tekrarlanabilirliği ±%1
    }
    return o;
  };
  const st = mtfSeg(ctx.T31.Rb), stEl = aMean(st.map(s => s.el)), stXel = aMean(st.map(s => s.xel));
  const sd = (a) => a.length > 1 ? aStd(a) * Math.sqrt(a.length / (a.length - 1)) : 0;
  const per = ctx.T31.runs.map(r => {
    const m = mtfSeg(r.R), qe = m.map(s => s.el / stEl), qx = m.map(s => s.xel / stXel);
    return { axis: r.axis, rEl: aMean(qe), rXel: aMean(qx), sEl: sd(qe), sXel: sd(qx), smEl: aMean(m.map(s => s.smEl)), smXel: aMean(m.map(s => s.smXel)) };
  });
  const H5 = (r) => Math.SQRT2 * d.IFOV * Math.sqrt(Math.max(0, -Math.log(Math.min(r, 0.999999)))) / Math.PI;
  const lim = Math.exp(-sq(Math.PI) * sq(d.req.smear) / (2 * sq(d.IFOV)));
  const worst = Math.min(...per.map(p => Math.min(p.rEl, p.rXel)));
  const ok = worst >= lim;
  return mkResult('T3.2', {
    status: stat(ok), measured: `MTF_titreşim/MTF_statik @ Nyquist en kötü ${fmt(worst, 4)} (sınır ${fmt(lim, 4)}); eksen başına ${nM} ölçüm`,
    kv: per.map(p => [`Shaker ${'xyz'[p.axis]}`, `oran el ${fmt(p.rEl, 4)} ± ${fmt(p.sEl, 4)} / xel ${fmt(p.rXel, 4)} ± ${fmt(p.sXel, 4)} → MTF'ten smear ${urad(H5(p.rEl))} / ${urad(H5(p.rXel))} µrad; doğrudan smear ${urad(p.smEl)} / ${urad(p.smXel)} µrad`])
      .concat([['Statik (shaker kapalı) kare içi jitter MTF\'i', `el ${fmt(stEl, 4)} / xel ${fmt(stXel, 4)} (${nM} ölçüm; optik MTF oranda sadeleşir)`]]),
    notes: ['MTF, kare içi gerçek LOS dağılımından (her kare için |OTF| Nyquist\'te) hesaplanıp eğik kenar tekrarlanabilirliği (±%1) eklendi; oran titreşimli / statik ölçümün oranıdır.', 'H5: σ = √2·IFOV·√(−ln r)/π, Gauss varsayımı.'],
    fill: { 'MTF': worst },
  });
};
// T3.3 — yüksek hızlı LOS ölçümü (PSD ağırlıklandırma girdisi)
TESTS['T3.3'] = function (P, ctx, prog) {
  const d = derive(P);
  if (!ctx.T31) TESTS['T3.1'](P, ctx, prog);
  const r = ctx.T31.runs[1].R;
  const ac = detrend(Float64Array.from(r.rec.ac_el.subarray(3000)), 'linear'), op = detrend(Float64Array.from(r.rec.opt_el.subarray(3000)), 'linear');
  const pa = welch(ac, 1000, 8192), po = welch(op, 1000, 8192);
  const wa = psdWeighting(pa.f, pa.P, d.Tint), wo = psdWeighting(po.f, po.P, d.Tint);
  const ti = turInfo(P);
  const ok = ti.turS >= P.wb.TUR_target;
  const tab = logDecimPSD(pa.f, scaleArr(pa.P, 1e12), 120, 0.5);
  ctx.psdTable = tab;
  // v13.6: TUR bütçeden (analitik) gelir; T0.2 koşulduysa ölçülen otokolimatör tabanına U-03, U-04, U-05 eklenerek çapraz denetim
  const U = Object.fromEntries(ti.U.map(u => [u.id, u.vh != null ? u.vh : u.v])), fl = ctx.floor && ctx.floor.ac;
  const uhM = fl ? Math.sqrt(sq(Math.max(fl.el, fl.xel) * 1e6) + sq(U['U-03']) + sq(U['U-04']) + sq(U['U-05'])) : null;
  const res = mkResult('T3.3', {
    status: stat(ok), measured: `Yüksek hızlı kanal TUR (bütçeden) = ${fmt(ti.turS, 2)} (hedef ${P.wb.TUR_target}); ayna PSD'si: wander ${urad(wa.wander)} / smear ${urad(wa.smear)} µrad, gerçek optik: ${urad(wo.wander)} / ${urad(wo.smear)} µrad`,
    kv: [['Bant toplamları, ayna (B1/B2/B3)', ['B1', 'B2', 'B3'].map(b => urad(wa.bands[b].total)).join(' / ') + ' µrad'], ['Bant toplamları, optik (B1/B2/B3)', ['B1', 'B2', 'B3'].map(b => urad(wo.bands[b].total)).join(' / ') + ' µrad'],
         ['u_yüksek hızlı (U-02…U-07)', fmt(ti.uh) + ' µrad'], ['TUR_smear (k=1 / Z540.3)', fmt(ti.turS_k1, 2) + ' / ' + fmt(ti.turS_z, 2)],
         ['Ölçüme dayalı denetim: T0.2 otokolimatör tabanı ⊕ U-03 ⊕ U-04 ⊕ U-05', fl ? `${fmt(uhM)} µrad → TUR ${fmt(d.req.smear * 1e6 / (uhM * ti.mult), 2)} (bütçe ${fmt(ti.uh)} → ${fmt(ti.turS, 2)})` : 'T0.2 koşulmadı'],
         ['Dışa aktarılan PSD satırı', String(tab.f.length) + ' (f artan; PSD ağırlıklandırma girdisi)']],
    notes: ['Ayna (otokolimatör) kanalı optik içi hareketi göremez: soğutucu (B3-02) ve optik alt montaj (B3-03) eksik kalır. ROI (pencere) yüksek kare hızı modu optik LOS\'u doğrudan görürdü; kullanıcı kararıyla (v13.7) T3.3\'e eklenmedi.',
            'Durum, bütçedeki u_h ile hesaplanan TUR\'dan gelir (analitik). T0.2\'nin stab OFF otokolimatör kaydı zincirin hava ⊕ gürültü kısmını ölçer; masa mikro-titreşimi (U-03), IMU (U-04) ve ölçek (U-05) bütçeden eklenerek aynı TUR ölçüme dayalı olarak denetlenir.'],
    num: { turS: ti.turS, uh: ti.uh, uhMeas: uhM },
  });
  res.plots.push({ title: 'Kümülatif RMS (el): ayna vs optik', xLabel: 'Hz', yLabel: 'µrad', xLog: true,
    series: [{ name: 'Ayna (otokolimatör)', x: Float32Array.from(pa.f.subarray(1)), y: Float32Array.from(cumRms(pa.f, pa.P).subarray(1), v => v * 1e6) },
             { name: 'Optik LOS (gerçek)', x: Float32Array.from(po.f.subarray(1)), y: Float32Array.from(cumRms(po.f, po.P).subarray(1), v => v * 1e6) }] });
  return res;
};
// T3.4 — kriyo-soğutucu mikrofoniği
TESTS['T3.4'] = function (P, ctx, prog) {
  const d = derive(P), fc = P.dut.cooler.f, fps = d.fps, Tint = d.Tint;
  const out = []; let k = 0;
  for (const stab of [true, false]) {
    const R = runSim(P, labScenario(P, { label: 'T3.4', T: 125, fs: 4000, stab, hexActive: false, seed: 3401 + k,
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel'] } }), (p) => prog && prog((k + p) / 2)); k++;
    const tr = recT(R), [i0, i1] = idxRange(tr, 5, 125);
    const acA = sineFit(tr, R.rec.ac_el, fc, { i0, i1 }).A;
    const trA = sineFit(tr, R.rec.opt_el, fc, { i0, i1 }).A;
    // v13.11 (§11): gerçek soğutucu LOS'u optik kanalda 1.–3. harmoniğin sinüs uydurmasından (önce kaydın toplam RMS'i yazılıyordu;
    // o değer soğutucuyla ilgisiz gyro yürüyüşünü ve hava türbülansını da taşıyordu)
    const fRecN = R.meta.fRec / 2, hA = [1, 2, 3].map(h => (h * fc < 0.9 * fRecN ? sineFit(tr, R.rec.opt_el, h * fc, { i0, i1 }).A : NaN));
    const trTot = Math.sqrt(hA.filter(isFinite).reduce((a, b) => a + b * b, 0) / 2);
    const v = videoAngles(R, ctx); const [j0, j1] = idxRange(v.t, 5, 125);
    const fa = Math.abs(fc - Math.round(fc / fps) * fps);
    // v13.11 (§11): katlanan frekans 0'a ya da Nyquist'e (fps/2) çok yakınsa ton videoda ayrıştırılamaz (stroboskopik sabit ya da
    // genliği fazına bağlı Nyquist tonu): uydurma yapılmaz, test GEÇERSİZ olur. Sınır: kayıt penceresinin iki frekans çözünürlüğü
    const fGuard = 2 / (v.t[Math.max(j0, j1 - 1)] - v.t[j0]), aliasOk = fa >= fGuard && fa <= fps / 2 - fGuard;
    const al = aliasOk ? sineFit(v.t, v.el, fa, { i0: j0, i1: j1, valid: v.ok }) : { A: NaN };
    const corr = al.A / Math.abs(sinc(Math.PI * fc * Tint));
    out.push({ stab, acA, trA, hA, trTot, fa, alA: al.A, corr, aliasOk, fGuard });
  }
  const o = out[0], est = o.corr / Math.SQRT2, pg = pixPhaseInfo(P, ctx);
  const ok = est <= budgetAlloc(P)['B3-02'] * 1e-6;
  const nF = Math.round(fc / fps), aliasTxt = `${fc} Hz → |${fc} − ${nF}·${fps}| = ${fmt(o.fa, 1)} Hz`;
  return mkResult('T3.4', {
    status: o.aliasOk ? stat(ok) : 'GEÇERSİZ',
    measured: o.aliasOk ? `Videoda ${fmt(o.fa, 1)} Hz'e katlanan ton → sinc düzeltmeli temel bileşen ${urad(est)} µrad RMS (tahsis ${fA(budgetAlloc(P)['B3-02'])}); ayna kanalı ${urad(o.acA / Math.SQRT2, 3)} µrad (görmez)`
      : `Soğutucu tonu videoda ayrıştırılamıyor: ${aliasTxt} (${o.fa < o.fGuard ? 'stroboskopik: kare hızının katına çok yakın, ton sabit bir sapmaya dönüşür' : 'kare hızının yarısına çok yakın: genlik fazına bağlı'}); ROI modu, farklı kare hızı ya da optik yüksek hızlı kanal gerekir`,
    kv: out.map(q => [`Stab ${q.stab ? 'ON' : 'OFF'}`, `ayna ${urad(q.acA / Math.SQRT2, 3)} µrad · ${q.aliasOk ? `video alias ${urad(q.alA / Math.SQRT2)} µrad → düzeltilmiş ${urad(q.corr / Math.SQRT2)} µrad` : 'video: ayrıştırılamaz'} · gerçek ${fc} Hz bileşeni ${urad(q.trA / Math.SQRT2)} µrad`])
      .concat([['Katlanma', `${aliasTxt}; pencere W = sinc(π·${fc}·${Tint * 1e3} ms) = ${fmt(Math.abs(sinc(Math.PI * fc * Tint)), 3)}; ayrıştırma sınırı ${fmt(o.fGuard, 3)} Hz ile ${fmt(fps / 2 - o.fGuard, 2)} Hz arası`],
               ['Harmonikler', `${2 * fc} ve ${3 * fc} Hz videoda ${fmt(Math.abs(2 * fc - Math.round(2 * fc / fps) * fps), 1)} ve ${fmt(Math.abs(3 * fc - Math.round(3 * fc / fps) * fps), 1)} Hz'e katlanır; kabul yalnız temel bileşene uygulanır. Harmonikler için ROI modu veya optik yüksek hızlı kanal gerekir`],
               ['Gerçek soğutucu LOS (optik kanal, stab ON)', `temel / 2. / 3. harmonik ${o.hA.map(a => (isFinite(a) ? urad(a / Math.SQRT2) : '—')).join(' / ')} µrad → toplam ${urad(o.trTot)} µrad RMS`],
               ['Videonun küçük hareket kazancı (el, piksel fazı)', `${fmt(pg.gY, 3)} (${pg.src}); video genliği bu kazancı içerir`]]),
    notes: ['Soğutucu FPA/optik grubunu titreştirir: referans aynası (mekanik açı) bunu görmez. Video, katlanmış tonu verir; genlik, entegrasyon penceresinin sinc ağırlığıyla düzeltilir. Ölçülen genlik hedefin sub-piksel konumundaki küçük hareket kazancını da taşır (piksel fazı; kullanıcı kararıyla yalnız raporlanır).'],
    fill: o.aliasOk ? { 'B3-02': est } : {},
  });
};
// T3.5 — optik alt montaj modları (dwell, ayna vs optik ayrımı)
TESTS['T3.5'] = function (P, ctx, prog) {
  const d = derive(P), out = []; let k = 0;
  const modes = [{ f: P.dut.modes.opt.f, kind: 'shaker', a: 1.0 }, { f: P.dut.modes.gim.f, kind: 'açısal uyarıcı', alpha: 5 }];
  for (const m of modes) {
    const o = { label: 'T3.5', T: 62, fs: 4000, hexActive: false, seed: 3501 + k, rec: { fs: 2000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel'] } };   // her rezonansta 60 s
    if (m.kind === 'shaker') o.trans = [{ type: 'sine', axis: 1, A: m.a / sq(TAU * m.f), f: m.f, t0: 0.5, ramp: 0.5 }, { type: 'sine', axis: 2, A: m.a / sq(TAU * m.f), f: m.f, ph: 1, t0: 0.5, ramp: 0.5 }];
    else o.vib = [{ type: 'sine', axis: 0, A: m.alpha / sq(TAU * m.f), f: m.f, t0: 0.5, ramp: 0.5 }];
    o.cooler = false;
    const R = runSim(P, labScenario(P, o), (p) => prog && prog((k + p) / 2)); k++;
    const n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / R.meta.fRec;
    const [i0, i1] = idxRange(t, 2, 61.5);
    const op = sineFit(t, R.rec.opt_el, m.f, { i0, i1 }).A, me = sineFit(t, R.rec.mech_el, m.f, { i0, i1 }).A;
    out.push({ m, op, me, ratio: me / Math.max(op, 1e-15), cls: me / Math.max(op, 1e-15) < 0.3 ? 'Optik iç hareket (zoom grubu / FPA / ayna montajı) — aynada görünmez' : 'Gimbal / taşıyıcı yapı — aynada görünür' });
  }
  // işletme kestirimi B3-03: işletme geniş bant ivmesiyle izole koşu
  const row = OP_ROWS.find(r => r.id === 'B3-03');
  const Rop = runSim(P, rowScenario(P, row, { T: 30 }));
  const b303 = losMetrics(Rop, P, { skip: 5 }).rms.el;
  const ok = b303 <= budgetAlloc(P)['B3-03'] * 1e-6;
  return mkResult('T3.5', {
    status: stat(ok), measured: out.map(o => `${fmt(o.m.f, 0)} Hz: optik ${urad(o.op / Math.SQRT2, 2)} / ayna ${urad(o.me / Math.SQRT2, 2)} µrad RMS → ${o.cls}`).join('; ') + `; işletmede B3-03 ≈ ${urad(b303)} µrad`,
    kv: out.map(o => [`${fmt(o.m.f, 0)} Hz (${o.m.kind})`, `ayna/optik oranı ${fmt(o.ratio, 3)} — ${o.cls}`]).concat([['İşletme geniş bant titreşimiyle B3-03', urad(b303) + ' µrad RMS (tahsis ' + fA(budgetAlloc(P)['B3-03']) + ')']]),
    notes: ['Gerçek düzenekte stroboskobik ışık veya lazer vibrometre ile hangi alt montajın hareket ettiği görülür; burada ayna (mekanik) ile optik LOS genlik oranı aynı ayrımı verir. Düz ayna eğimi LOS\'a 2× yansır.'],
    fill: { 'B3-03': b303 },
  });
};
// T4.1 — boresight korunumu (basit istatistiksel model)
TESTS['T4.1'] = function (P, ctx) {
  if (!ctx.bore) TESTS['T0.5'](P, ctx);
  const rng = new RNG(seedOf(P, 4101)), acc = 15, req = P.ana.req.boresight_urad;
  const shift = ctx.bore.map((b, i) => ({ c: b.c, daz: i ? 3 * rng.gauss() + 8 * rng.gauss() : 0, del: i ? 3 * rng.gauss() + 8 * rng.gauss() : 0 }));
  const meas = shift.map(s => ({ c: s.c, daz: s.daz + acc * rng.gauss(), del: s.del + acc * rng.gauss() }));
  const worst = Math.max(...meas.map(m => Math.hypot(m.daz, m.del)));
  return mkResult('T4.1', { status: req == null ? 'BİLGİ' : stat(worst <= req), measured: `En büyük kanal kayması ${fmt(worst, 1)} µrad (ölçüm doğruluğu ≈ 15 µrad; gereksinim ${req == null ? 'girilmedi' : req + ' µrad'})`,
    kv: meas.map(m => [m.c, `Δaz ${fmt(m.daz, 1)}, Δel ${fmt(m.del, 1)} µrad (gerçek ${fmt(shift.find(s => s.c === m.c).daz, 1)}, ${fmt(shift.find(s => s.c === m.c).del, 1)})`]),
    notes: ['Basit istatistiksel model: titreşim (σ = 3 µrad) ve şok (σ = 8 µrad) sonrası kalıcı kayma; fizik tabanlı değildir. Boresight gereksinimi proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).'] });
};
// T4.2 — sıcaklık × dinamik (mühendislik beklentisi)
TESTS['T4.2'] = function (P, ctx, prog) {
  const temps = [{ T: -20, fr: 2.0, b: 1.6 }, { T: 20, fr: 1.0, b: 1.0 }, { T: 55, fr: 0.85, b: 0.8 }];
  const cases = [];
  for (const tc of temps) { cases.push({ tc, sched: false }); if (tc.fr !== 1) cases.push({ tc, sched: true }); }
  const out = []; let k = 0;
  const fS = 0.05, nper = 6;
  const VS = vivSpec(P), ship = VS.kind === 'wind', toneOn = !ship || VS.present;      // gemide VIV yoksa ton segmenti koşulmaz
  const fT = ship ? VS.f : P.wb.viv.fn, fTl = fmt(fT, 2) + ' Hz', useTone = toneOn && (ship || VS.lin);   // v13.3: denizaltında öteleme açıksa açısal + öteleme tonu
  for (const cs of cases) {
    const tc = cs.tc, P2 = cloneParams(P);
    for (const a of [P2.dut.el, P2.dut.az]) { a.Fc *= tc.fr; a.Fs *= tc.fr; a.b *= tc.b; }
    P2.dut.gyro.Top = tc.T;          // FOG sıcaklık katsayıları (v11): ΔT = T − Tcal; katsayılar 0 ise etkisiz
    // sabit FF: ileri besleme modeli 20 °C'deki F_c ile kalır → etkin η = η/fr. Programlı FF: model sıcaklıkla güncellenir.
    if (!cs.sched) P2.dut.ctl.ff.eta = P.dut.ctl.ff.eta / tc.fr;
    const sg = segSines(ship ? (toneOn ? [{ axis: 0, f: fS, A: 5 * D2R, nper }, { axis: 0, f: fT, A: VS.A, nper: Math.round(30 * fT) }] : [{ axis: 0, f: fS, A: 5 * D2R, nper }])
      : [{ axis: 0, f: fS, A: 5 * D2R, nper }, { axis: 0, f: P.wb.viv.fn, A: P.wb.viv.amp_deg * D2R, nper: Math.round(30 * P.wb.viv.fn) }]);
    let cmd = sg.cmd, trans = [];
    if (useTone) {     // gemi ve (v13.3) denizaltı: ton segmenti VIV biçiminde (açısal + aynı fazda öteleme), aynı zamanlamayla
      const c1 = sg.cmd[1], tn = windTone(P2, VS, fT, c1.t0, c1.t1, c1.ramp);
      cmd = [sg.cmd[0]].concat(tn.cmd); trans = tn.trans;
      if (Math.abs(VS.roll) < Math.abs(VS.pitch)) sg.segs[1].axis = 1;
    }
    const R = runSim(P2, labScenario(P2, { label: 'T4.2', T: sg.T, fs: 4000, cmd, trans, resF: fT, seed: 4201 + k }), (p) => prog && prog((k + p) / cases.length)); k++;   // dar bant kontrol tona ayarlı
    const tr = recT(R), s0 = sg.segs[0];
    let i0 = 0; while (i0 < tr.length && tr[i0] < s0.c0) i0++;
    const K = Math.floor((s0.c1 - s0.c0) * fS + 1e-9);
    const A = tsaAnalysis(tr, R.rec.ac_el, fS, i0, K, R.meta.fRec);
    if (!toneOn) { out.push({ T: tc.T, sched: cs.sched, pk: A.pk, det: A.det, viv: NaN, drr: NaN }); continue; }
    const f2 = fitSegments(P2, R, [sg.segs[1]], ctx)[0];
    const vv = useTone ? Math.max(f2.fe.A, f2.fx.A) / Math.SQRT2 : f2.fe.A / Math.SQRT2;
    out.push({ T: tc.T, sched: cs.sched, pk: A.pk, det: A.det, viv: vv, drr: useTone ? db(vv / (VS.A / Math.SQRT2)) : drrOf(f2.fe, f2.fin) });
  }
  const AL = budgetAlloc(P), limP = P.wb.k_conf * AL['B1-07'] * 1e-6, limV = AL['B2-01'] * 1e-6;
  const cfgSched = !!P.dut.ctl.ff.tempSched;
  const cfg = out.filter(o => o.sched === cfgSched || o.T === 20);
  const vivOn = VS.present;          // VIV yoksa ton ölçütü (B2-01) uygulanmaz; denizaltında ton bilgi olarak koşulur (v13.3: hız zarfı kuralı dahil)
  const ok = cfg.every(o => o.pk <= limP && (!vivOn || o.viv <= limV));
  const lbl = (o) => `${o.T} °C${o.T === 20 ? '' : (o.sched ? ' (programlı FF)' : ' (sabit FF)')}`;
  const Gy = P.dut.gyro, tcOn = (Gy.tcBias || 0) !== 0 || (Gy.tcSF || 0) !== 0;
  const tcKv = tcOn ? temps.map(t => { const dT = t.T - (Gy.Tcal != null ? Gy.Tcal : 20), db0 = (Gy.tcBias || 0) * dT, dsf = (Gy.tcSF || 0) * dT;
    return [`Gyro sıcaklık etkisi ${t.T} °C (ΔT = ${fmt(dT, 0)} °C)`, `bias ${fmt(Gy.bias0, 3)} → ${fmt(Gy.bias0 + db0, 3)} °/h (τ = ${P.wb.tau} s'de ${fmt((Gy.bias0 + db0) * DEGPH * P.wb.tau * 1e6, 2)} µrad kayma; drift tahsisi ${fmt(derive(P).req.drift * 1e6, 0)} µrad); ölçek ${fmt(Gy.sf_ppm + dsf, 0)} ppm`]; }) : [];
  return mkResult('T4.2', { status: stat(ok),
    measured: `Yapılandırılmış DUT (${cfgSched ? 'sıcaklık programlı' : 'sabit'} FF): ` + cfg.map(o => `${o.T} °C sürtünme tepesi ${urad(o.pk, 1)} µrad` + (toneOn ? `, ${fTl} artık ${urad(o.viv)} µrad` : '')).join('; ') +
      (vivOn ? '' : (ship ? ' (rüzgâr VIV\'i yok: ton segmenti koşulmadı)' : ` (${VS.on ? 'işletme hız zarfında VIV yok' : 'VIV kapalı'}: ${fTl} artığı bilgi amaçlı)`)),
    kv: out.map(o => [lbl(o), `sürtünme tepesi (TSA) ${urad(o.pk, 1)} µrad (sınır ${urad(limP, 1)}), tekrarlanan RMS ${urad(o.det, 2)} µrad` + (toneOn ? ` · ${ship ? 'rüzgâr VIV tonu artığı (el/xel büyüğü)' : (useTone ? 'VIV tonu artığı (açısal + öteleme; el/xel büyüğü)' : 'VIV tonu artığı')} ${urad(o.viv)} µrad, DRR ${fmt(o.drr, 1)} dB (tahsis ${urad(limV, 0)})` : '')]).concat(tcKv),
    notes: ['Soğukta yağ dolu keçenin sürtünmesi ve viskoz direnci artar (mühendislik beklentisi, kaynak değil): −20 °C\'de sürtünme ×2, viskoz kuplaj ×1,6; +55 °C\'de ×0,85 / ×0,8.',
            'Sabit FF: sürtünme kompanzasyonu 20 °C modelinde kalır; soğukta eksik (η_etkin ≈ 0,48), sıcakta aşırı (η_etkin ≈ 1,12) kompanze eder. Aşırı kompanzasyon negatif sürtünme gibi davranır ve yön değişimlerinde sıçrama üretir.',
            'Programlı FF: sürtünme modeli sıcaklıkla güncellenir (örn. keçe sıcaklık sensörü + çizelge ya da çevrimiçi sürtünme kestirimi). Model sekmesinden yapılandırmaya eklenebilir.',
            ship ? `Tepe değerler senkron ortalamayla (T1.6 yöntemi) bulundu; ${toneOn ? `${fTl} rüzgâr VIV tonu (açısal${VS.lin ? ' + öteleme' : ''}) yapılandırılmış dar bant kontrolle koşuldu.` : 'rüzgâr VIV\'i bu ayarlarla oluşmadığı için ton segmenti koşulmadı.'}`
              : `Tepe değerler senkron ortalamayla (T1.6 yöntemi) bulundu; ${fTl} VIV tonu (açısal${useTone ? ' + mast başı ötelemesi' : ''}) yapılandırılmış dar bant kontrolle koşuldu.`] });
};
const TEST_ORDER = ['T0.1', 'T0.2', 'T0.3', 'T0.4', 'T0.5', 'T0.6', 'T0.7', 'T1.1', 'T1.2', 'T1.3', 'T1.4', 'T1.5', 'T1.6', 'T1.7', 'T1.8', 'T1.9',
  'T2.1', 'T2.2', 'T2.3', 'T2.4', 'T2.5', 'T3.1', 'T3.2', 'T3.3', 'T3.4', 'T3.5', 'T4.1', 'T4.2'];
const FOV_LOSS_EXPECTED = new Set(['T1.8']);       // dönüş testi: hedef dönüş sırasında alandan bilerek çıkar
function runTest(id, P, ctx, prog) {
  const t0 = Date.now();
  RUNLOG = [];
  let r;
  try { r = TESTS[id](P, ctx, prog); }
  catch (e) {
    r = mkResult(id, { status: 'GEÇERSİZ', measured: 'Test değerlendirilemedi: ' + (e && e.message ? e.message : String(e)),
      notes: ['Analiz bir ara sonuç üretemedi (ör. geçerli kare kalmadı). Aşağıdaki geçerlilik notuna ve parametrelere bakın.'] });
    r.error = String(e && e.stack || e);
  }
  // v13.10 (§9 kararları): varsayılandan farklı dar bant kestirim hatası ya da gözlemci modeli sonucu etkileyen testlere not düşülür
  { const RS = P.dut.ctl.res || {}, FO = (P.dut.ctl.ff && P.dut.ctl.ff.obs) || {}, nonUnit = ['Fc', 'Fs', 'vs', 's0'].filter(k => FO[k] != null && FO[k] !== 1);
    if (r && Array.isArray(r.notes)) {
      if (RS.on && RS.adaptive && RS.estErr && ['T2.1', 'T2.2', 'T2.3', 'T4.2'].includes(id)) r.notes.push(`Uyarlanır dar bant tonun frekansını %${fmt(100 * RS.estErr, 1)} ${RS.estErr > 0 ? 'yüksek' : 'düşük'} kestiriyor (Model → Örnek DUT — stabilizasyon döngüsü; varsayılan 0 = ideal).`);
      if (P.dut.ctl.ff && P.dut.ctl.ff.on && nonUnit.length && ['T1.6', 'T2.4', 'T4.2', 'T2.2', 'T2.3'].includes(id)) r.notes.push(`Sürtünme gözlemcisinin modeli tesisten farklı: ${nonUnit.map(k => ({ Fc: 'F_c', Fs: 'F_s', vs: 'v_s', s0: 'σ0' })[k] + ' × ' + fmt(FO[k], 3)).join(', ')} (Model → Örnek DUT — stabilizasyon döngüsü; varsayılan 1 = tam bilgi).`);
    } }
  const log = RUNLOG || []; RUNLOG = null;
  // v13.7 (§7): en uzun stab AÇIK video kaydı (izleyicisiz, dönüşsüz laboratuvar koşuları) — kompanzasyon kapalıyken hangi testlerin
  // hedefi alandan kaçıracağı Model → Dünya dönüşü panelinde bu süreden belirlenir (önceden sabit liste: T2.1 eksikti)
  const stabRuns = log.filter(q => q.isLab && q.stab && q.frames > 0 && !q.slew && !q.tracker);
  r.recT = { stabMax: stabRuns.length ? Math.max(...stabRuns.map(q => q.T)) : 0, n: stabRuns.length };
  const lost = log.filter(q => q.isLab && q.stab && q.frames > 0 && q.invalid > 0 && !q.slew);
  if (lost.length && !FOV_LOSS_EXPECTED.has(id)) {
    const q = lost.reduce((a, b) => (b.invalid / b.frames > a.invalid / a.frames ? b : a));
    const d = derive(P), es = earthSheet(P), compOff = lost.some(z => !z.comp);
    const frac = 100 * (1 - q.invalid / q.frames);
    const short = `hedef t = ${fmt(q.firstInvalidT, 0)} s'de görüş alanından çıktı (geçerli kare %${fmt(frac, 1)})`;
    const msg = `Hedef t = ${fmt(q.firstInvalidT, 0)} s'de görüş alanından çıktı (${q.label}: geçerli kare %${fmt(frac, 1)}).` +
      (compOff ? ` Dünya dönüşü kompanzasyonu kapalı (Model → Dünya dönüşü): eylemsiz LOS laboratuvara göre yatay ${fmt(es.h, 1)} / düşey ${fmt(es.v, 1)} µrad/s kayar ve hedef ≈ ${fmt(es.off.exit, 0)} s'de alanı terk eder. Uzun kayıtlarda kompanzasyon açık olmalı; T0.7 bu testin ön şartıdır.` : ' Bu noktadan sonraki kareler değerlendirmeye alınmadı.');
    r.notes = [msg].concat(r.notes || []);
    r.validity = { lostFrom: q.firstInvalidT, validPct: frac, compOff };
    if (compOff && id !== 'T0.7') { r.status = 'GEÇERSİZ'; r.measured = `Kayıt geçersiz: ${short}; dünya dönüşü kompanzasyonu kapalı. Geçerli kalan segmentler: ` + r.measured; r.fill = {}; }
  }
  r.elapsed = (Date.now() - t0) / 1000;
  return r;
}
