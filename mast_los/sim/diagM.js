const L = require('./engine.js');
const u = (x) => (x * 1e6).toFixed(2);
const rng = +(process.argv[2] || 10) * 1e-6;
const prep = (P) => { P.dut.el.sigma0 = P.dut.el.Fc / rng; P.dut.az.sigma0 = P.dut.az.Fc / rng; P.dut.mount.kappa = 0; };
const runOp = (label, f) => { const P = L.defaultParams(); prep(P); const S = L.opScenario(P, { T: 300, seed: 11, fs: 4000 }); f && f(S);
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 }); const v = M.video;
  console.log(label.padEnd(14), 'RMS', u(M.rms.el), u(M.rms.xel), '| B1/B2/B3 el', u(M.band.el.B1), u(M.band.el.B2), u(M.band.el.B3), 'xel', u(M.band.xel.B1), u(M.band.xel.B2), u(M.band.xel.B3), '| wander', u(v.wander.el), u(v.wander.xel), 'smear', u(v.smear.el), u(v.smear.xel)); };
console.log('presliding', Math.round(rng*1e6), 'µrad, mount off');
runOp('op all');
runOp('op noFric', S => { S.mech.friction = false; });
runOp('op noHFA', S => { S.vib = []; });
runOp('op noHFA,aux', S => { S.vib = []; S.acc = S.acc.filter(c => c.type !== 'sine'); });
runOp('op seaOnly', S => { S.vib = []; S.acc = []; S.accMount = []; S.cmd = S.cmd.filter(c => c.type === 'series'); });
// B2-06 row with translational path
{ const P = L.defaultParams(); prep(P); const row = Object.assign({}, L.OP_ROWS.find(r => r.id === 'B2-06'), { mech: ['imbalance', 'optMode', 'earth'] });
  const S = L.rowScenario(P, row, { T: 120, seed: 11 }); const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 });
  console.log('B2-06 row (transl.) el/xel', u(M.rms.el), u(M.rms.xel), 'at a_rms', P.env.plat.a_rms); }
