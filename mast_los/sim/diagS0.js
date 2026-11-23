const L = require('./engine.js');
const u = (x) => (x * 1e6).toFixed(2);
const rng = +(process.argv[2] || 50) * 1e-6;
const setS0 = (P) => { P.dut.el.sigma0 = P.dut.el.Fc / rng; P.dut.az.sigma0 = P.dut.az.Fc / rng; };
// angular path
{ const P = L.defaultParams(); setS0(P); const R = L.runSim(P, L.mastAngScenario(P, { T: 40 }), null); const M = L.losMetrics(R, P, { skip: 3, nseg: 8192 });
  console.log('presliding', rng*1e6, 'µrad | mast-ang path el', u(M.rms.el), 'xel', u(M.rms.xel)); }
// op all / noFric
for (const nf of [false, true]) { const P = L.defaultParams(); setS0(P); const S = L.opScenario(P, { T: 300, seed: 11, fs: 4000 }); if (nf) S.mech.friction = false;
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 }); const v = M.video;
  console.log(nf ? 'op noFric' : 'op all   ', 'RMS', u(M.rms.el), u(M.rms.xel), '| B1/B2/B3 el', u(M.band.el.B1), u(M.band.el.B2), u(M.band.el.B3), '| wander', u(v.wander.el), u(v.wander.xel), 'smear', u(v.smear.el), u(v.smear.xel)); }
// B1-07 op row
{ const P = L.defaultParams(); setS0(P); const row = L.OP_ROWS.find(r => r.id === 'B1-07'); const S = L.rowScenario(P, row, { T: 300, seed: 11 });
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 }); console.log('B1-07 row el/xel', u(M.rms.el), u(M.rms.xel)); }
