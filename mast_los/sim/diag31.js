const L = require('./engine.js');
function run(label, mod) {
  const P = L.defaultParams(); mod && mod(P);
  const S = L.mastAngScenario(P, { T: 40 }); S.mech = S.mech || {}; mod && mod.S && mod.S(S);
  const t0 = Date.now(); const R = L.runSim(P, S, null);
  const M = L.losMetrics(R, P, { skip: 3, nseg: 8192 });
  const br = L.aRms(Float64Array.from(R.rec.base_r.subarray(3000)));
  console.log(label.padEnd(26), 'el', (M.rms.el*1e6).toFixed(2), 'xel', (M.rms.xel*1e6).toFixed(2), '| band4-33 el', (L.bandRms(M.psd.f, M.psd.el, 4, 33)*1e6).toFixed(2), '| base roll', (br*1e6).toFixed(1), ((Date.now()-t0)/1000).toFixed(1)+'s');
}
const V = {
  nominal: null,
  noFric: Object.assign(() => {}, { S: (S) => { S.mech.friction = false; } }),
  ffOff: (P) => { P.dut.ctl.ff.on = false; },
  fest2000: (P) => { P.dut.ctl.ff.f_est = 2000; },
  fest1000: (P) => { P.dut.ctl.ff.f_est = 1000; },
  tanh: (P) => { P.dut.ctl.ff.mode = 'coulomb'; P.dut.ctl.ff.w_ff = 1.5e-3; },
  eta08: (P) => { P.dut.ctl.ff.eta = 0.8; },
  noCog: Object.assign(() => {}, { S: (S) => { S.mech.cogging = false; } }),
};
for (const k of (process.argv[2] || Object.keys(V).join(',')).split(',')) run(k, V[k]);
