const L = require('../engine.js'), D2R = Math.PI / 180;
const P = L.defaultParams();
for (const A of [3, 5.66, 3, 1]) for (const ax of [0, 1]) {
  const sg = L.segSines([{ axis: ax, f: 0.1, A: A * D2R, nper: 6 }]);
  const t0 = Date.now(); const R = L.runSim(P, L.labScenario(P, { T: sg.T, fs: 2000, cmd: sg.cmd, seed: 1100 }), null);
  console.log('A', A, 'ax', ax, 'T', sg.T.toFixed(0), 's sim →', ((Date.now() - t0) / 1000).toFixed(2), 's; sat', R.stats.satCount);
}
