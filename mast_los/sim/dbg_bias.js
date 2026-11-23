const L = require('./engine.js');
const B = 1, c = 0.6 * B, Tcs = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000], K = 0.0081 * B;
const av = (tau) => { let s = 0; for (const Tc of Tcs) { const x = tau / Tc; s += (2 * c * c * Tc / tau) * (1 - (Tc / (2 * tau)) * (3 - 4 * Math.exp(-x) + Math.exp(-2 * x))); } return Math.sqrt(s + K * K * tau / 3); };
const taus = Array.from(L.logspace(0.5, 30000, 25));
for (const t of taus) console.log(t.toFixed(2), av(t).toFixed(4));
let mn = 1e9, mx = 0; for (const t of L.logspace(2, 3000, 200)) { const v = av(t); mn = Math.min(mn, v); mx = Math.max(mx, v); }
console.log('2-3000 s range', mn.toFixed(4), mx.toFixed(4));
