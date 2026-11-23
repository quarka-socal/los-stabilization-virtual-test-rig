// Teknik kılavuz §6 — piksel fazı (S-eğrisi) yanlılığının test sonuçlarına etkisi: hedef noktasının sub-piksel konumu (x0, y0)
// ve piksel fazı genliği değiştirilerek T1.3 (wander) ve T1.9 (proje LOS metrikleri) koşulur; gerçek LOS wander'ı (simülasyon)
// ve küçük hareket kazancı 1 + 2π·a·cos(2πφ) (a = √2·pixlock) ile karşılaştırılır. Çıktı: pixphase.json, konsol özeti.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const mk = (fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return P; };
const cases = [
  ['varsayılan (x0 0,37, y0 −0,21)', mk()],
  ['piksel fazı 0', mk(P => { P.wb.chain.pixlock_px = 0; })],
  ['x0 = y0 = 0 (kazanç en büyük)', mk(P => { P.dut.video.x0 = 0; P.dut.video.y0 = 0; })],
  ['x0 = y0 = 0,5 (kazanç en küçük)', mk(P => { P.dut.video.x0 = 0.5; P.dut.video.y0 = 0.5; })],
  ['x0 = y0 = 0,25 (eğim hatası yok)', mk(P => { P.dut.video.x0 = 0.25; P.dut.video.y0 = 0.25; })],
];
const out = [];
for (const [nm, P] of cases) {
  const t0 = Date.now(), ctx = {};
  L.runTest('T0.1', P, ctx, null);
  const r13 = L.runTest('T1.3', P, ctx, null), r19 = L.runTest('T1.9', P, ctx, null);
  const kv = (r, re) => { const q = (r.kv || []).find(([k]) => re.test(k)); return q ? String(q[1]) : ''; };
  const a = Math.SQRT2 * P.wb.chain.pixlock_px, g = (ph) => 1 + 2 * Math.PI * a * Math.cos(2 * Math.PI * ph);
  const o = { nm, t13: r13.measured, seeds: kv(r13, /Tohum başına/), real: kv(r13, /Gerçek LOS/), w: r13.num && r13.num.wander,
    t19: r19.measured, t19kv: (r19.kv || []).filter(([k]) => /video ile ölçülen|Takip sonrası: σ|gerçek optik/i.test(k)).map(([k, v]) => k + ': ' + v),
    gX: g(P.dut.video.x0), gE: g(P.dut.video.y0), s: (Date.now() - t0) / 1000 };
  out.push(o);
  console.log(`${nm} [${f(o.s, 0)} s] | küçük hareket kazancı el ${f(o.gE, 3)} / xel ${f(o.gX, 3)}`);
  console.log(`   T1.3 ${r13.status}: ${r13.measured.slice(0, 120)}`);
  console.log(`   tohumlar: ${o.seeds} · gerçek LOS: ${o.real}`);
  console.log(`   T1.9 ${r19.status}: ${r19.measured.slice(0, 200)}`);
  for (const s of o.t19kv) console.log('      · ' + s.slice(0, 220));
}
require('fs').writeFileSync(path.join(__dirname, 'pixphase.json'), JSON.stringify(out, null, 1));
