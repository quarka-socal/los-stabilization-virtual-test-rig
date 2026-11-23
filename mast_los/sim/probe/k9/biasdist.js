// §7: T0.7 AÇIK koşusunda gyro bias'ının kayma payının dağılımı (tohumlar). 900 s ve 300 s; ölçüm gürültüsü kapalı, mekanizmalar açık.
// Beklenen: sabit bias (bias0) + kararsızlık gerçekleşmesi (bi). Bütçe varsayımı: H.bias + H.b0_res (= 0,09 °/h = 0,436 µrad/s).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const slope = (t, y) => { const n = t.length, tm = t.reduce((a, b) => a + b, 0) / n, ym = y.reduce((a, b) => a + b, 0) / n; let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (t[i] - tm) * (y[i] - ym); b += (t[i] - tm) ** 2; } return a / b; };
const res = {};
for (const T of [900, 300]) {
  const rows = [];
  for (let s = 0; s < 12; s++) {
    const P = L.defaultParams('sub');
    const S = L.labScenario(P, { label: 'bias', T: T + 3, fs: 2000, earthComp: true, seed: 702 + 37 * s, meas: { video: false, ac: false, imu: false, air: false, microvib: false, noise: false },
      rec: { fs: 20, ch: ['dr_b_el', 'dr_b_xel'] } });
    const R = L.runSim(P, S), tt = Array.from({ length: R.meta.nRec }, (_, i) => i / R.meta.fRec), i0 = Math.round(3 * R.meta.fRec);
    rows.push({ el: slope(tt.slice(i0), Array.from(R.rec.dr_b_el.subarray(i0))) * 1e6, xel: slope(tt.slice(i0), Array.from(R.rec.dr_b_xel.subarray(i0))) * 1e6 });
  }
  const st = (k) => { const v = rows.map(r => r[k]), m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return { m, sd, maxAbs: Math.max(...v.map(Math.abs)) }; };
  res[T] = { rows, el: st('el'), xel: st('xel') };
  console.log(`T = ${T} s: bias kayma payı el ort ${res[T].el.m.toFixed(3)} ± ${res[T].el.sd.toFixed(3)} (en büyük |·| ${res[T].el.maxAbs.toFixed(3)}), xel ${res[T].xel.m.toFixed(3)} ± ${res[T].xel.sd.toFixed(3)} (${res[T].xel.maxAbs.toFixed(3)}) µrad/s; tohumlar el: ${rows.map(r => r.el.toFixed(2)).join(' ')}`);
}
const P = L.defaultParams('sub'), G = P.dut.gyro, DPH = Math.PI / 180 / 3600;
console.log(`DUT: bias0 ${G.bias0} °/h = ${(G.bias0 * DPH * 1e6).toFixed(3)} µrad/s, bi ${G.bi} °/h = ${(G.bi * DPH * 1e6).toFixed(3)}; bütçe H.bias + b0_res = ${((P.wb.H.bias + P.wb.H.b0_res) * DPH * 1e6).toFixed(3)} µrad/s`);
require('fs').writeFileSync(path.join(__dirname, 'biasdist.json'), JSON.stringify(res, null, 1));
