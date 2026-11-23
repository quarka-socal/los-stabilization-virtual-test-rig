const L = require('./engine.js');
const P = L.defaultParams();
const target = { 'B3-01': 3.00, 'B3-03': 2.00 };
const knob = { 'B3-01': { get: () => P.env.aux.a, set: (v) => P.env.aux.a = v }, 'B3-03': { get: () => P.env.hf.acc_rms, set: (v) => P.env.hf.acc_rms = v } };
for (let pass = 0; pass < 2; pass++) for (const id of Object.keys(target)) {
  const row = L.OP_ROWS.find(r => r.id === id);
  const R = L.runSim(P, L.rowScenario(P, row, { T: 60 }));
  const M = L.losMetrics(R, P, { skip: 10 });
  const v = M.rms.el * 1e6; console.log(pass, id, 'el', v.toFixed(3), 'xel', (M.rms.xel * 1e6).toFixed(3), 'wander', (M.video.wander.el*1e6).toFixed(3), 'smear', (M.video.smear.el*1e6).toFixed(3));
  knob[id].set(knob[id].get() * target[id] / v);
}
console.log('aux a', P.env.aux.a, 'hf acc', P.env.hf.acc_rms);
