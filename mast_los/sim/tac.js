const L = require('./engine.js');
for (const comp of [true, false]) {
  const P = L.defaultParams(); P.wb.earth.comp = comp;
  const S = L.shakerScenario(P, { axis: 1, mode: 'off' });
  const R = L.runSim(P, S, null);
  for (const c of ['ac_el', 'opt_el', 'mech_el']) {
    const x = Float64Array.from(R.rec[c].subarray(3000));
    const d = L.detrend(x, 'linear');
    // quadratic detrend
    const n = x.length; let best = null;
    const t = Array.from({ length: n }, (_, i) => i / n - 0.5);
    // fit a + b t + c t^2
    let S0 = n, S1 = 0, S2 = 0, S3 = 0, S4 = 0, Y0 = 0, Y1 = 0, Y2 = 0;
    for (let i = 0; i < n; i++) { const u = t[i]; S1 += u; S2 += u * u; S3 += u * u * u; S4 += u * u * u * u; Y0 += x[i]; Y1 += x[i] * u; Y2 += x[i] * u * u; }
    const A = [[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]], B = [Y0, Y1, Y2];
    const sol = L.solveLin ? null : null;
    console.log('comp', comp, c, 'lin-detrended RMS', (L.aRms(d) * 1e6).toFixed(2), 'range', ((Math.max(...x) - Math.min(...x)) * 1e6).toFixed(1), 'first/last', (x[0] * 1e6).toFixed(1), (x[n - 1] * 1e6).toFixed(1), 'mid', (x[n >> 1] * 1e6).toFixed(1));
  }
}
