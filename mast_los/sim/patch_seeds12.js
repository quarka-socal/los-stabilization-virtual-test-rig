// v12: T1.9 (proje LOS kalıntı kabulü) tohum tekrarları. Her seeds_<k>.json'a T1.9 sonucu eklenir (büyük diziler
// — kümülatif RMS, ASD — atılır). Diğer testler v12'de değişmedi (uyum kipi regresyonu; v11 ekleri patch_seeds11.js).
'use strict';
const L = require('./engine.js'), fs = require('fs'), path = require('path');
const slim = (q) => { if (!q) return q; const o = Object.assign({}, q); delete o.cum; delete o.asd; return o; };
for (const k of [1, 2, 3, 4]) {
  const file = path.join(__dirname, `seeds_${k}.json`), S = JSON.parse(fs.readFileSync(file, 'utf8'));
  const P = L.defaultParams(); P.ana.seedOffset = k;
  const t0 = Date.now(), r = L.runTest('T1.9', P, {}, null), n = r.num || {};
  S.tests['T1.9'] = { status: r.status, fill: r.fill || {}, num: { basis: n.basis, decide: n.decide, checks: n.checks, trk: n.trk, once: slim(n.once), sonra: slim(n.sonra) } };
  S.v12 = true;
  fs.writeFileSync(file, JSON.stringify(S));
  const B = n[n.basis] || {};
  console.log(k, 'T1.9', r.status, 'σ_vek u95', B.sVec ? (B.sVec.u95 * 1e6).toFixed(3) : '—', 'σ_El', B.sEl ? (B.sEl.u95 * 1e6).toFixed(3) : '—', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
