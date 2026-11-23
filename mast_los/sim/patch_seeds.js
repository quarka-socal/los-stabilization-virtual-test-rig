// Kabul ölçütü düzeltilen testleri (T0.2, T3.1 zinciri) tohum tekrarlarında yeniden koşar ve seeds_<k>.json'u günceller.
// Kullanım: node patch_seeds.js 1,2,3,4 [T0.1,T0.2,T3.1,T3.2,T3.3]
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const ks = (process.argv[2] || '1,2,3,4').split(',').map(Number);
const ids = (process.argv[3] || 'T0.1,T0.2,T3.1,T3.2,T3.3').split(',');
for (const k of ks) {
  const file = path.join(__dirname, `seeds_${k}.json`);
  const S = JSON.parse(fs.readFileSync(file, 'utf8'));
  const P = L.defaultParams(); P.ana.seedOffset = k;
  const ctx = {};
  for (const id of ids) { const r = L.runTest(id, P, ctx, null); S.tests[id] = { status: r.status, fill: r.fill || {}, num: r.num || null }; console.log(k, id, r.status, JSON.stringify(r.fill || {})); }
  fs.writeFileSync(file, JSON.stringify(S));
}
