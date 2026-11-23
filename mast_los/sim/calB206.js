const L = require('./engine.js');
const P = L.defaultParams(); P.dut.ctl.res.on = false;
for (let it = 0; it < 2; it++) {
  const R = L.runSim(P, L.rowScenario(P, L.OP_ROWS.find(r => r.id === 'B2-06'), { T: 600 }), null);
  const M = L.losMetrics(R, P, { skip: 20 });
  console.log('a_rms', P.env.plat.a_rms.toFixed(4), 'B2-06 el', (M.rms.el * 1e6).toFixed(3), 'xel', (M.rms.xel * 1e6).toFixed(3));
  P.env.plat.a_rms *= 2.0 / (M.rms.el * 1e6);
}
console.log('new a_rms', P.env.plat.a_rms.toFixed(4));
