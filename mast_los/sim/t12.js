const L = require('./engine.js');
const P = L.defaultParams();
const d = L.derive(P), A = 0.05 * L.D2R, Tp = 0.2;
const ev = []; for (let i = 0; i < 10; i++) ev.push({ t0: 3 + i * 4, Tp, A: A * (i % 2 ? -1 : 1) });
const S = L.labScenario(P, { label: 'dbg', T: 45, fs: 4000, stab: false, cmd: [{ type: 'halfsine', axis: 0, events: ev }], meas: { video: true, ac: true, imu: true, air: false, microvib: false, noise: false } });
const R = L.runSim(P, S);
const n = R.meta.nRec, tr = new Float64Array(n); for (let i = 0; i < n; i++) tr[i] = i / 1000;
const v = L.videoAngles(R, {});
const base = Float64Array.from(R.rec.base_r), imu = Float64Array.from(R.rec.imu_r);
const tv = [], yv = []; for (let i = 0; i < v.t.length; i++) if (v.ok[i]) { tv.push(v.t[i]); yv.push(v.el[i]); }
console.log('IMU vs base (IMU gecikmesi, + beklenir 0.95 ms):', (L.delayEstimate(tr, base, tr, imu, 4000, 0.01) * 1e3).toFixed(4), 'ms');
console.log('video vs base (0 beklenir):', (L.delayEstimate(tr, base, Float64Array.from(tv), Float64Array.from(yv), 4000, 0.01) * 1e3).toFixed(4), 'ms');
console.log('video vs IMU (−0.95 beklenir):', (L.delayEstimate(tr, imu, Float64Array.from(tv), Float64Array.from(yv), 4000, 0.01) * 1e3).toFixed(4), 'ms');
// alternatif: 1 kHz kayıtlı opt_el ile
const opt = Float64Array.from(R.rec.opt_el);
console.log('opt_el (1 kHz) vs IMU:', (L.delayEstimate(tr, imu, tr, opt, 4000, 0.01) * 1e3).toFixed(4), 'ms');
console.log('opt_el vs base:', (L.delayEstimate(tr, base, tr, opt, 4000, 0.01) * 1e3).toFixed(4), 'ms');
function perPulse(R, label) {
  const n = R.meta.nRec, tr = new Float64Array(n); for (let i = 0; i < n; i++) tr[i] = i / 1000;
  const v = L.videoAngles(R, {}); const imu = Float64Array.from(R.rec.imu_r);
  const est = [];
  for (const e of ev) {
    let i0 = Math.round((e.t0 - 0.6) * 1000), i1 = Math.round((e.t0 + 0.9) * 1000);
    const tv = [], yv = []; for (let i = 0; i < v.t.length; i++) if (v.ok[i] && v.t[i] >= e.t0 - 0.5 && v.t[i] <= e.t0 + 0.8) { tv.push(v.t[i]); yv.push(v.el[i]); }
    est.push(L.delayEstimate(tr.subarray(i0, i1), imu.subarray(i0, i1), Float64Array.from(tv), Float64Array.from(yv), 4000, 0.01) * 1e3);
  }
  console.log(label, est.map(x => x.toFixed(3)).join(' '));
}
perPulse(R, 'gürültüsüz, darbe başına:');
const S2 = L.labScenario(P, { label: 'dbg2', T: 45, fs: 4000, stab: false, cmd: [{ type: 'halfsine', axis: 0, events: ev }] });
perPulse(L.runSim(P, S2), 'gürültülü, darbe başına:');
