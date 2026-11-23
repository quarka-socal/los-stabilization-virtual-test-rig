const L = require('./engine.js');
const P = L.defaultParams();
const row = L.OP_ROWS.find(r => r.id === 'B1-07');
for (let pass = 0; pass < 4; pass++) {
  const R = L.runSim(P, L.rowScenario(P, row, { T: 600 }));
  const M = L.losMetrics(R, P, { skip: 20 });
  const v = M.rms.el * 1e6;
  console.log('pass', pass, 'Fc_el', P.dut.el.Fc.toFixed(4), 'Fc_az', P.dut.az.Fc.toFixed(4), '→ el', v.toFixed(3), 'xel', (M.rms.xel * 1e6).toFixed(3), 'p99', (M.p99.el * 1e6).toFixed(2), (M.p99.xel * 1e6).toFixed(2));
  const k = Math.pow(3 / v, 1.0);
  P.dut.el.Fc *= k; P.dut.el.Fs = 1.1 * P.dut.el.Fc; P.dut.az.Fc *= k; P.dut.az.Fs = 1.1 * P.dut.az.Fc;
}
