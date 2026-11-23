// §8 Bütçe varsayımları — analitik tarama: motordan bağımsız ikinci uygulama ↔ motor (computeBudget satırları ve toplamları,
// görüntü rotasyonu sınırları, EIS çarpanları, drift), 22 durum. Bağımsız taraf satır girdilerini (E, F, G, H, L, M, Q) yalnız
// §8 dışı satırlar için motordan alır; §8 satırlarını (B1-04, B1-05, B1-06, B1-08, B1-09, B1-10, R-01) kendisi kurar.
// Ek: (a) B1-04'ün LOS ekseni etrafındaki dönmeye dayalı karşılığı (benzetimin ve T1.1'in fiziği), (b) rastgele yürüyüşün wander
// penceresindeki (doğrusal trend çıkarılmış) karşılığı σ√(T/15) — Monte Carlo ile doğrulanır.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const D2R = Math.PI / 180, DPH = Math.PI / 180 / 3600, G0 = 9.80665;
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
function indep(P) {
  const wb = P.wb, H = wb.H, eis = wb.eis, tau = wb.tau, ext = wb.extRows !== false;
  const ch = wb.channels.find(c => c.name === wb.refChannel), IF = ch.p_um / ch.f_mm * 1e-3, IFu = IF * 1e6;
  const fps = ch.fps, Tint = ch.Tint_ms * 1e-3;
  const SD = L.seaDOF(P), roll = SD.ang[0], acc = L.seaAccDirector(P);
  const fa = acc.fa > 0 ? acc.fa : (SD.six ? SD.lin[2].fdom : SD.ang[1].fdom);
  // görüntü rotasyonu: ölçüt noktası yarıçapı (px) → açı θ = atan(r·p/f)
  const rC = 0.5 * Math.hypot(ch.Nh, ch.Nv), rE = ch.Nh / 2, th = (r) => Math.atan(r * ch.p_um * 1e-6 / (ch.f_mm * 1e-3));
  const thRef = wb.rotRef === 'edge' ? th(rE) : th(rC);
  const my = {
    'B1-04': { E: H.eps_mrad * 1e-3 * roll.Aeq * D2R * 1e6, F: 'µrad genlik', G: roll.fdom },
    'B1-05': { E: H.arw * D2R / 60 * Math.sqrt(tau) * 1e6, F: 'µrad RMS', G: 1 / (2 * tau) },
    'B1-06': { E: H.bias * DPH * tau * 1e6, F: 'µrad RMS', G: 1 / (2 * tau) },
    'R-01': { E: H.roll_res_mrad * 1e-3 * thRef * 1e6, F: 'µrad RMS', G: roll.fdom, Q: wb.k_roll * IFu },
  };
  if (ext) {
    my['B1-08'] = { E: H.accSens * acc.eff, F: 'µrad RMS', G: fa };
    my['B1-09'] = { E: (H.b0_res + Math.abs(H.tc_bias * H.dT)) * DPH * tau * 1e6, F: 'µrad RMS', G: 1 / (2 * tau) };
    my['B1-10'] = { E: H.kg * DPH * acc.accInt / G0 * 1e6, F: 'µrad RMS', G: fa };
  }
  const eng = L.computeBudget(P, null).rows;
  const rows = eng.map(r => { const m = my[r.id]; return Object.assign({ id: r.id, H: r.H, L: r.L, M: r.M, Q: r.Q }, m ? m : { E: r.E, F: r.F, G: r.G }, m && m.Q != null ? { Q: m.Q } : {}); });
  for (const r of rows) {
    const rms = r.F === '° genlik' ? r.E * D2R * 1e6 / Math.SQRT2 : (r.F === 'µrad genlik' ? r.E / Math.SQRT2 : r.E);
    r.I = rms * Math.pow(10, r.H / 20);
    const x = Math.PI * r.G * Tint; r.N = r.G > 0 ? (Math.sin(x) / x) ** 2 : 1;
    r.O = r.I * Math.sqrt(r.N); r.Pp = r.I * Math.sqrt(1 - r.N);
    r.AC = r.G > 0 ? Math.abs(r.G - fps * Math.round(r.G / fps)) : 0;
    // EIS: y = (1−η)x + η·LP(x); artık çarpanı |(1 + j(1−η)f/f_c)/(1 + jf/f_c)|; f_c = 0 → 1 − η; katlanmış frekans 0 → 1 (EIS görmez)
    r.AD = r.AC <= 0 ? 1 : (eis.fc > 0 ? Math.hypot(1, (1 - eis.eta) * r.AC / eis.fc) / Math.hypot(1, r.AC / eis.fc) : 1 - eis.eta);
    r.AH = r.O * (r.AC <= 0 ? 1 : 1 - eis.eta); r.AE = r.O * r.AD;
  }
  // gruplar: M ≠ '' olan E satırları doğrusal, sonra karesel
  const tot = (key, band) => { let s = 0; const g = {}; for (const r of rows) { if (r.L !== 'E' || (band && !r.id.startsWith(band))) continue; if (r.M) g[r.M] = (g[r.M] || 0) + r[key]; else s += r[key] ** 2; } for (const k in g) s += g[k] ** 2; return Math.sqrt(s); };
  const reg = eis.reg_px * IFu;
  const E96 = my['B1-05'].E, E99 = my['B1-06'].E, E120 = wb.earth.Omega * wb.earth.delta_deg * D2R * tau * 1e6, Eb0 = ext ? my['B1-09'].E : 0;
  return { rows, wander: tot('O'), smear: tot('Pp'), los: tot('I'), eisWander: Math.sqrt(tot('AE') ** 2 + reg ** 2), eisLock: Math.sqrt(tot('AH') ** 2 + reg ** 2),
    drift: Math.hypot(E96, E99 + Eb0 + E120), limC: wb.k_roll * IF / th(rC), limE: wb.k_roll * IF / th(rE), thRef };
}
// B1-04'ün LOS ekseni etrafındaki dönmeye dayalı karşılığı (yatay LOS; serbestlik dereceleri bağımsız): σ_rot² = (cos a0·σ_r)² + (sin a0·σ_p)²
function b104los(P) {
  const SD = L.seaDOF(P), a0 = P.dut.geom.a0 * D2R, eps = P.wb.H.eps_mrad * 1e-3;
  const cr = Math.cos(a0) * SD.ang[0].sigma, cp = Math.sin(a0) * SD.ang[1].sigma, s = Math.hypot(cr, cp);
  return { rms: eps * s * 1e6, f: Math.abs(cr) >= Math.abs(cp) ? SD.ang[0].fdom : SD.ang[1].fdom, dom: Math.abs(cr) >= Math.abs(cp) ? 'roll' : 'pitch', roll: eps * SD.ang[0].sigma * 1e6 };
}
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const cases = [
  ['varsayılan (denizaltı)', mk()], ['gemi', mk('ship')],
  ['ARW 0,01 °/√h', mk(null, P => { P.wb.H.arw = 0.01; })], ['bias kararsızlığı 0,1 °/h', mk(null, P => { P.wb.H.bias = 0.1; })],
  ['eksen kaçıklığı ε 0,5 mrad', mk(null, P => { P.wb.H.eps_mrad = 0.5; })], ['artık rotasyon 1 mrad', mk(null, P => { P.wb.H.roll_res_mrad = 1; })],
  ['ölçüt noktası alan kenarı', mk(null, P => { P.wb.rotRef = 'edge'; })], ['k_roll 0,25 IFOV', mk(null, P => { P.wb.k_roll = 0.25; })],
  ['referans kanal HDTV-NFOV', mk(null, P => { P.wb.refChannel = 'HDTV-NFOV'; })], ['referans kanal MWIR-WFOV', mk(null, P => { P.wb.refChannel = 'MWIR-WFOV'; })],
  ['EIS f_c 0 (kilit)', mk(null, P => { P.wb.eis.fc = 0; })], ['EIS f_c 2 Hz', mk(null, P => { P.wb.eis.fc = 2; })], ['EIS η 0', mk(null, P => { P.wb.eis.eta = 0; })],
  ['EIS registrasyon 0', mk(null, P => { P.wb.eis.reg_px = 0; })], ['ivme duyarlılığı 10 µrad/(m/s²)', mk(null, P => { P.wb.H.accSens = 10; })],
  ['açılış bias artığı 0,1 °/h', mk(null, P => { P.wb.H.b0_res = 0.1; })], ['bias sıcaklık katsayısı 0,002 °/h/°C', mk(null, P => { P.wb.H.tc_bias = 0.002; })],
  ['g-duyarlılığı 1 °/h/g (gemi)', mk('ship', P => { P.wb.H.kg = 1; })], ['drift penceresi τ 10 s', mk(null, P => { P.wb.tau = 10; })],
  ['ek bütçe satırları kapalı', mk(null, P => { P.wb.extRows = false; })], ['LOS pruvaya bakar (a0 = 0°)', mk(null, P => { P.dut.geom.a0 = 0; })],
  ['6-DOF SS4, gemi, k_g 1', mk('ship', P => { P.wb.sea.mode = '6dof'; P.wb.H.kg = 1; })],
];
let worst = 0, where = '', n = 0; const out = [];
const relE = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
for (const [nm, P] of cases) {
  const A = indep(P), B = L.computeBudget(P, null), d = L.derive(P);
  const cmp = (k, a, b) => { n++; const e = relE(a, b); if (e > worst) { worst = e; where = `${nm} · ${k}`; } };
  for (const r of A.rows) { const q = B.rows.find(x => x.id === r.id); for (const k of ['E', 'G', 'I', 'O', 'Pp', 'AD', 'AE', 'AH']) cmp(r.id + '.' + k, r[k], q[k]); if (r.id === 'R-01') cmp('R-01.Q', r.Q, q.Q); }
  for (const k of ['wander', 'smear', 'los', 'eisWander', 'eisLock', 'drift']) cmp(k, A[k], B[k]);
  cmp('limC', A.limC, d.rot.limC); cmp('limE', A.limE, d.rot.limE); cmp('thRef', A.thRef, d.rot.ang);
  const g = (id) => A.rows.find(r => r.id === id), L4 = b104los(P);
  const o = { nm, wander: A.wander, eisW: A.eisWander, eisL: A.eisLock, drift: A.drift, b104: g('B1-04').I, b104los: L4.rms, b104f: L4.f, b104dom: L4.dom, b105: g('B1-05').I, b106: g('B1-06').I,
    b108: g('B1-08') ? g('B1-08').I : 0, b109: g('B1-09') ? g('B1-09').I : 0, b110: g('B1-10') ? g('B1-10').I : 0, r01: g('R-01').I, r01Q: g('R-01').Q, limC: A.limC * 1e6, limE: A.limE * 1e6,
    b105AE: g('B1-05').AE, b104AE: g('B1-04').AE, b101AE: g('B1-01').AE, reg: P.wb.eis.reg_px * d.IFOV * 1e6, arwWin: P.wb.H.arw * D2R / 60 * Math.sqrt(P.ana.Tw / 15) * 1e6 };
  out.push(o);
  console.log(`${nm.padEnd(36)} wander ${f(o.wander, 2)} · EIS ${f(o.eisW, 2)} / kilit ${f(o.eisL, 2)} · drift ${f(o.drift, 2)} | B1-04 ${f(o.b104, 2)} (LOS ekseni: ${f(o.b104los, 2)}, ${o.b104dom}) · B1-05 ${f(o.b105, 3)} (wander penceresinde ${f(o.arwWin, 2)}) · B1-06 ${f(o.b106, 3)} · B1-08 ${f(o.b108, 3)} · B1-09 ${f(o.b109, 3)} · B1-10 ${f(o.b110, 4)} | R-01 ${f(o.r01, 2)} / ${f(o.r01Q, 2)} · ψ_lim köşe ${f(o.limC, 1)} kenar ${f(o.limE, 1)} µrad`);
}
console.log(`\nmotor ↔ bağımsız: ${n} sayı, en büyük göreli fark ${worst.toExponential(2)} (${where})`);
// Monte Carlo: rastgele yürüyüşün T penceresinde doğrusal trend çıkarılmış RMS'i ↔ σ√(T/15), ortalaması çıkarılmış ↔ σ√(T/6)
function mb32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r = mb32(8101), gs = () => { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
const sig = 1, fsMC = 50, T = 120, nW = 4000, N = T * fsMC; let s15 = 0, s6 = 0;
for (let w = 0; w < nW; w++) {
  const x = new Float64Array(N); let acc = 0; for (let i = 0; i < N; i++) { acc += sig * Math.sqrt(1 / fsMC) * gs(); x[i] = acc; }
  const dl = L.detrend(x, 'linear'), dm = L.detrend(x, 'mean'); s15 += dl.reduce((s, v) => s + v * v, 0) / N; s6 += dm.reduce((s, v) => s + v * v, 0) / N;
}
const mc = { lin: Math.sqrt(s15 / nW), linExp: sig * Math.sqrt(T / 15), mean: Math.sqrt(s6 / nW), meanExp: sig * Math.sqrt(T / 6) };
console.log(`Monte Carlo (${nW} pencere, T = ${T} s): doğrusal trend çıkarılmış RMS ${f(mc.lin, 4)} ↔ σ√(T/15) ${f(mc.linExp, 4)}; ortalama çıkarılmış ${f(mc.mean, 4)} ↔ σ√(T/6) ${f(mc.meanExp, 4)}`);
require('fs').writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify({ worst, where, n, rows: out, mc }, null, 1));
