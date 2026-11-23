// Kullanıcının özelleştirilmiş LOS jitter gereksinimleri: mevcut örnek DUT'un işletme benzetimindeki değerleri.
// Gerçek optik LOS (1 kHz), 600 s, 20 s oturma atılır; 60 s pencerelerde ortalama + doğrusal trend çıkarılır.
'use strict';
const L = require('../engine.js');
const scen = process.argv[2] || 'sub';
const P = scen === 'sub' ? L.defaultParams() : L.defaultParams('ship');
if (scen === 'ss4' || scen === 'ss5') { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[scen.toUpperCase()])); }
const T = 600, R = L.runSim(P, L.opScenario(P, { T, seed: 11, fs: 4000, derot: true }), null);
const fr = R.meta.fRec, i0 = 20 * fr, el = R.rec.opt_el.subarray(i0), xel = R.rec.opt_xel.subarray(i0), n = el.length;
const W = 60 * fr, nW = Math.floor(n / W);
const det = (a) => L.detrend(Float64Array.from(a), 'linear');
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const win = [];
const dEl = new Float64Array(nW * W), dXel = new Float64Array(nW * W);
for (let k = 0; k < nW; k++) {
  const e = det(el.subarray(k * W, (k + 1) * W)), x = det(xel.subarray(k * W, (k + 1) * W));
  dEl.set(e, k * W); dXel.set(x, k * W);
  let mn = Infinity, mx = -Infinity, mnx = Infinity, mxx = -Infinity; for (let i = 0; i < W; i++) { mn = Math.min(mn, e[i]); mx = Math.max(mx, e[i]); mnx = Math.min(mnx, x[i]); mxx = Math.max(mxx, x[i]); }
  win.push({ sEl: rms(e), sX: rms(x), ppEl: mx - mn, ppX: mxx - mnx });
}
const pct = (a, p) => { const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const absEl = dEl.map(Math.abs), absX = dXel.map(Math.abs), rad = new Float64Array(dEl.length); for (let i = 0; i < rad.length; i++) rad[i] = Math.hypot(dEl[i], dXel[i]);
// pozlama penceresi (10 ms, kare başına 50 fps): pencere ortalamasına göre RMS ve tepe-tepe
const fE = Math.round(0.010 * fr), fStep = Math.round(fr / 50), sx = [], px = [], se = [], pe = [];
for (let s0 = 0; s0 + fE <= nW * W; s0 += fStep) {
  for (const [a, S, Pk] of [[dEl, se, pe], [dXel, sx, px]]) { let m = 0; for (let i = 0; i < fE; i++) m += a[s0 + i]; m /= fE; let q = 0, lo = Infinity, hi = -Infinity; for (let i = 0; i < fE; i++) { q += (a[s0 + i] - m) ** 2; lo = Math.min(lo, a[s0 + i]); hi = Math.max(hi, a[s0 + i]); } S.push(Math.sqrt(q / fE)); Pk.push(hi - lo); }
}
const rmsArr = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
// PSD (Welch, 32,8 s segment, Hann, %50 örtüşme) ve bant RMS, maske oranı
const masks = [[0.1, 2.5, 6.0], [2.5, 20, 1.0], [20, 100, 0.35]];
const psd = (a) => L.welch(a, fr, 32768);
const PE = psd(dEl), PX = psd(dXel);
const band = (Pp, f1, f2) => { let s = 0; for (let i = 1; i < Pp.f.length; i++) if (Pp.f[i] >= f1 && Pp.f[i] < f2) s += Pp.P[i] * Pp.df; return Math.sqrt(s); };
const maskR = (Pp, f1, f2, m) => { let r = 0, fm = 0; for (let i = 1; i < Pp.f.length; i++) if (Pp.f[i] >= f1 && Pp.f[i] < f2) { const a = Math.sqrt(Pp.P[i]) * 1e6 / m; if (a > r) { r = a; fm = Pp.f[i]; } } return { r, fm }; };
const u = (v) => (v * 1e6).toFixed(2);
const avg = (k) => win.reduce((s, w) => s + w[k], 0) / win.length, mxw = (k) => Math.max(...win.map(w => w[k]));
console.log(`== ${scen} (${nW} × 60 s pencere, gerçek optik LOS 1 kHz)`);
console.log(`σ_El ort/en kötü ${u(avg('sEl'))} / ${u(mxw('sEl'))}  σ_Az(xel) ${u(avg('sX'))} / ${u(mxw('sX'))}  vektör ${u(Math.hypot(avg('sEl'), avg('sX')))} / ${u(Math.max(...win.map(w => Math.hypot(w.sEl, w.sX))))}`);
console.log(`PPV El en kötü ${u(mxw('ppEl'))}  Xel ${u(mxw('ppX'))}  (ort ${u(avg('ppEl'))} / ${u(avg('ppX'))});  PPV/σ El ${(avg('ppEl') / avg('sEl')).toFixed(2)}`);
console.log(`P99.73 |El| ${u(pct(absEl, 0.9973))}  |Xel| ${u(pct(absX, 0.9973))}  radyal ${u(pct(rad, 0.9973))}   3σ_vek ${u(3 * Math.hypot(avg('sEl'), avg('sX')))}`);
console.log(`Pozlama 10 ms: RMS(kareler) El ${u(rmsArr(se))} Xel ${u(rmsArr(sx))}  P99 El ${u(pct(se, 0.99))} Xel ${u(pct(sx, 0.99))}  en büyük ${u(Math.max(...se))} / ${u(Math.max(...sx))}; tepe-tepe P99 ${u(pct(pe, 0.99))} / ${u(pct(px, 0.99))}`);
for (const [f1, f2, m] of masks) { const rE = maskR(PE, f1, f2, m), rX = maskR(PX, f1, f2, m); console.log(`bant ${f1}–${f2} Hz: RMS El ${u(band(PE, f1, f2))} Xel ${u(band(PX, f1, f2))} µrad | maske ${m}: en büyük ASD/maske El ${rE.r.toFixed(2)} @ ${rE.fm.toFixed(2)} Hz, Xel ${rX.r.toFixed(2)} @ ${rX.fm.toFixed(2)} Hz | maske-ima RMS ${(m * Math.sqrt(f2 - f1)).toFixed(2)}`); }
console.log(`toplam 0.1–100 Hz RMS El ${u(band(PE, 0.1, 100))} Xel ${u(band(PX, 0.1, 100))}; <0.1 Hz El ${u(band(PE, 0, 0.1))}; >100 Hz El ${u(band(PE, 100, 500))}`);
// takip döngüsü idealleştirmesi: 2,5 Hz altı tümüyle düzeltilirse (yüksek geçiren) kalan RMS
const hp = (Pp) => band(Pp, 2.5, 500);
console.log(`2,5 Hz üstü (takip düzeltmesi ideal): El ${u(hp(PE))} Xel ${u(hp(PX))} vektör ${u(Math.hypot(hp(PE), hp(PX)))}`);
