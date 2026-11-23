// bias kararsızlığı: log aralıklı Gauss–Markov toplamıyla 1/f (flicker) yaklaşımı + RRW; Allan tabanını 0,664·B'ye kalibre et
const L = require('./engine.js');
const B = 1;                     // birim
const Tcs = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
function simulate(c, Krrw, hours, fs, seed) {
  const n = Math.round(hours * 3600 * fs), dt = 1 / fs, rng = new L.RNG(seed);
  const gm = Tcs.map(T => ({ phi: Math.exp(-dt / T), q: c * B * Math.sqrt(1 - Math.exp(-2 * dt / T)), x: c * B * rng.gauss() }));
  const x = new Float64Array(n); let rw = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (const g of gm) { g.x = g.phi * g.x + g.q * rng.gauss(); s += g.x; } rw += Krrw * Math.sqrt(dt) * rng.gauss(); x[i] = s + rw; }
  return x;
}
for (const c of [0.5, 0.55]) {
  const fs = 1, x = simulate(c, 0.0081 * B, 60, fs, 99);
  const ad = L.allanDev(x, fs, Array.from(L.logspace(2, 20000, 30)));
  const mid = ad.filter(a => a.tau >= 20 && a.tau <= 3000).map(a => a.adev);
  const mn = Math.min(...ad.map(a => a.adev));
  console.log('c', c, 'floor median(20–3000 s)', (mid.sort((a, b) => a - b)[mid.length >> 1]).toFixed(4), 'min', mn.toFixed(4), ' (hedef 0.664)', ad.map(a => a.tau.toFixed(0) + ':' + a.adev.toFixed(3)).join(' '));
}
