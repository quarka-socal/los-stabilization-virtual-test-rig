// Regresyon: verilen platformun varsayılanlarıyla kampanya (+ işletme) koşar; taban pre.json ile alan alan karşılaştırır
// Kullanım: node regress.js <taban.json> [tests|op|all] [sub|ship] [çıktı.json|-] [compat]
//   compat: v11 eklerini nötrleyen uyum kipi (compatV10) — v10 tabanıyla bit düzeyinde aynı sonuç beklenir
'use strict';
const L = require('./engine.js'), fs = require('fs');
const base0 = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const what = process.argv[3] || 'all', kind = process.argv[4] || 'sub', outF = process.argv[5] && process.argv[5] !== '-' ? process.argv[5] : null, compat = process.argv[6] === 'compat';
const base = kind === 'ship' && base0.ship ? base0.ship : base0;     // pre.json: gemi sonuçları .ship altında
const P = compat ? L.compatV10(L.defaultParams(kind)) : L.defaultParams(kind);
const b64 = (a) => Buffer.from(new Float32Array(a).buffer).toString('base64');
function decimXY(x, y, maxPts) {
  const n = y.length; if (n <= maxPts) return [x, y];
  const bins = Math.floor(maxPts / 2), step = n / bins, xo = [], yo = [];
  for (let b = 0; b < bins; b++) {
    const i0 = Math.floor(b * step), i1 = Math.min(n, Math.floor((b + 1) * step));
    let imn = i0, imx = i0; for (let i = i0; i < i1; i++) { if (y[i] < y[imn]) imn = i; if (y[i] > y[imx]) imx = i; }
    const [a, c] = imn < imx ? [imn, imx] : [imx, imn]; xo.push(x[a], x[c]); yo.push(y[a], y[c]);
  }
  return [xo, yo];
}
function serPlot(p) {   // precompute.js ile aynı serileştirme (seyreltme dahil)
  if (!p.series) return p;
  return Object.assign({}, p, { series: p.series.map(s => { let x = Array.from(s.x), y = Array.from(s.y);
    if (!s.dots && y.length > 1600 && !p.xLog) [x, y] = decimXY(x, y, 1600);
    return Object.assign({}, s, { x: b64(x), y: b64(y), n: y.length }); }) });
}
const diffs = [], got = { tests: {} };
const cmp = (path, a, b) => { const sa = JSON.stringify(a), sb = JSON.stringify(b); if (sa !== sb) diffs.push({ path, base: sa && sa.slice(0, 400), now: sb && sb.slice(0, 400) }); };
const t0 = Date.now();
if (what === 'all' || what === 'tests') {
  const ctx = {};
  for (const id of L.TEST_ORDER) {
    const t1 = Date.now(); const r = L.runTest(id, P, ctx, null);
    const s = { status: r.status, measured: r.measured, kv: r.kv, notes: r.notes, fill: r.fill, validity: r.validity, num: r.num, plots: (r.plots || []).map(serPlot) };
    got.tests[id] = s;
    const B = base.tests && base.tests[id];
    if (!B) { console.log(id, 'tabanda yok (yeni test) — karşılaştırılmadı'); continue; }
    for (const k of ['status', 'measured', 'kv', 'notes', 'fill', 'validity', 'num']) cmp(id + '.' + k, B[k], s[k]);
    (B.plots || []).forEach((bp, i) => { const np = s.plots[i]; if (!np) { diffs.push({ path: id + '.plots[' + i + ']', base: 'var', now: 'yok' }); return; }
      cmp(id + '.plots[' + i + '].title', bp.title, np.title);
      (bp.series || []).forEach((bs, j) => { const ns = (np.series || [])[j]; if (!ns) { diffs.push({ path: id + '.plots[' + i + '].series[' + j + ']', base: 'var', now: 'yok' }); return; }
        cmp(id + `.plots[${i}].series[${j}].name`, bs.name, ns.name); cmp(id + `.plots[${i}].series[${j}].y`, bs.y, ns.y); cmp(id + `.plots[${i}].series[${j}].x`, bs.x, ns.x); }); });
    console.log(id, r.status, ((Date.now() - t1) / 1000).toFixed(1) + ' s');
  }
}
if (what === 'all' || what === 'op') {
  const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
  got.op = { rows: {}, all: { wanderEl: D.all.M.video.wander.el, wanderXel: D.all.M.video.wander.xel, rmsEl: D.all.M.rms.el, p99El: D.all.M.video.p99.el, eis: D.all.eis, eisLock: D.all.eisLock } };
  for (const [id, r] of Object.entries(D.rows)) { const o = {}; for (const [k, v] of Object.entries(r)) if (typeof v === 'number') o[k] = v; got.op.rows[id] = o;
    if (base.op && base.op.rows[id]) for (const k of Object.keys(base.op.rows[id])) if (k !== 'id') cmp('op.' + id + '.' + k, base.op.rows[id][k], o[k]); }
  if (base.op) for (const k of ['wanderEl', 'wanderXel', 'rmsEl', 'p99El', 'eis', 'eisLock']) cmp('op.all.' + k, base.op.all[k], got.op.all[k]);
  console.log('op', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}
console.log('FARK SAYISI', diffs.length);
for (const d of diffs.slice(0, 60)) console.log(JSON.stringify(d));
if (outF) fs.writeFileSync(outF, JSON.stringify({ diffs, got }));
