// Hexapod mikro-titreşiminin (2 µrad) ölçülen LOS'a geçen payı: stab ON ve OFF, diğer gürültüler kapalı, aynı tohum
const L = require('../engine.js');
const rmsDet = (a) => { const n = a.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; } const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - b * sx) / n; let s = 0; for (let i = 0; i < n; i++) { const r = a[i] - c - b * i; s += r * r; } return Math.sqrt(s / n); };
const P = L.defaultParams('sub');
const quiet = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: false, gyroBias: false, imbalance: true, gimMode: true, optMode: true, cooler: false, earth: false, compErr: false };
for (const stab of [true, false]) {
  const out = {};
  for (const mv of [true, false]) {
    const S = L.labScenario(P, { label: 'mv', T: 70, fs: 4000, stab, seed: 31, cmd: [] });
    S.mech = Object.assign({}, quiet);
    S.meas = { video: true, ac: true, imu: true, air: false, microvib: mv, noise: false };
    S.rec = { fs: 1000, ch: ['opt_el', 'opt_xel', 'imu_r', 'imu_p', 'imu_y'] };
    const R = L.runSim(P, S, null), i0 = 10000;
    // video (50 fps, entegrasyon) karşılığı: kare ortalamaları
    const V = R.video; const ve = [], vx = []; for (let i = 0; i < V.n; i++) if (V.t[i] > 10) { ve.push(V.vEl ? V.vEl[i] : NaN); vx.push(V.vXel ? V.vXel[i] : NaN); }
    out[mv] = { el: rmsDet(R.rec.opt_el.subarray(i0)) * 1e6, xel: rmsDet(R.rec.opt_xel.subarray(i0)) * 1e6, imu: rmsDet(R.rec.imu_r.subarray(i0)) * 1e6,
      vEl: rmsDet(Float64Array.from(ve)) * 1e6, vXel: rmsDet(Float64Array.from(vx)) * 1e6 };
  }
  const q = (a, b) => Math.sqrt(Math.max(0, a * a - b * b));
  console.log(`stab ${stab ? 'ON ' : 'OFF'}: LOS (1 kHz) el ${out[true].el.toFixed(3)} vs ${out[false].el.toFixed(3)} µrad → masa payı el ${q(out[true].el, out[false].el).toFixed(3)} / xel ${q(out[true].xel, out[false].xel).toFixed(3)} µrad; kare ortalaması (video) el ${q(out[true].vEl, out[false].vEl).toFixed(3)} / xel ${q(out[true].vXel, out[false].vXel).toFixed(3)} µrad; IMU (tabla) ${out[true].imu.toFixed(2)} µrad`);
}
