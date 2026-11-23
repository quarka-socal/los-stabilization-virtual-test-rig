const L = require('./engine.js');
const P = L.defaultParams();
const row = L.OP_ROWS.find(r => r.id === 'B1-07');
let Fc = 0.1694;
for (let pass = 0; pass < 4; pass++) {
  P.dut.el.Fc = Fc; P.dut.el.Fs = 1.1 * Fc; P.dut.el.sigma0 = Fc / 1e-5;
  P.dut.az.Fc = 3.76 * Fc; P.dut.az.Fs = 1.1 * P.dut.az.Fc; P.dut.az.sigma0 = P.dut.az.Fc / 1e-5;
  const R = L.runSim(P, L.rowScenario(P, row, { T: 600 }));
  const M = L.losMetrics(R, P, { skip: 20 });
  const v = M.rms.el * 1e6;
  console.log('pass', pass, 'Fc_el', Fc.toFixed(4), 'Fc_az', (3.76 * Fc).toFixed(4), '→ el', v.toFixed(3), 'xel', (M.rms.xel * 1e6).toFixed(3), 'p99', (M.p99.el * 1e6).toFixed(2), (M.p99.xel * 1e6).toFixed(2));
  Fc *= Math.pow(3 / v, 0.9);
}
