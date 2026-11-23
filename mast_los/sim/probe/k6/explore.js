// §5 keşif: hexapod erişimi, T1.3 deniz profili talebi, öteleme (strok), kolimatör geometrisi için ham sayılar
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const D2R = Math.PI / 180, TAU = 2 * Math.PI;
for (const kind of ['sub', 'ship']) {
  const P = L.defaultParams(kind), d = L.derive(P), hx = P.wb.hex;
  console.log(`== ${kind}: θ_max ${hx.theta_max}°, ω_max ${hx.omega_max}°/s, α_max ${hx.alpha_max}°/s², f_bw ${hx.fbw} Hz, güvenilir ${hx.rel_ratio * hx.fbw} Hz, strok ±${P.lab.hexStroke * 1e3} mm`);
  console.log(`   köşeler: θ→ω ${(hx.omega_max / (TAU * hx.theta_max)).toFixed(4)} Hz, ω→α ${(hx.alpha_max / (TAU * hx.omega_max)).toFixed(4)} Hz; FOV ${d.FOVh.toFixed(4)}×${d.FOVv.toFixed(4)}°, stab-OFF ${d.stabOffMax.toFixed(4)}°`);
  for (const f of [0.083, 0.1, 0.125, 0.5, 1, 2, 3, 4.1, 5.48, 10, 20]) console.log(`   reach(${f}) = ${d.reach(f).toFixed(4)}° (${d.reachLim(f)})`);
  // T1.3 senaryosu: deniz profili (tohum 1301) — hexapod sınır oranı ve öteleme
  const S = L.seaLabScenario(P, { T: 620, seed: 1301 }), lim = L.hexLimitCheck(P, S), tp = L.transPeak(P, S);
  console.log(`   T1.3 profili: oran ${lim.axes.map(a => a.ratio.toFixed(3)).join('/')} (tepe θ ${lim.axes.map(a => a.peakDeg.toFixed(2)).join('/')}°, ω ${lim.axes.map(a => a.peakRate.toFixed(2)).join('/')}°/s, α ${lim.axes.map(a => a.peakAcc.toFixed(2)).join('/')}°/s²), kırpma ${lim.clipFrac}`);
  console.log(`   öteleme: q = ${S.seaQ != null ? S.seaQ.toFixed(4) : '—'}, talep ±${S.seaDemand != null ? (S.seaDemand).toFixed(3) : '—'} m, tepe ${(tp * 1e3).toFixed(1)} mm`);
  // eksen başına öteleme tepesi
  if (S.trans && S.trans.length) {
    const fs = 200, n = Math.round(S.T * fs), ch = L.makeChannel(S.trans, fs, L.makeRngFactory(S.seed)), v = [0, 0, 0], pk = [0, 0, 0];
    for (let k = 0; k < n; k++) { v[0] = v[1] = v[2] = 0; ch.eval(k / fs, v); for (let i = 0; i < 3; i++) pk[i] = Math.max(pk[i], Math.abs(v[i])); }
    console.log(`   öteleme tepe x/y/z ${pk.map(x => (x * 1e3).toFixed(1)).join(' / ')} mm`);
  }
  console.log(`   LOS (gövde): a0 ${P.dut.geom.a0}°, e0 ${P.dut.geom.e0 == null ? P.wb.earth.el : P.dut.geom.e0}°; L_pg ${P.dut.L_pg} m; L_off ${hx.L_off} m; θ_test ${hx.theta_test}°`);
  console.log(`   kolimatör: ${JSON.stringify(P.wb.coll)}; kanal ${d.ch.name} f ${d.ch.f_mm} mm, D_p ${d.ch.Dp_mm} mm, IFOV ${(d.IFOV * 1e6).toFixed(2)} µrad`);
}
