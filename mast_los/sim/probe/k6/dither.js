// §5: masa mikro-titreşimi ↔ sürtünme etkileşimi (dither) — deniz profili altında gerçek LOS'un düşük (< 1 Hz) ve yüksek
// (> 2 Hz) frekans bileşenleri, mikro-titreşim açık / kapalı (aynı tohum); sürtünme kapalıyken aynı karşılaştırma
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const mvA = +(process.argv[2] || 2);
const P = L.defaultParams('sub'); P.wb.hex.microvib = mvA;
const run = (mv, fric) => { const S = L.seaLabScenario(P, { T: 320, seed: 1301 }); S.meas = Object.assign({}, S.meas, { microvib: mv });
  if (!fric) S.mech = Object.assign({}, S.mech || {}, { friction: false });
  S.rec = { fs: 1000, ch: ['opt_el', 'opt_xel'] }; return L.runSim(P, S); };
const band = (x, f1, f2) => { const sp = L.welch(L.detrend(Float64Array.from(x.subarray(20000)), 'linear'), 1000, 65536); return L.bandRms(sp.f, sp.P, f1, f2); };
for (const fric of [true, false]) {
  const a = run(true, fric), b = run(false, fric);
  for (const c of ['opt_el', 'opt_xel']) {
    const lo1 = band(a.rec[c], 0.02, 1), lo0 = band(b.rec[c], 0.02, 1), hi1 = band(a.rec[c], 2, 400), hi0 = band(b.rec[c], 2, 400);
    console.log(`sürtünme ${fric ? 'AÇIK' : 'KAPALI'}, ${c}, mikro-titreşim ${mvA} µrad: 0,02–1 Hz ${(lo0 * 1e6).toFixed(3)} → ${(lo1 * 1e6).toFixed(3)}; 2–400 Hz ${(hi0 * 1e6).toFixed(3)} → ${(hi1 * 1e6).toFixed(3)} µrad (kapalı → açık)`);
  }
}
