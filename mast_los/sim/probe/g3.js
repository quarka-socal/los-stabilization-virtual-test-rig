const L = require('../engine.js');
const TAU = 2 * Math.PI;
const MECH_OFF = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false]));
const meas = { video: true, ac: false, imu: false, air: false, microvib: false, noise: false };
const P = L.defaultParams(), tk = L.trkModel(P), d = L.derive(P);
const mech = Object.assign({}, MECH_OFF, { optMode: true });
function run(ax, fq, on) {
  const T = 6 + Math.max(16 / fq, 8);
  const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 7, mech, meas, hexActive: false, cooler: false,
    acc: [{ type: 'sine', axis: ax, A: 2.0, f: fq, t0: 0.5, ramp: 1 }], tracker: on ? { bw: P.ana.los.trk.bw, lat_frames: P.ana.los.trk.lat_frames, gate_px: 32 } : null,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel'] } });
  const n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / R.meta.fRec;
  let i0 = 0; while (t[i0] < 5) i0++; const i1 = n - 10;
  const fe = L.sineFit(t, R.rec.opt_el, fq, { i0, i1 }), fx = L.sineFit(t, R.rec.opt_xel, fq, { i0, i1 });
  return { el: fe.A, xel: fx.A, phE: fe.ph, lost: R.stats.trackLost };
}
const t0 = Date.now();
for (const ax of [0, 1, 2]) { const r = run(ax, 2, false); console.log('axis', ax, 'el', (r.el * 1e6).toFixed(4), 'xel', (r.xel * 1e6).toFixed(4)); }
console.log('trk', tk.fc.toFixed(3), tk.pm.toFixed(2), (20 * Math.log10(tk.sPk)).toFixed(2), tk.fPk.toFixed(3), tk.f0.toFixed(3), 'tau', (tk.tau * 1e3).toFixed(2));
// inner loop T_in(w) ≈ jw·(−gyroN) (gyro filter difference negligible < 10 Hz)
const Tin = (fq) => { const w = TAU * fq, g = d.loopEl.gyroN(w); return { re: -(-w * g.im), im: -(w * g.re) }; };
const cm = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cabs = (a) => Math.hypot(a.re, a.im);
for (const fq of [0.3, 0.7, 1, 1.5, 2, 2.5, 3, 3.5, 4.5, 6, 8]) {
  const off = run(2, fq, false), on = run(2, fq, true);
  const S0 = L.cabs(tk.S(fq)), Lf = tk.L(fq), ti = Tin(fq), Lfull = cm({ re: Lf.re, im: Lf.im }, ti), Sfull = 1 / cabs({ re: 1 + Lfull.re, im: Lfull.im });
  console.log(fq.toFixed(2).padStart(5), 'sim', (20 * Math.log10(on.el / off.el)).toFixed(2).padStart(7), 'ana', (20 * Math.log10(S0)).toFixed(2).padStart(7), 'ana+inner', (20 * Math.log10(Sfull)).toFixed(2).padStart(7), '|Tin|', cabs(ti).toFixed(4), 'ph', (Math.atan2(ti.im, ti.re) * 180 / Math.PI).toFixed(2), 'lost', on.lost);
}
console.log(((Date.now() - t0) / 1000).toFixed(1), 's');
