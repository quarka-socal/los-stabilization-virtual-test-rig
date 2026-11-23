// v13.17 (§14 K2 c): opDecomposition'ın yeni req.noSlap alanı ↔ k17 probu (A_s = 0 ile tam ayrıştırma); takip öncesi koşu ↔ ön hesap (değişmemeli)
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '../k17/op_noslap.json'), 'utf8'));
const PRE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../app/pre.json'), 'utf8'));
const P = L.defaultParams('sub'), t0 = Date.now(), D = L.opDecomposition(P, { T: 600, seed: 11 }, null), u = (x) => (x * 1e6).toFixed(4);
const out = {};
for (const k of ['pre', 'post']) {
  const a = D.req.noSlap[k], b = ref.without[k], c = D.req[k], c0 = PRE.op.req[k];
  console.log(`${k}: çarpmasız PPV El ${u(a.ppEl)} ↔ k17 ${u(b.ppEl)} · PPV/σ ${a.rEl.toFixed(4)} ↔ ${b.rEl.toFixed(4)} · P99,73 ${u(a.p9973.rad)} ↔ ${u(b.p9973)} · σ_El u95 ${u(L.decideStat(a.sEl, P.ana.los.decide))} ↔ ${u(b.sEl)}`);
  console.log(`   çarpmalı koşu ↔ ön hesap: PPV El ${u(c.ppEl)} ↔ ${u(c0.ppEl)}, σ_vek pooled ${u(c.sVec.pooled)} ↔ ${u(c0.sVec.pooled)}`);
  out[k] = { ppEl: a.ppEl, ppXel: a.ppXel, rEl: a.rEl, p9973: a.p9973.rad, refPpEl: b.ppEl, same: Math.abs(a.ppEl - b.ppEl) < 1e-12 && Math.abs(c.ppEl - c0.ppEl) < 1e-12 };
}
const S = L.defaultParams('ship'), D2 = L.opDecomposition(S, { T: 600, seed: 11 }, null);
console.log('gemi: noSlap', D2.req.noSlap ? 'VAR (beklenmiyor)' : 'yok (çarpma kaynağı yok)');
console.log(`süre ${((Date.now() - t0) / 1000).toFixed(0)} s (iki platform)`);
fs.writeFileSync(path.join(__dirname, 'noslap_check.json'), JSON.stringify(out, null, 1));
