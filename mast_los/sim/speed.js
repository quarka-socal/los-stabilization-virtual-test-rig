const L = require('./engine.js');
const P = L.defaultParams();
for (const fs of [2000, 4000]) {
  const S = { T: 60, fs, world: 'lab', stab: true, seed: 1, cmd: [], vib: [], trans: [], acc: [], accMount: [],
    meas: { video: true, ac: true, imu: true, air: true, microvib: true, noise: true },
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y'] } };
  const t0 = Date.now(); L.runSim(P, S); const dt = (Date.now() - t0) / 1000;
  console.log(`fs ${fs}: 60 s sim in ${dt.toFixed(2)} s → ${(60 / dt).toFixed(1)}× real time`);
}
