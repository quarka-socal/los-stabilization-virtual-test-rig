// v11 duman testi: varsayılan parametrelerle 27 test + işletme ayrıştırması (platform argüman)
const L = require('../engine.js'), kind = process.argv[2] || 'sub', mode = process.argv[3] || '';
const P = L.defaultParams(kind);
if (mode === 'ss5') { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); }
const ctx = {}, t0 = Date.now(), out = {};
for (const id of L.TEST_ORDER) {
  const t1 = Date.now(); const r = L.runTest(id, P, ctx, null);
  out[id] = { status: r.status, measured: r.measured, fill: r.fill, err: r.error };
  console.log(id, r.status, ((Date.now() - t1) / 1000).toFixed(1) + 's', r.error ? 'HATA ' + r.error.slice(0, 300) : r.measured.slice(0, 150));
}
const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
console.log('op', ((Date.now() - t0) / 1000).toFixed(0), 's; rows:', Object.entries(D.rows).map(([k, r]) => k + '=' + (r.el * 1e6).toFixed(2)).join(' '));
console.log('op all wander el/xel', (D.all.M.video.wander.el * 1e6).toFixed(2), (D.all.M.video.wander.xel * 1e6).toFixed(2));
require('fs').writeFileSync(__dirname + '/smoke11_' + kind + (mode ? '_' + mode : '') + '.json', JSON.stringify({ out, op: Object.fromEntries(Object.entries(D.rows).map(([k, r]) => [k, { el: r.el, xel: r.xel }])) }));
