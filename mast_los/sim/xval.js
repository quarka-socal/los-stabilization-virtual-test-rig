const L = require('./engine.js');
const rng = new L.RNG(7), n = 20000, fs = 1000;
const x = new Float64Array(n), y = new Float64Array(n);
const bq = L.bqLP(50, fs, 0.9);
for (let i = 0; i < n; i++) { x[i] = rng.gauss() + 0.5 * Math.sin(2 * Math.PI * 37 * i / fs); y[i] = bq.step(x[i]) * 2 + 0.3 * rng.gauss(); }
const W = L.welchCSD(x, y, fs, 1024), H = L.tfH1(x, y, fs, 1024);
require('fs').writeFileSync('xval.json', JSON.stringify({ x: Array.from(x), y: Array.from(y), f: Array.from(W.f), Pxx: Array.from(W.Pxx), Pyy: Array.from(W.Pyy), Cr: Array.from(W.Cr), Ci: Array.from(W.Ci), mag: Array.from(H.mag), ph: Array.from(H.ph), coh: Array.from(H.coh) }));
