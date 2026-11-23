// §6 — test yanıtları: ölçüm zinciri parametreleri değiştirilerek T0.1 (IFOV, S-eğrisi), T0.2 (taban, beklenen zincir tabanı, DUT payı,
// otokolimatör tabanı), T0.4 (gecikme), T3.3 (TUR, ölçüme dayalı denetim) koşulur; piksel fazı 0,05 px'te T1.9 da.
// Çıktı: tests.json, konsol özeti (doc §6 test değişim tablosu).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const mk = (fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return P; };
const cases = [
  ['varsayılan', mk()],
  ['centroid 0,06 px', mk(P => { P.wb.chain.centroid_px = 0.06; })],
  ['hava 3 µrad', mk(P => { P.wb.chain.air = 3; })],
  ['piksel fazı 0,05 px', mk(P => { P.wb.chain.pixlock_px = 0.05; }), true],
  ['piksel fazı 0', mk(P => { P.wb.chain.pixlock_px = 0; })],
  ['hedef noktası x0 = y0 = 0', mk(P => { P.dut.video.x0 = 0; P.dut.video.y0 = 0; })],
  ['otokolimatör gürültüsü 2 µrad', mk(P => { P.wb.chain.ac_noise = 2; })],
  ['IMU bandı 100 Hz', mk(P => { P.wb.chain.imu_bw = 100; })],
  ['senkron Δt 2 ms', mk(P => { P.wb.chain.dt_sync_ms = 2; })],
  ['hedef TUR 10', mk(P => { P.wb.TUR_target = 10; })],
  ['Z540.3 (k = 2)', mk(P => { P.wb.TUR_def = 'Z540.3'; P.wb.k_exp = 2; })],
];
const out = [];
for (const [nm, P, with19] of cases) {
  const t0 = Date.now(), ctx = {};
  const r1 = L.runTest('T0.1', P, ctx, null), r2 = L.runTest('T0.2', P, ctx, null), r4 = L.runTest('T0.4', P, ctx, null), r3 = L.runTest('T3.3', P, ctx, null);
  const p = r1.num.pix, n2 = r2.num, n4 = r4.num, n3 = r3.num;
  const o = { nm, T01: { st: r1.status, IFOV: r1.num.IFOVeff * 1e6, relU: r1.num.relU, amp: p.amp, uAmp: p.uAmp, aExp: p.aExp, gX: p.gX, gY: p.gY, uG: p.uG, grid: (r1.kv.find(k => /Uydurma/.test(k[0])) || [])[1] },
    T02: { st: r2.status, offEl: n2.offEl * 1e6, offXel: n2.offXel * 1e6, expEl: n2.expEl, expXel: n2.expXel, dutEl: n2.dutEl, dutXel: n2.dutXel, acEl: n2.acOffEl * 1e6, acXel: n2.acOffXel * 1e6 },
    T04: { st: r4.status, m: n4.m * 1e3, se: n4.se * 1e3, model: n4.model * 1e3, measured: r4.measured },
    T33: { st: r3.status, turS: n3.turS, uh: n3.uh, uhMeas: n3.uhMeas } };
  if (with19) { const r9 = L.runTest('T1.9', P, ctx, null); o.T19 = { st: r9.status, measured: r9.measured, kv: (r9.kv || []).filter(([k]) => /video ile ölçülen|Takip sonrası: σ|Piksel fazı/.test(k)).map(([k, v]) => k + ': ' + v) }; }
  o.s = (Date.now() - t0) / 1000; out.push(o);
  console.log(`${nm} [${f(o.s, 0)} s]`);
  console.log(`  T0.1 ${o.T01.st}: IFOV ${f(o.T01.IFOV, 4)} (u %${f(o.T01.relU * 100, 4)}); S-eğrisi ${f(p.amp, 4)} ± ${f(p.uAmp, 4)} px (beklenen ${f(p.aExp, 4)}); kazanç ${f(p.gX, 3)}/${f(p.gY, 3)} ± ${f(p.uG, 3)}; ızgara artığı ${o.T01.grid}`);
  console.log(`  T0.2 ${o.T02.st}: stab OFF ${f(o.T02.offEl)}/${f(o.T02.offXel)}; beklenen zincir ${f(o.T02.expEl)}/${f(o.T02.expXel)}; DUT payı ${f(o.T02.dutEl)}/${f(o.T02.dutXel)}; otokolimatör ${f(o.T02.acEl)}/${f(o.T02.acXel)} µrad`);
  console.log(`  T0.4 ${o.T04.st}: ${f(o.T04.m, 4)} ± ${f(o.T04.se, 4)} ms (model ${f(o.T04.model, 4)}) · ${String(o.T04.measured).slice(0, 160)}`);
  console.log(`  T3.3 ${o.T33.st}: TUR ${f(o.T33.turS)} (u_h ${f(o.T33.uh)}; ölçüme dayalı ${f(o.T33.uhMeas)})`);
  if (o.T19) { console.log(`  T1.9 ${o.T19.st}: ${o.T19.measured.slice(0, 200)}`); for (const s of o.T19.kv) console.log('     · ' + s.slice(0, 260)); }
}
require('fs').writeFileSync(path.join(__dirname, 'tests.json'), JSON.stringify(out, null, 1));
