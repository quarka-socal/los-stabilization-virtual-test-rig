const L = require('./engine.js');
const u = (x) => (x * 1e6).toFixed(2);
function one(label, mod, T) {
  const P = L.defaultParams(); mod && mod(P);
  const S = L.opScenario(P, { T: T || 300, seed: 11, fs: 4000 });
  if (mod && mod.S) mod.S(S);
  const t0 = Date.now(); const R = L.runSim(P, S, null);
  const M = L.losMetrics(R, P, { skip: 20 });
  const v = M.video;
  console.log(label.padEnd(18), 'RMS el', u(M.rms.el), 'xel', u(M.rms.xel), '| bands el B1/B2/B3', u(M.band.el.B1), u(M.band.el.B2), u(M.band.el.B3), '| wander el/xel', u(v.wander.el), u(v.wander.xel), 'smear', u(v.smear.el), u(v.smear.xel), ((Date.now()-t0)/1000).toFixed(0)+'s');
}
const which = (process.argv[2] || 'all').split(',');
const V = {
  all: null,
  noFric: Object.assign(() => {}, { S: (S) => { S.mech.friction = false; } }),
  noPlat: Object.assign(() => {}, { S: (S) => { S.accMount = []; } }),
  noFricPlat: Object.assign(() => {}, { S: (S) => { S.mech.friction = false; S.accMount = []; } }),
};
for (const k of which) one(k, V[k], +(process.argv[3] || 300));
