// §11 Örnek DUT — optik: T0.1 (plaka ölçeği ve distorsiyon) kestiricisinin tohumlar arası dağılımı ve belirttiği belirsizliğin
// kapsaması: z = (IFOV_kestirim / IFOV_gerçek − 1) / u_rel. Gerçek IFOV = p/f·(1 + scaleErr). Çıktı: optics_eng.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const out = [];
for (const [nm, fn, N] of [['varsayılan (scaleErr 0,004, k1 −0,002)', null, 30], ['scaleErr 0,02', (P) => { P.dut.optics.scaleErr = 0.02; }, 12], ['k1 −0,02', (P) => { P.dut.optics.k1 = -0.02; }, 12], ['k1 0', (P) => { P.dut.optics.k1 = 0; }, 12]]) {
  const t0 = Date.now(), z = [], e = [], k1 = [], u = [];
  for (let s = 0; s < N; s++) {
    const P = L.defaultParams('sub'); if (fn) fn(P); P.ana.seedOffset = s;
    const ctx = {}; L.runTest('T0.1', P, ctx, null);
    const ch = P.wb.ch ? null : null, d = L.derive(P), IFt = d.IFOV * (1 + P.dut.optics.scaleErr);
    const err = ctx.T01.IFOVeff / IFt - 1; e.push(err); u.push(ctx.T01.relU); z.push(err / ctx.T01.relU); k1.push(ctx.T01.k1);
  }
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => Math.sqrt(a.reduce((x, y) => x + (y - m(a)) ** 2, 0) / (a.length - 1));
  const P0 = L.defaultParams('sub'); if (fn) fn(P0);
  const r = { nm, N, errMean: m(e), errSd: sd(e), uMean: m(u), zMean: m(z), zRms: Math.sqrt(m(z.map(x => x * x))), fracAbsZgt2: z.filter(x => Math.abs(x) > 2).length / N, k1Mean: m(k1), k1Sd: sd(k1), k1Model: P0.dut.optics.k1 };
  out.push(r);
  console.log(`${nm}: n ${N} · IFOV hatası ort ${(100 * r.errMean).toFixed(4)} %, sd ${(100 * r.errSd).toFixed(4)} %, belirtilen u ort ${(100 * r.uMean).toFixed(4)} % · z ort ${r.zMean.toFixed(2)}, z RMS ${r.zRms.toFixed(2)}, |z| > 2 oranı ${(100 * r.fracAbsZgt2).toFixed(0)} % · k1 ${r.k1Mean.toFixed(5)} ± ${r.k1Sd.toFixed(5)} (model ${r.k1Model}) [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'optics_eng.json'), JSON.stringify(out, null, 1));
