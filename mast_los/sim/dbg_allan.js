const L = require('./engine.js');
const fs0 = 100, N = 3600 * fs0, Nn = 1.0, rng = new L.RNG(29), x = new Float64Array(N);
for (let i = 0; i < N; i++) x[i] = Nn * Math.sqrt(fs0) * rng.gauss();
const ad = L.allanDev(x, fs0, [0.01, 0.02, 0.1, 1, 10, 100, 300]);
for (const a of ad) console.log(a.tau, (a.adev * Math.sqrt(a.tau)).toFixed(4), a.K);
