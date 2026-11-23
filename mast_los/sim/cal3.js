const L = require('./engine.js');
const row = L.OP_ROWS.find(r => r.id === 'B1-07');
for (const [Fc, eta, fsr, wff] of [[0.12, 0.95, 1.33, 5e-4], [0.08, 0.95, 1.2, 5e-4], [0.06, 0.9, 1.2, 5e-4], [0.08, 0.95, 1.2, 2e-4], [0.1, 0.97, 1.15, 3e-4]]) {
  const P = L.defaultParams();
  P.dut.el.Fc = Fc; P.dut.el.Fs = Fc * fsr; P.dut.ctl.ff.eta = eta; P.dut.ctl.ff.w_ff = wff;
  P.dut.az.Fc = Fc * 3.75; P.dut.az.Fs = P.dut.az.Fc * fsr;
  const S = L.rowScenario(P, row, { T: 300 });
  const R = L.runSim(P, S);
  const M = L.losMetrics(R, P, { skip: 20 });
  console.log('Fc', Fc, 'eta', eta, 'Fs/Fc', fsr, 'wff', wff, '→ el RMS', (M.rms.el * 1e6).toFixed(2), 'P99', (M.p99.el * 1e6).toFixed(2), '| xel RMS', (M.rms.xel * 1e6).toFixed(2), 'P99', (M.p99.xel * 1e6).toFixed(2));
}
