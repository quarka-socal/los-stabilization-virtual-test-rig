// İşletme ayrıştırması: VIV açık (önceden hesaplanmış) ve kapalı (gemi üstü direk) karşılaştırması
'use strict';
const L = require('./engine.js'), pre = require('../app/pre.json');
const P = L.defaultParams(); P.wb.viv.on = false;
const t0 = Date.now(); const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
const a = D.all, M = a.M, v = M.video, u = (x) => (x * 1e6).toFixed(2);
const o = pre.op;
console.log('süre', ((Date.now() - t0) / 1000).toFixed(0), 's');
console.log('B2-01 el (VIV açık → kapalı):', u(o.rows['B2-01'].el), '→', u(D.rows['B2-01'].el), 'µrad');
console.log('Tüm kaynaklar: wander el', u(o.all.wanderEl), '→', u(v.wander.el), '| LOS RMS el', u(o.all.rmsEl), '→', u(M.rms.el), '| B2 bandı el', u(o.all.bandEl.B2), '→', u(M.band.el.B2), '| P99 el', u(o.all.p99El), '→', u(v.p99.el), '| EIS sonrası', u(o.all.eis), '→', u(a.eis));
const B1 = L.computeBudget(L.defaultParams(), null), B0 = L.computeBudget(P, null);
console.log('Bütçe (analitik): wander', B1.wander.toFixed(2), '→', B0.wander.toFixed(2), '| B2 bandı', B1.bands.B2.wander.toFixed(2), '→', B0.bands.B2.wander.toFixed(2), '| EIS sonrası', B1.eisWander.toFixed(2), '→', B0.eisWander.toFixed(2));
require('fs').writeFileSync(require('path').join(__dirname, 'viv_op.json'), JSON.stringify({ wanderEl: v.wander.el, rmsEl: M.rms.el, b2: M.band.el.B2, p99: v.p99.el, eis: a.eis }));
