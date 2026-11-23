// Prototip: EN 1991-1-4 Ek E yaklaşım 1 + örnek gemi direği değerleri
const TAU = 2 * Math.PI, D2R = Math.PI / 180, sq = (x) => x * x;
function clat0Circ(Re) { if (Re <= 3e5) return 0.7; if (Re <= 5e5) return 0.7 - 0.5 * Math.log(Re / 3e5) / Math.log(5 / 3); if (Re <= 5e6) return 0.2; return 0.3; }
function calc(W) {
  const b = W.D, St = W.St, vcrit = b * W.fn / St, Re = b * vcrit / W.nu, clat0 = clat0Circ(Re), ratio = vcrit / W.Umax, active = ratio <= 1.25;
  const clat = active ? clat0 : 0, Sc = 2 * W.delta * W.me / (W.rho * b * b), lam = W.L / b;
  let yb = 0, Ljb = 6, Kw = 0, it = 0;
  for (; it < 200; it++) { Ljb = yb < 0.1 ? 6 : (yb < 0.6 ? 4.8 + 12 * yb : 12); const x = Math.min(1, Ljb / lam); Kw = 3 * x * (1 - x + x * x / 3); const yn = W.K * Kw * clat / (St * St * Sc); if (Math.abs(yn - yb) < 1e-14) { yb = yn; break; } yb = yn; }
  const y = yb * b, th = W.kth * y / W.L, acc = sq(TAU * W.fn) * y;
  return { vcrit, kn: vcrit / 0.514444, Re, clat0, clat, ratio, Sc, lam, Ljb, Kw, yb, y_mm: y * 1e3, th_deg: th / D2R, th_urad: th * 1e6, acc, it };
}
// 1) Rakočević & Popović (2018) örneği: y = b·K·Kw·c_lat/(St²·Sc), c_lat Re'den
const ex = [{ n: 1.095, v: 3.29, Sc: 13.98, K: 0.131, Kw: 0.245, Re: 118477, y: 26.8, clat: 0.700 }, { n: 3.821, v: 11.47, Sc: 18.93, K: 0.184, Kw: 0.463, Re: 413491, y: 28.9, clat: 0.386 }, { n: 3.821, v: 19.03, Sc: 6.89, K: 0.184, Kw: 0.463, Re: 1136788, y: 68.3, clat: 0.200 }];
for (const e of ex) { const b = 0.18 * e.v / e.n, c = clat0Circ(e.Re), y = b * e.K * e.Kw * c / (sq(0.18) * e.Sc); console.log('örnek: b', b.toFixed(4), 'c_lat', c.toFixed(3), '(makale', e.clat, ') y', (y * 1e3).toFixed(2), 'mm (makale', e.y, ')'); }
// 2) Konsol 1. mod uç eğimi oranı φ'(L)L/φ(L)
const bL = 1.87510407, sg = (Math.cosh(bL) + Math.cos(bL)) / (Math.sinh(bL) + Math.sin(bL));
const phiL = Math.cosh(bL) - Math.cos(bL) - sg * (Math.sinh(bL) - Math.sin(bL)), dphiL = bL * (Math.sinh(bL) + Math.sin(bL) - sg * (Math.cosh(bL) - Math.cos(bL)));
console.log('düzgün konsol 1. mod φ\'(L)L/φ(L) =', (dphiL / phiL).toFixed(4), '; statik uç yükü 1,5; (z/h)² 2');
// K = ∫Φ/(4π∫Φ²) için (z/h)²
console.log('K((z/h)^2) =', (1 / 3 / (4 * Math.PI / 5)).toFixed(4));
// 3) Örnek gemi direği: çelik boru D=0,40 m, t=10 mm, L=8 m, tepe kütlesi 250 kg
const E = 2.1e11, rho_s = 7850, ro = 0.20, ri = 0.19, Lm = 8, M = 250;
const I = Math.PI / 4 * (ro ** 4 - ri ** 4), A = Math.PI * (ro * ro - ri * ri), m = A * rho_s, k = 3 * E * I / Lm ** 3, Meff = M + 0.2357 * m * Lm;
const fR = Math.sqrt(k / Meff) / TAU, me = m + M / (Lm / 5);
console.log('boru: m', m.toFixed(1), 'kg/m, EI', (E * I).toExponential(3), ', Rayleigh f_n', fR.toFixed(3), 'Hz, m_e (Φ=(z/h)², uç kütlesi dahil)', me.toFixed(1), 'kg/m');
for (const delta of [0.02, 0.03, 0.05]) {
  const r = calc({ D: 0.40, L: 8, fn: 4.1, me: 252, delta, St: 0.18, Umax: 25, kth: 1.5, rho: 1.25, nu: 1.5e-5, K: 0.13 });
  console.log('δ', delta, JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toPrecision(4) : v));
}
