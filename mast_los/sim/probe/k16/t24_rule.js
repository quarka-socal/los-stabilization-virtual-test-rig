// v13.14 §13 K1: T2.4 ve düzenek darbesinin genlik kuralı — 'ic' (şimdiki) ↔ 'gercek' (hız sıçramasının hexapod dinamiğinden sonraki
// ivmesi de sınırlanır). T2.4 sonuçları (tepe, oturma, B2-02 kestirimi), düzenek darbe oynatmasının gerçekleşen tepeleri.
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const PRE = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../app/pre.json'), 'utf8'));
const out = {};
for (const rule of ['ic', 'gercek']) {
  const P = L.defaultParams('sub'); if (rule === 'gercek') P.wb.hex.pulseRule = 'gercek';
  const t0 = Date.now(), r = L.runTest('T2.4', P, {}, null), pl = L.playScenario(P, { kind: 'slap', T: 60, stab: true }, null);
  out[rule] = { amps: [0.05, 0.1, 0.2].map(Tp => L.pulseAmpDeg(P, Tp)), status: r.status, measured: r.measured, kv: r.kv.slice(0, 9), fill: r.fill, play: pl.metrics.base[0], s: (Date.now() - t0) / 1000 };
  console.log(`== ${rule}: genlik (ölçeksiz) ${out[rule].amps.map(a => a.toFixed(4)).join(' / ')}°; ${r.status}; ${r.measured}`);
  for (const k of r.kv.slice(0, 9)) console.log('   ', k[0], '|', k[1]);
  console.log(`   düzenek darbe (×0,9): θ ${pl.metrics.base[0].th.toFixed(3)}°, ω ${pl.metrics.base[0].om.toFixed(2)} °/s, α ${pl.metrics.base[0].al.toFixed(1)} °/s²; B2-02 dolgu ${(r.fill['B2-02'] * 1e6).toFixed(3)} µrad; ${out[rule].s.toFixed(1)} s`);
}
out.preSame = JSON.stringify(out.ic.kv) === JSON.stringify(PRE.tests['T2.4'].kv.slice(0, 9)) && out.ic.measured === PRE.tests['T2.4'].measured;
console.log('varsayılan kural ön hesapla aynı:', out.preSame);
fs.writeFileSync(path.join(__dirname, 't24_rule.json'), JSON.stringify(out, null, 1));
