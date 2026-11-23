// v13.10 (§9 kararları): dar bant frekans kestirim hatası (T2.2, T2.3) ve sürtünme gözlemcisinin model hatası (T1.6, işletme B1-07)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const run = (id, P) => L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null), out = { est: [], obs: [] };
for (const [kind, e] of [['sub', 0], ['sub', 0.05], ['sub', -0.05], ['sub', 0.1], ['sub', 0.2], ['ship', 0], ['ship', 0.05], ['ship', 0.1]]) {
  const P = L.defaultParams(kind); P.dut.ctl.res.estErr = e; const r = run('T2.2', P), r3 = kind === 'sub' && Math.abs(e) <= 0.1 ? run('T2.3', P) : null;
  out.est.push({ kind, e, t22: r.status, m22: r.measured, t23: r3 && r3.status, m23: r3 && r3.measured });
  console.log(`${kind} kestirim %${(e * 100).toFixed(0)}: T2.2 ${r.status} — ${r.measured.slice(0, 150)}${r3 ? ` | T2.3 ${r3.status} — ${r3.measured.slice(0, 120)}` : ''}`);
}
const opB107 = (P) => { const row = L.OP_ROWS.find(q => q.id === 'B1-07'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 }); return M.rms.el; };
for (const [nm, o] of [['tam bilgi', {}], ['F_c × 0,9', { Fc: 0.9 }], ['F_c × 1,1', { Fc: 1.1 }], ['F_c, F_s × 0,9', { Fc: 0.9, Fs: 0.9 }], ['F_c, F_s × 1,1', { Fc: 1.1, Fs: 1.1 }],
  ['F_s × 1,2', { Fs: 1.2 }], ['v_s × 0,5', { vs: 0.5 }], ['v_s × 2', { vs: 2 }], ['σ0 × 0,5', { s0: 0.5 }], ['σ0 × 2', { s0: 2 }]]) {
  const P = L.defaultParams('sub'); Object.assign(P.dut.ctl.ff.obs, o); const r = run('T1.6', P), m = r.measured.match(/tepe ([\d.]+) µrad/), op = opB107(P);
  out.obs.push({ nm, o, st: r.status, peak: m ? +m[1] : null, opEl: op });
  console.log(`gözlemci ${nm}: T1.6 ${r.status} tepe ${m ? m[1] : '—'} µrad | işletme B1-07 el ${(op * 1e6).toFixed(2)} µrad`);
}
require('fs').writeFileSync(path.join(__dirname, 'decide.json'), JSON.stringify(out, null, 1));
