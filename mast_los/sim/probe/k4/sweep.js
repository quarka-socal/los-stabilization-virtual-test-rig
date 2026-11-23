// Teknik kılavuz §4 (VIV) — analitik değişim taraması. Denizaltı: hidrodinamik VIV taraması (vivTable), test bandı ve
// dwell adayları (vivBand), B2-01 analitik satırı ve T2.1'in gerekli DRR'ı; gemi: EN 1991-1-4 Ek E yaklaşım 1 (windVivCalc),
// kilitlenme bandı, B2-01. Her durumda motorun değerleri burada bağımsız yazılmış ifadelerle karşılaştırılır.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const D2R = Math.PI / 180, TAU = 2 * Math.PI, KN = 0.514444;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : (+x).toFixed(d);
const mk = (kind, fn) => { const P = L.defaultParams(kind); if (fn) fn(P); return P; };
const out = { sub: [], ship: [] };
// ------------------------------------------------------------------ denizaltı
const subCases = [
  ['S0', 'varsayılan (D 0,25 m, St 0,2, f_n 3 Hz, 0,05°)', mk('sub')],
  ['S1', 'D = 0,40 m', mk('sub', P => { P.wb.viv.D = 0.40; })],
  ['S2', 'St = 0,25 (transkritik)', mk('sub', P => { P.wb.viv.St = 0.25; })],
  ['S3', 'f_n = 2 Hz', mk('sub', P => { P.wb.viv.fn = 2; })],
  ['S4', 'f_n = 5 Hz', mk('sub', P => { P.wb.viv.fn = 5; })],
  ['S5', 'f_n = 8 Hz', mk('sub', P => { P.wb.viv.fn = 8; })],
  ['S6', 'genlik 0,10°', mk('sub', P => { P.wb.viv.amp_deg = 0.10; })],
  ['S7', 'K0 üst sınırı 2,7', mk('sub', P => { P.wb.viv.K0_hi = 2.7; })],
  ['S8', 'marj 0', mk('sub', P => { P.wb.viv.margin = 0; })],
  ['S9', 'VIV kapalı', mk('sub', P => { P.wb.viv.on = false; })],
];
for (const [id, nm, P] of subCases) {
  const v = P.wb.viv, hx = P.wb.hex, d = L.derive(P), T = L.vivTable(P), VB = L.vivBand(P), rows = L.budgetRows(P), r201 = rows.find(r => r.id === 'B2-01');
  const Q = L.budgetAlloc(P)['B2-01'], sig = v.amp_deg * D2R / Math.SQRT2 * 1e6;           // µrad RMS
  let worst = 0, txt = 0;
  for (const r of T) {
    const U = r.kn * KN, fv = v.St * U / v.D, K0 = fv / v.fn, Ur = U / (v.fn * v.D), Re = U * v.D / v.nu, w = TAU * fv;
    const cls = K0 >= v.K0_lo && K0 <= v.K0_hi ? 'TARAMA: RİSK' : (K0 >= v.K0_lo * (1 - v.margin) && K0 <= v.K0_hi * (1 + v.margin) ? 'Sınırda' : 'Düşük');
    for (const [a, b] of [[r.fv, fv], [r.K0, K0], [r.Ur, Ur], [r.Re, Re], [r.reach, Math.min(hx.theta_max, hx.omega_max / w, hx.alpha_max / (w * w))]]) worst = Math.max(worst, rel(a, b));
    if (r.scr !== cls) txt++;
  }
  const dw = T.filter(r => r.dwell), fLo = dw.length ? Math.min(...dw.map(r => r.fv)) : NaN, fHi = dw.length ? Math.max(...dw.map(r => r.fv)) : NaN;
  const est = v.on === false ? 0 : sig * Math.pow(10, -40 / 20), req = 20 * Math.log10(Q / sig);
  worst = Math.max(worst, dw.length ? Math.max(rel(VB.fLo, fLo), rel(VB.fHi, fHi)) : 0);
  const RS = P.dut.ctl.res, cover = dw.length ? dw.filter(r => r.fv >= RS.fmin && r.fv <= RS.fmax).length + '/' + dw.length : '—';
  const o = { id, nm, band: [fLo, fHi], cand: dw.map(r => +r.fv.toFixed(3)), risk: T.filter(r => r.scr.includes('RİSK')).map(r => r.kn), reWarn: T.filter(r => r.reWarn).length,
    ReRange: [Math.min(...T.map(r => r.Re)), Math.max(...T.map(r => r.Re))], UrRange: [Math.min(...T.map(r => r.Ur)), Math.max(...T.map(r => r.Ur))],
    B201: { E: r201.E, G: r201.G, H: r201.H, est: r201.K != null ? r201.K : null }, est, req, reachFn: d.reach(v.fn), cover, worst, txt };
  out.sub.push(o);
  console.log(`${id} ${nm}: bant ${f(fLo, 2)}–${f(fHi, 2)} Hz (aday ${o.cand.length}, risk hızları ${o.risk.join(',') || '—'} kn); U_r ${f(o.UrRange[0], 1)}–${f(o.UrRange[1], 1)}; Re ${f(o.ReRange[0] / 1e5, 1)}–${f(o.ReRange[1] / 1e5, 1)}·10⁵ (Re > Re_crit: ${o.reWarn}/9); B2-01 E ${v.amp_deg}° G ${r201.G} H ${r201.H} → ${f(est, 2)} µrad; gerekli DRR ${f(req, 1)} dB; erişim @ f_n ${f(o.reachFn, 2)}°; dar bant kapsar ${cover} | bağımsız fark ${worst.toExponential(1)}, metin ${txt}`);
}
// ------------------------------------------------------------------ gemi
function enW(P) {     // EN 1991-1-4 Ek E yaklaşım 1 — bağımsız yazım
  const W = P.wb.wviv, b = W.D, St = W.St, vcrit = b * W.fn / St, Re = b * vcrit / W.nu;
  const c0 = Re <= 3e5 ? 0.7 : (Re <= 5e5 ? 0.7 - 0.5 * Math.log10(Re / 3e5) / Math.log10(5 / 3) : (Re <= 5e6 ? 0.2 : 0.3));
  const ratio = vcrit / W.Umax, active = ratio <= 1.25, clat = active ? c0 : 0, Sc = 2 * W.delta * W.me / (W.rho * b * b), lam = W.L / b;
  let yb = 0, Ljb = 6, Kw = 0;
  for (let i = 0; i < 500; i++) { Ljb = yb < 0.1 ? 6 : (yb < 0.6 ? 4.8 + 12 * yb : 12); const x = Math.min(1, Ljb / lam); Kw = 1 - Math.pow(1 - x, 3); const yn = W.K * Kw * clat / (St * St * Sc); if (Math.abs(yn - yb) < 1e-14) { yb = yn; break; } yb = yn; }
  const yF = yb * b, th = W.kth * yF / W.L, meas = W.amp_deg != null && isFinite(W.amp_deg), theta = meas ? W.amp_deg * D2R : th, y = meas ? theta * W.L / W.kth : yF;
  return { vcrit, Re, c0, clat, ratio, active, Sc, Ljb, Kw, yb, yF, th, theta, y, acc: Math.pow(TAU * W.fn, 2) * y, lock: [vcrit * (1 - 0.4 * W.eps0), vcrit * (1 + 0.6 * W.eps0)] };
}
const shipCases = [
  ['W0', 'varsayılan (b 0,40 m, l 8 m, f_n 4,1 Hz, δ 0,02, U_max 25 m/s, β 0°)', mk('ship')],
  ['W1', 'β = 90° (yandan rüzgâr)', mk('ship', P => { P.wb.wviv.beta = 90; })],
  ['W2', 'δ_s = 0,05', mk('ship', P => { P.wb.wviv.delta = 0.05; })],
  ['W3', 'U_max = 6 m/s', mk('ship', P => { P.wb.wviv.Umax = 6; })],
  ['W4', 'f_n = 3 Hz', mk('ship', P => { P.wb.wviv.fn = 3; })],
  ['W5', 'b = 0,30 m', mk('ship', P => { P.wb.wviv.D = 0.30; })],
  ['W6', 'l = 12 m', mk('ship', P => { P.wb.wviv.L = 12; })],
  ['W7', 'm_e = 400 kg/m', mk('ship', P => { P.wb.wviv.me = 400; })],
  ['W8', 'St = 0,20', mk('ship', P => { P.wb.wviv.St = 0.20; })],
  ['W9', 'κ = 1,38', mk('ship', P => { P.wb.wviv.kth = 1.38; })],
  ['W10', 'ölçülmüş genlik 0,02°', mk('ship', P => { P.wb.wviv.amp_deg = 0.02; })],
  ['W11', 'öteleme kapalı', mk('ship', P => { P.wb.wviv.lin = false; })],
  ['W12', 'b = 1,0 m (Re süperkritik)', mk('ship', P => { P.wb.wviv.D = 1.0; })],
];
for (const [id, nm, P] of shipCases) {
  const w = L.windVivCalc(P), I = enW(P), VS = L.vivSpec(P), W = P.wb.wviv, d = L.derive(P), rows = L.budgetRows(P), r201 = rows.find(r => r.id === 'B2-01');
  const Q = L.budgetAlloc(P)['B2-01'], sig = VS.A / Math.SQRT2 * 1e6, req = VS.present ? 20 * Math.log10(Q / sig) : NaN, est = VS.present ? sig * Math.pow(10, W.drr_dB / 20) : 0;
  let worst = 0; for (const k of ['vcrit', 'Re', 'Sc', 'Kw', 'yF', 'theta', 'y', 'acc']) if (isFinite(I[k]) && I[k] !== 0) worst = Math.max(worst, rel(w[k], I[k]));
  worst = Math.max(worst, rel(w.clat0, I.c0), rel(w.lock[0], I.lock[0]), rel(w.lock[1], I.lock[1]));
  const o = { id, nm, vcrit: w.vcrit, Re: w.Re, regime: w.regime, clat: w.clat, ratio: w.ratio, active: w.active, Sc: w.Sc, Kw: w.Kw, yF: w.yF, thDeg: w.theta / D2R, acc: w.acc, lock: w.lock,
    roll: VS.roll, pitch: VS.pitch, tx: VS.tx, ty: VS.ty, lin: VS.lin, present: VS.present, req, est, reachFn: d.reach(W.fn), stroke: P.lab.hexStroke, worst };
  out.ship.push(o);
  console.log(`${id} ${nm}: v_crit ${f(w.vcrit, 2)} m/s (oran ${f(w.ratio, 2)}, ${w.active ? 'zarf içi' : 'incelenmez'}), Re ${f(w.Re / 1e5, 2)}·10⁵ ${w.regime}, c_lat ${f(w.clat, 3)}, Sc ${f(w.Sc, 1)}, K_W ${f(w.Kw, 3)}, y_F ${f(w.yF * 1e3, 2)} mm, θ ${f(w.theta / D2R, 4)}°, ivme ${f(w.acc, 2)} m/s²; kilit ${f(w.lock[0], 1)}–${f(w.lock[1], 1)} m/s; roll/pitch ${f(VS.roll, 2)}/${f(VS.pitch, 2)}; B2-01 tahmini ${f(est, 2)} µrad, gerekli DRR ${f(req, 1)} dB; erişim ${f(o.reachFn, 3)}° | bağımsız fark ${worst.toExponential(1)}`);
}
require('fs').writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify(out, null, 1));
