// FOG ekleri: (a) nötr değerlerde önceki motorla bit düzeyinde aynılık; (b) gecikme: analitik ↔ benzetim DRR
const L = require('../engine.js'), Lv10 = require('../../bak_v10/engine_v10.js');
const D2R = Math.PI / 180;
// (a) aynı senaryo, iki motor
for (const k of ['sub', 'ship']) {
  const P = L.compatV10(L.defaultParams(k)), Pold = Lv10.defaultParams(k);
  const mk = (LL, PP) => LL.labScenario(PP, { label: 'x', T: 30, fs: 2000, seed: 5, cmd: [{ type: 'sine', axis: 0, A: 2 * D2R, f: 0.2, t0: 0, ramp: 2 }] });
  const R1 = L.runSim(P, mk(L, P), null), R0 = Lv10.runSim(Pold, mk(Lv10, Pold), null);
  let dmax = 0; for (const c of ['opt_el', 'opt_xel', 'ac_el']) { const a = R1.rec[c], b = R0.rec[c]; for (let i = 0; i < a.length; i++) dmax = Math.max(dmax, Math.abs(a[i] - b[i])); }
  console.log(k, 'v10 ↔ v11 (uyum ayarları) en büyük fark', dmax, '| video kare farkı', Math.max(...Array.from(R1.video.x.subarray(0, R1.video.n), (v, i) => Math.abs(v - R0.video.x[i]))));
}
// (b) gecikme 1 ms: analitik model
const P = L.defaultParams('sub'); const d0 = L.derive(P); P.dut.gyro.lat_ms = 1; const d1 = L.derive(P);
console.log('El PM', d0.loopEl.pm.toFixed(1), '→', d1.loopEl.pm.toFixed(1), '°; GM', d0.loopEl.gm.toFixed(1), '→', d1.loopEl.gm.toFixed(1), 'dB @', (d1.loopEl.gmF || 0).toFixed(0), 'Hz; Az PM', d0.loopAz.pm.toFixed(1), '→', d1.loopAz.pm.toFixed(1));
for (const f of [1, 10, 40, 80]) console.log('  DRR', f, 'Hz:', (20 * Math.log10(L.cabs(d0.loopEl.drr(2 * Math.PI * f)))).toFixed(2), '→', (20 * Math.log10(L.cabs(d1.loopEl.drr(2 * Math.PI * f)))).toFixed(2), 'dB');
