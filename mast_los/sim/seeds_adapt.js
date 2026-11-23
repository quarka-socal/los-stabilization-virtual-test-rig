// v13.17 (§14 K1 c): uyarlamalı tohum tekrarı. Kampanya 5 tohumla koşulur (vv_seeds.js, k = 0…4). Bu 5 tohumda sınıra %2'den yakın
// karar satırı olan testler (vv_seeds_agg.js → seeds.json adaptive.ids; şimdi yalnız T1.9) N_hedef tohuma tamamlanır (k = 5…N−1).
// Ön koşul testleri bağlam için önce koşulur: T1.9 ← T0.1 (IFOV_cal, ölçek belirsizliği relU, piksel fazı). Bu bağımlılığın tam olduğu
// --check kipiyle sınanır: k = 1…4 için T1.9 sonucu vv_seeds.js'in tam kampanya koşusuyla (seeds_<k>.json) birebir aynı olmalıdır.
// Kullanım: node seeds_adapt.js <k0> <k1> [T1.9,…]          → seeds_adapt_<k>.json (k ≥ 5)
//           node seeds_adapt.js 1 4 T1.9 --check             → yalnız karşılaştırma, dosya yazılmaz
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const PREREQ = { 'T1.9': ['T0.1'] };
const k0 = +(process.argv[2] || 5), k1 = +(process.argv[3] || k0), check = process.argv.includes('--check');
const ids = (process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4].split(',') : null) ||
  JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds.json'), 'utf8')).adaptive.ids;
const pickQ = (q) => q ? { sEl: q.sEl, sXel: q.sXel, sVec: q.sVec, ppEl: q.ppEl, ppXel: q.ppXel, p9973: { rad: q.p9973.rad }, exp: { el: q.exp.el, xel: q.exp.xel }, el: { bands: q.el.bands } } : null;
const brief = (id, r) => ({ status: r.status, fill: r.fill || {}, num: id === 'T1.9' && r.num && r.num.once ? { basis: r.num.basis, checks: r.num.checks, once: pickQ(r.num.once), sonra: pickQ(r.num.sonra) } : null });
let bad = 0;
for (let k = k0; k <= k1; k++) {
  const t0 = Date.now(), P = L.defaultParams(); P.ana.seedOffset = k;
  const out = { offset: k, adaptive: true, tests: {} }, ctx = {};
  for (const id of ids) {
    for (const pr of PREREQ[id] || []) if (!ctx['_' + pr]) { L.runTest(pr, P, ctx, null); ctx['_' + pr] = 1; }
    const r = L.runTest(id, P, ctx, null); out.tests[id] = brief(id, r);
    if (check) {
      const ref = JSON.parse(fs.readFileSync(path.join(__dirname, `seeds_${k}.json`), 'utf8')).tests[id];
      const a = r.num.checks.map(c => c.v), b = ref.num.checks.map(c => c.v), d = Math.max(...a.map((v, i) => Math.abs(v - b[i]) / Math.abs(b[i])));
      const same = r.status === ref.status && d === 0; if (!same) bad++;
      console.log(`k ${k} ${id}: ${r.status} ↔ ${ref.status}; 18 karar satırının en büyük göreli farkı ${d.toExponential(2)} → ${same ? 'birebir' : 'FARK'}`);
    } else console.log(`k ${k} ${id} ${r.status} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  out.elapsed = (Date.now() - t0) / 1000;
  if (!check) fs.writeFileSync(path.join(__dirname, `seeds_adapt_${k}.json`), JSON.stringify(out));
}
if (check) { console.log(bad ? `FARK: ${bad}` : 'ön koşul bağımlılığı tam: tam kampanya koşusuyla birebir'); process.exitCode = bad ? 1 : 0; }
