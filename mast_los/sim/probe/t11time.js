const L = require('../engine.js');
for (const k of ['sub', 'ship']) {
  const P = L.defaultParams(k); const ctx = {}; L.runTest('T0.1', P, ctx, null);
  const t0 = Date.now(); L.RUNLOG_ = null; const r = L.runTest('T1.1', P, ctx, null);
  console.log(k, 'T1.1', r.status, ((Date.now() - t0) / 1000).toFixed(1), 's');
  const freqs = Array.from(new Set([0.05, 0.1, 0.2, 0.5, 1, 1 / P.wb.sea.roll_T, 1 / P.wb.sea.pitch_T, 1 / P.wb.sea.yaw_T].map(f => Math.round(f * 1e4) / 1e4))).sort((a, b) => a - b);
  const sg = L.segSines(freqs.map(f => ({ axis: 0, f, A: 0.01, nper: 10 })));
  console.log(' freqs', freqs.join(','), 'T per axis', sg.T.toFixed(0));
}
