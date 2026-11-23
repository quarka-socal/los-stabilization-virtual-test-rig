const L = require('../engine.js'), D2R = Math.PI / 180;
const rmsDet = (a) => { const n = a.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; } const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - b * sx) / n; let s = 0; for (let i = 0; i < n; i++) { const r = a[i] - c - b * i; s += r * r; } return Math.sqrt(s / n); };
const iso = { coupling: true, friction: false, cogging: false, misalign: false, gyroNoise: false, gyroBias: false, imbalance: false, gimMode: false, optMode: false, cooler: false, earth: false, compErr: false };
function run(P, axis, A, f, mech) {
  const S = L.labScenario(P, { label: 'probe', T: 60, fs: 2000, stab: true, seed: 7, cmd: [{ type: 'sine', axis, A: A * D2R, f, t0: 0, ramp: 5 }] });
  S.mech = Object.assign({}, mech); S.meas = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
  S.rec = { fs: 1000, ch: ['opt_el', 'opt_xel'] };
  const R = L.runSim(P, S, null), i0 = 15000;
  return { el: rmsDet(R.rec.opt_el.subarray(i0)) * 1e6, xel: rmsDet(R.rec.opt_xel.subarray(i0)) * 1e6 };
}
for (const [A, f] of [[2.5, 0.15], [5, 0.35]]) {
  const r0 = run(L.defaultParams('ship'), 1, A, f, iso);
  const r1 = run(L.defaultParams('ship'), 1, A, f, Object.assign({}, iso, { misalign: true }));
  const P2 = L.defaultParams('ship'); P2.dut.gyro.sf_ppm = 0; const r2 = run(P2, 1, A, f, Object.assign({}, iso, { misalign: true }));
  const pred = 0.1e-3 * A * D2R / Math.SQRT2 * 1e6;
  console.log(`pitch ±${A}° @ ${f} Hz (LOS iskele → pitch LOS ekseni etrafında): ε=0 → el ${r0.el.toFixed(3)} / xel ${r0.xel.toFixed(3)} | ε=0,1 mrad → el ${r1.el.toFixed(3)} / xel ${r1.xel.toFixed(3)} µrad (S_f=0 ile: ${r2.el.toFixed(3)} / ${r2.xel.toFixed(3)}); ε·θ/√2 tahmini ${pred.toFixed(2)} µrad`);
}
