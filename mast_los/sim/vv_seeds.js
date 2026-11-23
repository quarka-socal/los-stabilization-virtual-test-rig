// İstatistiksel tekrar: tüm kampanya + işletme ayrıştırması, P.ana.seedOffset = k ile (tüm rastgele süreçlerin
// başka bir gerçekleşmesi). Kullanım: node vv_seeds.js <k>   → seeds_<k>.json
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const k = +(process.argv[2] || 1);
const P = L.defaultParams(); P.ana.seedOffset = k;
const t0 = Date.now();
const out = { offset: k, tests: {}, op: null };
const ctx = {};
for (const id of L.TEST_ORDER) {
  const t1 = Date.now();
  const r = L.runTest(id, P, ctx, null);
  out.tests[id] = { status: r.status, fill: r.fill || {}, num: r.num || null };
  console.log(k, id, r.status, ((Date.now() - t1) / 1000).toFixed(1) + ' s');
}
const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
const rows = {}; for (const [id, r] of Object.entries(D.rows)) rows[id] = { el: r.el, xel: r.xel, cmp: r.cmp, cmpXel: r.cmpXel };
const M = D.all.M;
out.op = { rows, rho: D.rho, all: { rmsEl: M.rms.el, rmsXel: M.rms.xel, wanderEl: M.video.wander.el, wanderXel: M.video.wander.xel, smearEl: M.video.smear.el, smearXel: M.video.smear.xel, p99El: M.video.p99.el, eis: D.all.eis } };
out.elapsed = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(__dirname, `seeds_${k}.json`), JSON.stringify(out));
console.log('seed', k, 'bitti', out.elapsed.toFixed(0), 's');
