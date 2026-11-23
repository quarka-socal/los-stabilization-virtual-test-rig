// Teknik kılavuz §3 (v13.1) — kaldıraç kolu değişimlerinde test yanıtları: T1.3 (laboratuvar deniz profili, öteleme q'su) ve
// T2.5 (B1-08 kestirimi, tam ilişkili sınır). Argüman: 'a' denizaltı h = 1 m (yeni varsayılan), 'b' gemi r = (20, 0, 15) m.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const which = process.argv[2] || 'a';
const P = L.defaultParams(which === 'a' ? 'sub' : 'ship');
if (which === 'b') { P.wb.sea.rx = 20; P.wb.sea.ry = 0; P.wb.sea.h = 15; }
const out = { which, r: L.seaArm(P) }, ctx = {};
for (const id of ['T2.5', 'T1.3']) {
  const t0 = Date.now(), r = L.runTest(id, P, ctx, null);
  out[id] = { status: r.status, measured: r.measured, kv: r.kv, notes: r.notes, num: r.num && (id === 'T2.5' ? { tr6: r.num.tr6 && { predEl: r.num.tr6.predEl, predXel: r.num.tr6.predXel, acc: r.num.tr6.acc } } : { wander: r.num.wander }) };
  console.log(id, r.status, ((Date.now() - t0) / 1000).toFixed(0) + ' s |', r.measured);
  for (const [k, v] of r.kv) if (/Deniz ötelemesi|deniz ivmesi|İşletme kestirimi|tam ilişkili|Tohum başına/.test(k)) console.log('   ', k, '|', v);
  for (const n of r.notes) if (/ötelemesini|kaldıraç/.test(n)) console.log('   not:', n.slice(0, 260));
}
require('fs').writeFileSync(path.join(__dirname, `tests_${which}.json`), JSON.stringify(out, null, 1));
