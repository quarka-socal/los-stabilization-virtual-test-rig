// Tüm örnek DUT ve ortam düzeylerinin bütçe örnek tahminlerine kalibrasyonu
const L = require('./engine.js');
const fs = require('fs');
const P = L.defaultParams();
P.dut.ctl.res.on = false;   // ortam düzeyleri taban döngüyle (bütçenin varsaydığı türden DUT) kalibre edilir
const FI = +(process.argv[2] || 4);
// 1) döngü: fi seç, el (b, k)'yı DRR(1/8) = −80 / DRR(3) = −40 için çöz; az: aynı b/K oranı, k ile DRR(1/12) = −80
function solveEl() {
  const el = P.dut.el; el.fi = FI; let b = 2, k = 10;
  for (let it = 0; it < 80; it++) {
    const f = (bb, kk) => { el.b = bb; el.k = kk; const lm = L.loopModel(el, P.dut.ctl, P.dut.gyro, P.dut.cur, el.J); return [L.db(L.cabs(lm.drr(2 * Math.PI * 0.125))) + 80, L.db(L.cabs(lm.drr(2 * Math.PI * 3))) + 40]; };
    const r = f(b, k); if (Math.hypot(...r) < 1e-9) break;
    const h = 1e-5, rb = f(b * (1 + h), k), rk = f(b, k * (1 + h)), lh = Math.log(1 + h);
    const J11 = (rb[0] - r[0]) / lh, J12 = (rk[0] - r[0]) / lh, J21 = (rb[1] - r[1]) / lh, J22 = (rk[1] - r[1]) / lh, det = J11 * J22 - J12 * J21;
    b *= Math.exp(-Math.max(-1, Math.min(1, (r[0] * J22 - r[1] * J12) / det))); k *= Math.exp(-Math.max(-1, Math.min(1, (J11 * r[1] - J21 * r[0]) / det)));
  }
  el.b = b; el.k = k;
  const az = P.dut.az; az.fi = FI; const Jaz = az.Ja + az.Jez;
  const Ke = L.loopModel(el, P.dut.ctl, P.dut.gyro, P.dut.cur, el.J).K, Ka = L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz).K;
  az.b = el.b * Ka / Ke; let lo = 0.01, hi = 500;
  for (let i = 0; i < 100; i++) { const m = Math.sqrt(lo * hi); az.k = m; const v = L.db(L.cabs(L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz).drr(2 * Math.PI / 12))); if (v > -80) hi = m; else lo = m; }
}
// solveEl();  // (b, k) taban döngü için zaten çözülmüş (dar bant kapalı); değerler src/02_model.js'de
const d = L.derive(P);
console.log('el', P.dut.el.b, P.dut.el.k, 'K', d.loopEl.K, 'PM', d.loopEl.pm, 'GM', d.loopEl.gm, '| az', P.dut.az.b, P.dut.az.k, 'K', d.loopAz.K, 'PM', d.loopAz.pm, 'GM', d.loopAz.gm);
// 2) kaynak düzeyleri
const target = { 'B1-07': 3.00, 'B2-02': 2.00, 'B2-03': 2.00, 'B2-04': 1.50, 'B2-06': 2.00, 'B3-01': 3.00, 'B3-02': 1.50, 'B3-03': 2.00, 'B3-04': 1.50 };
const azRatio = 2.25;
const knob = {
  'B1-07': { get: () => P.dut.el.Fc, set: (v) => { P.dut.el.Fc = v; P.dut.el.Fs = 1.1 * v; P.dut.el.sigma0 = v / 1e-3; P.dut.az.Fc = azRatio * v; P.dut.az.Fs = 1.1 * azRatio * v; P.dut.az.sigma0 = azRatio * v / 1e-3; }, pw: 0.9 },
  'B2-02': { get: () => P.env.slap.A, set: (v) => P.env.slap.A = v, pw: 1 },
  'B2-03': { get: () => P.env.lat.a_rms, set: (v) => P.env.lat.a_rms = v, pw: 1 },
  'B2-04': { get: () => P.dut.el.cogA, set: (v) => { P.dut.el.cogA = v; P.dut.az.cogA = 2 * v; }, pw: 1 },
  'B2-06': { get: () => P.env.plat.a_rms, set: (v) => P.env.plat.a_rms = v, pw: 1 },
  'B3-01': { get: () => P.env.aux.a, set: (v) => P.env.aux.a = v, pw: 1 },
  'B3-02': { get: () => P.dut.cooler.A, set: (v) => P.dut.cooler.A = v, pw: 1 },
  'B3-03': { get: () => P.env.hf.acc_rms, set: (v) => P.env.hf.acc_rms = v, pw: 1 },
  'B3-04': { get: () => P.env.hf.ang_rms, set: (v) => P.env.hf.ang_rms = v, pw: 1 },
};
knob['B1-07'].set(1.5);
for (let pass = 0; pass < 3; pass++) {
  for (const id of Object.keys(target)) {
    const row = L.OP_ROWS.find(r => r.id === id);
    const R = L.runSim(P, L.rowScenario(P, row, { T: 600 }));
    const M = L.losMetrics(R, P, { skip: 20 });
    const v = M.rms.el * 1e6, k = knob[id], ratio = target[id] / v;
    console.log(`pass ${pass} ${id} el ${v.toFixed(3)} xel ${(M.rms.xel * 1e6).toFixed(3)} p99 ${(M.p99.el * 1e6).toFixed(2)}/${(M.p99.xel * 1e6).toFixed(2)} → ×${ratio.toFixed(4)}`);
    k.set(k.get() * Math.pow(ratio, k.pw));
  }
}
const out = { el: { fi: P.dut.el.fi, b: P.dut.el.b, k: P.dut.el.k, Fc: P.dut.el.Fc, Fs: P.dut.el.Fs, sigma0: P.dut.el.sigma0, cogA: P.dut.el.cogA },
  az: { fi: P.dut.az.fi, b: P.dut.az.b, k: P.dut.az.k, Fc: P.dut.az.Fc, Fs: P.dut.az.Fs, sigma0: P.dut.az.sigma0, cogA: P.dut.az.cogA },
  slapA: P.env.slap.A, lat: P.env.lat.a_rms, plat: P.env.plat.a_rms, aux: P.env.aux.a, cooler: P.dut.cooler.A, hfacc: P.env.hf.acc_rms, hfang: P.env.hf.ang_rms };
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('cal_out.json', JSON.stringify(out, null, 1));
