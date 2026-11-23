// Tohum tekrarlarını birleştirir: temel koşu (app/pre.json, k = 0) + seeds_<k>.json → seeds.json
'use strict';
const fs = require('fs');
const path = require('path');
const pre = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'pre.json'), 'utf8'));
const runs = [{ offset: 0, tests: Object.fromEntries(Object.entries(pre.tests).map(([id, r]) => [id, { status: r.status, fill: r.fill || {}, num: r.num || null }])),
  op: { rows: pre.op.rows, rho: pre.op.rho, all: pre.op.all } }];
for (const f of fs.readdirSync(__dirname).filter(f => /^seeds_\d+\.json$/.test(f)).sort()) runs.push(JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
const stat = (v) => {
  const a = v.filter(x => x != null && isFinite(x)); const n = a.length; if (!n) return null;
  const m = a.reduce((s, x) => s + x, 0) / n, sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1)) : 0;
  return { n, mean: m, sd, cv: m !== 0 ? sd / Math.abs(m) : null, min: Math.min(...a), max: Math.max(...a), v: a };
};
// v13.17 (§14 K1 c): uyarlamalı tekrar — temel 5 tohumda sınıra %2'den yakın karar satırı olan testler seeds_adapt.js ile
// N_hedef tohuma tamamlanır (seeds_adapt_<k>.json); seçim yalnız temel tohumlardan yapılır (döngüsel değil)
const N_TARGET = 20, NEAR = 0.02;
const nearIds = Object.keys(runs[0].tests).filter(id => runs.some(r => { const n = r.tests[id] && r.tests[id].num;
  return n && n.checks && n.checks.some(c => c.lim && Math.abs(c.v / c.lim - 1) <= NEAR); }));
const adaptRuns = fs.readdirSync(__dirname).filter(f => /^seeds_adapt_\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))).sort((a, b) => a.offset - b.offset);
const ids = Object.keys(runs[0].tests);
const tests = {};
for (const id of ids) {
  const runsT = nearIds.includes(id) ? runs.concat(adaptRuns.filter(r => r.tests[id])) : runs;
  const st = {}; for (const r of runsT) { const s = r.tests[id] && r.tests[id].status; st[s] = (st[s] || 0) + 1; }
  const keys = new Set(); for (const r of runsT) for (const k of Object.keys((r.tests[id] && r.tests[id].fill) || {})) keys.add(k);
  const fill = {}; for (const k of keys) fill[k] = stat(runsT.map(r => r.tests[id] && r.tests[id].fill ? r.tests[id].fill[k] : null));
  tests[id] = { status: st, fill, n: runsT.length };
  if (id === 'T1.9') {      // v12: proje LOS kalıntısı — karar tabanının özet sayıları (tohumlar arası)
    const pick = (r) => { const n = r.tests[id] && r.tests[id].num; if (!n || !n.once) return null; const o = {};
      for (const k of ['once', 'sonra']) { const q = n[k]; o[k] = { sEl: q.sEl.u95, sXel: q.sXel.u95, sVec: q.sVec.u95, sVecP: q.sVec.pooled, ppEl: q.ppEl, ppXel: q.ppXel, p9973: q.p9973.rad, expEl: q.exp.el, expXel: q.exp.xel, b1El: q.el.bands[1] }; }
      o.nBad = (n.checks || []).filter(c => !c.ok).length; o.basis = n.basis || null;
      o.rows = (n.checks || []).map(c => ({ key: c.key, name: c.name, ok: !!c.ok, r: c.lim ? c.v / c.lim : null })); return o; };
    const pk = runsT.map(pick), req = {};
    for (const k of ['once', 'sonra']) { req[k] = {}; for (const f of ['sEl', 'sXel', 'sVec', 'sVecP', 'ppEl', 'ppXel', 'p9973', 'expEl', 'expXel', 'b1El']) req[k][f] = stat(pk.map(o => o && o[k][f])); }
    req.nBad = stat(pk.map(o => o && o.nBad));
    // v13.16: satır düzeyi — her karar satırının tohumlar arası AŞIM sayısı ve değer / sınır oranı (karar tabanında)
    const keys0 = pk[0] ? pk[0].rows.map(c => c.key) : [];
    req.basis = pk[0] ? pk[0].basis : null; req.nRows = keys0.length;
    req.rows = keys0.map(key => { const a = pk.map(o => o && o.rows.find(c => c.key === key)).filter(Boolean);
      return { key, name: a[0].name, n: a.length, nBad: a.filter(c => !c.ok).length, r: stat(a.map(c => c.r)) }; });
    tests[id].req = req;
  }
}
const op = {};
for (const id of Object.keys(runs[0].op.rows)) op[id] = { el: stat(runs.map(r => r.op.rows[id] && r.op.rows[id].el)), cmp: stat(runs.map(r => r.op.rows[id] && r.op.rows[id].cmp)), xel: stat(runs.map(r => r.op.rows[id] && r.op.rows[id].xel)) };
const all = {}; for (const k of ['rmsEl', 'rmsXel', 'wanderEl', 'wanderXel', 'smearEl', 'smearXel', 'p99El', 'eis']) all[k] = stat(runs.map(r => r.op.all ? r.op.all[k] : null));
const out = { generated: new Date().toISOString(), n: runs.length, offsets: runs.map(r => r.offset), tests, op, all, rho: stat(runs.map(r => r.op.rho)),
  adaptive: { nTarget: N_TARGET, near: NEAR, ids: nearIds, nDone: Object.fromEntries(nearIds.map(id => [id, tests[id].n])), offsets: adaptRuns.map(r => r.offset) } };
fs.writeFileSync(path.join(__dirname, 'seeds.json'), JSON.stringify(out));
console.log('tohum sayısı', runs.length, '· uyarlamalı:', JSON.stringify(out.adaptive.nDone));
for (const id of ids) { const t = tests[id]; const fl = Object.entries(t.fill).map(([k, s]) => `${k} ${(s.mean * (k === 'MTF' ? 1 : 1e6)).toFixed(3)}±${(s.sd * (k === 'MTF' ? 1 : 1e6)).toFixed(3)}`).join(', '); console.log(id, JSON.stringify(t.status), fl); }
for (const [id, o] of Object.entries(op)) if (o.el) console.log('op', id, (o.el.mean * 1e6).toFixed(3), '±', (o.el.sd * 1e6).toFixed(3), 'cv', (o.el.cv * 100).toFixed(1) + '%');
