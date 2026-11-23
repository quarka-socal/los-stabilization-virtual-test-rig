// generator mı, düz fonksiyon mu? Hız karşılaştırması
const fs = require('fs');
let src = fs.readFileSync('engine.js', 'utf8');
src = src.replace('function* simIter(P, S) {', 'function simIter(P, S, onProg) {').replace('if (k % prog === 0) yield k / N;', 'if (onProg && k % prog === 0) onProg(k / N);')
         .replace(/function runSim\(P, S, onProgress\) \{[\s\S]*?\n\}/, 'function runSim(P, S, onProgress) { return simIter(P, S, onProgress); }');
fs.writeFileSync('engine_plain.js', src);
const A = require('./engine.js'), B = require('./engine_plain.js');
function mk(L) { const mech = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, true]));
  return { T: 60, fs: 4000, world: 'lab', stab: true, seed: 3, cmd: [{ type: 'sine', axis: 0, A: 3 * L.D2R, f: 0.125, ramp: 8 }], mech,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'imu_r', 'imu_p', 'imu_y', 'ac_el', 'ac_xel'] } }; }
for (const [nm, L] of [['gen', A], ['plain', B], ['gen', A], ['plain', B]]) {
  const P = L.defaultParams(); const t0 = Date.now(); const R = L.runSim(P, mk(L)); const dt = (Date.now() - t0) / 1000;
  console.log(nm, dt.toFixed(2), 's', (dt / R.meta.N * 1e6).toFixed(3), 'us/step', 'frames', R.video.n);
}
