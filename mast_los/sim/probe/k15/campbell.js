// v13.13 K1: dalga çarpması genlik ölçeğinin Campbell beklentisine kalibrasyonu — motorun döngü modeliyle ince ızgara (T_p 61 nokta, f 20000
// nokta log), sayfanın 11 noktalı kuralı ve orta nokta kuralı karşılaştırması; yeni A = A0 · 2 / σ_Campbell(dar bant kapalı)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const P = L.defaultParams('sub'), TAU2 = 2 * Math.PI, sq = (x) => x * x;
const camp = (resOn, A, nTp, rule, nf) => { const ctl = Object.assign({}, P.dut.ctl, { res: Object.assign({}, P.dut.ctl.res, { on: resOn }) }), lp = L.loopModel(P.dut.el, ctl, P.dut.gyro, P.dut.cur, P.dut.el.J), sl = P.env.slap;
  let acc = 0;
  for (let i = 0; i < nTp; i++) { const Tp = rule === 'inc' ? sl.Tmin + i * (sl.Tmax - sl.Tmin) / (nTp - 1) : sl.Tmin + (i + 0.5) * (sl.Tmax - sl.Tmin) / nTp; let e = 0, fPrev = 0, gPrev = 0;
    for (let k = 1; k <= nf; k++) { const f = 0.001 * Math.pow(400000, k / nf), den = 1 - 4 * f * f * Tp * Tp, X2 = Math.abs(den) < 1e-9 ? sq(Tp / 2) : sq((2 * Tp / Math.PI) * Math.cos(Math.PI * f * Tp) / den), g = 2 * sq(L.cabs(lp.drr(TAU2 * f))) * X2;
      if (k > 1) e += 0.5 * (g + gPrev) * (f - fPrev); fPrev = f; gPrev = g; }
    acc += (rule === 'inc' && (i === 0 || i === nTp - 1) && nTp > 11) ? 0.5 * e : e; }
  const w = rule === 'inc' && nTp > 11 ? nTp - 1 : nTp;
  return Math.sqrt(sl.rate * sq(A * 1e-6) * acc / w) * 1e6; };
const A0 = P.env.slap.A, out = {};
for (const [nm, a, b, c] of [['sayfa (11 nokta, uçlar dahil, eşit ağırlık; f 4000)', 11, 'inc', 4000], ['orta nokta 11; f 4000', 11, 'mid', 4000], ['yamuk 61; f 20000', 61, 'inc', 20000], ['orta nokta 41; f 20000', 41, 'mid', 20000]]) {
  const off = camp(false, A0, a, b, c), on = camp(true, A0, a, b, c); out[nm] = { off, on }; console.log(`${nm}: dar bant kapalı ${off.toFixed(4)}, yapılandırılmış ${on.toFixed(4)} µrad (A ${A0})`); }
const ref = out['yamuk 61; f 20000'], An = A0 * 2 / ref.off;
console.log(`yeni A = ${A0} · 2 / ${ref.off.toFixed(4)} = ${An.toFixed(1)} µrad → 2101: dar bant kapalı ${(ref.off * 2101 / A0).toFixed(4)}, yapılandırılmış ${(ref.on * 2101 / A0).toFixed(4)}`);
require('fs').writeFileSync(path.join(__dirname, 'campbell.json'), JSON.stringify({ A0, out, An }, null, 1));
