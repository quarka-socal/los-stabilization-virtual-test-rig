// v13.15 §14: işletmede PPV El'in kaynağı — gereksinim özeti (op.req) dalga çarpması açık (ön hesap) ↔ kapalı (A_s = 0), denizaltı
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const PRE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../app/pre.json'), 'utf8'));
const P = L.defaultParams('sub'); P.env.slap.A = 0;
const t0 = Date.now(), D = L.opDecomposition(P, { T: 600, seed: 11 }, null), q0 = PRE.op.req, q1 = D.req, lim = L.losLimits(P);
const row = (nm, q) => { const u = (x) => (x * 1e6).toFixed(2), ds = (w) => L.decideStat(w, P.ana.los.decide);
  return `${nm}: σ_El ${u(ds(q.sEl))} σ_Az ${u(ds(q.sXel))} σ_vek ${u(ds(q.sVec))} · PPV El ${u(q.ppEl)} / Az ${u(q.ppXel)} · PPV/σ ${q.rEl.toFixed(2)} / ${q.rXel.toFixed(2)} (Gauss ${q.gauss ? q.gauss.el.toFixed(1) + ' / ' + q.gauss.xel.toFixed(1) : '—'}) · P99,73 ${u(q.p9973.rad)}`; };
const out = { with: {}, without: {} };
for (const k of ['pre', 'post']) { console.log(row(`çarpma açık, ${k}`, q0[k])); console.log(row(`çarpma kapalı, ${k}`, q1[k]));
  out.with[k] = { ppEl: q0[k].ppEl, rEl: q0[k].rEl, p9973: q0[k].p9973.rad }; out.without[k] = { ppEl: q1[k].ppEl, rEl: q1[k].rEl, p9973: q1[k].p9973.rad, sEl: L.decideStat(q1[k].sEl, P.ana.los.decide), gauss: q1[k].gauss }; }
console.log(`sınırlar: PPV El ${(lim.ppvEl * 1e6).toFixed(1)}, P99,73 ${(lim.p9973 * 1e6).toFixed(1)} µrad; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
fs.writeFileSync(path.join(__dirname, 'op_noslap.json'), JSON.stringify(out, null, 1));
