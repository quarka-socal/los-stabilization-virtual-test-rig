// Varsayılan parametrelerle kampanya + işletme ayrıştırması + düzenek oynatmasını önceden hesaplar
// Çıktı: ../app/pre.json (sayfaya gömülür). Kullanım: node precompute.js [tests|op|play|all]
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const what = process.argv[2] || 'all';
const outFile = path.join(__dirname, '..', 'app', 'pre.json');
const pre = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

const b64 = (a) => Buffer.from(new Float32Array(a).buffer).toString('base64');
const b64u8 = (a) => Buffer.from(Uint8Array.from(a).buffer).toString('base64');
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
function serPlot(p) {
  if (!p.series) return p;
  return Object.assign({}, p, { series: p.series.map(s => {
    let x = Array.from(s.x), y = Array.from(s.y);
    if (!s.dots && y.length > 1600 && !p.xLog) [x, y] = decimXY(x, y, 1600);
    return Object.assign({}, s, { x: b64(x), y: b64(y), n: y.length });
  }) });
}
function serResult(r) {
  return { id: r.id, status: r.status, measured: r.measured, kv: r.kv, notes: r.notes, fill: r.fill, elapsed: r.elapsed, validity: r.validity, num: r.num, recT: r.recT, plots: (r.plots || []).map(serPlot) };
}
// platform: 'sub' (varsayılan, üst düzey alanlar) ya da 'ship' (pre.ship altında): node precompute.js <iş> ship
const plat = process.argv.includes('ship') ? 'ship' : 'sub';
const P = L.defaultParams(plat);
const tgt = plat === 'ship' ? (pre.ship = pre.ship || {}) : pre;
const t00 = Date.now();
if (what === 'all' || what === 'tests') {
  const only = process.argv[3] && process.argv[3] !== 'ship' ? process.argv[3].split(',') : null;
  const ctx = only ? Object.assign({}, tgt.ctx || {}) : {}; const res = only ? (tgt.tests || {}) : {};
  for (const id of (only || L.TEST_ORDER)) {
    const t0 = Date.now();
    const r = L.runTest(id, P, ctx, null);
    res[id] = serResult(r);
    console.log(id, r.status, ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  }
  tgt.tests = res;
  const arr = (v) => v == null ? v : (Array.isArray(v) ? v : Array.from(v.length != null ? v : Object.values(v)));
  tgt.ctx = { IFOVcal: ctx.IFOVcal, T01: ctx.T01 || null, floor: ctx.floor || null, res: ctx.res || [], bore: ctx.bore || null, psdTable: ctx.psdTable ? { f: arr(ctx.psdTable.f), P: arr(ctx.psdTable.P) } : null };
}
if (what === 'all' || what === 'op') {
  const t0 = Date.now();
  const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
  const a = D.all, M = a.M, v = M.video;
  const rows = {};
  for (const [id, r] of Object.entries(D.rows)) { const o = {}; for (const [k, val] of Object.entries(r)) if (typeof val === 'number') o[k] = val; o.id = id; rows[id] = o; }
  tgt.op = { T: D.T, seed: D.seed, rho: D.rho, rows,
    all: { rmsEl: M.rms.el, rmsXel: M.rms.xel, bandEl: M.band.el, bandXel: M.band.xel, wanderEl: v.wander.el, wanderXel: v.wander.xel, smearEl: v.smear.el, smearXel: v.smear.xel,
      p99El: v.p99.el, p99Xel: v.p99.xel, mtfEl: v.mtf.el, mtfXel: v.mtf.xel, pdeEl: v.pde.el.rms, pdeXel: v.pde.xel.rms, pw: { total: a.pw.total, wander: a.pw.wander, smear: a.pw.smear, bands: a.pw.bands },
      pwx: { total: a.pwx.total, wander: a.pwx.wander, smear: a.pwx.smear, bands: a.pwx.bands }, eis: a.eis, eisLock: a.eisLock, rotRes: M.rotRes,
      psdEl: { f: b64(a.psdPlot.el.x || a.psdPlot.el.f), P: b64(a.psdPlot.el.y || a.psdPlot.el.P) }, psdXel: { f: b64(a.psdPlot.xel.x || a.psdPlot.xel.f), P: b64(a.psdPlot.xel.y || a.psdPlot.xel.P) },
      ts: { t: b64(a.tsPlot.x), y: b64(a.tsPlot.y) } }, req: D.req || null };
  console.log('op decomposition', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
if (what === 'all' || what === 'play') {
  const t0 = Date.now();
  const enc = (p) => {
    const o = {}; for (const [k, v] of Object.entries(p)) {
      if (v instanceof Float32Array) o[k] = b64(v);
      else if (k === 'video') o.video = { n: v.n, fps: v.fps, t: b64(v.t), x: b64(v.x), y: b64(v.y), ok: b64u8(v.ok) };
      else if (k === 'videoEis') o.videoEis = Object.assign({}, v, { x: b64(v.x), y: b64(v.y) });
      else if (k === 'psd') o.psd = { f: b64(v.f), el: b64(v.el), xel: b64(v.xel) };
      else if (k === 'pupil') o.pupil = Object.assign({}, v, { h: b64(v.h), v: b64(v.v), ov: b64(v.ov) });
      else o[k] = v;
    } return o; };
  tgt.play = { on: enc(L.playScenario(P, { kind: 'sea', T: 60, stab: true })), off: enc(L.playScenario(P, { kind: 'sea', T: 60, stab: false })) };
  console.log('play', ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
if ((what === 'all' || what === 'vv') && plat === 'sub') {
  const rd = (f) => fs.existsSync(path.join(__dirname, f)) ? JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')) : null;
  pre.vv = rd('vv.json'); pre.seeds = rd('seeds.json'); pre.extra = rd('extra.json'); pre.sens = rd('sens.json'); pre.t07 = rd('t07.json');
  console.log('vv', pre.vv ? pre.vv.items.length + ' madde' : 'yok', '· seeds', pre.seeds ? 'var' : 'yok');
}
pre.generated = new Date().toISOString();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(pre));
console.log('wrote', outFile, (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB', 'total', ((Date.now() - t00) / 1000).toFixed(0) + ' s');
