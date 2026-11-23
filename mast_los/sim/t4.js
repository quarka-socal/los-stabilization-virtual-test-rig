const L = require('./engine_plain.js');
const mech = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, true]));
const S = { T: 120, fs: 4000, world: 'lab', stab: true, seed: 3, cmd: [{ type: 'sine', axis: 0, A: 3 * L.D2R, f: 0.125, ramp: 8 }], mech,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'imu_r', 'imu_p', 'imu_y', 'ac_el', 'ac_xel'] } };
const P = L.defaultParams(); const t0 = Date.now(); const R = L.runSim(P, S); console.log((Date.now()-t0)/1000);
