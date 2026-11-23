// Kaydedilmiş regresyon çıktısını (regress.js <taban> ... <çıktı.json>: { diffs, got }) başka bir tabanla karşılaştırır
// (regress.js ile aynı alanlar: durum, ölçülen, kv, notlar, dolgu, geçerlilik, num, grafik başlık/seri; işletme satırları).
// Kullanım: node regcmp.js <çıktı.json> <taban.json> <sub|ship> → alan bazında fark listesi ve test başına özet
'use strict';
const fs = require('fs');
const [outF, baseF, kind] = process.argv.slice(2);
const got = JSON.parse(fs.readFileSync(outF, 'utf8')).got, base0 = JSON.parse(fs.readFileSync(baseF, 'utf8'));
const base = kind === 'ship' && base0.ship ? base0.ship : base0;
const diffs = [];
const cmp = (path, a, b) => { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) diffs.push({ path, base: sa && sa.slice(0, 700), now: sb && sb.slice(0, 700) }); };
for (const [id, s] of Object.entries(got.tests || {})) {
  const B = base.tests && base.tests[id]; if (!B) { diffs.push({ path: id, base: 'yok', now: 'var' }); continue; }
  for (const k of ['status', 'measured', 'kv', 'notes', 'fill', 'validity', 'num']) cmp(id + '.' + k, B[k], s[k]);
  (B.plots || []).forEach((bp, i) => { const np = (s.plots || [])[i]; if (!np) { diffs.push({ path: id + '.plots[' + i + ']', base: 'var', now: 'yok' }); return; }
    cmp(id + '.plots[' + i + '].title', bp.title, np.title);
    (bp.series || []).forEach((bs, j) => { const ns = (np.series || [])[j]; if (!ns) { diffs.push({ path: id + `.plots[${i}].series[${j}]`, base: 'var', now: 'yok' }); return; }
      cmp(id + `.plots[${i}].series[${j}].name`, bs.name, ns.name); cmp(id + `.plots[${i}].series[${j}].y`, bs.y, ns.y); cmp(id + `.plots[${i}].series[${j}].x`, bs.x, ns.x); }); });
}
if (got.op && base.op) {
  for (const [id, o] of Object.entries(got.op.rows)) if (base.op.rows[id]) for (const k of Object.keys(base.op.rows[id])) if (k !== 'id') cmp('op.' + id + '.' + k, base.op.rows[id][k], o[k]);
  for (const k of ['wanderEl', 'wanderXel', 'rmsEl', 'p99El', 'eis', 'eisLock']) cmp('op.all.' + k, base.op.all[k], got.op.all[k]);
}
const by = {}; for (const d of diffs) { const t = d.path.split('.')[0]; (by[t] = by[t] || []).push(d.path.slice(t.length + 1)); }
console.log('FARK SAYISI', diffs.length);
for (const [t, a] of Object.entries(by)) console.log(`  ${t}: ${a.length} → ${a.join(', ').slice(0, 300)}`);
console.log('---');
for (const d of diffs) if (!/plots|validity/.test(d.path)) console.log(JSON.stringify(d).slice(0, 1500));
