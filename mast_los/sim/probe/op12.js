const L = require('../engine.js'), kind = process.argv[2] || 'sub';
const P = L.defaultParams(kind);
const t0 = Date.now(); const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
console.log('op', ((Date.now() - t0) / 1000).toFixed(1), 's');
const u = (x) => (x * 1e6).toFixed(2), q = D.req;
for (const k of ['pre', 'post']) { const m = q[k]; console.log(k, 'σ El/Az/vec pooled', u(m.sEl.pooled), u(m.sXel.pooled), u(m.sVec.pooled), 'u95', u(m.sEl.u95), u(m.sXel.u95), u(m.sVec.u95), 'PPV', u(m.ppEl), u(m.ppXel), 'P9973', u(m.p9973.rad), 'exp', u(m.exp.el), u(m.exp.xel), 'expPSD', u(m.expPsd.el), 'bandsEl', m.el.bands.map(u).join('/'), 'below', u(m.el.below), 'tones', m.el.tones.slice(0, 4).map(t => t.f.toFixed(2) + ':' + u(t.rms)).join(' ')); }
console.log('checksPost fail:', q.checksPost.filter(c => !c.ok).map(c => c.name + ' ' + u(c.v) + '/' + u(c.lim)).join(' | '));
const rows = Object.entries(D.rows).filter(([, r]) => r.qHpEl != null).map(([id, r]) => [id, r.qHpEl, r.qHpXel, r.qExpEl, r.qB0El, r.qB1El, r.qB2El, r.qB3El]).sort((a, b) => b[1] - a[1]);
for (const r of rows.slice(0, 10)) console.log(r[0], r.slice(1).map(u).join(' '));
