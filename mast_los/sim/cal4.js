// Doğrusal kaynak düzeylerinin ve sürtünmenin bütçe satırlarına kalibrasyonu (2 tur)
const L = require('./engine.js');
const P = L.defaultParams();
// başlangıç seçimleri
P.dut.el.Fc = 0.08; P.dut.el.Fs = 0.088; P.dut.az.Fc = 0.30; P.dut.az.Fs = 0.33;
P.dut.ctl.ff.eta = 0.95; P.dut.ctl.ff.w_ff = 2e-4;
P.dut.derot.sf = 0.019;
P.env.hf.ang_rms = 1.36; P.dut.modes.opt.gAcc = 5.93e-7;
const target = { 'B1-07': 3.00, 'B2-02': 2.00, 'B2-03': 2.00, 'B2-04': 1.50, 'B2-06': 2.00, 'B3-01': 3.00, 'B3-02': 1.50, 'B3-03': 2.00, 'B3-04': 1.50 };
const knob = {
  'B1-07': { get: () => P.dut.el.Fc, set: (v) => { P.dut.el.Fc = v; P.dut.el.Fs = 1.1 * v; P.dut.az.Fc = 3.75 * v; P.dut.az.Fs = 1.1 * 3.75 * v; }, pow: 1.0 },
  'B2-02': { get: () => P.env.slap.A, set: (v) => P.env.slap.A = v, pow: 1 },
  'B2-03': { get: () => P.env.lat.a_rms, set: (v) => P.env.lat.a_rms = v, pow: 1 },
  'B2-04': { get: () => P.dut.el.cogA, set: (v) => { P.dut.el.cogA = v; P.dut.az.cogA = 2 * v; }, pow: 1 },
  'B2-06': { get: () => P.env.plat.a_rms, set: (v) => P.env.plat.a_rms = v, pow: 1 },
  'B3-01': { get: () => P.env.aux.A, set: (v) => P.env.aux.A = v, pow: 1 },
  'B3-02': { get: () => P.dut.cooler.A, set: (v) => P.dut.cooler.A = v, pow: 1 },
  'B3-03': { get: () => P.dut.modes.opt.gAcc, set: (v) => P.dut.modes.opt.gAcc = v, pow: 1 },
  'B3-04': { get: () => P.env.hf.ang_rms, set: (v) => P.env.hf.ang_rms = v, pow: 1 },
};
for (let pass = 0; pass < 3; pass++) {
  for (const id of Object.keys(target)) {
    const row = L.OP_ROWS.find(r => r.id === id);
    const R = L.runSim(P, L.rowScenario(P, row, { T: 600 }));
    const M = L.losMetrics(R, P, { skip: 20 });
    const v = M.rms.el * 1e6, k = knob[id];
    const ratio = target[id] / v;
    console.log(`pass ${pass} ${id} el ${v.toFixed(3)} xel ${(M.rms.xel * 1e6).toFixed(3)} p99 ${(M.p99.el * 1e6).toFixed(2)} → ×${ratio.toFixed(4)}`);
    k.set(k.get() * Math.pow(ratio, k.pow));
  }
}
console.log(JSON.stringify({ el: { Fc: P.dut.el.Fc, Fs: P.dut.el.Fs, cogA: P.dut.el.cogA }, az: { Fc: P.dut.az.Fc, Fs: P.dut.az.Fs, cogA: P.dut.az.cogA },
  slapA: P.env.slap.A, lat: P.env.lat.a_rms, plat: P.env.plat.a_rms, aux: P.env.aux.A, cooler: P.dut.cooler.A, gAcc: P.dut.modes.opt.gAcc, hfang: P.env.hf.ang_rms }, null, 1));
