const L = require('./engine.js');
const P = L.defaultParams(); P.dut.ctl.res.on = false;
const d = L.derive(P), TAU = 2 * Math.PI;
console.log('DRR el 1/8 Hz', L.db(L.cabs(d.loopEl.drr(TAU * 0.125))).toFixed(3), '3 Hz', L.db(L.cabs(d.loopEl.drr(TAU * 3))).toFixed(3), '| az 1/12 Hz', L.db(L.cabs(d.loopAz.drr(TAU / 12))).toFixed(3));
const target = { 'B1-07': 3.00, 'B2-02': 2.00, 'B2-03': 2.00, 'B2-04': 1.50, 'B2-06': 2.00, 'B3-01': 3.00, 'B3-02': 1.50, 'B3-03': 2.00, 'B3-04': 1.50 };
for (const id of (process.argv[2] ? process.argv[2].split(',') : Object.keys(target))) {
  const row = L.OP_ROWS.find(r => r.id === id);
  const R = L.runSim(P, L.rowScenario(P, row, { T: 600 }));
  const M = L.losMetrics(R, P, { skip: 20, psd: false });
  console.log(id, 'el', (M.rms.el * 1e6).toFixed(3), 'hedef', target[id], 'oran', (target[id] / (M.rms.el * 1e6)).toFixed(4), 'xel', (M.rms.xel * 1e6).toFixed(3));
}
