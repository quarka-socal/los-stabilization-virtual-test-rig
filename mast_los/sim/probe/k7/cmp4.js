// §4 (VIV) tablolarının güncellenmesi: v13.3/v13.4 (probe/k5) ↔ v13.5 (probe/k7) test yanıtlarının karşılaştırması.
// Argüman: 'sub' | 'ship'. Her durum için T2.1, T2.2 (f_n OFF → ON, yalnız açısal, en kötü @ f, durum), T2.3 (sapma, durum),
// işletme B2-01 ve T2.2 yol ayrımı; değişen alanlar '≠' ile işaretlenir.
'use strict';
const fs = require('fs'), path = require('path');
const kind = process.argv[2] || 'sub';
const A = JSON.parse(fs.readFileSync(path.join(__dirname, '../k5', `tests_${kind}.json`), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(__dirname, `viv_${kind}.json`), 'utf8'));
const g = (s, re) => { const m = String(s || '').match(re); return m ? m.slice(1).join(' / ') : '—'; };
const kv = (q, re) => { const r = ((q && q.kv) || []).find(([k]) => re.test(k)); return r ? String(r[1]) : ''; };
const kvk = (q, re) => { const r = ((q && q.kv) || []).find(([k]) => re.test(k)); return r ? String(r[0]) + ' : ' + String(r[1]) : ''; };
const pick = (o) => {
  const t21 = o['T2.1'], t22 = o['T2.2'], t23 = o['T2.3'];
  return {
    'T2.1': `${t21.status} ${g(t21.measured, /roll→el (?:DRR ≤ )?(-?[\d.]+) dB @ ([\d.]+) Hz/)}`,
    'T2.2 fn': g(t22.measured, /f_n = ([\d.]+) Hz'de OFF ([\d.]+) → ON ([\d.]+) µrad/),
    'T2.2 açısal': g(t22.measured, /yalnız açısal uyarımla ([\d.]+) µrad/),
    'T2.2 en kötü': `${t22.status} ${g(t22.measured, /en kötü ([\d.]+) µrad/)}`,
    'T2.2 öteleme yolu': g(kv(t22, /yalnız açısal/), /öteleme yolu karesel ([\d.]+) µrad/),
    'T2.3': `${t23.status} ${g(t23.measured, /Kombine artık ([\d.]+) µrad; ayrı testlerin RSS'i ([\d.]+) µrad → sapma (-?[\d.]+) %/)}`,
    'B2-01 op': o.op ? `${o.op.el.toFixed(2)} / ${o.op.xel.toFixed(2)}` : '—',
    'B2-01 fill': o['T2.2'].fill && o['T2.2'].fill['B2-01'] != null ? (o['T2.2'].fill['B2-01'] * 1e6).toFixed(2) : '—',
    'yol': kv(t22, /yol ayrımı/).slice(0, 200),
  };
};
for (const b of B) {
  const a = A.find(x => x.id === b.id);
  const pb = pick(b), pa = a ? pick(a) : null;
  console.log(`\n${b.id} ${b.nm}`);
  for (const k of Object.keys(pb)) {
    const same = pa && pa[k] === pb[k];
    if (k === 'yol' && same) continue;
    console.log(`   ${same ? ' ' : '≠'} ${k}: ${pa ? pa[k] : '(yok)'}${same ? '' : '  →  ' + pb[k]}`);
  }
  // en kötü dwell frekansı (T2.2 kv'den: ON değerlerinin en büyüğü)
  const worstF = (o) => { let best = null; for (const [k, v] of (o['T2.2'].kv || [])) { const m = String(v).match(/ON el ([\d.]+) \/ xel ([\d.]+)/); const f = String(k).match(/^([\d.]+) Hz/); if (m && f) { const x = Math.max(+m[1], +m[2]); if (!best || x > best[1]) best = [f[1], x]; } } return best ? `${best[0]} Hz` : '—'; };
  const wa = a ? worstF(a) : '—', wb = worstF(b);
  if (wa !== wb) console.log(`   ≠ en kötü dwell: ${wa} → ${wb}`);
}
