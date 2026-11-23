const L = require('./engine.js');
const P = L.defaultParams();
const d = L.derive(P);
function runDRR(f, A_deg, axis, mechOn, fs, extra) {
  const nper = Math.max(6, Math.ceil(8 * f)), T = nper / f + 4;
  const mech = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false]));
  for (const k of mechOn) mech[k] = true;
  const S = Object.assign({ T, fs, world: 'lab', stab: true, seed: 7,
    cmd: [{ type: 'sine', axis, A: A_deg * L.D2R, f, t0: 0, t1: T, ramp: Math.min(2 / f, 0.3 * T) }],
    mech, meas: { video: true, ac: false, imu: true, air: false, microvib: false, noise: false },
    earthComp: false, rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'w_e', 'tq_e'] } }, extra || {});
  const t0 = Date.now();
  const R = L.runSim(P, S);
  const el = (Date.now() - t0) / 1000;
  const n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / 1000;
  const i0 = Math.floor((Math.min(2 / f, 0.3 * T) + 1) * 1000), i1 = n - Math.floor((Math.min(2 / f, 0.3 * T) + 1) * 1000);
  const inCh = ['base_r', 'base_p', 'base_y'][axis];
  const fin = L.sineFit(t, R.rec[inCh], f, { i0, i1 });
  const fe = L.sineFit(t, R.rec.opt_el, f, { i0, i1 }), fx = L.sineFit(t, R.rec.opt_xel, f, { i0, i1 });
  return { el, steps: R.meta.N, in: fin.A, outEl: fe.A, outXel: fx.A, drrEl: L.db(fe.A / fin.A), drrXel: L.db(fx.A / fin.A), resEl: fe.resRms, R };
}
for (const fs of [4000, 2000]) {
  const r = runDRR(0.125, 3, 0, ['coupling'], fs);
  console.log('fs', fs, 'time', r.el.toFixed(2), 's for', r.steps, 'steps =>', (r.el / r.steps * 1e6).toFixed(3), 'us/step');
  console.log('  roll 0.125Hz: in', (r.in * 1e6).toFixed(1), 'µrad; el out', (r.outEl * 1e6).toFixed(3), 'DRR el', r.drrEl.toFixed(2), 'analytic', L.db(L.cabs(d.loopEl.drr(2 * Math.PI * 0.125))).toFixed(2), '| xel', r.drrXel.toFixed(1));
}
for (const f of [0.5, 1, 3, 10]) {
  const A = Math.min(0.05, d.reach(f));
  const r = runDRR(f, A, 0, ['coupling'], 4000);
  console.log('roll', f, 'Hz A', A, 'DRR el sim', r.drrEl.toFixed(2), 'analytic', L.db(L.cabs(d.loopEl.drr(2 * Math.PI * f))).toFixed(2), ' res', (r.resEl*1e6).toFixed(3));
}
for (const f of [0.0833, 1, 3]) {
  const A = Math.min(1, d.reach(f));
  const r = runDRR(f, A, 2, ['coupling'], 4000);
  console.log('yaw', f, 'Hz A', A, 'DRR xel sim', r.drrXel.toFixed(2), 'analytic', L.db(L.cabs(d.loopAz.drr(2 * Math.PI * f))).toFixed(2));
}
// misalignment: pitch with LOS abeam → about LOS axis
{ const r = runDRR(0.1, 1.5, 1, ['misalign'], 4000); console.log('pitch 0.1Hz misalign only: el out µrad amp', (r.outEl*1e6).toFixed(3), 'xel', (r.outXel*1e6).toFixed(3), ' expected ε·θ =', (0.1e-3*1.5*L.D2R*1e6).toFixed(3)); }
