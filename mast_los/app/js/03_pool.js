// ---------------------------------------------------------------- arka plan hesap havuzu
const WORKER_GLUE = `
const L = LOSSIM_FACTORY();
let ctx = {}, lastT = 0;
const prog = (job, id) => (p) => { const n = Date.now(); if (n - lastT > 150 || p >= 1) { lastT = n; postMessage({ type: 'prog', job, id, p }); } };
const serRes = (r) => ({ id: r.id, status: r.status, measured: r.measured, kv: r.kv, notes: r.notes, fill: r.fill, elapsed: r.elapsed, num: r.num, validity: r.validity, recT: r.recT,
  plots: (r.plots || []).map(p => p.series ? Object.assign({}, p, { series: p.series.map(s => Object.assign({}, s, { x: Float32Array.from(s.x), y: Float32Array.from(s.y) })) }) : p) });
function serOp(D) {
  const a = D.all, M = a.M, v = M.video, rows = {};
  for (const [id, r] of Object.entries(D.rows)) { const o = { id }; for (const [k, val] of Object.entries(r)) if (typeof val === 'number') o[k] = val; rows[id] = o; }
  const ps = (q) => ({ f: Float32Array.from(q.f || q.x), P: Float32Array.from(q.P || q.y) });
  return { T: D.T, seed: D.seed, rho: D.rho, rows, all: { rmsEl: M.rms.el, rmsXel: M.rms.xel, bandEl: M.band.el, bandXel: M.band.xel, wanderEl: v.wander.el, wanderXel: v.wander.xel,
    smearEl: v.smear.el, smearXel: v.smear.xel, p99El: v.p99.el, p99Xel: v.p99.xel, mtfEl: v.mtf.el, mtfXel: v.mtf.xel, pdeEl: v.pde.el.rms, pdeXel: v.pde.xel.rms,
    pw: { total: a.pw.total, wander: a.pw.wander, smear: a.pw.smear, bands: a.pw.bands }, pwx: { total: a.pwx.total, wander: a.pwx.wander, smear: a.pwx.smear, bands: a.pwx.bands },
    eis: a.eis, eisLock: a.eisLock, rotRes: M.rotRes, psdEl: ps(a.psdPlot.el), psdXel: ps(a.psdPlot.xel), ts: { t: Float32Array.from(a.tsPlot.x), y: Float32Array.from(a.tsPlot.y) } }, req: D.req || null };
}
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'tests') {
      ctx = Object.assign({}, m.ctx || {});
      for (const id of m.ids) {
        const r = L.runTest(id, m.P, ctx, prog(m.job, id));
        postMessage({ type: 'test', job: m.job, id, res: serRes(r), ctxOut: { IFOVcal: ctx.IFOVcal, T01: ctx.T01, floor: ctx.floor, res: ctx.res, bore: ctx.bore, psdTable: ctx.psdTable ? { f: Array.from(ctx.psdTable.f), P: Array.from(ctx.psdTable.P) } : undefined } });
      }
      postMessage({ type: 'done', job: m.job });
    } else if (m.cmd === 'op') {
      const D = L.opDecomposition(m.P, { T: m.T || 600, seed: 11 }, prog(m.job, 'op'));
      postMessage({ type: 'done', job: m.job, op: serOp(D) });
    } else if (m.cmd === 'play') {
      const r = L.playScenario(m.P, m.opt, prog(m.job, 'play'));
      postMessage({ type: 'done', job: m.job, play: r });
    }
  } catch (err) { postMessage({ type: 'err', job: m.job, msg: String(err && err.stack || err) }); }
};`;
let WORKER_URL = null;
try { WORKER_URL = URL.createObjectURL(new Blob([LOSSIM_FACTORY.toString() + '\n' + WORKER_GLUE], { type: 'text/javascript' })); } catch (e) { WORKER_URL = null; }

class Pool {
  constructor(n) { this.n = n; this.idle = []; this.all = []; this.queue = []; this.seq = 0; this.broken = !WORKER_URL; }
  spawn() {
    const w = new Worker(WORKER_URL);
    w.onmessage = (e) => this.onMsg(w, e.data);
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); this.onFail(w, e.message || 'çalışan hatası'); };
    this.all.push(w); this.idle.push(w); return w;
  }
  run(msg, onEvent) {
    return new Promise((resolve, reject) => { msg.job = ++this.seq; this.queue.push({ msg, onEvent, resolve, reject }); this.pump(); });
  }
  pump() {
    if (this.broken) { while (this.queue.length) this.queue.shift().reject(new Error('Web Worker kullanılamıyor')); return; }
    try { while (this.all.length < this.n && this.queue.length > this.idle.length) this.spawn(); } catch (e) { this.broken = true; return this.pump(); }
    while (this.idle.length && this.queue.length) { const w = this.idle.shift(), j = this.queue.shift(); w.cur = j; w.postMessage(j.msg); }
  }
  onMsg(w, m) {
    const j = w.cur; if (!j || m.job !== j.msg.job) return;
    if (m.type === 'done' || m.type === 'err') {
      w.cur = null; this.idle.push(w);
      if (m.type === 'err') j.reject(new Error(m.msg)); else { j.onEvent && j.onEvent(m); j.resolve(m); }
      this.pump();
    } else if (j.onEvent) j.onEvent(m);
  }
  onFail(w, msg) {
    const j = w.cur; w.cur = null;
    this.all = this.all.filter(x => x !== w); this.idle = this.idle.filter(x => x !== w);
    try { w.terminate(); } catch (e) { /* yok */ }
    if (j) j.reject(new Error(msg));
    this.pump();
  }
  cancelAll() {
    for (const w of this.all) { try { w.terminate(); } catch (e) { /* yok */ } if (w.cur) w.cur.reject(new Error('iptal')); }
    for (const j of this.queue) j.reject(new Error('iptal'));
    this.all = []; this.idle = []; this.queue = [];
  }
}
const NW = clamp((navigator.hardwareConcurrency || 2) - 1, 1, 4);
const POOL = new Pool(NW);
const PLAYPOOL = new Pool(1);
