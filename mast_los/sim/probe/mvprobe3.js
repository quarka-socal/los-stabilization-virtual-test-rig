// Video karşılığı: 50 fps, 5 ms entegrasyon (4 kHz kayıttan kare ortalaması); masa payı stab ON / OFF
const L = require('../engine.js');
const P = L.defaultParams('sub');
const quiet = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: false, gyroBias: false, imbalance: true, gimMode: true, optMode: true, cooler: false, earth: false, compErr: false };
const rms = (a) => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
for (const stab of [true, false]) {
  const S = L.labScenario(P, { label: 'mv', T: 130, fs: 4000, stab, seed: 31, cmd: [] });
  S.mech = Object.assign({}, quiet);
  S.meas = { video: true, ac: true, imu: true, air: false, microvib: true, noise: false };
  S.rec = { fs: 4000, ch: ['opt_el', 'opt_xel'] };
  const R = L.runSim(P, S, null), fr = 4000, e = R.rec.opt_el, x = R.rec.opt_xel;
  const fe = [], fx = [];
  for (let t = 10; t < 129; t += 0.02) { const i = Math.round(t * fr), n = Math.round(0.005 * fr); let se = 0, sx = 0; for (let k = 0; k < n; k++) { se += e[i + k]; sx += x[i + k]; } fe.push(se / n); fx.push(sx / n); }
  const all = (a) => rms(Array.from(a.subarray(10 * fr, 129 * fr)));
  console.log(`stab ${stab ? 'ON ' : 'OFF'}: gerçek LOS (4 kHz) el ${(all(e) * 1e6).toFixed(2)} / xel ${(all(x) * 1e6).toFixed(2)} µrad | video karşılığı (50 fps, 5 ms) el ${(rms(fe) * 1e6).toFixed(2)} / xel ${(rms(fx) * 1e6).toFixed(2)} µrad`);
}
