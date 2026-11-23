// Mevcut DUT (gyro iç gimbalde, doğrudan stabilizasyon): S_f ve ε'nin LOS'a etkisi; gecikmenin faz payına etkisi
const L = require('../engine.js'), D2R = Math.PI / 180;
const rmsDet = (a) => { const n = a.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; } const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - b * sx) / n; let s = 0; for (let i = 0; i < n; i++) { const r = a[i] - c - b * i; s += r * r; } return Math.sqrt(s / n); };
function run(P, A, f, T, mech) {
  const S = L.labScenario(P, { label: 'probe', T, fs: 2000, stab: true, seed: 7, cmd: [{ type: 'sine', axis: 0, A: A * D2R, f, t0: 0, ramp: 5 }] });
  S.mech = Object.assign({}, S.mech || {}, mech || {});
  S.meas = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
  S.rec = { fs: 1000, ch: ['opt_el', 'opt_xel', 'rot'] };
  const R = L.runSim(P, S, null), i0 = 15000;
  return { el: rmsDet(R.rec.opt_el.subarray(i0)) * 1e6, xel: rmsDet(R.rec.opt_xel.subarray(i0)) * 1e6 };
}
const P0 = L.defaultParams('ship');
const d0 = L.derive(P0);
console.log('El döngüsü: kesim', d0.loopEl.fcx.toFixed(1), 'Hz, faz payı', d0.loopEl.pm.toFixed(1), '°, kazanç payı', d0.loopEl.gm.toFixed(1), 'dB @', (d0.loopEl.gmF||0).toFixed(0), 'Hz');
console.log('Az döngüsü: kesim', d0.loopAz.fcx.toFixed(1), 'Hz, faz payı', d0.loopAz.pm.toFixed(1), '°');
console.log('1 ms ek gecikmenin kesimde faz kaybı: el', (360 * d0.loopEl.fcx * 1e-3).toFixed(1), '°, az', (360 * d0.loopAz.fcx * 1e-3).toFixed(1), '°');
// yalnız kuplaj (sürtünme vb. kapalı) → S_f etkisini izole et; LOS iskele (a0 = 90°): roll → el
const iso = { coupling: true, friction: false, cogging: false, misalign: false, gyroNoise: false, gyroBias: false, imbalance: false, gimMode: false, optMode: false, cooler: false, earth: false, compErr: false };
for (const [A, f] of [[5, 0.1], [10, 0.25]]) {
  const out = [];
  for (const sf of [0, 100, 10000]) { const P = L.defaultParams('ship'); P.dut.gyro.sf_ppm = sf; const r = run(P, A, f, 60, iso); out.push(`S_f=${sf} ppm → el ${r.el.toFixed(3)} µrad`); }
  console.log(`roll ±${A}° @ ${f} Hz (yalnız kuplaj):`, out.join(' | '));
  const oe = [];
  for (const eps of [0, 0.1]) { const P = L.defaultParams('ship'); P.dut.gyro.epsEl = eps; P.dut.gyro.epsXel = eps; const r = run(P, A, f, 60, Object.assign({}, iso, { misalign: true })); oe.push(`ε=${eps} mrad → el ${r.el.toFixed(3)} / xel ${r.xel.toFixed(3)} µrad`); }
  console.log(`roll ±${A}° @ ${f} Hz (kuplaj + eksen kaçıklığı):`, oe.join(' | '));
}
