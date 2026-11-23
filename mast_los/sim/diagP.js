const L = require('./engine.js');
const u = (x) => (x * 1e6).toFixed(2);
const rng = +(process.argv[2] || 10) * 1e-6, D2R = Math.PI / 180;
const prep = (P) => { P.dut.el.sigma0 = P.dut.el.Fc / rng; P.dut.az.sigma0 = P.dut.az.Fc / rng; P.dut.mount.kappa = 0; };
const out = [];
const runOp = (label, f) => { const P = L.defaultParams(); prep(P); const S = L.opScenario(P, { T: 300, seed: 11, fs: 4000 }); f && f(S);
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 }); const v = M.video;
  out.push(`${label.padEnd(10)} B1/B2/B3 el ${u(M.band.el.B1)} ${u(M.band.el.B2)} ${u(M.band.el.B3)} xel ${u(M.band.xel.B1)} ${u(M.band.xel.B2)} ${u(M.band.xel.B3)} | wander ${u(v.wander.el)} ${u(v.wander.xel)} smear ${u(v.smear.el)} ${u(v.smear.xel)}`); };
runOp('op all'); runOp('op noFric', S => { S.mech.friction = false; });
for (const id of ['B1-07']) { const P = L.defaultParams(); prep(P); const S = L.rowScenario(P, L.OP_ROWS.find(r => r.id === id), { T: 300, seed: 11 });
  const R = L.runSim(P, S, null); const M = L.losMetrics(R, P, { skip: 20 }); out.push(`${id} row el/xel ${u(M.rms.el)} ${u(M.rms.xel)}`); }
// T2.2-like dwell at 3 Hz, 0.05°, res ON and OFF
for (const on of [false, true]) { const P = L.defaultParams(); prep(P); P.dut.ctl.res.on = on;
  const sg = L.segSines([{ axis: 0, f: 3, A: 0.05 * D2R, nper: 120 }]);
  const R = L.runSim(P, L.labScenario(P, { T: sg.T, fs: 2000, cmd: sg.cmd, resF: 3, seed: 2200 }), null);
  const fit = L.fitSegments(P, R, sg.segs, {})[0]; out.push(`dwell 3 Hz res ${on ? 'ON ' : 'OFF'}: ${u(fit.fe.A / Math.SQRT2)} µrad RMS`); }
// T1.6 TSA
{ const P = L.defaultParams(); prep(P); const r = L.TESTS['T1.6'](P, {}, null); out.push('T1.6: ' + r.measured); }
console.log('presliding', Math.round(rng * 1e6), 'µrad'); console.log(out.join('\n'));
