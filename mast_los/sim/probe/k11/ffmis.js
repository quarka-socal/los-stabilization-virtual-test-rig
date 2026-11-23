// T1.6 ve işletme B1-07: ileri besleme model hatasının η eşdeğeriyle taranması (gözlemci F_c'yi ±%δ yanlış bilirse FF torku η(1 ± δ) olur)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const out = [];
for (const eta of [0.76, 0.855, 0.9, 0.95, 1.0, 1.045, 1.14]) {
  const P = L.defaultParams('sub'); P.dut.ctl.ff.eta = eta;
  const r = L.runTest('T1.6', P, { IFOVcal: pre.ctx.IFOVcal }, null);
  const row = L.OP_ROWS.find(q => q.id === 'B1-07'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 });
  out.push({ eta, st: r.status, m: r.measured, opEl: M.rms.el, opXel: M.rms.xel });
  console.log(`η ${eta}: T1.6 ${r.status} — ${r.measured.slice(0, 120)} | işletme B1-07 el ${(M.rms.el * 1e6).toFixed(2)} / xel ${(M.rms.xel * 1e6).toFixed(2)} µrad`);
}
require('fs').writeFileSync(path.join(__dirname, 'ffmis.json'), JSON.stringify(out, null, 1));
