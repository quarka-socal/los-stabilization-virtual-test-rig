const L = require('./engine.js');
const D2R = Math.PI / 180, TAU = 2 * Math.PI;
const P = L.defaultParams(); P.dut.ctl.res.on = false;
const d = L.derive(P);
const MECH_OFF = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false]));
const MEAS_OFF = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
const mech = Object.assign({}, MECH_OFF, { coupling: true, earth: true });
for (const fq of [12, 20, 30, 40, 60, 100, 150]) {
  for (const fsv of [2000, 4000]) {
    const T = 3, S = { T, fs: fsv, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false, hexF: 1500,
      cmd: [{ type: 'sine', axis: 0, A: 0.01 * D2R, f: fq, t0: 0.2, ramp: 0.3 }], rec: { fs: fsv, ch: ['mech_el', 'base_r'] } };
    const R = L.runSim(P, S), n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / R.meta.fRec;
    const i0 = Math.round(1.5 * R.meta.fRec), i1 = n - 10;
    const fi = L.sineFit(t, R.rec.base_r, fq, { i0, i1 }), fo = L.sineFit(t, R.rec.mech_el, fq, { i0, i1 });
    const m = L.cabs(d.loopEl.drr(TAU * fq));
    console.log(fq, fsv, (20 * Math.log10(fo.A / fi.A)).toFixed(2), (20 * Math.log10(m)).toFixed(2));
  }
}
