const L = require('../engine.js');
const P = L.defaultParams();
const fs = 2000, T = 140, n = T * fs, A = 2e-6, f0 = 50;
for (const ph of [0, 30, 45, 60, 90, 120, 150]) {
  const el = new Float64Array(n), xel = new Float64Array(n);
  for (let i = 0; i < n; i++) { el[i] = A * Math.sin(2 * Math.PI * f0 * i / fs + ph * Math.PI / 180); xel[i] = 1e-9 * Math.sin(i * 0.37); }
  const m = L.losReqMetrics(P, el, xel, fs, { skip: 20 });
  console.log('ph', ph, 'td', (m.exp.tdEl * 1e6).toFixed(4), 'psd', (m.exp.el * 1e6).toFixed(4), 'analytic avg', (A / Math.SQRT2 * Math.sqrt(1 - (2 / Math.PI) ** 2) * 1e6).toFixed(4));
}
// 49.3 Hz (not locked)
{ const el = new Float64Array(n), xel = new Float64Array(n);
  for (let i = 0; i < n; i++) { el[i] = A * Math.sin(2 * Math.PI * 49.3 * i / fs); xel[i] = 1e-9 * Math.sin(i * 0.37); }
  const m = L.losReqMetrics(P, el, xel, fs, { skip: 20 }); const x = Math.PI * 49.3 * 0.01, sc = Math.sin(x) / x;
  console.log('49.3 Hz td', (m.exp.tdEl * 1e6).toFixed(4), 'psd', (m.exp.el * 1e6).toFixed(4), 'analytic', (A / Math.SQRT2 * Math.sqrt(1 - sc * sc) * 1e6).toFixed(4)); }
