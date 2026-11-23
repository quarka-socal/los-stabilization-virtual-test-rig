// v11: tohum tekrarlarını yeni varsayılanlara taşır. Denizaltı varsayılanında v10 → v11 farkı yalnız görüntü rotasyonu
// ölçütüdür (köşe pikseli): T1.5 yeniden koşulur; işletme R-01 satırı d.rot.of(ψ) doğrusal olduğundan kenar → köşe
// oranıyla (atan köşe / atan kenar) tam ölçeklenir; B1-08 (deniz ötelemesi) denizaltında kaynaksızdır (0).
// Diğer testlerin karar ve ölçümleri uyum kipi regresyonuyla v10 ile bit düzeyinde aynıdır (regress.js … compat).
'use strict';
const L = require('./engine.js'), fs = require('fs'), path = require('path');
const d = L.derive(L.defaultParams()), kRot = d.rot.angC / d.rot.angE;
for (const k of [1, 2, 3, 4]) {
  const file = path.join(__dirname, `seeds_${k}.json`), S = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (S.v11) { console.log(k, 'zaten v11'); continue; }
  const P = L.defaultParams(); P.ana.seedOffset = k;
  const r = L.runTest('T1.5', P, {}, null);
  S.tests['T1.5'] = { status: r.status, fill: r.fill || {}, num: r.num || null };
  const R1 = S.op.rows['R-01']; if (R1 && isFinite(R1.cmp)) R1.cmp *= kRot;
  S.op.rows['B1-08'] = { el: 0, xel: 0, cmp: 0, cmpXel: 0 };
  S.v11 = true;
  fs.writeFileSync(file, JSON.stringify(S));
  console.log(k, 'T1.5', r.status, JSON.stringify(r.fill), 'R-01 op ×', kRot.toFixed(5));
}
