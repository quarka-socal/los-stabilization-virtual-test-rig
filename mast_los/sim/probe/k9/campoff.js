// §7: kompanzasyon KAPALI iken bütün kampanya (denizaltı) — durumlar ve geçersizlik nedenleri; varsayılanla karşılaştırma (pre.json)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const pre = require(path.join(__dirname, '../../../app/pre.json'));
const P = L.defaultParams('sub'); P.wb.earth.comp = false;
const ctx = {}, out = [];
for (const id of L.TEST_ORDER) {
  const t0 = Date.now(); let r;
  try { r = L.runTest(id, P, ctx, null); } catch (e) { r = { status: 'HATA', measured: String(e.message) }; }
  const b = pre.tests[id] || {};
  out.push({ id, st: r.status, base: b.status, measured: String(r.measured).slice(0, 200), s: (Date.now() - t0) / 1000 });
  console.log(`${id} ${b.status} → ${r.status} [${((Date.now() - t0) / 1000).toFixed(0)} s] ${String(r.measured).slice(0, 150)}`);
}
require('fs').writeFileSync(path.join(__dirname, 'campoff.json'), JSON.stringify(out, null, 1));
