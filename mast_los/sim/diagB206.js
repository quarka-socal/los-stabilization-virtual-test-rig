const L = require('./engine.js');
const u = (x) => (x * 1e6).toFixed(3);
for (const steep of [false, true]) {
  const P = L.defaultParams();
  const row = L.OP_ROWS.find(r => r.id === 'B2-06');
  const S = L.rowScenario(P, row, { T: 300, seed: 11 });
  if (steep) S.accMount.forEach(c => { c.hp2 = c.hp; c.lp2 = c.lp; });
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20, nseg: 8192 });
  const b = (f1, f2) => u(L.bandRms(M.psd.f, M.psd.el, f1, f2));
  console.log(steep ? '4th-order' : '2nd-order', 'el total', u(M.rms.el), '| 0-4', b(0.01, 4), '4-33', b(4, 33), '33-80', b(33, 80), '80-200', b(80, 200), '>200', b(200, 500), '| xel', u(M.rms.xel));
}
