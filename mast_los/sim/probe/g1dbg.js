const L = require('../engine.js');
const P = L.defaultParams(), fs = 2000, T = 620, n = T * fs, A = 3e-6, f0 = 7.3, TAU = 2 * Math.PI;
const e2 = new Float64Array(n), x2 = new Float64Array(n);
for (let i = 0; i < n; i++) { e2[i] = A * Math.sin(TAU * f0 * i / fs + 0.4); x2[i] = 1e-9 * Math.sin(0.37 * i); }
const m = L.losReqMetrics(P, e2, x2, fs, { skip: 20 });
console.log('ppEl', m.ppEl * 1e6, 'win pp', m.win.map(w => (w.ppEl * 1e6).toFixed(3)).join(' '));
const y = L.filtfiltHP(e2, fs, 0.1);
let mx = 0, imx = 0; for (let i = 0; i < n; i++) { const d = Math.abs(y[i] - e2[i]); if (d > mx) { mx = d; imx = i; } }
console.log('max |HP(x) - x|', mx * 1e6, 'at t', imx / fs);
for (const tt of [0, 1, 5, 10, 20, 30, 300, 600, 610, 615, 619, 619.9]) { const i = Math.min(n - 1, Math.round(tt * fs)); console.log(tt, ((y[i] - e2[i]) * 1e6).toFixed(5)); }
