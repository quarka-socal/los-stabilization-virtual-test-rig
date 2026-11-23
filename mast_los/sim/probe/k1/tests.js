// Teknik kılavuz §2 — test ve düzenek (oynatma) düzeyi: kanal / format / IFOV / kare hızı / entegrasyon süresi değişince
const L = require('../../engine.js');
const which = process.argv[2] || 'play';
const ch0 = (P) => P.wb.channels.find(c => c.name === P.wb.refChannel);
const cases = [
  ['varsayılan', () => {}], ['ref MWIR-WFOV', (P) => { P.wb.refChannel = 'MWIR-WFOV'; }], ['ref HDTV-NFOV', (P) => { P.wb.refChannel = 'HDTV-NFOV'; }],
  ['ref SWIR-NFOV', (P) => { P.wb.refChannel = 'SWIR-NFOV'; }], ['format 640×512', (P) => { Object.assign(ch0(P), { Nh: 640, Nv: 512 }); }],
  ['f 600 mm', (P) => { ch0(P).f_mm = 600; }], ['fps 100', (P) => { ch0(P).fps = 100; }], ['fps 25', (P) => { ch0(P).fps = 25; }], ['Tint 10 ms', (P) => { ch0(P).Tint_ms = 10; }],
];
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : (+x).toFixed(d);
if (which === 'play') {
  for (const [name, fn] of cases) for (const stab of [true, false]) {
    const P = L.defaultParams(); fn(P); const d = L.derive(P);
    const p = L.playScenario(P, { kind: 'sea', T: 30, stab, scale: 1 }, null), V = p.video, IFt = p.geom.IFOVt || p.geom.IFOV;
    let n = 0, okc = 0, ex = 0, ey = 0;
    for (let k = 0; k < V.n; k++) { if (!V.ok[k]) continue; okc++; const i = Math.min(p.n - 1, Math.round(V.t[k] * p.fs)); ex = Math.max(ex, Math.abs(V.x[k] * IFt - p.opt_xel[i])); ey = Math.max(ey, Math.abs(V.y[k] * IFt - p.opt_el[i])); n++; }
    const xs = [], ys = []; for (let k = 0; k < V.n; k++) if (V.ok[k]) { xs.push(V.x[k]); ys.push(V.y[k]); }
    const span = xs.length ? `${f(Math.max(...xs) - Math.min(...xs))}×${f(Math.max(...ys) - Math.min(...ys))} px` : '—';
    console.log(`${name} stab ${stab ? 'AÇIK' : 'KAPALI'} | geom IFOV ${f(p.geom.IFOV * 1e6)} (derive ${f(d.IFOV * 1e6)}) · N ${p.geom.Nh}×${p.geom.Nv} · fps ${V.fps} (kanal ${d.fps}) · kare ${V.n} (beklenen ≈ ${Math.floor(30 * d.fps)}) · geçerli %${f(100 * okc / V.n, 1)} · iz ${span} · |video·IFOV − LOS| en büyük el ${f(ey * 1e6)} xel ${f(ex * 1e6)} µrad · MTF ${f(p.metrics.mtfEl, 3)} · wander ${f(p.metrics.wanderEl * 1e6)} µrad`);
  }
} else {
  const ids = which.split(',');
  for (const [name, fn] of cases.filter(c => (process.argv[3] || '').split('|').includes(c[0]))) {
    const P = L.defaultParams(); fn(P); const d = L.derive(P), ctx = {};
    for (const id of ids) { const t0 = Date.now(); const r = L.runTest(id, P, ctx, null);
      console.log(`${name} · ${id} ${r.status} (${f((Date.now() - t0) / 1000, 1)} s): ${r.measured.slice(0, 400)}`);
      const kv = (r.kv || []).filter(([k]) => /IFOV|gereksinim|Gereksinim|kabul|Kabul|WFOV|genlik|sınır|Sınır|köşe/.test(k)).slice(0, 5);
      for (const [k, v] of kv) console.log(`    ${k}: ${String(v).slice(0, 260)}`);
      if (r.fill && Object.keys(r.fill).length) console.log('    bütçeye:', Object.entries(r.fill).map(([k, v]) => `${k} ${k === 'MTF' ? f(v, 3) : f(v * 1e6)}`).join(', '));
    }
  }
}
