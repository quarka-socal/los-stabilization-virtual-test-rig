function LOSSIM_FACTORY() {
'use strict';
// ============================================================================
// 01_core.js — sabitler, PRNG, filtreler, FFT, spektral sentez, üreteçler
// ============================================================================
const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = 2 * Math.PI, G0 = 9.80665;
const URAD = 1e-6;
const DEGPH = Math.PI / 180 / 3600;      // 1 °/h  → rad/s
const DEGPSQH = Math.PI / 180 / 60;      // 1 °/√h → rad/√s

// ---------------------------------------------------------------- PRNG -------
function rotl32(x, k) { return (x << k) | (x >>> (32 - k)); }
function strHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function hash32(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  h = (h + Math.imul((b >>> 0) + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}
class RNG {               // xoshiro128** + Marsaglia polar Gauss
  constructor(seed) {
    let s = seed >>> 0;
    const sm = () => {
      s = (s + 0x9e3779b9) >>> 0; let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    if ((this.a | this.b | this.c | this.d) === 0) this.a = 1;
    this.has = false; this.spare = 0;
  }
  u32() {
    const r = Math.imul(rotl32(Math.imul(this.b, 5), 7), 9);
    const t = this.b << 9;
    this.c ^= this.a; this.d ^= this.b; this.b ^= this.c; this.a ^= this.d;
    this.c ^= t; this.d = rotl32(this.d, 11);
    return r >>> 0;
  }
  uniform() { return (this.u32() + 0.5) / 4294967296; }
  gauss() {
    if (this.has) { this.has = false; return this.spare; }
    let u, v, s;
    do { u = 2 * this.uniform() - 1; v = 2 * this.uniform() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this.spare = v * m; this.has = true; return u * m;
  }
}
function makeRngFactory(seed) {
  const cache = new Map();
  return (name) => {
    let r = cache.get(name);
    if (!r) { r = new RNG(hash32(seed >>> 0, strHash(name))); cache.set(name, r); }
    return r;
  };
}

// ---------------------------------------------------------------- yardımcı ---
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function sq(x) { return x * x; }
function sinc(x) { return Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x; }
function Ww(f, T) { const x = Math.PI * f * T; return f <= 0 ? 1 : sq(sinc(x)); }   // W_w = sinc²(πfT)
function db(x) { return 20 * Math.log10(Math.max(x, 1e-300)); }
function linspace(a, b, n) { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = a + (b - a) * i / (n - 1); return o; }
function logspace(a, b, n) { const o = new Float64Array(n); const la = Math.log10(a), lb = Math.log10(b); for (let i = 0; i < n; i++) o[i] = Math.pow(10, la + (lb - la) * i / (n - 1)); return o; }

// ---------------------------------------------------------------- FFT --------
const _fftCache = new Map();
function _fftTables(n) {
  let t = _fftCache.get(n);
  if (t) return t;
  const h = n >> 1;
  const cs = new Float64Array(h), sn = new Float64Array(h);
  for (let i = 0; i < h; i++) { cs[i] = Math.cos(TAU * i / n); sn[i] = Math.sin(TAU * i / n); }
  const rev = new Uint32Array(n); const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  t = { cs, sn, rev };
  if (_fftCache.size > 12) _fftCache.clear();
  _fftCache.set(n, t); return t;
}
// yerinde radix-2; ileri: X_k = Σ x_n e^{-j2πkn/N}; ters (inverse=true): 1/N YOK
function fft(re, im, inverse) {
  const n = re.length; if (n <= 1) return;
  const { cs, sn, rev } = _fftTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const sg = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cs[k], wi = sg * sn[k];
        const a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

// ---------------------------------------------- spektral sentez (Gauss süreç) -
// shapeFn(f): tek taraflı PSD şekli (ölçek önemsiz); sonuç tam hedef RMS'e normalize edilir
function synthSeries(shapeFn, fs, n, rng, targetRms) {
  const N = nextPow2(Math.max(n, 16));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const s = shapeFn(k * fs / N);
    if (!(s > 0)) continue;
    const a = Math.sqrt(s * fs * N / 2) / Math.SQRT2;
    const xr = a * rng.gauss(), xi = a * rng.gauss();
    re[k] = xr; im[k] = xi; re[N - k] = xr; im[N - k] = -xi;
  }
  fft(re, im, true);
  const out = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) { out[i] = re[i] / N; mean += out[i]; }
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) { out[i] -= mean; ss += out[i] * out[i]; }
  const rms = Math.sqrt(ss / n);
  if (targetRms != null && rms > 0) { const g = targetRms / rms; for (let i = 0; i < n; i++) out[i] *= g; }
  return out;
}
// Aynı gerçekleşmenin ikinci türeviyle birlikte sentez: ẍ, frekans alanında −(2πf)² ile çarpılarak band sınırlı
// sinyal için tam bulunur. Ortalama çıkarma türevi değiştirmez; RMS ölçeği ikisine birlikte uygulanır.
function synthSeriesD2(shapeFn, fs, n, rng, targetRms) {
  const N = nextPow2(Math.max(n, 16));
  const re = new Float64Array(N), im = new Float64Array(N), r2 = new Float64Array(N), i2 = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const f = k * fs / N, s = shapeFn(f);
    if (!(s > 0)) continue;
    const a = Math.sqrt(s * fs * N / 2) / Math.SQRT2, w2 = -sq(TAU * f);
    const xr = a * rng.gauss(), xi = a * rng.gauss();
    re[k] = xr; im[k] = xi; re[N - k] = xr; im[N - k] = -xi;
    r2[k] = w2 * xr; i2[k] = w2 * xi; r2[N - k] = w2 * xr; i2[N - k] = -w2 * xi;
  }
  fft(re, im, true); fft(r2, i2, true);
  const x = new Float64Array(n), a = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) { x[i] = re[i] / N; a[i] = r2[i] / N; mean += x[i]; }
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) { x[i] -= mean; ss += x[i] * x[i]; }
  const rms = Math.sqrt(ss / n);
  if (targetRms != null && rms > 0) { const g = targetRms / rms; for (let i = 0; i < n; i++) { x[i] *= g; a[i] *= g; } }
  return { x, a };
}
// Aynı gerçekleşmenin birinci ve ikinci türeviyle birlikte sentezi (ẋ: ×j2πf, ẍ: ×−(2πf)²). x, synthSeries ile bit
// düzeyinde aynıdır (aynı rastgele çekilişler, aynı ortalama çıkarma ve ölçek); RMS ölçeği üçüne birlikte uygulanır.
function synthSeriesDer(shapeFn, fs, n, rng, targetRms) {
  const N = nextPow2(Math.max(n, 16));
  const re = new Float64Array(N), im = new Float64Array(N), r1 = new Float64Array(N), i1 = new Float64Array(N), r2 = new Float64Array(N), i2 = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const f = k * fs / N, s = shapeFn(f);
    if (!(s > 0)) continue;
    const a = Math.sqrt(s * fs * N / 2) / Math.SQRT2, w = TAU * f, w2 = -w * w;
    const xr = a * rng.gauss(), xi = a * rng.gauss();
    re[k] = xr; im[k] = xi; re[N - k] = xr; im[N - k] = -xi;
    r1[k] = -w * xi; i1[k] = w * xr; r1[N - k] = -w * xi; i1[N - k] = -w * xr;          // j·w·(xr + j·xi)
    r2[k] = w2 * xr; i2[k] = w2 * xi; r2[N - k] = w2 * xr; i2[N - k] = -w2 * xi;
  }
  fft(re, im, true); fft(r1, i1, true); fft(r2, i2, true);
  const x = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) { x[i] = re[i] / N; v[i] = r1[i] / N; a[i] = r2[i] / N; mean += x[i]; }
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) { x[i] -= mean; ss += x[i] * x[i]; }
  const rms = Math.sqrt(ss / n);
  if (targetRms != null && rms > 0) { const g = targetRms / rms; for (let i = 0; i < n; i++) { x[i] *= g; v[i] *= g; a[i] *= g; } }
  return { x, v, a };
}
// bant sınırlı spektral biçim (6-DOF deniz profili): n. derece Butterworth bant geçiren |H|²; f1–f2 arasında düz
function shapeBand(f1, f2, n) { n = n || 4; return (f) => f <= 0 ? 0 : 1 / ((1 + Math.pow(f1 / f, 2 * n)) * (1 + Math.pow(f / f2, 2 * n))); }
// spektral biçimin ikinci türev oranı: σ_ẍ / σ_x = (2π)²·√(∫f⁴S df / ∫S df) (log ızgara, fp çevresinde ±200 kat; v13.1:
// ±30 kat 8. derece bant biçiminde f⁴ ağırlıklı kuyruğu %0,01 kesiyordu, V&V W10)
function accRatio(shapeFn, fp) {
  let s0 = 0, s4 = 0;
  for (let f = fp / 200; f <= fp * 200; f *= 1.005) { const w = shapeFn(f) * f; s0 += w; s4 += w * f * f * f * f; }
  return s0 > 0 ? sq(TAU) * Math.sqrt(s4 / s0) : 0;
}
function velRatio(shapeFn, fp) {
  let s0 = 0, s2 = 0;
  for (let f = fp / 200; f <= fp * 200; f *= 1.005) { const w = shapeFn(f) * f; s0 += w; s2 += w * f * f; }
  return s0 > 0 ? TAU * Math.sqrt(s2 / s0) : 0;
}
// yavaş renkli gürültü: fsg hızında sentez, Catmull-Rom ile sürekli zamana
function slowNoise(shapeFn, fsg, T, rms, rng) {
  const n = Math.max(8, Math.ceil(T * fsg) + 4);
  const d = synthSeries(shapeFn, fsg, n, rng, rms);
  return (t) => {
    const x = t * fsg; const i = Math.floor(x), u = x - i;
    const i0 = clamp(i - 1, 0, n - 1), i1 = clamp(i, 0, n - 1), i2 = clamp(i + 1, 0, n - 1), i3 = clamp(i + 2, 0, n - 1);
    const p0 = d[i0], p1 = d[i1], p2 = d[i2], p3 = d[i3];
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  };
}
// log-frekansta Gauss tepe (dar bantlı süreç şekli)
function shapeLogGauss(fp, sigLn) { return (f) => f <= 0 ? 0 : Math.exp(-0.5 * sq(Math.log(f / fp) / sigLn)) / f; }
function shapeGauss(fp, sf) { return (f) => Math.exp(-0.5 * sq((f - fp) / sf)); }

// ---------------------------------------------------------------- filtreler --
class Biquad {  // DF2T
  constructor(b0, b1, b2, a1, a2) { this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2; this.z1 = 0; this.z2 = 0; }
  step(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
  setCoef(o) { this.b0 = o.b0; this.b1 = o.b1; this.b2 = o.b2; this.a1 = o.a1; this.a2 = o.a2; }   // durum korunur (yavaş ayar)
  reset(v) { // DC kararlı duruma getir (v girişi için)
    const g = (this.b0 + this.b1 + this.b2) / (1 + this.a1 + this.a2); const y = g * v;
    this.z2 = this.b2 * v - this.a2 * y; this.z1 = this.b1 * v - this.a1 * y + this.z2; }
  // tek frekansta karmaşık yanıt (|H|, ∠H)
  resp(f, fs) {
    const w = TAU * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = this.b0 + this.b1 * c1 + this.b2 * c2, ni = -(this.b1 * s1 + this.b2 * s2);
    const dr = 1 + this.a1 * c1 + this.a2 * c2, di = -(this.a1 * s1 + this.a2 * s2);
    const den = dr * dr + di * di;
    return { re: (nr * dr + ni * di) / den, im: (ni * dr - nr * di) / den };
  }
}
function _bq(kind, f0, fs, Q, gainDb) {
  const w0 = TAU * Math.min(f0, 0.49 * fs) / fs, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (kind === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (kind === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (kind === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (kind === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (kind === 'peak') { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else throw new Error('biquad ' + kind);
  return new Biquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}
const bqLP = (f, fs, Q = Math.SQRT1_2) => _bq('lp', f, fs, Q);
const bqHP = (f, fs, Q = Math.SQRT1_2) => _bq('hp', f, fs, Q);
const bqBP = (f, fs, Q) => _bq('bp', f, fs, Q);
const bqNotch = (f, fs, Q) => _bq('notch', f, fs, Q);
const bqPeak = (f, fs, Q, g) => _bq('peak', f, fs, Q, g);

// birinci derece alçak geçiren (tam ayrıklaştırma)
class Lag1 {
  constructor(fc, dt) { this.k = fc > 0 ? 1 - Math.exp(-TAU * fc * dt) : 1; this.y = 0; }
  step(x) { this.y += this.k * (x - this.y); return this.y; }
}
// ikinci derece sistem ẍ + 2ζω ẋ + ω² x = ω² u  (ZOH ile tam ayrıklaştırma, ζ<1)
class Osc2 {
  constructor(f, zeta, dt) {
    const w = TAU * f, z = Math.min(zeta, 0.995);
    const s = z * w, wd = w * Math.sqrt(1 - z * z), e = Math.exp(-s * dt);
    const c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
    this.p11 = e * (c + (s / wd) * sn); this.p12 = e * sn / wd;
    this.p21 = -e * (w * w / wd) * sn; this.p22 = e * (c - (s / wd) * sn);
    this.g1 = 1 - this.p11; this.g2 = -this.p21;      // Γ0 = [−2ζωΦ12 − (Φ22−1), ω²Φ12] ≡ [1−Φ11, −Φ21]
    this.w2 = w * w; this.c2 = 2 * z * w;
    // birinci derece tutma (FOH, giriş adım içinde doğrusal): Γ1 = Γ0 − A⁻¹ΦB + A⁻²(Φ−I)B/dt
    const cc = this.c2, ww = this.w2;
    const aiPB0 = -cc * this.p12 - this.p22, aiPB1 = ww * this.p12;
    const ai2G0 = (-cc * this.g1 - this.g2) / ww, ai2G1 = this.g1;
    this.h1 = this.g1 - aiPB0 + ai2G0 / dt; this.h2 = this.g2 - aiPB1 + ai2G1 / dt;
    this.x = 0; this.v = 0; this.a = 0; this.up = 0;
    // ω·dt büyükse (hızlı yumuşatma süzgeci) ivme, hızın geri farkından alınır (sayısal iptali önler)
    this.fdAcc = w * dt > 0.5; this.idt = 1 / dt;
  }
  step(u) {           // FOH: önceki girişten u'ya doğrusal geçiş; durum t_k'ya ilerler
    const x = this.x, v = this.v, du = u - this.up;
    this.x = this.p11 * x + this.p12 * v + this.g1 * this.up + this.h1 * du;
    this.v = this.p21 * x + this.p22 * v + this.g2 * this.up + this.h2 * du;
    this.a = this.fdAcc ? (this.v - v) * this.idt : this.w2 * (u - this.x) - this.c2 * this.v;
    this.up = u;
    return this.x;
  }
  reset(x0) { this.x = x0; this.v = 0; this.a = 0; this.up = x0; }
}
// Gauss–Markov (birinci derece) süreci
class GaussMarkov {
  constructor(sigma, Tc, dt, rng) { this.phi = Math.exp(-dt / Tc); this.q = sigma * Math.sqrt(1 - this.phi * this.phi); this.rng = rng; this.x = sigma * rng.gauss(); }
  step() { this.x = this.phi * this.x + this.q * this.rng.gauss(); return this.x; }
}

// Gyro bias kararsızlığı: log aralıklı 10 Gauss–Markov bileşeninin toplamı (1 s … 30 000 s) 1/f gürültüsüne
// yaklaşır. Kapalı biçim Allan sapması (V&V N7): 20–1000 s'de 0,65–0,67·B (IEEE 952 düz bölgesi 0,664·B ±%3);
// 2 s'de 0,55·B, 3000 s'de 0,70·B (üstteki küçük hız rastgele yürüyüşü, RRW, K = 0,0081·B/√s).
class BiasProcess {
  // fresh = true: bias koşudan hemen önce kalibre edilmiş — Gauss–Markov bileşenleri sıfır sapmadan başlar
  // (varsayılan: durağan dağılımdan, yani son kalibrasyondan uzun süre geçmiş gyro). Rastgele sayı akışı iki
  // durumda da aynıdır; sonraki dolaşım birebir eşleşir (eşleştirilmiş karşılaştırma).
  constructor(B, rng, dt, fresh) {
    this.Tcs = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
    this.c = 0.60 * B; this.rng = rng; this.dtu = 0.05; this.acc = 0; this.dt = dt;
    const du = this.dtu;
    this.phi = this.Tcs.map(T => Math.exp(-du / T)); this.q = this.Tcs.map(T => this.c * Math.sqrt(1 - Math.exp(-2 * du / T)));
    this.x = this.Tcs.map(() => (fresh ? 0 : 1) * this.c * rng.gauss()); this.rw = 0; this.krw = 0.0081 * B * Math.sqrt(du);
    this.v = this.x.reduce((a, b) => a + b, 0);
  }
  step() {
    this.acc += this.dt;
    if (this.acc >= this.dtu) {
      this.acc -= this.dtu; let s = 0;
      for (let k = 0; k < this.x.length; k++) { this.x[k] = this.phi[k] * this.x[k] + this.q[k] * this.rng.gauss(); s += this.x[k]; }
      this.rw += this.krw * this.rng.gauss(); this.v = s + this.rw;
    }
    return this.v;
  }
}
// beyaz Gauss → biquad zinciri; çıkış RMS'i dürtü yanıtı enerjisinden tam normalize edilir
class ShapedNoise {
  constructor(sections, rms, rng, fs) {
    this.sec = sections; this.rng = rng;
    // dürtü yanıtı enerjisi
    const probe = sections.map(s => new Biquad(s.b0, s.b1, s.b2, s.a1, s.a2));
    let e = 0, x = 1, tail = 0;
    const nmax = Math.max(4096, Math.round(fs * 20));
    for (let i = 0; i < nmax; i++) {
      let y = x; x = 0;
      for (const p of probe) y = p.step(y);
      e += y * y;
      if (i > 2048 && y * y < 1e-18 * e) { if (++tail > 512) break; } else tail = 0;
    }
    this.g = e > 0 ? rms / Math.sqrt(e) : 0;
  }
  step() { let y = this.rng.gauss(); for (const s of this.sec) y = s.step(y); return this.g * y; }
}

// --------------------------------------------- yumuşak zarf (rampa) yardımcı --
function envelope(t, t0, t1, ramp) {
  if (t < t0 || t > t1) return 0;
  if (ramp <= 0) return 1;
  if (t < t0 + ramp) return 0.5 - 0.5 * Math.cos(Math.PI * (t - t0) / ramp);
  if (t > t1 - ramp) return 0.5 - 0.5 * Math.cos(Math.PI * (t1 - t) / ramp);
  return 1;
}

// ------------------------------------------------------- sinyal üreteçleri ----
// Her üreteç: {axis, value(t)}; durumlu olanlar adım başına tam bir kez çağrılır.
function makeComponent(c, fs, rngf) {
  const ax = c.axis | 0;
  switch (c.type) {
    case 'sine': {
      const A = c.A, w = TAU * c.f, ph = c.ph || 0, t0 = c.t0 || 0, t1 = c.t1 == null ? 1e12 : c.t1, ramp = c.ramp || 0;
      return { axis: ax, value: (t) => { const g = envelope(t, t0, t1, ramp); return g === 0 ? 0 : A * g * Math.sin(w * (t - t0) + ph); } };
    }
    case 'series': {
      const d = c.data, n = d.length, fsg = c.fs, t0 = c.t0 || 0, sc = c.scale == null ? 1 : c.scale;
      return {
        axis: ax, value: (t) => {
          const x = (t - t0) * fsg; if (x < -1 || x > n) return 0;
          const i = Math.floor(x), u = x - i;
          const i0 = clamp(i - 1, 0, n - 1), i1 = clamp(i, 0, n - 1), i2 = clamp(i + 1, 0, n - 1), i3 = clamp(i + 2, 0, n - 1);
          const p0 = d[i0], p1 = d[i1], p2 = d[i2], p3 = d[i3];
          return sc * (p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0))));
        }
      };
    }
    case 'chirp': { // logaritmik süpürme; genlik ampFn(f) (rad) ile frekansa bağlı
      const f0 = c.f0, f1 = c.f1, r = c.octPerMin / 60, t0 = c.t0 || 0, ramp = c.ramp || 1, ampFn = c.ampFn;
      const Tsw = Math.log2(f1 / f0) / r, k = f0 / (r * Math.LN2);
      return {
        axis: ax, T: Tsw, value: (t) => {
          const tt = t - t0; if (tt < 0 || tt > Tsw) return 0;
          const f = f0 * Math.pow(2, r * tt);
          const ph = TAU * k * (Math.pow(2, r * tt) - 1);
          return ampFn(f) * envelope(tt, 0, Tsw, ramp) * Math.sin(ph);
        }, freqAt: (t) => { const tt = t - t0; return (tt < 0 || tt > Tsw) ? 0 : f0 * Math.pow(2, r * tt); }
      };
    }
    case 'halfsine': { // olay listesi: {t0, Tp, A}
      const ev = c.events.slice().sort((a, b) => a.t0 - b.t0); let p = 0;
      return {
        axis: ax, value: (t) => {
          while (p < ev.length && ev[p].t0 + ev[p].Tp < t) p++;
          let s = 0;
          for (let i = p; i < ev.length && ev[i].t0 <= t; i++) { const e = ev[i]; const u = (t - e.t0) / e.Tp; if (u >= 0 && u <= 1) s += e.A * Math.sin(Math.PI * u); }
          return s;
        }
      };
    }
    case 'steps': { // [{t, v}] düğümleri; geçiş tr saniye yükseltilmiş kosinüs
      const kn = c.knots, tr = c.trans || 1;
      return {
        axis: ax, value: (t) => {
          let v = kn.length ? kn[0].v : 0;
          for (let i = 1; i < kn.length; i++) {
            if (t < kn[i].t) break;
            const u = (t - kn[i].t) / tr;
            v = u >= 1 ? kn[i].v : kn[i - 1].v + (kn[i].v - kn[i - 1].v) * (0.5 - 0.5 * Math.cos(Math.PI * u));
          }
          return v;
        }
      };
    }
    case 'noise': { // biquad şekillendirilmiş beyaz gürültü, RMS normalize
      const secs = [];
      if (c.hp) secs.push(bqHP(c.hp, fs, c.hpQ || Math.SQRT1_2));
      if (c.hp2) secs.push(bqHP(c.hp2, fs, c.hpQ || Math.SQRT1_2));
      if (c.lp) secs.push(bqLP(c.lp, fs, c.lpQ || Math.SQRT1_2));
      if (c.lp2) secs.push(bqLP(c.lp2, fs, c.lpQ || Math.SQRT1_2));
      if (c.peak) secs.push(bqPeak(c.peak.f, fs, c.peak.Q, c.peak.g));
      const sn = new ShapedNoise(secs, c.rms, rngf(c.stream || ('noise' + ax)), fs);
      const t0 = c.t0 || 0, t1 = c.t1 == null ? 1e12 : c.t1, ramp = c.ramp || 0;
      return { axis: ax, value: (t) => { const v = sn.step(); return v * envelope(t, t0, t1, ramp); } };
    }
    case 'const': { const v = c.v; return { axis: ax, value: () => v }; }
    default: throw new Error('bileşen tipi: ' + c.type);
  }
}
function makeChannel(list, fs, rngf) {
  const comps = (list || []).map(c => makeComponent(c, fs, rngf));
  return {
    comps,
    eval(t, out) { out[0] = 0; out[1] = 0; out[2] = 0; for (const c of comps) out[c.axis] += c.value(t); return out; }
  };
}

// ============================================================================
// 02_model.js — parametreler: temel girdiler (kanal, gereksinim, düzenek, senaryo, bütçe varsayımları), örnek DUT,
// işletme ortamı, laboratuvar; türetilmiş büyüklükler ve analitik döngü modeli. Simülasyon kendi içinde tanımlıdır:
// hiçbir değer dış bir dosyaya bağlı değildir; her parametrenin rolü Model sekmesindeki etiketinde yazar.
// ============================================================================

// SS4/SS5 6-DOF proje test profili (kullanıcı tablosu: ± tepe genlik, frekans bandı). Standart değeri değildir: STANAG
// 4154 işletilebilirlik sınırları ve deniz durumu tanımı verir, MIL-STD-167-1A 4–33 Hz titreşim standardıdır; gemi
// hareketi gemiye, rotaya ve hıza bağlıdır (DOD-STD-1399-301A ya da gemi RAO'su ile değiştirin). Eksenler gövdede:
// surge x (pruva), sway y (iskele), heave z (yukarı). Açılar °, ötelemeler m, frekanslar Hz.
const SEA6 = {
  SS4: { roll: { A: 5.0, f1: 0.10, f2: 0.25 }, pitch: { A: 2.5, f1: 0.15, f2: 0.35 }, yaw: { A: 1.5, f1: 0.05, f2: 0.20 },
         surge: { A: 0.3, f1: 0.10, f2: 0.25 }, sway: { A: 0.4, f1: 0.10, f2: 0.30 }, heave: { A: 0.5, f1: 0.10, f2: 0.30 } },
  SS5: { roll: { A: 10.0, f1: 0.10, f2: 0.25 }, pitch: { A: 5.0, f1: 0.15, f2: 0.35 }, yaw: { A: 3.0, f1: 0.05, f2: 0.20 },
         surge: { A: 0.7, f1: 0.10, f2: 0.25 }, sway: { A: 1.0, f1: 0.10, f2: 0.30 }, heave: { A: 1.2, f1: 0.10, f2: 0.30 } },
};
const SEA_ANG = ['roll', 'pitch', 'yaw'], SEA_LIN = ['surge', 'sway', 'heave'];
// Temel girdilerin varsayılan değerleri (P.wb: tarihsel ad; 'temel girdiler'). Roller: kanal (referans dedektör kanalı),
// gereksinim, kabul kuralı, düzenek (hexapod, kolimatör, ölçüm zinciri, laboratuvar), senaryo (deniz, VIV, dünya),
// bütçe varsayımı (gyro spesifikasyonu, görüntü rotasyonu artığı, EIS). Kullanıcı kendi projesinin değerlerini girer.
function baseDefaults() {
  return {
    channels: [
      { name: 'MWIR-NFOV', p_um: 12, f_mm: 300, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 100 },   // kanal tablosu
      { name: 'MWIR-WFOV', p_um: 12, f_mm: 50, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 25 },
      { name: 'HDTV-NFOV', p_um: 3.45, f_mm: 300, Nh: 1920, Nv: 1080, fps: 50, Tint_ms: 1, Dp_mm: 75 },
      { name: 'SWIR-NFOV', p_um: 15, f_mm: 250, Nh: 640, Nv: 512, fps: 50, Tint_ms: 2, Dp_mm: 70 },
    ],
    refChannel: 'MWIR-NFOV',                 // bütçe referans kanalı
    k_wander: 0.5, k_smear: 0.25,            // gereksinim (IFOV RMS, eksen başına)
    tau: 1, drift_ifov: 1,                   // drift penceresi (s) ve izin verilen drift (IFOV)
    k_conf: 2.576, TUR_target: 4,            // kabul kuralı: güven çarpanı, hedef TUR
    TUR_def: 'k1', k_exp: 2,                 // TUR tanımı (k = 1 | Z540.3) ve genişletme katsayısı
    k_roll: 0.5,                             // görüntü rotasyonu: ölçüt noktasında izin verilen kayma (IFOV RMS; R-01 tahsisi)
    // Görüntü rotasyonu ölçüt noktası: 'corner' = dizinin en dış köşe pikseli (yarı köşegen, r = ½·√(Nh² + Nv²));
    // 'edge' = alan kenarı (yatay yarı genişlik, Nh/2; v10 davranışı)
    rotRef: 'corner',
    // Ek bütçe satırları (v11: B1-08 deniz ötelemesi, B1-09/B1-10 FOG): false → v10 satır seti (regresyon kipi)
    extRows: true,
    hex: { theta_max: 15, omega_max: 40, alpha_max: 400, fbw: 20, rel_ratio: 0.5,   // düzenek: hexapod sınırları
           // L_off: pivotun DUT giriş göz bebeğinden kaçıklığı (m; kurulum toleransı, kolimatör açıklığı denetiminde en kötü yönde
           // L_off·sin θ⊥). v13.4: 0,15 → 0 — testler pivotu göz bebeğine koyar (T0.1, T1.3); önceki değer hiçbir hesaba girmiyordu.
           L_off: 0, theta_test: 5, microvib: 2, stabOff_ratio: 0.4,                // uç poz, masa mikro-titreşimi (µrad RMS), stab-OFF payı
           // taban düzeltmesinde masa mikro-titreşimi: 'zincir' | 'tam' | 'kapalı'. v13.5 (kullanıcı kararı): varsayılan 'kapalı' —
           // örnek DUT'ta masa titreşimi ölçüme karesel eklenmiyor (sürtünme ditheri), düşüm tutucu değil (V&V M7)
           mvCorr: 'kapalı',
           // hexapod ötelemesinin dinamiği — 'fbw' (açıyla aynı bacak dinamiği, Osc2 f_bw, ζ = 0,7071; v13.5 varsayılanı, kullanıcı
           // kararı) | 'ideal' (süzgeçsiz; v13.4'e kadar). Shaker koşuları (hexActive: false) her zaman ideal.
           transDyn: 'fbw' },
    // düzenek: kolimatör (v13.4: uygunluk denetimi — collGeom, pupilExcursion). f_c odak, D_c açıklık (mm), iğne deliği çapı (µm),
    // siyah cisim kontrastı ΔT (K; bilgi), f_c/f_DUT alt sınırı, açıklık payı k: D_c ≥ k·(D_p + 2e)
    // v13.5 (kullanıcı kararları): delta_um kolimatör odak hatası δ (µm; + hedef odak düzleminin ötesinde; 0 = ideal), paralaks
    // payı (δ_max denetimi, µrad); fitTrans: laboratuvar deniz ötelemesi göz bebeği kayması e ≤ e_free olacak biçimde ölçeklenir;
    // vigRule: gerçek vinyetlemede (e > (D_c − D_p)/2) test GEÇERSİZ. Gemide D_c 200 mm (applyPlatform; 12° roll × L_pg = 25 mm).
    coll: { fc_mm: 1500, Dc_mm: 150, pinhole_um: 50, dT: 10, ratio_min: 3, ap_margin: 1.1, delta_um: 0, par_allow_urad: 1, fitTrans: true, vigRule: true },
    // düzenek: ölçüm zinciri. v13.7 (kullanıcı kararı K4): IMU ve otokolimatör gürültüsü tek taraflı genlik yoğunluğu (µrad/√Hz, beyaz).
    // IMU gürültüsü hareketle birlikte IMU süzgecinden (imu_bw, 2. derece Butterworth) geçer: RMS = imu_asd·√ENBW, analog
    // ENBW = (π/(2√2))·f_IMU = 1,111·f_IMU; otokolimatör gürültüsü kayıt bandında (0–f_kayıt/2) beyaz: RMS = ac_asd·√(f_kayıt/2).
    // 0,0224 µrad/√Hz ≈ eski örnek başına 0,5 µrad (1 kHz kayıt). noiseModel 'sample' (compatV10): v13.6'ya kadarki tanım
    // (imu_noise, ac_noise örnek başına RMS, süzgeçsiz). v13.6: kullanılmayan ac_rate kaldırıldı. roi_fps > 0: ROI kanalı
    // (v13.7, kullanıcı kararı K3: hiçbir teste eklenmedi; gizli, 0).
    chain: { imu_bw: 500, imu_asd: 0.0224, ac_asd: 0.0224, noiseModel: 'asd', dt_sync_ms: 0.5,
             centroid_px: 0.03, scale_eps: 0.005, air: 1.0, pixlock_px: 0.02, roi_fps: 0 },
    sea: { roll_A: 3, roll_T: 8, pitch_A: 1.5, pitch_T: 10, yaw_A: 1, yaw_T: 12,            // senaryo (denizaltı örneği)
           // profil kipi ('dar' = eşdeğer sinüs genliği + baskın periyot, log-Gauss dar bant, yalnız açısal;
           // '6dof' = bant sınırlı 6 serbestlik dereceli profil, ± tepe genlik, σ = A/kp), tepe çarpanı kp.
           // Kaldıraç kolu r = (rx, ry, h) m: deniz profilinin tanımlandığı hareket referans noktasından LOS referans
           // noktasına (mast başı / direktör); gövde eksenleri x pruva +, y iskele +, z yukarı +. Denizaltı örneği
           // h = 1 m (v13.1 kullanıcı kararı; kullanıcı girer), rx = ry = 0
           mode: 'dar', kp: 3, h: 1, rx: 0, ry: 0, dof: JSON.parse(JSON.stringify(SEA6.SS4)) },
    viv: { section: 'Dairesel', D: 0.25, St: 0.2, nu: 1.1892e-6, Re_crit: 2e5, fn: 3,         // senaryo: hidrodinamik VIV (denizaltı)
           K0_lo: 0.6, K0_hi: 2.0, margin: 0.2, amp_deg: 0.05,
           // bütçe varsayımı: f_n'de DRR (B2-01 analitik tahmini; v13.2 parametre — önceden sabit −40 dB)
           drr_dB: -40,
           // v13.3 (kullanıcı kararları): mast başı ötelemesi (konsol mast: tepe açısı θ ile tepe ötelemesi y = θ·L/κ birlikte;
           // akışa dik y yönünde, açıyla aynı fazda; gemi direğiyle aynı mekanizma) — L: mast serbest boyu (destekten mast
           // başına; örnek: periskop patenti 4,2 m), κ: tepe eğim oranı. Kütle oranı m* = m/(ρπD²/4) (birim boy; örnek:
           // patentte 260 kg / 4,2 m, D = 0,25 m → ≈ 1,2): kilitlenme aralığının üst ucu ve alt dal frekansı
           // f*_alt = √((m* + 1)/(m* − 0,54)) (Govardhan & Williamson 2000); m* ≤ 0,54 → üst sınır yok (2002); null = kapalı.
           // İşletme hız zarfı (mast açıkken, kn): zarfta riskli ya da sınırda hız yoksa VIV oluşmaz (B2-01 = 0).
           L: 4, kth: 1.5, lin: true, mstar: 1.2, Umin_kn: 2, Umax_kn: 12,
           on: true },   // hidrodinamik VIV açık/kapalı (yalnız denizaltı platformunda etkin)
    // Platform: 'sub' = denizaltı sürülebilir optronik mastı (varsayılan), 'ship' = gemi direğinde EO direktör. Platform, hangi kaynakların var olduğunu belirler: hidrodinamik VIV ve
    // dalga çarpması yalnız denizaltında, rüzgâr kaynaklı girdap kopması yalnız gemide.
    platform: 'sub',
    // Rüzgâr kaynaklı girdap kopması — gemi direği (EN 1991-1-4:2005 Ek E, yaklaşım 1). Örnek direk (kaynak değil):
    // çelik boru D = 0,40 m, et 10 mm (96 kg/m), serbest yükseklik 8 m, tepe kütlesi (direktör + platform) 250 kg →
    // Rayleigh f_n = 4,10 Hz (rijit mesnet), m_e = m + M/∫Φ² = 252 kg/m (Φ = (z/l)²). δ_s kaynaklı çelik mertebesi.
    wviv: { on: true, D: 0.40, L: 8, fn: 4.1, me: 252, delta: 0.02, St: 0.18, Umax: 25, beta: 0, kth: 1.5, lin: true,
            ftol: 0.15, eps0: 0.3, drr_dB: -40, amp_deg: null, rho: 1.25, nu: 1.5e-5, K: 0.13 },
    earth:{ Omega: 7.292115e-5, lat: 40, az: 90, el: 0, comp: true, delta_deg: 1 },          // senaryo/düzenek: dünya dönüşü (Ω WGS 84)
    // bütçe varsayımları: gyro ARW, bias, eksen kaçıklığı, artık roll. v13.8 (§8): kullanılmayan mtf_r kaldırıldı; B1-04'ün tabanı
    // epsBasis: 'los' = LOS ekseni etrafındaki baz dönmesi (benzetimin, T1.1'in ve V&V F3'ün fiziği), 'roll' = v13.7'ye kadar roll genliği
    // v13.9 (§8 K2, kullanıcı kararı): rwMetric 'window' = rastgele yürüyüş satırları wander toplamına wander penceresinin metriğiyle
    // girer (B1-05 = ARW·√(T_w/15), doğrusal trend çıkarılmış); B1-06 ve B1-09 sabit kayma olarak trendle çıkar, yalnız drift'e girer.
    // 'tau' = v13.8'e kadar: üçü de τ drift penceresinin metriğiyle wander toplamına girer
    H: { arw: 0.005, bias: 0.05, eps_mrad: 0.1, roll_res_mrad: 0.5, epsBasis: 'los', rwMetric: 'window',
         // ek bütçe varsayımları (v11): LOS ivme duyarlılığı (optik montaj + dengesizlik, B1-08);
         // FOG: kalibrasyon sonrası açılış bias'ı artığı, bias sıcaklık katsayısı ve sıcaklık farkı (B1-09),
         // g-duyarlılığı (B1-10). 0 = girilmedi (veri sayfasından girin)
         accSens: 2.0, b0_res: 0.04, tc_bias: 0, dT: 40, kg: 0,
         // deniz frekansında DRR varsayımı (B1-01…B1-03 analitik tahmini; v13 parametre — önceden sabit −80 dB)
         drrSea_dB: -80 },
    eis: { fc: 0.5, eta: 0.8, reg_px: 0.1 },                                                 // bütçe varsayımı: EIS
    unc: { fmin: 0.05, Nper: 30, perSeg: 4, Trec: 900, coh: 0.8, rawExample: 8 },            // ölçüm belirsizliği: kayıt istatistiği
  };
}

// Örnek DUT (gerçek ürün değil). Fiziksel yapı Hilkert/Masten ISP modelidir; sayılar,
// varsayılan halde bütçenin örnek tahminlerini yeniden üretecek biçimde ayarlanmıştır.
function dutDefaults() {
  return {
    geom: { a0: 90, e0: null },              // LOS azimutu (pruvaya göre, iskele +); elevasyon null → wb.earth.el (LOS elevasyonu) — dünya dönüşü hesabıyla aynı geometri
    el: { J: 0.25, fc: 40, fi: 4, b: 1.6626, k: 4.8402,            // b, k: DRR(1/8 Hz) = −80 dB ve DRR(3 Hz) = −40 dB için çözüldü
          Fc: 1.5818, Fs: 1.7400, ws: 0.003, sigma0: 1581.8,      // N·m; σ0 = F_c / 1 mrad (ön-kayma; Dahl 1968 ölçeği)
          cogN: 300, cogA: 0.01214, Tmax: 20 },
    az: { Ja: 0.35, Jex: 0.20, Jez: 0.25, fc: 30, fi: 4, b: 2.9694, k: 13.3244,   // k: DRR(1/12 Hz) = −80 dB
          Fc: 3.5590, Fs: 3.9149, ws: 0.003, sigma0: 3559.0,     // yağ dolu keçe: el ekseninin 2,25 katı (Lan ve ark. 2023)
          cogN: 360, cogA: 0.02428, Tmax: 40 },
    ctl: { fctl: 2000, flp: 400, zlp: 0.7, secant: true,
           // v13.10 (§9 K1, kullanıcı kararı): estErr = uyarlanır dar bandın frekans kestirim hatası (oran; 0,05 = %5 yüksek). 0 = ideal
           res: { on: true, f: 3.0, adaptive: true, gain_dB: 20, zeta: 0.08, fmin: 1.2, fmax: 6.0, estErr: 0 },   // örnek: VIV bandında adaptif rezonans kontrolcü (T2.2 'kontrol özelliği')
           // v13.10 (§9 K2, kullanıcı kararı): obs = LuGre gözlemcisinin model parametreleri, tesisin değerine oran (F_c, F_s, v_s, σ0). 1 = tam bilgi
           ff: { on: true, mode: 'lugre', eta: 0.95, f_est: 500, w_ff: 1.5e-3, hys: 0, tempSched: false, obs: { Fc: 1, Fs: 1, vs: 1, s0: 1 } } },
    cur: { fbw: 1500 },
    gyro: { fbw: 1000, arw: 0.0042, bi: 0.042, bias0: 0.04, epsEl: 0.10, epsXel: 0.10, sf_ppm: 100,
            // v11 FOG ekleri (örnek DUT; 0 = etkisiz, veri sayfasından girin): ek gecikme (döngünün 1 kontrol periyodu hesap
            // gecikmesine ek), ölçek doğrusalsızlığı (IEEE 952: en küçük kareler doğrusundan en büyük sapma, ppm·FS), ölçüm
            // menzili, kuantizasyon (LSB), bias ve ölçek sıcaklık katsayıları (kalibrasyon sıcaklığı Tcal, çalışma Top), g-duyarlılığı
            lat_ms: 0, sfnl_ppm: 0, range_dps: 1000, lsb_dph: 0, tcBias: 0, tcSF: 0, Tcal: 20, Top: 20, kg: 0 },
    imb: { me: 20, rcg_e: [0.30, 0.05, 0.40], ma: 30, rcg_a: [0.20, 0.20, 0] },   // kg, mm: el montajı (E çerçevesi) / az boyunduruğu (A çerçevesi); az ekseni ikisinin toplamını taşır
    L_pg: 0.12,                              // giriş göz bebeği → gimbal merkezi (m, LOS'un tersine)
    mount: { f: 25, zeta: 0.05, kappa: 0, yaw: 0.5 },   // direk tepesi açısal modu: öteleme ivmesi → açısal (rad per m/s²). Bütçede satırı yok; varsayılan kapalı (κ = 1e-4 ile 'ne olur' denemesi)
    modes: { gim: { f: 180, zeta: 0.02, gA: 2.0e-7 }, opt: { f: 120, zeta: 0.02, gAcc: 1.5e-6 } },
    cooler: { f: 60, A: 1.982, h2: 0.35, h3: 0.15 },          // µrad (60 Hz temel genlik), harmonik oranları
    derot: { on: true, lat_ms: 30, sf: 0.019 },
    optics: { k1: -0.002, scaleErr: 0.004 },                 // radyal distorsiyon; gerçek IFOV/nominal − 1
    video: { lat_ms: 0, x0: 0.37, y0: -0.21 },
  };
}

// İşletme ortamı (mast başı, periskop derinliği). Deniz ve VIV Model'deki senaryo değerlerinden;
// diğer düzeyler bütçe satırlarının analitik tahminlerine kalibre edilmiştir.
function envDefaults() {
  return {
    seaWidth: 0.12,                          // log-frekans Gauss tepe genişliği (σ_ln)
    viv: { bw: 0.03 },                       // Hz, kilitlenme → neredeyse tek ton
    slap: { rate: 0.10, Tmin: 0.05, Tmax: 0.20, A: 2100 },    // olay/s, s, s, µrad (tepe RMS ölçeği); v13.13: Campbell beklentisi dar bant kapalı taban döngüde 2 µrad (önce tek gerçekleşmeye, 2458)
    lat: { f: 8, bw: 0.8, a_rms: 0.861 },      // m/s² (gövde y, yanal)
    plat: { f1: 4, f2: 33, a_rms: 0.9066 },   // m/s² RMS eksen başına (4. derece biçim); B2-06 = 2 µrad için kalibre
    aux: { f: 50, a: 2.256 },                  // m/s² (doğrusal tepe, her eksen; yapı yolu)
    hf: { f1: 60, f2: 400, ang_rms: 1.360, acc_rms: 0.3953 },      // µrad RMS açısal, m/s² RMS doğrusal
  };
}
function labDefaults() {
  return {
    microvib: { f1: 5, f2: 150, fres: 70, Qres: 4, gres: 12 },   // spektrum biçimi; RMS wb.hex.microvib (2 µrad)
    air: { fc: 2 },                                               // spektrum biçimi; RMS wb.chain.air (1 µrad)
    floorCoupling: 0,                                             // µrad / (rad/s²) — kolimatör zemin kuplajı
    hexStroke: 0.10,                                              // m (öteleme stroku, örnek)
    rocking: { free: 50, controlled: 2 },                         // µrad/mm (shaker sallanması)
    pivotHull: 1.0,                                               // m (T2.5 ölçekli gövde dönme merkezi)
  };
}
function anaDefaults() {
  // req: projeye özgü gereksinimler (null = girilmedi → test BİLGİ olarak raporlanır)
  return { Tw: 120, detrend: 'linear', pdeWin: 0.1, edgeMargin_px: 2, seeds: 3, seedOffset: 0,
    req: { settle_ms: null, trackErr_urad: null, boresight_urad: null, shockPeak_urad: null, shockSettle_ms: null },
    los: losReqDefaults() };
}
// Proje LOS kalıntı gereksinimleri (v12, kullanıcının proje tablosu). Limitler IFOV = p/f oranıdır:
// σ_vek ≤ 0,10, σ_El ≤ 0,0625, σ_Az ≤ 0,0775 (√(El² + Az²) = σ_vek), kayıt PPV ≤ 6,5·σ_eksen (Gauss uç değer oranı),
// geçiş (stick-slip) PPV ≤ 0,40 (T1.6), ampirik radyal P99,73 ≤ 0,30, pozlama içi RMS (T_e, karelerin karesel ortalaması)
// ≤ 0,05. PSD: bant RMS tahsisi = pay × eksen sınırı (bantlar 0,1–2,5–20–100–500 Hz), düz eşdeğer ASD maskesi = tahsis/√Δf;
// ayrık ton ≤ √toneFrac × bant tahsisi. Zaman alanı: 0,1 Hz sıfır fazlı yüksek geçiren + Tw pencerelerinde doğrusal trend.
// Karar: σ'lar için pencere RMS'lerinin tek taraflı %95 üst güven sınırı (ust95 | enkotu | ortalama); PPV en kötü pencere;
// P99,73 havuzlanmış; pozlama karesel ortalama. Kabul tabanı: dış kamera takip döngüsü sonrası (basis: sonra | once).
function losReqDefaults() {
  return { on: true, kVec: 0.10, kEl: 0.0625, kAz: 0.0775, kPPV: 6.5, kRev: 0.40, k9973: 0.30, kExp: 0.05, Texp_ms: 10,
    Tw: 60, fHP: 0.1, T: 645, skip: 20, bands: [0.1, 2.5, 20, 100, 500], share: [0.6, 0.6, 0.48, 0.2], toneFrac: 0.5, toneMin: 1.0,
    decide: 'ust95', basis: 'sonra', trk: { bw: 2.5, lat_frames: 2, gate_px: 32 } };
}
// Platforma göre deniz hareketi (eşdeğer sinüs genliği, baskın periyot). Denizaltı: senaryo örneği (baseDefaults).
// Gemi (örnek): roll ve pitch NATO işletilebilirlik sınırlarında (4° ve 1,5° RMS → A = √2·RMS); roll periyodu ≈ 10 s
// (R/V Melville 1/23 model, T_n = 2,14 s → Froude ölçeği 10,3 s); pitch 7 s ve yaw (1°, 12 s) tahmini/örnek.
// Gemi örneğinde direktör, direk tepesinde hareket merkezinin 15 m üstündedir (örnek: 8 m direk + güverte yüksekliği);
// boyuna ve enine konumu (rx, ry) varsayılanda 0 — proje kendi yerleşimini girer.
function platformSea(kind) {
  return kind === 'ship' ? { roll_A: 5.66, roll_T: 10, pitch_A: 2.12, pitch_T: 7, yaw_A: 1, yaw_T: 12, mode: 'dar', kp: 3, h: 15, rx: 0, ry: 0, dof: JSON.parse(JSON.stringify(SEA6.SS4)) }
    : baseDefaults().sea;
}
// Deniz hareketinin serbestlik dereceleri (kipten bağımsız erişim). ang: roll, pitch, yaw (rad); lin: surge, sway, heave
// (m). A: test genliği (dar: eşdeğer sinüs genliği; 6dof: ± tepe), Aeq: eşdeğer sinüs genliği (√2·σ), sigma: RMS,
// fdom: baskın (bant merkezi) frekans, shape: tek taraflı PSD biçimi. 'dar' ifadeleri önceki sürümle aynıdır.
function seaDOF(P) {
  const s = P.wb.sea, six = s.mode === '6dof', kp = s.kp || 3, sw = P.env.seaWidth;
  const ang = [0, 1, 2].map(ax => {
    if (!six) {
      const A = [s.roll_A, s.pitch_A, s.yaw_A][ax], T = [s.roll_T, s.pitch_T, s.yaw_T][ax], fp = 1 / T;
      return { key: SEA_ANG[ax], A, Aeq: A, sigma: A * D2R / Math.SQRT2, fdom: fp, f1: fp * Math.exp(-2 * sw), f2: fp * Math.exp(2 * sw), shape: shapeLogGauss(fp, sw), active: A > 0 };
    }
    const q = s.dof[SEA_ANG[ax]], sig = q.A * D2R / kp;
    return { key: SEA_ANG[ax], A: q.A, Aeq: Math.SQRT2 * sig * R2D, sigma: sig, fdom: Math.sqrt(q.f1 * q.f2), f1: q.f1, f2: q.f2, shape: shapeBand(q.f1, q.f2), active: q.A > 0 };
  });
  const lin = [0, 1, 2].map(ax => {
    if (!six) return { key: SEA_LIN[ax], A: 0, Aeq: 0, sigma: 0, fdom: NaN, f1: NaN, f2: NaN, shape: null, active: false };
    const q = s.dof[SEA_LIN[ax]], sig = q.A / kp;
    return { key: SEA_LIN[ax], A: q.A, Aeq: Math.SQRT2 * sig, sigma: sig, fdom: Math.sqrt(q.f1 * q.f2), f1: q.f1, f2: q.f2, shape: shapeBand(q.f1, q.f2), active: q.A > 0 };
  });
  const r = seaArm(P), rOn = r[0] !== 0 || r[1] !== 0 || r[2] !== 0;
  return { six, kp, h: r[2], r, rOn, ang, lin };
}
// Kaldıraç kolu r = (rx, ry, rz = h), m; sayı olmayan ya da girilmemiş bileşen 0 (önceki sürümlerin parametre kümeleri)
function seaArm(P) { const s = P.wb.sea, v = (x) => (typeof x === 'number' && isFinite(x) ? x : 0); return [v(s.rx), v(s.ry), v(s.h)]; }
// Direktördeki doğrusal ivme RMS'i (m/s², gövde eksenleri): ağırlık merkezi ötelemesi + kaldıraç kolu α × r:
// a_x = θ̈·rz − ψ̈·ry, a_y = ψ̈·rx − φ̈·rz, a_z = φ̈·ry − θ̈·rx. Merkezcil ω×(ω×r) ikinci derecedir (bağıl katkısı ≈ açının
// RMS'i, rad); bütçe kestiriminde ihmal, benzetimde tam. Serbestlik dereceleri bağımsız üretilir: terimler karesel toplanır.
// corrUp: bir eksendeki terimler tam ilişkili ve aynı fazda olsaydı RMS üst sınırı (bilgi; gerçek gemi hareketinde roll–sway–
// yaw ve pitch–heave–surge ortak dalga girdisinden gelir). fa: ivme varyansıyla ağırlıklı RMS frekansı √(Σσ²f²/Σσ²) (B1-08
// satırının frekansı); accInt = √Σ(σ_a/(2πf))² (m/s): g-duyarlı hız hatasının döngü bandında integre olan açısı (B1-10).
function seaAccDirector(P) {
  const D = seaDOF(P), h = D.h, r = D.r, ar = r.map(Math.abs);
  const lin = D.lin.map(q => q.active ? q.sigma * accRatio(q.shape, q.fdom) : 0);
  const angAcc = D.ang.map(q => q.active ? q.sigma * accRatio(q.shape, q.fdom) : 0);
  const T = (k, arm) => ({ src: SEA_ANG[k], arm, v: arm * angAcc[k], f: D.ang[k].fdom });
  const terms = [[T(1, ar[2]), T(2, ar[1])], [T(0, ar[2]), T(2, ar[0])], [T(0, ar[1]), T(1, ar[0])]];   // x: θ̈rz, ψ̈ry · y: φ̈rz, ψ̈rx · z: φ̈ry, θ̈rx
  const lever = terms.map(t => Math.hypot(t[0].v, t[1].v));
  const x = Math.hypot(lin[0], lever[0]), y = Math.hypot(lin[1], lever[1]), z = Math.hypot(lin[2], lever[2]);
  const all = [];
  D.lin.forEach((q, k) => { if (lin[k] > 0) all.push({ src: SEA_LIN[k], ax: k, v: lin[k], f: q.fdom }); });
  terms.forEach((t, k) => t.forEach(q => { if (q.v > 0) all.push({ src: q.src, ax: k, v: q.v, f: q.f }); }));
  const s2 = all.reduce((s, q) => s + q.v * q.v, 0);
  const fa = s2 > 0 ? Math.sqrt(all.reduce((s, q) => s + q.v * q.v * q.f * q.f, 0) / s2) : NaN;
  const accInt = Math.sqrt(all.reduce((s, q) => s + sq(q.v / (TAU * q.f)), 0));
  const up = [0, 1, 2].map(k => lin[k] + terms[k][0].v + terms[k][1].v);
  return { x, y, z, eff: Math.hypot(x, y, z), lin, lever, angAcc, h, r, terms, all, fa, accInt,
    corrUp: { x: up[0], y: up[1], z: up[2], eff: Math.hypot(up[0], up[1], up[2]) } };
}
// Laboratuvarda LOS referans noktasının öteleme talebi (analitik, bilgi; koşudaki q zaman serisinden): ağırlık merkezi
// ötelemesi + (R − I)·r. Birinci derece v × r (v = (φ, θ, ψ)): x ← θ·rz, ψ·ry; y ← φ·rz, ψ·rx; z ← φ·ry, θ·rx. İkinci
// derece: r_k·(1 − cos) terimi −½·r_k·(a² + b²) (a, b: k eksenine dik iki açı) → ortalama kayması ½|r_k|(σa² + σb²) ve
// saçılımı |r_k|·√((σa⁴ + σb⁴)/2). Tepe ≈ k_p·σ + ortalama kayması; q = strok / en büyük tepe.
function seaLabDemand(P) {
  const D = seaDOF(P), r = D.r, s = D.ang.map(q => (q.active ? q.sigma : 0)), L = D.lin.map(q => (q.active ? q.sigma : 0));
  const first = [[r[2] * s[1], r[1] * s[2]], [r[2] * s[0], r[0] * s[2]], [r[1] * s[0], r[0] * s[1]]], perp = [[1, 2], [0, 2], [0, 1]];
  const axes = [0, 1, 2].map(k => {
    const a = s[perp[k][0]], b = s[perp[k][1]], rk = Math.abs(r[k]);
    const sd2 = rk * Math.sqrt((a ** 4 + b ** 4) / 2), m2 = rk * (a * a + b * b) / 2, sigma = Math.hypot(L[k], first[k][0], first[k][1], sd2);
    return { sigma, mean2: m2, peak: D.kp * sigma + m2 };
  });
  const pk = Math.max(axes[0].peak, axes[1].peak, axes[2].peak), st = P.lab.hexStroke;
  return { axes, pk, stroke: st, q: pk > st ? st / pk : 1 };
}
function applyPlatform(P, kind) {
  P.wb.platform = kind === 'ship' ? 'ship' : 'sub';
  P.wb.sea = platformSea(P.wb.platform);
  // v13.5 (kullanıcı kararı): gemide kolimatör açıklığı 200 mm — 12° deniz roll'u stab ON'da göz bebeğini ötelemesiz de 25 mm kaydırır
  // (L_pg·sin θ); 150 mm'nin paylı sınırı 18,2 mm. Denizaltında 150 mm (ötelemesiz 13,6 mm).
  if (P.wb.coll) P.wb.coll.Dc_mm = P.wb.platform === 'ship' ? 200 : 150;
  return P;
}
function defaultParams(kind) {
  const P = { wb: baseDefaults(), dut: dutDefaults(), env: envDefaults(), lab: labDefaults(), ana: anaDefaults() };
  if (kind === 'ship') applyPlatform(P, 'ship');
  return P;
}
const isShip = (P) => !!(P && P.wb && P.wb.platform === 'ship');
// v10 ile özdeş sonuç veren ayarlar (bit düzeyinde regresyon kipi): görüntü rotasyonu kenarda,
// ek bütçe satırları kapalı; v11'de eklenen diğer terimler (mikro-titreşim düşümü, kaldıraç kolu,
// 6-DOF öteleme, FOG ekleri) nötr değerlerine çekilir
function compatV10(P) {
  P.wb.rotRef = 'edge'; P.wb.extRows = false; P.wb.hex.mvCorr = 'kapalı';
  P.wb.sea.mode = 'dar'; P.wb.sea.h = 0; P.wb.sea.rx = 0; P.wb.sea.ry = 0;
  P.wb.viv.lin = false; P.wb.viv.mstar = null;      // v13.3 denizaltı VIV ekleri (mast başı ötelemesi, kütle oranı) nötr
  P.wb.hex.transDyn = 'ideal'; Object.assign(P.wb.coll, { fitTrans: false, vigRule: false, delta_um: 0 });   // v13.5 düzenek kuralları nötr
  Object.assign(P.wb.chain, { noiseModel: 'sample', imu_noise: 0.5, ac_noise: 0.5 });                    // v13.7 öncesi gürültü tanımı
  P.wb.H.epsBasis = 'roll';                                                                                // v13.8 öncesi B1-04 tabanı
  P.wb.H.rwMetric = 'tau';                                                                                 // v13.9 öncesi rastgele yürüyüş metriği
  Object.assign(P.dut.gyro, { lat_ms: 0, sfnl_ppm: 0, lsb_dph: 0, tcBias: 0, tcSF: 0, kg: 0, Top: P.dut.gyro.Tcal != null ? P.dut.gyro.Tcal : 20 });
  if (P.ana.los) P.ana.los.on = false;          // v12 proje gereksinim değerlendirmesi (T1.9, işletme takip koşusu) kapalı
  return P;
}

// ------------------------------------------- rüzgâr kaynaklı girdap kopması --
// EN 1991-1-4:2005 Ek E. Dairesel kesitte temel yanal kuvvet katsayısı c_lat,0(Re) (Şekil E.2): Re ≤ 3·10⁵ → 0,7;
// 3·10⁵–5·10⁵ arasında log(Re)'ye göre doğrusal 0,7 → 0,2; 5·10⁵–5·10⁶ → 0,2 (Rakočević & Popović 2018 örneğinin
// 0,700 / 0,386 / 0,200 değerleriyle doğrulandı). Re > 5·10⁶ (transkritik) doğrulanmadı: muhafazakâr 0,3.
function clat0Circ(Re) {
  if (Re <= 3e5) return 0.7;
  if (Re <= 5e5) return 0.7 - 0.5 * Math.log(Re / 3e5) / Math.log(5 / 3);
  if (Re <= 5e6) return 0.2;
  return 0.3;
}
// Yaklaşım 1 (E.7): y_F,max/b = K·K_W·c_lat / (St²·Sc); Sc = 2·δ_s·m_e/(ρ·b²) (E.4); v_crit = b·f_n/St (E.1.3.1);
// L_j/b Tablo E.4'ten (y_F/b'ye göre, yinelemeli); K_W = ∫_{L_j}Φ / ∫_l Φ, Φ = (z/l)² → 1 − (1 − L_j/l)³ (üst sınır
// uygulanmadı: muhafazakâr); K = 0,13 (konsol). E.1.2(2): v_crit > 1,25·v_m ise girdap kopması incelenmez → c_lat = 0.
// 0,83 < v_crit/v_m ≤ 1,25 aralığında c_lat azaltılmaz (muhafazakâr). Direktör direk tepesindedir: açı θ = κ·y/l
// (κ = 1,5 tepe kütlesi baskın konsol; 1,38 düzgün konsol 1. modu), öteleme ivmesi (2πf_n)²·y.
function windVivCalc(P) {
  const W = P.wb.wviv, b = W.D, St = W.St;
  const vcrit = b * W.fn / St;
  const Re = b * vcrit / W.nu;
  const clat0 = clat0Circ(Re);
  const ratio = vcrit / W.Umax;
  const active = ratio <= 1.25;
  const clat = active ? clat0 : 0;
  const Sc = 2 * W.delta * W.me / (W.rho * b * b);
  const lam = W.L / b;
  let yb = 0, Ljb = 6, Kw = 0, conv = false;
  for (let it = 0; it < 200; it++) {
    Ljb = yb < 0.1 ? 6 : (yb < 0.6 ? 4.8 + 12 * yb : 12);
    const x = Math.min(1, Ljb / lam);
    Kw = 3 * x * (1 - x + x * x / 3);
    const yn = W.K * Kw * clat / (St * St * Sc);
    if (Math.abs(yn - yb) < 1e-13) { yb = yn; conv = true; break; }
    yb = yn;
  }
  const yF = yb * b, thCalc = W.kth * yF / W.L;
  const meas = W.amp_deg != null && isFinite(W.amp_deg);            // ölçülmüş/verilmiş genlik hesabın yerine geçer
  const theta = meas ? W.amp_deg * D2R : thCalc, y = meas ? theta * W.L / W.kth : yF;
  return { vcrit, Re, clat0, clat, ratio, active, Sc, lam, Ljb, Kw, yb, yF, thCalc, theta, y, acc: sq(TAU * W.fn) * y, meas, conv,
    lock: [vcrit * (1 - 0.4 * W.eps0), vcrit * (1 + 0.6 * W.eps0)],
    regime: Re < 3e5 ? 'alt-kritik' : (Re < 5e5 ? 'kritik geçiş' : (Re <= 5e6 ? 'süperkritik' : 'transkritik')) };
}
// Denizaltı mastı: kütle oranının kilitlenmeye etkisi (v13.3). Alt dal frekansı f*_alt = √((m* + 1)/(m* − 0,54))
// (Govardhan & Williamson 2000; f* = f/f_n, f_n durgun suda). Kilitlenme yanıtları "gerçek indirgenmiş hız" U*/f* ile
// çakıştığından (Khalak & Williamson 1999) kilitlenmenin üst ucu f*_alt ile ölçeklenir: K0_üst,etkin = K0_üst·f*_alt
// (ağır mastta f* → 1, kural değişmez). m* ≤ 0,54'te rezonans bütün hızlara uzanır (Govardhan & Williamson 2002):
// üst sınır yok, alt dal yok (yanıt frekansı hızla artar; f_v adayları kapsar). mstar null → eski sabit kural.
function vivMass(P) {
  const v = P.wb.viv, m = v.mstar;
  if (m == null || !isFinite(m)) return { on: false, mstar: null, fstar: 1, k0hi: v.K0_hi, flock: null, inf: false };
  if (m <= 0.54) return { on: true, mstar: m, fstar: Infinity, k0hi: Infinity, flock: null, inf: true };
  const fs = Math.sqrt((m + 1) / (m - 0.54));
  return { on: true, mstar: m, fstar: fs, k0hi: v.K0_hi * fs, flock: fs * v.fn, inf: false };
}
// Denizaltı: işletme hız zarfında (U_min–U_max, kn) K0 = St·U/(D·f_n) aralığı tarama bandıyla (payıyla) kesişiyor mu (v13.3).
// Kesişmiyorsa VIV oluşmaz (gemideki "v_crit > 1,25·U_max → incelenmez" kuralının karşılığı).
// Alt dala erişim (v13.3): üst → alt dal geçişinde yanıt frekansı vakumdaki doğal frekanstan geçer, f ≈ f_n,vak =
// f_n·√((m* + 1)/m*) (Govardhan & Williamson 2000; C_A = 1), ve kilitlenmede yanıt durgun silindirin kopma frekansının
// gerisinde kalır. Bu yüzden alt dal (f*_alt·f_n) ancak zarfın en yüksek hızındaki f_v, taramanın payıyla, f_n,vak'a
// ulaşırsa dwell adayıdır (gerekli koşul; tutucu). Ulaşmıyorsa yanıt f_n ile f_v adayları arasında kalır.
function vivRisk(P) {
  const v = P.wb.viv, M = vivMass(P), kn = 0.514444;
  const Ua = Math.min(v.Umin_kn, v.Umax_kn) * kn, Ub = Math.max(v.Umin_kn, v.Umax_kn) * kn;
  const K0a = v.St * Ua / (v.D * v.fn), K0b = v.St * Ub / (v.D * v.fn);
  const lo = v.K0_lo * (1 - v.margin), hi = M.inf ? Infinity : M.k0hi * (1 + v.margin), risk = K0b >= lo && K0a <= hi;
  const fvMax = K0b * v.fn, fvac = M.on && !M.inf ? v.fn * Math.sqrt((M.mstar + 1) / M.mstar) : null;
  const lock = risk && M.flock != null && fvMax * (1 + v.margin) >= fvac;
  return { K0a, K0b, lo, hi, risk, M, fvMax, fvac, lock };
}
// Etkin VIV kaynağı (platforma göre). A: direk/mast başının açısal genliği (rad, eşdeğer sinüs); roll/pitch: dönme
// vektörünün gövde eksenlerindeki bileşen katsayıları; y: öteleme genliği (m); tx/ty: öteleme yön kosinüsleri.
// Gemi: rüzgârın geldiği yön β (pruvadan); girdap kuvveti akışa dik yatay n = (−sin β, cos β); tepe +y·n'e
// giderken dönme vektörü θ·(z × n) = θ·(−cos β, −sin β, 0).
// Denizaltı (v13.3): ileri harekette akış pruvadan gelir (β = 0 karşılığı): kuvvet ve tepe ötelemesi y (iskele) yönünde,
// dönme vektörü −θ·x (roll = −1); öteleme y = θ·L/κ. Öteleme kapalıysa (lin = false; uyum kipi) eski yalnız açısal biçim.
function vivSpec(P) {
  if (!isShip(P)) {
    const v = P.wb.viv, on = v.on !== false, th = v.amp_deg * D2R, lin = v.lin !== false && v.L > 0, rk = vivRisk(P);
    return { kind: 'hydro', on, present: on && rk.risk, risk: rk, f: v.fn, A: th, roll: lin ? -1 : 1, pitch: 0,
      y: lin ? th * v.L / (v.kth > 0 ? v.kth : 1.5) : 0, tx: 0, ty: lin ? 1 : 0, lin, H: isFinite(v.drr_dB) ? v.drr_dB : -40 };
  }
  const W = P.wb.wviv, w = windVivCalc(P), on = W.on !== false, b = W.beta * D2R;
  return { kind: 'wind', on, present: on && w.theta > 0, f: W.fn, A: w.theta, roll: -Math.cos(b), pitch: -Math.sin(b),
    y: w.y, tx: -Math.sin(b), ty: Math.cos(b), lin: W.lin !== false, H: W.drr_dB, w };
}
// v13.14 (§13): laboratuvar yarım sinüs açı darbesinin genliği (°, ölçeksiz). 'ic' (varsayılan): yalnız iç tepe — θ_max, ω_max·T_p/π,
// α_max·(T_p/π)². 'gercek': ayrıca başta ve sondaki hız sıçramasının (πA/T_p) hexapod dinamiğinden (2. derece, f_bw, ζ 0,7071)
// sonra doğurduğu ivme tepesi κ·ω_b·πA/T_p ≤ α_max, κ = exp(−ζ/√(1−ζ²)·atan(√(1−ζ²)/ζ)) = e^(−π/4).
function pulseAmpDeg(P, Tp) {
  const hx = P.wb.hex; let A = Math.min(hx.theta_max, hx.omega_max * Tp / Math.PI, hx.alpha_max * sq(Tp / Math.PI));
  if (hx.pulseRule === 'gercek') { const z = 0.7071, r = Math.sqrt(1 - z * z), k = Math.exp(-z / r * Math.atan(r / z)); A = Math.min(A, hx.alpha_max * Tp / (k * Math.PI * TAU * hx.fbw)); }
  return A;
}
// Kaynak bu platformda var mı (işletme benzetimi ve bütçe ayrıştırması)
function sourceActive(P, id) {
  if (id === 'viv') return vivSpec(P).present;
  if (id === 'slap') return !isShip(P);          // dalga çarpması yalnız su içindeki mastta
  if (id === 'sea_s' || id === 'sea_w' || id === 'sea_h') { const D = seaDOF(P); return D.six && D.lin[['sea_s', 'sea_w', 'sea_h'].indexOf(id)].active; }
  if (id === 'lever') { const A = seaAccDirector(P); return A.lever[0] > 0 || A.lever[1] > 0 || A.lever[2] > 0; }
  return true;
}
function cloneParams(P) { return JSON.parse(JSON.stringify(P)); }

// ------------------------------------------------------ karmaşık aritmetik ---
function C(re, im) { return { re, im: im || 0 }; }
function cadd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
function csub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
function cmul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cdiv(a, b) { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function cabs(a) { return Math.hypot(a.re, a.im); }
function carg(a) { return Math.atan2(a.im, a.re); }
function cexpj(ph) { return { re: Math.cos(ph), im: Math.sin(ph) }; }

// eksen döngüsünün analitik modeli (sürekli zaman yaklaşık eşdeğeri)
// v13.9: Kfix verilirse kazanç yeniden tasarlanmaz — benzetimde K, dar bant res.f'deyken tasarlanır (derive) ve uyarlanır dar bant
// başka frekansa kaydığında aynı kalır; çalışma noktasının döngüsü loopModel(..., resF, d.loopEl.K) ile birebir verilir
function loopModel(ax, ctl, gyro, cur, J, resF, Kfix) {
  const wi = TAU * ax.fi, wlp = TAU * ctl.flp, zlp = ctl.zlp;
  const wg = TAU * gyro.fbw, wc = TAU * cur.fbw, tau = 1.5 / ctl.fctl;
  const res = ctl.res, wr = TAU * (resF || res.f), gr = Math.pow(10, res.gain_dB / 20) - 1;
  const Cs = (w) => {      // C(jω)/K
    const s = C(0, w);
    const pii = cmul(cadd(C(1), cdiv(C(wi), s)), cadd(C(1), cdiv(C(wi), s)));
    const lp = cdiv(C(wlp * wlp), cadd(cadd(cmul(s, s), C(0, 2 * zlp * wlp * w)), C(wlp * wlp)));
    let r = C(1);
    if (res.on) r = cadd(C(1), cdiv(C(0, gr * 2 * res.zeta * wr * w), cadd(cadd(cmul(s, s), C(0, 2 * res.zeta * wr * w)), C(wr * wr))));
    return cmul(cmul(pii, lp), r);
  };
  const Gs = (w) => cmul(cmul(cdiv(C(1), C(1, w / wg)), cdiv(C(1), C(1, w / wc))), cexpj(-w * tau));
  const Ps = (w) => { const s = C(0, w); return cdiv(s, cadd(cadd(cmul(C(J), cmul(s, s)), C(ax.b * 0, ax.b * w)), C(ax.k))); };
  const wct = TAU * ax.fc;
  // K, sürekli zaman tasarım modelinde f_c'de |L| = 1 olacak biçimde seçilir (örnek DUT'un kazanç tasarımı)
  const L1 = cmul(cmul(Cs(wct), Gs(wct)), Ps(wct));
  const K = Kfix != null && isFinite(Kfix) ? Kfix : 1 / cabs(L1);
  // Yanıtlar uygulanan ayrık kontrolcüyle hesaplanır (öykünme modeli, Nyquist altı): geri Euler PII (I[n] = I[n−1] + T·e[n], T/(1 − z⁻¹)),
  // bilineer AG ve rezonans biquadları, bir periyot hesap gecikmesi ve ZOH; akım ve gyro bantları sürekli
  const fctl = ctl.fctl, Tc = 1 / fctl, lpD = bqLP(ctl.flp, fctl, 1 / (2 * zlp)), bpD = bqBP(resF || res.f, fctl, 1 / (2 * res.zeta));
  const Cd = (w) => {
    const fq = w / TAU, zi = cexpj(-w * Tc), it = cdiv(C(wi * Tc), csub(C(1), zi)), p1 = cadd(C(1), it);
    const l = lpD.resp(fq, fctl); let r = C(1);
    if (res.on) { const b = bpD.resp(fq, fctl); r = cadd(C(1), cmul(C(gr), C(b.re, b.im))); }
    return cmul(cmul(cmul(p1, p1), C(l.re, l.im)), r);
  };
  const Zd = (w) => cmul(cexpj(-w * Tc), w === 0 ? C(1) : cdiv(csub(C(1), cexpj(-w * Tc)), C(0, w * Tc)));   // hesap gecikmesi × ZOH
  // FOG ek gecikmesi (v11): kazanç tasarımı (K) gecikmesiz kalır, gerçek döngü gecikmeyi taşır → faz payı azalır
  const tg = (gyro.lat_ms || 0) * 1e-3;
  const Gd0 = (w) => cmul(cmul(cdiv(C(1), C(1, w / wg)), cdiv(C(1), C(1, w / wc))), Zd(w));
  const Gd = tg > 0 ? (w) => cmul(Gd0(w), cexpj(-w * tg)) : Gd0;
  const L = (w) => cmul(C(K), cmul(cmul(Cd(w), Gd(w)), Ps(w)));
  const den = (w) => { const s = C(0, w); return cadd(cadd(cadd(cmul(C(J), cmul(s, s)), C(0, ax.b * w)), C(ax.k)), cmul(s, cmul(C(K), cmul(Cd(w), Gd(w))))); };
  const drr = (w) => cdiv(C(ax.k, ax.b * w), den(w));                         // θ/θ_taban
  const torque = (w) => cdiv(C(1), den(w));                                    // θ/T_d  (rad/N·m)
  const ZdG = tg > 0 ? (w) => cmul(Zd(w), cexpj(-w * tg)) : Zd;
  const gyroN = (w) => cdiv(cmul(C(-K), cmul(Cd(w), cmul(cdiv(C(1), C(1, w / wc)), ZdG(w)))), den(w)); // θ/n (rad per rad/s)
  // kesim frekansı ve faz payı (ayrık öykünme modelinde |L| = 1 noktası), kazanç payı
  let fcx = ax.fc;
  { let lo = 0.3 * ax.fc, hi = 3 * ax.fc; for (let it = 0; it < 60; it++) { const md = Math.sqrt(lo * hi); if (cabs(L(TAU * md)) > 1) lo = md; else hi = md; } fcx = Math.sqrt(lo * hi); }
  const pm = 180 + carg(L(TAU * fcx)) * R2D;
  // kazanç payı: açılmış fazın −180°'yi kestiği frekansta −|L| (dB)
  let gm = Infinity, gmF = null;
  {
    let prev = null, unw = 0;
    for (let f = fcx; f < 0.49 * ctl.fctl; f *= 1.01) {
      const ph = carg(L(TAU * f)) * R2D;
      if (prev != null) { while (ph + unw - prev > 180) unw -= 360; while (ph + unw - prev < -180) unw += 360; }
      const pu = ph + unw;
      if (prev != null && prev > -180 && pu <= -180) {
        // v13.9: kesişme %1'lik ızgara aralığında ikiye bölmeyle bulunur (önceden ızgaranın kesişmeden sonraki noktası: ±0,1 dB, ±%1)
        let a = f / 1.01, c = f; const phU = (x) => { let q = carg(L(TAU * x)) * R2D + unw; while (q - prev > 180) q -= 360; while (q - prev < -180) q += 360; return q; };
        for (let k = 0; k < 50; k++) { const m = Math.sqrt(a * c); if (phU(m) > -180) a = m; else c = m; }
        gmF = Math.sqrt(a * c); gm = -db(cabs(L(TAU * gmF))); break;
      }
      prev = pu;
    }
  }
  return { K, wi, pm, gm, gmF, fcx, L, drr, torque, gyroN, J };
}

// --------------------------------------------------------- türetilmiş ----------
function derive(P) {
  const wb = P.wb, dut = P.dut;
  const ch = wb.channels.find(c => c.name === wb.refChannel) || wb.channels[0];
  const IFOV = ch.p_um / ch.f_mm * 1e-3;                     // rad (12 µm / 300 mm = 40 µrad)
  const FOVh = 2 * Math.atan(ch.Nh * ch.p_um * 1e-6 / (2 * ch.f_mm * 1e-3)) * R2D;
  const FOVv = 2 * Math.atan(ch.Nv * ch.p_um * 1e-6 / (2 * ch.f_mm * 1e-3)) * R2D;
  const Tint = ch.Tint_ms * 1e-3, fps = ch.fps;
  const req = { wander: wb.k_wander * IFOV, smear: wb.k_smear * IFOV, drift: wb.drift_ifov * IFOV,
                p99: wb.k_conf * wb.k_wander * IFOV, rot: wb.k_roll * IFOV };
  // Görüntü rotasyonu: LOS etrafındaki ψ dönmesi optik eksenden θ açısal uzaklıktaki noktayı ≈ ψ·θ kaydırır. Ölçüt
  // noktası köşe (yarı köşegen) ya da kenar (Nh/2). Roll sınırı ψ_lim = k_roll·IFOV / θ_ref ≈ k_roll / r_px (IFOV'dan
  // bağımsız). Kenar ölçütü FOVh/2'dir (v10 davranışı).
  const rCpx = 0.5 * Math.hypot(ch.Nh, ch.Nv), rEpx = ch.Nh / 2;
  const angC = Math.atan(rCpx * ch.p_um * 1e-6 / (ch.f_mm * 1e-3)), angE = FOVh / 2 * D2R;
  const rotCorner = wb.rotRef !== 'edge';
  const rot = { ref: rotCorner ? 'corner' : 'edge', rPx: rotCorner ? rCpx : rEpx, ang: rotCorner ? angC : angE, rCpx, rEpx, angC, angE,
    lim: wb.k_roll * IFOV / (rotCorner ? angC : angE), limC: wb.k_roll * IFOV / angC, limE: wb.k_roll * IFOV / angE,
    // artık rotasyon ψ (rad) → ölçüt noktasının yer değiştirmesi (rad); kenar kipinde önceki sürümle aynı işlem sırası
    of: (psi) => rotCorner ? psi * angC : psi * FOVh / 2 * D2R };
  const hx = wb.hex;
  const reach = (f) => Math.min(hx.theta_max, hx.omega_max / (TAU * f), hx.alpha_max / sq(TAU * f));  // ° (hexapod erişimi)
  const reachLim = (f) => { const a = hx.theta_max, b = hx.omega_max / (TAU * f), c = hx.alpha_max / sq(TAU * f); const m = Math.min(a, b, c); return m === a ? 'Aralık' : (m === b ? 'Hız' : 'İvme'); };
  const stabOffMax = hx.stabOff_ratio * Math.min(FOVh, FOVv);  // °
  // dünya dönüşü: ENU
  const E = wb.earth, phi = E.lat * D2R;
  const OmL = [0, E.Omega * Math.cos(phi), E.Omega * Math.sin(phi)];
  const al = E.az * D2R, ep = E.el * D2R;
  const los0 = [Math.sin(al) * Math.cos(ep), Math.cos(al) * Math.cos(ep), Math.sin(ep)];
  // kompanzasyon hatası: |Δ| = Ω·δ, LOS'a ve Ω'ya dik (görüntü eksenlerine en kötü yansıyan)
  let dvec = [los0[1] * OmL[2] - los0[2] * OmL[1], los0[2] * OmL[0] - los0[0] * OmL[2], los0[0] * OmL[1] - los0[1] * OmL[0]];
  let dn = Math.hypot(dvec[0], dvec[1], dvec[2]);
  if (dn < 1e-12) { dvec = [0, 0, 1]; dn = 1; }
  const dmag = E.Omega * E.delta_deg * D2R;
  const Delta = dvec.map(v => v / dn * dmag);
  const a0 = dut.geom.a0 * D2R, e0 = (dut.geom.e0 != null ? dut.geom.e0 : E.el) * D2R;
  const beta = Math.atan2(los0[1], los0[0]) - a0;              // pruvanın doğudan açısı (CCW)
  // döngüler
  const elJ = dut.el.J;
  const azJ = dut.az.Ja + dut.az.Jex * sq(Math.sin(e0)) + dut.az.Jez * sq(Math.cos(e0));
  const loopEl = loopModel(dut.el, dut.ctl, dut.gyro, dut.cur, elJ);
  const loopAz = loopModel(dut.az, dut.ctl, dut.gyro, dut.cur, azJ);
  // dünya dönüşünün görüntü eksenlerine izdüşümü (ENU; LOS azimutu α, elevasyonu ε)
  const earthImg = {
    h: E.Omega * Math.abs(Math.sin(phi) * Math.cos(ep) - Math.cos(phi) * Math.cos(al) * Math.sin(ep)),
    v: E.Omega * Math.abs(Math.cos(phi) * Math.sin(al)),
    r: E.Omega * Math.abs(Math.cos(phi) * Math.cos(al) * Math.cos(ep) + Math.sin(phi) * Math.sin(ep)),
  };
  return { ch, IFOV, FOVh, FOVv, Tint, fps, Nh: ch.Nh, Nv: ch.Nv, req, rot, reach, reachLim, stabOffMax,
           OmL, los0, Delta, dmag, a0, e0, beta, azJ, loopEl, loopAz, earthImg };
}

// ---------------------------------------------------------------- kolimatör ve göz bebeği kayması (v13.4, kılavuz §5)
// Kolimatör, odak düzlemindeki iğne deliğini (arkasında siyah cisim) paralel demete çevirir: DUT için hedef sonsuzdadır ve
// öteleme görüntüyü kaydırmaz. Uygunluk ölçütleri: (1) f_c/f_DUT ≥ oran_min (hedef görüntüsü küçük kalır, kolimatörün odak ve
// aberasyon hataları DUT odak düzleminde f_DUT/f_c ile küçülür); (2) iğne deliğinin açısal boyutu d/f_c ve DUT odak
// düzlemindeki görüntüsü d·f_DUT/f_c ≤ p (alt piksel nokta hedef); (3) açıklık: demet, hareket boyunca DUT giriş göz bebeğini
// taşırmalıdır, D_c ≥ k·(D_p + 2e), e = en büyük yanal göz bebeği kayması. Göz bebeği E gimbal merkezi G'nin L_pg önündedir
// (LOS boyunca); pivot O testlerin kurulumunda göz bebeğindedir (T2.5'in ikinci koşusunda h aşağıda). Stab ON'da LOS
// laboratuvarda sabittir, G tabanla döner: E − E0 = (R − I)(G − O); stab OFF'ta yük tabanla döner: E − E0 = (R − I)(E0 − O).
// Hexapod ötelemesi (6-DOF, kaldıraç kolu, VIV) göz bebeğini doğrudan taşır. L_off: pivotun göz bebeğinden kaçıklığı
// (kurulum toleransı), en kötü yönde L_off·sin θ⊥ eklenir (θ⊥: dönmenin LOS'a dik bileşeni). ΔT (siyah cisim kontrastı) bilgi.
function collGeom(P, e0Deg) {
  const d = derive(P), C = P.wb.coll, ch = d.ch, hx = P.wb.hex, wb = P.wb;
  const alC = wb.earth.az * D2R, a0 = d.a0, e0 = e0Deg != null ? e0Deg * D2R : d.e0;      // v13.5: senaryonun LOS yükselişi (T1.4)
  const los0 = [Math.sin(alC) * Math.cos(e0), Math.cos(alC) * Math.cos(e0), Math.sin(e0)];
  const beta = Math.atan2(los0[1], los0[0]) - a0;
  let yr = [-los0[1], los0[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = [yr[0] / n, yr[1] / n, 0]; }
  const zr = [los0[1] * yr[2] - los0[2] * yr[1], los0[2] * yr[0] - los0[0] * yr[2], los0[0] * yr[1] - los0[1] * yr[0]];
  const losB = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
  const Dp = (ch.Dp_mm || 0) * 1e-3, Dc = C.Dc_mm * 1e-3, k = C.ap_margin > 0 ? C.ap_margin : 1;
  const ratio = C.fc_mm / ch.f_mm, phRad = C.pinhole_um * 1e-6 / (C.fc_mm * 1e-3), phImg = C.pinhole_um * ch.f_mm / C.fc_mm;
  return { Dp, Dc, k, eFree: (Dc / k - Dp) / 2, apStatic: k * Dp, apOk: Dc >= k * Dp, ratio, ratioMin: C.ratio_min, ratioOk: ratio >= C.ratio_min,
    phRad, phIFOV: phRad / d.IFOV, phImg_um: phImg, p_um: ch.p_um, phOk: phImg <= ch.p_um, dT: C.dT, fc_mm: C.fc_mm, ch: ch.name,
    Lpg: P.dut.L_pg, Loff: hx.L_off || 0, cb: Math.cos(beta), sb: Math.sin(beta), yr, zr, losB,
    // v13.5: paralaks — 1/R = δ/f_c² (1/m); δ_izin = f_c²·θ_izin/e (e verilince)
    delta_um: C.delta_um || 0, parK: (C.delta_um || 0) * 1e-6 / sq(C.fc_mm * 1e-3), parAllow: (C.par_allow_urad > 0 ? C.par_allow_urad : 1) * 1e-6,
    deltaMax: (e) => (e > 0 ? sq(C.fc_mm * 1e-3) * (C.par_allow_urad > 0 ? C.par_allow_urad : 1) * 1e-6 / e : Infinity),
    eVig: (Dc - Dp) / 2 };
}
// D_p çaplı göz bebeği dairesinin, merkezi s kadar kaymış D_c çaplı demet dairesi içinde kalan alan oranı (iki daire kesişimi)
function pupilOverlap(Dp, Dc, s) {
  const r = Dp / 2, R = Dc / 2;
  if (!(r > 0)) return 1;
  if (s >= r + R) return 0; if (s <= R - r) return 1; if (s <= r - R) return (R * R) / (r * r);
  const a = r * r * Math.acos(clamp((s * s + r * r - R * R) / (2 * s * r), -1, 1)), b = R * R * Math.acos(clamp((s * s + R * R - r * r) / (2 * s * R), -1, 1));
  const c = 0.5 * Math.sqrt(Math.max(0, (-s + r + R) * (s + r - R) * (s - r + R) * (s + r + R)));
  return (a + b - c) / (Math.PI * r * r);
}
// Taban duruşu (φ, θ, ψ; 03_sim.js ile aynı dönüş sırası R = Rz·Ry·Rx), gövde eksenindeki öteleme t (m), stab ve pivot
// derinliği hP (pivot göz bebeğinin hP altında; testlerde 0) için göz bebeğinin LOS'a dik kayması: [yatay (yr), düşey (zr)], m
function pupilShift(G, ph, th, ps, t, stab, hP) {
  const cph = Math.cos(ph), sph = Math.sin(ph), cth = Math.cos(th), sth = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps);
  const R = [[cps * cth, cps * sth * sph - sps * cph, cps * sth * cph + sps * sph], [sps * cth, sps * sth * sph + cps * cph, sps * sth * cph - cps * sph], [-sth, cth * sph, cth * cph]];
  const h = hP || 0, L = G.Lpg, lb = G.losB;
  // stab ON: G − O = −L_pg·l̂ + h·ẑ ; stab OFF: E0 − O = h·ẑ
  const v = stab ? [-L * lb[0], -L * lb[1], -L * lb[2] + h] : [0, 0, h];
  const dE = [t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0];
  for (let i = 0; i < 3; i++) dE[i] += R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2] - v[i];
  const l = [G.cb * dE[0] - G.sb * dE[1], G.sb * dE[0] + G.cb * dE[1], dE[2]];
  let hz = l[0] * G.yr[0] + l[1] * G.yr[1] + l[2] * G.yr[2], vt = l[0] * G.zr[0] + l[1] * G.zr[1] + l[2] * G.zr[2];
  return [hz, vt];
}
// Senaryonun komut profilinden (açısal komut + hexapod ötelemesi; hexapodun ilettiği hareket 1 Hz'in altında komutla aynıdır)
// en büyük yanal göz bebeği kayması, vinyetleme süresi ve en düşük örtüşme. o.fs: değerlendirme hızı (Hz). v13.4: 200 Hz — 50 Hz,
// tam sayı frekanslı test sinüslerinde (T2.5: 1 ve 2 Hz) her çevrimde aynı fazları örneklediği için tepeyi %0,2–0,8 ve vinyetleme
// süresini 1,6 puan eksik veriyordu (bağımsız 1 kHz değerlendirmesiyle karşılaştırma: probe/k6/sweep.js)
function pupilExcursion(P, S, o) {
  o = o || {};
  const G = collGeom(P, S.e0), fs = o.fs || 200, n = Math.max(3, Math.round(S.T * fs)), stab = S.stab !== false, hP = S.pivotH || 0;
  const rng = makeRngFactory(S.seed == null ? 1 : S.seed), cm = makeChannel(S.cmd || [], fs, rng), tr = makeChannel(S.trans || [], fs, rng);
  const a = [0, 0, 0], t = [0, 0, 0], l = G.losB;
  let eMax = 0, hMax = 0, vMax = 0, ovMin = 1, nVig = 0, thPerp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / fs; cm.eval(tt, a); if (tr.comps.length) tr.eval(tt, t);
    const [hz, vt] = pupilShift(G, a[0], a[1], a[2], t, stab, hP);
    const dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2], tp = Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]);
    const e = Math.hypot(hz, vt) + G.Loff * Math.sin(Math.min(tp, Math.PI / 2)), ov = pupilOverlap(G.Dp, G.Dc, e);
    if (e > eMax) eMax = e; if (Math.abs(hz) > hMax) hMax = Math.abs(hz); if (Math.abs(vt) > vMax) vMax = Math.abs(vt);
    if (tp > thPerp) thPerp = tp; if (ov < ovMin) ovMin = ov; if (ov < 1 - 1e-9) nVig++;
  }
  return { eMax, hMax, vMax, thPerp, ovMin, fVig: nVig / n, req: G.k * (G.Dp + 2 * eMax), ok: eMax <= G.eFree + 1e-12, eFree: G.eFree, Dc: G.Dc, Dp: G.Dp, k: G.k, stab, hP };
}
// v13.5: oran → yüzde metni. 1'in (0'ın) hemen altındaki (üstündeki) oranlar %100,0 (%0,0) diye yuvarlanmaz: gerçek vinyetlemede
// test GEÇERSİZ olurken örtüşme '%100.0' yazmasın (gemi D_c = 150 mm: en düşük örtüşme 0,99989, sürenin %0,05'i)
function pctFine(x) {
  const p = 100 * x;
  if (x < 1 - 1e-9 && p >= 99.95) return fmt(Math.min(p, 99.999), p >= 99.995 ? 3 : 2);
  if (x > 1e-9 && p < 0.05) return fmt(Math.max(p, 0.001), p < 0.005 ? 3 : 2);
  return fmt(p, 1);
}
// test sonuçları için ortak metin: kv satırı ve (açıklık yetmiyorsa) not
function pupilTxt(P, X) {
  const mm = (v) => fmt(v * 1e3, 1), vig = X.ovMin < 1 - 1e-9, rule = P.wb.coll.vigRule !== false;
  const kv = [`Göz bebeği ↔ kolimatör demeti (${X.stab ? 'stab ON' : 'stab OFF'})`, `en büyük yanal kayma ${mm(X.eMax)} mm (yatay ${mm(X.hMax)}, düşey ${mm(X.vMax)}; sınır (D_c/k − D_p)/2 = ${mm(X.eFree)} mm) → gerekli D_c ${fmt(X.req * 1e3, 0)} mm (mevcut ${fmt(X.Dc * 1e3, 0)}); en düşük örtüşme %${pctFine(X.ovMin)}, vinyetleme süresi %${pctFine(X.fVig)}`];
  const note = X.ok ? null : `Kolimatör açıklığı bu hareket için yetersiz: göz bebeği en çok ${mm(X.eMax)} mm yana kayıyor (k = ${X.k} paylı sınır ${mm(X.eFree)} mm), gerekli D_c ${fmt(X.req * 1e3, 0)} mm. ` +
    (X.ovMin < 1 ? `Demet göz bebeğini sürenin %${pctFine(X.fVig)}'inde tam kaplamıyor (en düşük örtüşme %${pctFine(X.ovMin)}): sinyal bu oranda düşer, centroid gürültüsü artar ve aberasyonlu optikte nokta görüntüsü kayabilir. ` : 'Göz bebeği demetin içinde kalıyor ama pay tükeniyor. ') +
    (vig && rule ? 'Demet göz bebeğini tam kaplamadığı için test bu düzenekte tanımlandığı gibi yapılamaz: sonuç GEÇERSİZ (benzetim kolimatörü ideal alır). '
      : (vig ? 'Benzetim kolimatörü ideal (vinyetlemesiz) alır: sonuç bu kurulumda ölçülebilir olmayabilir. ' : 'Vinyetleme yok; k paylı sınır aşıldı (bilgi). ')) +
    'Daha büyük açıklıklı kolimatör kullanın ya da yanal ötelemeyi ayrı testte (T2.5) ölçün.';
  return { kv, note };
}
// v13.5 (kullanıcı kararı): gerçek vinyetleme (e > (D_c − D_p)/2, örtüşme < 1) → test GEÇERSİZ (hexapod sınırı kuralıyla aynı);
// yalnız k paylı sınır aşılırsa not. res: test sonucu (mkResult), X: pupilExcursion (en kötü koşu)
function pupilRule(P, res, X) {
  if (!X || P.wb.coll.vigRule === false || !(X.ovMin < 1 - 1e-9)) return res;
  const mm = (v) => fmt(v * 1e3, 1);
  res.status = 'GEÇERSİZ';
  res.measured = `Kolimatör demeti göz bebeğini tam kaplamıyor (kayma ${mm(X.eMax)} mm > (D_c − D_p)/2 = ${mm((X.Dc - X.Dp) / 2)} mm, en düşük örtüşme %${pctFine(X.ovMin)}): sonuç GEÇERSİZ. ` + res.measured;
  return res;
}
// v13.5 (kullanıcı kararı): laboratuvar ötelemesini kolimatör sınırına sığdırma. comps: ölçeklenecek öteleme bileşenleri (deniz
// ötelemesi, 'series', scale alanı); S: tam senaryo (açısal komut + bütün ötelemeler). e ≤ e_free olacak en büyük ortak oran
// q_c ∈ [0, 1] ikiye bölmeyle (16 adım, komut profilinden) bulunur; bileşenlerin scale'i q_c ile çarpılır. Açısal hareket tek başına
// sınırı aşıyorsa q_c = 0 (öteleme kaldırılır) ve kalan aşım test kuralına (pupilRule) bırakılır.
function fitTransToColl(P, S, comps) {
  if (!comps || !comps.length || P.wb.coll.fitTrans === false) return { qc: 1 };
  // Kayma ötelemeye göre doğrusaldır: e(t; f) = |a(t) + f·b(t)| + L_off·sin θ⊥(t); a: açısal hareket + ölçeklenmeyen öteleme (ör. VIV
  // tonu), b: ölçeklenen ötelemenin izdüşümü. Diziler bir kez 100 Hz'de çıkarılır (deniz hareketi < 1,5 Hz: tepe örnekleme hatası
  // < %0,1), oran ikiye bölmeyle e ≤ e_free·(1 − 10⁻³) için bulunur; pupilExcursion'ın 200 Hz değerlendirmesi böylece sınırda kalır.
  const G = collGeom(P, S.e0), fs = 100, n = Math.max(3, Math.round(S.T * fs)), stab = S.stab !== false, hP = S.pivotH || 0, tol = 1e-12, eT = G.eFree * (1 - 1e-3);
  const rng = makeRngFactory(S.seed == null ? 1 : S.seed), cm = makeChannel(S.cmd || [], fs, rng), trA = makeChannel(S.trans || [], fs, rng), trS = makeChannel(comps, fs, rng);
  const ah = new Float64Array(n), av = new Float64Array(n), bh = new Float64Array(n), bv = new Float64Array(n), lt = new Float64Array(n);
  const a = [0, 0, 0], tA = [0, 0, 0], tS = [0, 0, 0], tF = [0, 0, 0], l = G.losB;
  for (let i = 0; i < n; i++) {
    const t = i / fs; cm.eval(t, a); trA.eval(t, tA); trS.eval(t, tS);
    for (let k = 0; k < 3; k++) tF[k] = tA[k] - tS[k];
    const [h0, v0] = pupilShift(G, a[0], a[1], a[2], tF, stab, hP);
    // b: ölçeklenen ötelemenin izdüşümü (dönüşsüz pupilShift ile aynı: Rz(β)·t → yr, zr)
    const lx = G.cb * tS[0] - G.sb * tS[1], ly = G.sb * tS[0] + G.cb * tS[1], lz = tS[2];
    ah[i] = h0; av[i] = v0; bh[i] = lx * G.yr[0] + ly * G.yr[1] + lz * G.yr[2]; bv[i] = lx * G.zr[0] + ly * G.zr[1] + lz * G.zr[2];
    const dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2];
    lt[i] = G.Loff * Math.sin(Math.min(Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]), Math.PI / 2));
  }
  const ex = (f) => { let m = 0; for (let i = 0; i < n; i++) { const e = Math.hypot(ah[i] + f * bh[i], av[i] + f * bv[i]) + lt[i]; if (e > m) m = e; } return m; };
  const s0 = comps.map(c => (c.scale == null ? 1 : c.scale)), set = (f) => comps.forEach((c, i) => { c.scale = s0[i] * f; });
  const e1 = ex(1);
  if (e1 <= eT + tol) return { qc: 1, e1, e: e1 };
  const e0 = ex(0);
  if (e0 > eT + tol) { set(0); return { qc: 0, e1, e: e0 }; }
  let lo = 0, hi = 1;
  for (let it = 0; it < 26; it++) { const m = 0.5 * (lo + hi); if (ex(m) <= eT + tol) lo = m; else hi = m; }
  set(lo);
  return { qc: lo, e1, e: ex(lo) };
}

// ============================================================================
// 03_sim.js — zaman alanı simülatörü
//   taban (hexapod/işletme) → 3B kinematik → 2 eksen gimbal + LuGre + gyro +
//   stabilizasyon döngüsü → esnek/optik modlar → ölçüm zinciri (video, oto-
//   kolimatör, IMU, enkoder) → kayıt
// ============================================================================
const MECH_DEFAULT = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: true, gyroBias: true,
  imbalance: true, gimMode: true, optMode: true, cooler: true, earth: true, compErr: true, gyroG: true };
const MEAS_DEFAULT = { video: true, ac: true, imu: true, air: true, microvib: true, noise: true };
const AX = { roll: 0, pitch: 1, yaw: 2, x: 0, y: 1, z: 2 };

// hexapod komut profilinin θ/ω/α sınırlarına göre kontrolü (1 kHz örnekleme)
// v13.3: senaryodaki hexapod öteleme komutlarının (S.trans) eksen başına en büyük mutlak değeri (m) — strok denetimi
function transPeak(P, S) {
  if (!S.trans || !S.trans.length) return 0;
  const fs = 500, n = Math.max(3, Math.round(S.T * fs)), ch = makeChannel(S.trans, fs, makeRngFactory(S.seed == null ? 1 : S.seed)), v = [0, 0, 0];
  let pk = 0; for (let k = 0; k < n; k++) { v[0] = v[1] = v[2] = 0; ch.eval(k / fs, v); pk = Math.max(pk, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])); }
  return pk;
}
function hexLimitCheck(P, S) {
  const hx = P.wb.hex;
  const fs = 1000, n = Math.max(3, Math.round(S.T * fs));
  const ch = makeChannel(S.cmd, fs, makeRngFactory(S.seed == null ? 1 : S.seed));
  const v = [0, 0, 0];
  const th = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let k = 0; k < n; k++) { ch.eval(k / fs, v); th[0][k] = v[0]; th[1][k] = v[1]; th[2][k] = v[2]; }
  const res = { axes: [], clipFrac: 0, any: false };
  let clipAny = 0;
  const lim = [hx.theta_max * D2R, hx.omega_max * D2R, hx.alpha_max * D2R];
  const over = new Uint8Array(n);
  for (let i = 0; i < 3; i++) {
    let pm = 0, vm = 0, am = 0;
    const x = th[i];
    for (let k = 1; k < n - 1; k++) {
      const p = Math.abs(x[k]), vv = Math.abs((x[k + 1] - x[k - 1]) * fs / 2), aa = Math.abs((x[k + 1] - 2 * x[k] + x[k - 1]) * fs * fs);
      if (p > pm) pm = p; if (vv > vm) vm = vv; if (aa > am) am = aa;
      if (p > lim[0] || vv > lim[1] * 1.0001 || aa > lim[2] * 1.0001) over[k] = 1;
    }
    res.axes.push({ peakDeg: pm * R2D, peakRate: vm * R2D, peakAcc: am * R2D,
      ratio: Math.max(pm / lim[0], vm / lim[1], am / lim[2]) });
  }
  for (let k = 0; k < n; k++) clipAny += over[k];
  res.clipFrac = clipAny / n; res.any = clipAny > 0;
  return res;
}

function simIter(P, S, onProg) {
  const d = derive(P), wb = P.wb, dut = P.dut, lab = P.lab;
  const fs = S.fs || 4000, dt = 1 / fs, N = Math.max(1, Math.round(S.T * fs));
  const fctl = dut.ctl.fctl, m = Math.max(1, Math.round(fs / fctl)), dtc = m * dt;
  const rngf = makeRngFactory(S.seed == null ? 1 : S.seed);
  const mech = Object.assign({}, MECH_DEFAULT, S.mech || {});
  const meas = Object.assign({}, MEAS_DEFAULT, S.meas || {});
  const isLab = S.world !== 'op';
  const stab = S.stab !== false;
  const comp = S.earthComp != null ? !!S.earthComp : !!wb.earth.comp;
  // video kanalı: varsayılan bütçe referans kanalı; S.channel ile başka kanal (ör. WFOV) seçilebilir
  const chS = S.channel ? (wb.channels.find(c => c.name === S.channel) || d.ch) : d.ch;
  const IFOV = chS.p_um / chS.f_mm * 1e-3, IFOVt = IFOV * (1 + dut.optics.scaleErr);
  const Tint = S.Tint != null ? S.Tint : chS.Tint_ms * 1e-3, fps = chS.fps;
  const Nh = chS.Nh, Nv = chS.Nv;

  // ------------------------------------------------------------- geometri ----
  const a0 = dut.geom.a0 * D2R;
  const e0 = (S.e0 != null ? S.e0 : (dut.geom.e0 != null ? dut.geom.e0 : wb.earth.el)) * D2R;
  const alC = wb.earth.az * D2R;
  const los0 = [Math.sin(alC) * Math.cos(e0), Math.cos(alC) * Math.cos(e0), Math.sin(e0)];
  const beta = Math.atan2(los0[1], los0[0]) - a0, cb = Math.cos(beta), sbt = Math.sin(beta);
  // laboratuvara sabit referans görüntü eksenleri: x=LOS0, y=yukarı×x (sol), z=x×y (yukarı)
  let yr = [-los0[1], los0[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = [yr[0] / n, yr[1] / n, 0]; }
  const xr = los0, zr = [xr[1] * yr[2] - xr[2] * yr[1], xr[2] * yr[0] - xr[0] * yr[2], xr[0] * yr[1] - xr[1] * yr[0]];
  // dünya dönüşü (ENU) ve kompanzasyon kestirimi
  const phiL = wb.earth.lat * D2R, Om = mech.earth ? wb.earth.Omega : 0;
  const OmL = [0, Om * Math.cos(phiL), Om * Math.sin(phiL)];
  let OmH = [0, 0, 0];
  if (comp) {
    let dv = [los0[1] * OmL[2] - los0[2] * OmL[1], los0[2] * OmL[0] - los0[0] * OmL[2], los0[0] * OmL[1] - los0[1] * OmL[0]];
    let dn = Math.hypot(dv[0], dv[1], dv[2]); if (dn < 1e-15) { dv = [0, 0, 1]; dn = 1; }
    const dm = mech.compErr ? wb.earth.Omega * wb.earth.delta_deg * D2R * (mech.earth ? 1 : 0) : 0;
    const sgn = S.compErrSign == null ? 1 : S.compErrSign;
    OmH = [OmL[0] + sgn * dv[0] / dn * dm, OmL[1] + sgn * dv[1] / dn * dm, OmL[2] + sgn * dv[2] / dn * dm];
  }

  // -------------------------------------------------------- taban kanalları --
  const hexF = S.hexF || (isLab ? wb.hex.fbw : 1500);
  const vibList = (S.vib || []).slice();
  if (isLab && S.hexActive !== false && meas.microvib && wb.hex.microvib > 0) {
    const mv = lab.microvib;
    for (let i = 0; i < 3; i++) vibList.push({ type: 'noise', axis: i, rms: wb.hex.microvib * URAD, hp: mv.f1, lp: mv.f2,
      peak: { f: mv.fres, Q: mv.Qres, g: mv.gres }, stream: 'microvib' + i });
  }
  const cmdCh = makeChannel(S.cmd, fs, rngf), vibCh = makeChannel(vibList, fs, rngf);
  const trCh = makeChannel(S.trans, fs, rngf), accCh = makeChannel(S.acc, fs, rngf), accmCh = makeChannel(S.accMount, fs, rngf);
  const hasVib = vibCh.comps.length > 0, hasTr = trCh.comps.length > 0, hasAcc = accCh.comps.length > 0, hasAccm = accmCh.comps.length > 0;
  const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ce0 = Math.cos(e0), se0 = Math.sin(e0);
  const hexO = [0, 1, 2].map(() => new Osc2(hexF, 0.7071, dt));
  const vibO = [0, 1, 2].map(() => new Osc2(1500, 0.7071, dt));
  // v13.4: hexapod ötelemesi bacak dinamiğinden geçer (wb.hex.transDyn = 'fbw': açıyla aynı Osc2). 'ideal': 1500 Hz (süzgeçsiz).
  const trF = isLab && S.hexActive !== false && wb.hex.transDyn === 'fbw' ? hexF : 1500;
  const trO = [0, 1, 2].map(() => new Osc2(trF, 0.7071, dt));
  const mnt = dut.mount;
  // direk modu yalnız işletmede: laboratuvarda DUT rijit fikstürde (hexapod / shaker) — açısal yol ayrıca uyarılır
  const useMount = (S.mount != null ? !!S.mount : !isLab) && mnt && mnt.kappa > 0;
  const mO = [0, 1, 2].map(() => new Osc2(mnt.f, mnt.zeta, dt));
  const kRock = (S.rocking || 0) * 1e-3;          // µrad/mm → rad/m
  const accmL = S.accMountLinear === false ? 0 : 1; // 0: yalnız direk modunun açısal çıktısı (açısal uyarıcı ile yeniden üretim)
  const thMax = wb.hex.theta_max * D2R;
  const cmdv = [0, 0, 0], vibv = [0, 0, 0], trv = [0, 0, 0], accv = [0, 0, 0], accmv = [0, 0, 0];

  // -------------------------------------------------------- DUT parametreleri
  const EL = dut.el, AZ = dut.az, G = dut.gyro, CT = dut.ctl;
  const Je = EL.J;
  const be = mech.coupling ? EL.b : 0, ke = mech.coupling ? EL.k : 0;
  const ba = mech.coupling ? AZ.b : 0, ka = mech.coupling ? AZ.k : 0;
  const Ke = d.loopEl.K, Ka = d.loopAz.K, wie = TAU * EL.fi, wia = TAU * AZ.fi;
  const kcur = 1 - Math.exp(-TAU * dut.cur.fbw * dt);
  const kgy = 1 - Math.exp(-TAU * G.fbw * dt);
  // v11 FOG ekleri (nötr değerlerde önceki sürümle bit düzeyinde aynı): sıcaklık farkı ΔT = Top − Tcal → bias (tcBias,
  // °/h/°C) ve ölçek (tcSF, ppm/°C); kübik ölçek doğrusalsızlığı (en küçük kareler doğrusundan en büyük sapma = sfnl·FS:
  // δω = k3·ω³ − 0,6·k3·FS²·ω, k3 = 2,5·sfnl·10⁻⁶/FS²); ölçüm menzili ±FS (doyum); kuantizasyon (LSB, °/h);
  // g-duyarlılığı (giriş eksenindeki özgül kuvvet değişimi, °/h/g); saf gecikme (kontrol hızında, doğrusal ara değer)
  const Tcal = G.Tcal != null ? G.Tcal : 20, dTg = (G.Top != null ? G.Top : Tcal) - Tcal;
  const tcB = (G.tcBias || 0) * dTg, tcS = (G.tcSF || 0) * dTg;
  const sf = 1 + (tcS ? G.sf_ppm + tcS : G.sf_ppm) * 1e-6;
  const FSr = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R;
  const k3 = (G.sfnl_ppm || 0) * 2.5e-6 / (FSr * FSr), bNL = 0.6 * k3 * FSr * FSr, fogNL = k3 !== 0;
  const lsbR = (G.lsb_dph || 0) * DEGPH, kgR = mech.gyroG !== false ? (G.kg || 0) * DEGPH / G0 : 0;
  const nLat = Math.max(0, (G.lat_ms || 0) * 1e-3 * fctl), latN = Math.ceil(nLat) + 2;
  const latY = nLat > 0 ? new Float64Array(latN) : null, latZ = nLat > 0 ? new Float64Array(latN) : null;
  let latI = 0, gSat = 0, gMaxY = 0, gMaxZ = 0;
  const epsE = mech.misalign ? G.epsEl * 1e-3 : 0, epsX = mech.misalign ? G.epsXel * 1e-3 : 0;
  const arwN = mech.gyroNoise ? G.arw * DEGPSQH : 0, nStd = arwN / Math.sqrt(dtc);
  const rG = rngf('gyro');
  const gyroFresh = !!(S.gyroFresh || G.freshCal);      // isteğe bağlı: bias koşudan hemen önce kalibre edilmiş
  const gmY = new BiasProcess(mech.gyroBias ? G.bi * DEGPH : 0, rngf('gmY'), dtc, gyroFresh);
  const gmZ = new BiasProcess(mech.gyroBias ? G.bi * DEGPH : 0, rngf('gmZ'), dtc, gyroFresh);
  const b0r = rngf('bias0');
  // sıcaklık kaynaklı bias değişimi, eksenin sabit bias işaretiyle aynı yönde alınır (en kötü durum)
  const b0Y = mech.gyroBias ? (tcB ? G.bias0 + tcB : G.bias0) * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  const b0Z = mech.gyroBias ? (tcB ? G.bias0 + tcB : G.bias0) * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  // kontrolcü süzgeçleri (kontrol hızında)
  const lpE = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp)), lpA = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp));
  // v13.10 (§9 K1): uyarlanır kipte dar bant kestirilen frekansa ayarlanır: f_kestirim = f_gerçek·(1 + estErr); estErr = 0 ideal (v13.9 davranışı)
  const res = CT.res, rEst = res.adaptive && res.estErr ? 1 + res.estErr : 1, resF = (res.adaptive && S.resF) ? S.resF * rEst : res.f;
  const resOn = !!res.on && stab;
  const gr = Math.pow(10, res.gain_dB / 20) - 1;
  const rbE = bqBP(resF, fctl, 1 / (2 * res.zeta)), rbA = bqBP(resF, fctl, 1 / (2 * res.zeta));
  // adaptif izleme (S.resTrack: t → f, ideal frekans kestirimi) ve çalışma bandı [fmin, fmax]
  const rBand = [res.fmin || 0, res.fmax || 1e9];
  const resTrack = resOn && res.adaptive && typeof S.resTrack === 'function' ? (rEst !== 1 ? (t) => S.resTrack(t) * rEst : S.resTrack) : null;
  const inBand = (f) => f > 0 && f >= rBand[0] && f <= rBand[1];
  let resGt = resOn ? (inBand(resTrack ? (resTrack(0) || resF) : resF) ? 1 : 0) : 0, resG = resGt, nextRT = 0;
  const kResG = 1 - Math.exp(-dtc / 0.3);
  // sürtünme
  const fricE = mech.friction ? { Fc: EL.Fc, Fs: EL.Fs, ws: EL.ws, s0: EL.sigma0 } : null;
  const fricA = mech.friction ? { Fc: AZ.Fc, Fs: AZ.Fs, ws: AZ.ws, s0: AZ.sigma0 } : null;
  // v13.10 (§9 K2): ileri beslemenin gözlemcisi kendi sürtünme modelini kullanır (tesis × oran); oranlar 1 iken tesisle aynı (v13.9)
  const FO = (CT.ff && CT.ff.obs) || {}, oFc = FO.Fc != null ? FO.Fc : 1, oFs = FO.Fs != null ? FO.Fs : 1, oVs = FO.vs != null ? FO.vs : 1, oS0 = FO.s0 != null ? FO.s0 : 1;
  const obsE = fricE ? { Fc: fricE.Fc * oFc, Fs: fricE.Fs * oFs, ws: fricE.ws * oVs, s0: fricE.s0 * oS0 } : null;
  const obsA = fricA ? { Fc: fricA.Fc * oFc, Fs: fricA.Fs * oFs, ws: fricA.ws * oVs, s0: fricA.s0 * oS0 } : null;
  const cogAe = mech.cogging ? EL.cogA : 0, cogAa = mech.cogging ? AZ.cogA : 0;
  // sürtünme ileri besleme: enkoder türevinden bağıl hız kestirimi (AGF) ve Coulomb modeli
  const FF = CT.ff || { on: false }, ffOn = !!FF.on && !!fricE && stab && S.ff !== false;
  const kff = 1 - Math.exp(-TAU * (FF.f_est || 100) * dt);
  let wEf = 0, wAf = 0, sgE = 0, sgA = 0, zhE = 0, zhA = 0;
  const ffLu = FF.mode === 'lugre';
  const ffHys = FF.hys != null ? FF.hys : 0;   // >0: histerezisli işaret (rad/s); 0: tanh(ŵ/w_ff)
  // dengesizlik (kg·m): Ue el montajı (E çerçevesi), Ua az boyunduruğu (A çerçevesi). Az ekseni etrafında dönen
  // kütle ikisinin toplamıdır: U_A = Ua + R_AE(e)·Ue (el montajının payı yükseklik açısıyla döner)
  const Ue = mech.imbalance ? dut.imb.rcg_e.map(v => v * 1e-3 * dut.imb.me) : [0, 0, 0];
  const Ua = mech.imbalance ? dut.imb.rcg_a.map(v => v * 1e-3 * dut.imb.ma) : [0, 0, 0];
  // pivot → gimbal merkezi (gövde çerçevesi): göz bebeğinden L_pg geride + pivot yüksekliği
  const losB0 = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
  const hP = S.pivotH || 0;
  const rpg = [-dut.L_pg * losB0[0], -dut.L_pg * losB0[1], -dut.L_pg * losB0[2] + hP];
  // modlar
  const MD = dut.modes;
  const gimY = new Osc2(MD.gim.f, MD.gim.zeta, dt), gimZ = new Osc2(MD.gim.f, MD.gim.zeta, dt);
  const optY = new Osc2(MD.opt.f, MD.opt.zeta, dt), optZ = new Osc2(MD.opt.f, MD.opt.zeta, dt);
  const gGim = mech.gimMode ? MD.gim.gA : 0, gOpt = mech.optMode ? MD.opt.gAcc : 0;
  const CL = dut.cooler, rC = rngf('cooler');
  const cAmp = mech.cooler && S.cooler !== false ? CL.A * URAD : 0;
  const cph = [0, 1, 2, 3, 4, 5].map(() => TAU * rC.uniform());
  const cw = TAU * CL.f;
  // özyinelemeli (karmaşık dönüş) osilatörler: büyük argümanlı Math.sin maliyetinden kaçınır
  const oscC = new Float64Array(6), oscS = new Float64Array(6), oscCd = new Float64Array(6), oscSd = new Float64Array(6);
  for (let j = 0; j < 6; j++) { const h = (j % 3) + 1; oscC[j] = Math.cos(cph[j]); oscS[j] = Math.sin(cph[j]); oscCd[j] = Math.cos(h * cw * dt); oscSd[j] = Math.sin(h * cw * dt); }
  // türetme (dönüş ekseni etrafında)
  const DR = dut.derot, derotOn = S.derot != null ? !!S.derot : !!DR.on;
  const rotBufN = Math.max(1, Math.round(DR.lat_ms * 1e-3 * fs) + 1), rotBuf = new Float64Array(rotBufN);
  const rD = rngf('derot');
  // ölçüm zinciri
  const CH = wb.chain;
  const airOn = isLab && meas.air && CH.air > 0;
  // hava türbülansı + kolimatör kararlılığı: yavaş renkli gürültü, düşük hızda sentez + kübik ara değer
  const airShape = (f) => 1 / ((1 + sq(f / lab.air.fc)) * (1 + sq(sq(f / (4 * lab.air.fc)))));
  const airE = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airE')) : null;
  const airX = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airX')) : null;
  const airAE = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airAE')) : null;
  const airAX = airOn ? slowNoise(airShape, 64, S.T, CH.air * URAD, rngf('airAX')) : null;
  const floorK = isLab ? (S.floorCoupling != null ? S.floorCoupling : lab.floorCoupling) * URAD : 0;
  // v13.5 (kullanıcı kararı): kolimatör paralaksı. Odak hatası δ (µm; + hedef odak düzleminin ötesinde) hedefi R = f_c²/δ uzaklığına
  // koyar; göz bebeği d kadar yana kayınca görünür hedef açısı −d/R değişir (el: zr, xel: yr). d, pupilShift ile aynı geometri:
  // pivot O, stab ON G − O = −L_pg·l_B + h·z, stab OFF E0 − O = h·z; d_lab = Rz(β)·t + L·v − Rz(β)·v (gerçekleşen duruş ve öteleme).
  const parK = isLab ? (S.collDelta != null ? S.collDelta : (wb.coll && wb.coll.delta_um) || 0) * 1e-6 / sq(wb.coll.fc_mm * 1e-3) : 0;
  const parV = (() => { const h = S.pivotH || 0, L = dut.L_pg, lb = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
    return stab ? [-L * lb[0], -L * lb[1], -L * lb[2] + h] : [0, 0, h]; })();
  let parE = 0, parX = 0;
  const imuLP = [0, 1, 2].map(() => bqLP(CH.imu_bw, fs, 0.7071));
  const imuDel = Math.max(0, (S.syncDt != null ? S.syncDt : CH.dt_sync_ms) * 1e-3 * fs);
  const imuBufN = Math.ceil(imuDel) + 3, imuBuf = [new Float64Array(imuBufN), new Float64Array(imuBufN), new Float64Array(imuBufN)];
  const rM = rngf('meas');
  const noiseOn = meas.noise !== false;
  const cNoise = noiseOn && isLab ? CH.centroid_px : 0;
  const plA = noiseOn && isLab ? CH.pixlock_px * Math.SQRT2 : 0;
  // v13.7 (K4): gürültü yoğunluğu. 'asd': IMU gürültüsü benzetim adımında (yoğunluk imu_asd, örnek başına imu_asd·√(fs/2)) açıya
  // eklenir ve hareketle birlikte IMU süzgecinden geçer (ayrı RNG akışı 'imuN'); otokolimatör kayıt örneği başına ac_asd·√(f_kayıt/2).
  // 'sample' (compatV10): eski tanım. rM akışı her iki kipte aynı tüketilir (video ve otokolimatör gerçekleşmeleri değişmez).
  const nzSample = CH.noiseModel === 'sample', fRecEff = fs / Math.max(1, Math.round(fs / ((S.rec && S.rec.fs) || 1000)));
  const imuN = noiseOn && nzSample ? CH.imu_noise * URAD : 0;
  const imuA = noiseOn && !nzSample ? (CH.imu_asd || 0) * URAD * Math.sqrt(fs / 2) : 0, rI = rngf('imuN');
  const acN = noiseOn ? (nzSample ? CH.ac_noise : (CH.ac_asd || 0) * Math.sqrt(fRecEff / 2)) * URAD : 0;
  const k1 = dut.optics.k1, rRef2 = (Nh * Nh + Nv * Nv) / 4;
  const x0 = dut.video.x0, y0 = dut.video.y0, edge = P.ana.edgeMargin_px;
  const vidLat = (dut.video.lat_ms || 0) * 1e-3;
  const xiPi = Math.PI / IFOVt;    // 2π ξ_N θ, ξ_N = 1/(2·IFOV)

  // ----------------------------------------------------------- kayıt ---------
  const fRec = (S.rec && S.rec.fs) || 1000, recEvery = Math.max(1, Math.round(fs / fRec));
  const chans = (S.rec && S.rec.ch) || ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'imu_r', 'imu_p', 'imu_y'];
  const nRec = Math.floor(N / recEvery) + 1;
  const rec = {}; for (const c of chans) rec[c] = new Float32Array(nRec);
  const RC = (c) => rec[c] || null;
  const r_opt_el = RC('opt_el'), r_opt_xel = RC('opt_xel'), r_mech_el = RC('mech_el'), r_mech_xel = RC('mech_xel');
  const r_rel_el = RC('rel_el'), r_rel_xel = RC('rel_xel'), r_ac_el = RC('ac_el'), r_ac_xel = RC('ac_xel');
  const r_base_r = RC('base_r'), r_base_p = RC('base_p'), r_base_y = RC('base_y');
  const r_imu_r = RC('imu_r'), r_imu_p = RC('imu_p'), r_imu_y = RC('imu_y'), anyImu = !!(r_imu_r || r_imu_p || r_imu_y);
  const r_cmd_r = RC('cmd_r'), r_cmd_p = RC('cmd_p'), r_cmd_y = RC('cmd_y'), r_enc_a = RC('enc_a'), r_enc_e = RC('enc_e');
  const r_gyr_y = RC('gyr_y'), r_gyr_z = RC('gyr_z'), r_rot = RC('rot'), r_rot_res = RC('rot_res');
  const r_tq_e = RC('tq_e'), r_tq_a = RC('tq_a'), r_w_e = RC('w_e'), r_w_a = RC('w_a'), r_acc_e = RC('acc_e'), r_acc_y = RC('acc_y'), r_trk_el = RC('trk_el');
  const r_tr_x = RC('tr_x'), r_tr_y = RC('tr_y'), r_tr_z = RC('tr_z');      // hexapod/shaker ötelemesi (m, gövde ekseninde; yalnız kayıt)
  const r_par_el = RC('par_el'), r_par_xel = RC('par_xel');      // v13.5: kolimatör paralaksının hedef açısı (rad; yalnız kayıt)
  // kayma ayrıştırması (yalnız kayıt; dinamiği değiştirmez): dünya dönüşü artığının (Ω̂ − Ω) ve gyro bias'ının
  // LOS'a görüntü eksenlerinde biriken katkısı
  const r_dre_el = RC('dr_e_el'), r_dre_xel = RC('dr_e_xel'), r_drb_el = RC('dr_b_el'), r_drb_xel = RC('dr_b_xel');
  const doDr = !!(r_dre_el || r_dre_xel || r_drb_el || r_drb_xel);
  const dOm = [OmH[0] - OmL[0], OmH[1] - OmL[1], OmH[2] - OmL[2]];     // kompanzasyon kapalıysa Ω̂ = 0 → −Ω
  let drEe = 0, drEx = 0, drBe = 0, drBx = 0;
  // video
  const doVideo = meas.video !== false;
  const Tf = 1 / fps, tOff = S.frameOffset != null ? S.frameOffset : 0.37e-3;
  const nF = doVideo ? Math.floor((S.T - tOff - Tint) / Tf) + 1 : 0;
  const V = { n: 0, t: new Float64Array(Math.max(nF, 0)), x: new Float64Array(Math.max(nF, 0)), y: new Float64Array(Math.max(nF, 0)),
    valid: new Uint8Array(Math.max(nF, 0)), mEl: new Float64Array(Math.max(nF, 0)), mXel: new Float64Array(Math.max(nF, 0)),
    vEl: new Float64Array(Math.max(nF, 0)), vXel: new Float64Array(Math.max(nF, 0)), oEl: new Float64Array(Math.max(nF, 0)), oXel: new Float64Array(Math.max(nF, 0)),
    fps, Tint, IFOV, x0, y0 };
  let fi = 0, fStart = tOff, fEnd = tOff + Tint, s1e = 0, s2e = 0, s1x = 0, s2x = 0, oce = 0, ose = 0, ocx = 0, osx = 0, fn = 0, stt = 0;
  // ROI yüksek hızlı optik kanal
  const roiF = S.roiFps != null ? S.roiFps : CH.roi_fps;
  const doRoi = isLab && roiF > 0;
  const TroiInt = doRoi ? 0.5 / roiF : 0, nRoi = doRoi ? Math.floor((S.T - TroiInt) * roiF) : 0;
  const RO = { n: 0, t: new Float64Array(nRoi), el: new Float64Array(nRoi), xel: new Float64Array(nRoi), fps: roiF };
  const roiNoise = noiseOn ? CH.centroid_px * Math.sqrt(Tint / Math.max(TroiInt, 1e-9)) * IFOV : 0;
  let ri = 0, rStart = 0, rEnd = TroiInt, rsE = 0, rsX = 0, rn = 0, rst = 0;
  // izleyici (T1.7) ve dönüş (T1.8)
  const TR = S.tracker || null;
  const trQ = []; let trIy = 0, trIz = 0, trWy = 0, trWz = 0, trLost = 0, trLostState = false, trErrE = 0, trErrX = 0;
  const trK = TR ? TAU * TR.bw : 0, trWi = TR ? trK / 4 : 0;
  const SL = S.slew || null;
  // trapez dönüş profili: ivmelen → sabit hız → yavaşla; gidiş t0'da, dönüş t0+Tm+hold'da
  let slA = 0, slW = 0, slTa = 0, slTc = 0, slTm = 0, slT0 = 0, slHold = 0;
  if (SL) {
    const ang = SL.ang * D2R, wmx = SL.rate * D2R; slA = SL.acc * D2R;
    slTc = ang / wmx - wmx / slA; slW = wmx;
    if (slTc < 0) { slTc = 0; slW = Math.sqrt(ang * slA); }
    slTa = slW / slA; slTm = 2 * slTa + slTc; slT0 = SL.t0; slHold = SL.hold;
  }
  const slewProf = (tt) => tt < 0 || tt > slTm ? 0 : (tt < slTa ? slA * tt : (tt < slTa + slTc ? slW : slW - slA * (tt - slTa - slTc)));
  const slewRate = (t) => SL ? slewProf(t - slT0) - slewProf(t - slT0 - slTm - slHold) : 0;

  // ------------------------------------------------------------ durum --------
  let lx = los0[0], ly = los0[1], lz = los0[2];
  let Oey = 0, Oaz = 0;                  // gimbal eylemsiz hızları (rad/s)
  let zE = 0, zA = 0;                    // LuGre kıl durumları
  let TmE = 0, TmA = 0, TappE = 0, TappA = 0, TnextE = 0, TnextA = 0;
  let I1e = 0, I2e = 0, I1a = 0, I2a = 0;
  let gFy = 0, gFz = 0, gMy = 0, gMz = 0;  // gyro süzgeç durumu, ölçülen
  let a = a0, e = e0;
  let satCount = 0, invalid = 0, maxRelE = 0, maxRelA = 0;
  let fEy0 = 0, fEz0 = G0;                // başlangıç (nominal) özgül kuvveti, E çerçevesinde: optik montajın statik sarkması

  // başlangıç: statik dengesizlik torkunu integratöre yükle, gimbal hızlarını eylemsiz kompanzasyona eşitle
  {
    const ca = Math.cos(a0), sa = Math.sin(a0), ce = Math.cos(e0), se = Math.sin(e0);
    // taban seviyede: R_LB = Rz(β); fL = (0,0,g)
    const fB = [0, 0, G0];                       // R_LB^T (0,0,g) = (0,0,g)
    const xEB = [ca * ce, sa * ce, se], yEB = [-sa, ca, 0], zEB = [-ca * se, -sa * se, ce];
    const fE = [xEB[2] * G0, 0, zEB[2] * G0];
    fEy0 = fE[1]; fEz0 = fE[2];
    const TiE = -(Ue[2] * fE[0] - Ue[0] * fE[2]);
    const fA = [ca * fB[0] + sa * fB[1], -sa * fB[0] + ca * fB[1], fB[2]];
    const UAx = Ua[0] + ce * Ue[0] - se * Ue[2], UAy = Ua[1] + Ue[1];
    const TiA = -(UAx * fA[1] - UAy * fA[0]);
    // durağanda e=0 → I1=0, u2 = ωi·I2, T = K·u2 (az: /cos e) = −Ti
    I2e = -TiE / (Ke * wie); I2a = -TiA * (CT.secant ? Math.max(ce, 0.1) : 1) / (Ka * wia);
    TmE = TappE = TnextE = -TiE; TmA = TappA = TnextA = -TiA;
    lpE.reset(wie * I2e); lpA.reset(wia * I2a);
    if (stab) {
      // başlangıçta döngü (g − c) = 0 tutar: y_E hızı c_y, z_E hızı c_z (kompanzasyon kapalıysa sıfır).
      // z_E hızı = −oAx·sin e + Ω_az·cos e  →  Ω_az = (c_z + oAx·sin e)/cos e  (e ≠ 0'da da geçici rejimsiz başlar)
      const cy0 = comp ? yr[0] * OmH[0] + yr[1] * OmH[1] + yr[2] * OmH[2] : 0;
      const cz0 = comp ? zr[0] * OmH[0] + zr[1] * OmH[1] + zr[2] * OmH[2] : 0;
      const oBx0 = cb * OmL[0] + sbt * OmL[1], oBy0 = -sbt * OmL[0] + cb * OmL[1];      // R_LB = Rz(β) → oB = R_LBᵀ·Ω_L
      const oAx0 = ca * oBx0 + sa * oBy0;
      Oey = cy0; Oaz = (cz0 + oAx0 * se) / Math.max(ce, 1e-6);
    }
  }

  const prog = Math.max(1, Math.floor(N / 60));
  let ir = 0, firstInvalidT = null;
  let wCmdY = 0, wCmdZ = 0;
  let L00, L01, L02, L10, L11, L12, L20, L21, L22;

  for (let k = 0; k < N; k++) {
    const t = k * dt;
    // ----------------------------------------------- 1) taban hareketi ------
    cmdCh.eval(t, cmdv);
    if (hasVib) vibCh.eval(t, vibv);
    if (hasTr) trCh.eval(t, trv);
    if (hasAcc) accCh.eval(t, accv);
    if (hasAccm) accmCh.eval(t, accmv);
    for (let i = 0; i < 3; i++) {
      let u = cmdv[i]; if (isLab) { if (u > thMax) u = thMax; else if (u < -thMax) u = -thMax; }   // hexapod strok sınırı (yalnız laboratuvar)
      hexO[i].step(u);
      if (hasVib) vibO[i].step(vibv[i]);
      if (hasTr) trO[i].step(trv[i]);
    }
    if (useMount && (hasTr || hasAccm)) {
      const amx = accmv[0] + trO[0].a, amy = accmv[1] + trO[1].a;
      mO[0].step(mnt.kappa * amy); mO[1].step(mnt.kappa * amx); mO[2].step(mnt.kappa * mnt.yaw * amy);
    }
    // roll ← y ve z ötelemesinden, pitch ← x ötelemesinden sallanma
    const rkR = kRock * (trO[1].x + trO[2].x), rkP = kRock * trO[0].x;
    const rkRv = kRock * (trO[1].v + trO[2].v), rkPv = kRock * trO[0].v;
    const rkRa = kRock * (trO[1].a + trO[2].a), rkPa = kRock * trO[0].a;
    const ph = hexO[0].x + vibO[0].x + mO[0].x + rkR, th = hexO[1].x + vibO[1].x + mO[1].x + rkP, ps = hexO[2].x + vibO[2].x + mO[2].x;
    const phd = hexO[0].v + vibO[0].v + mO[0].v + rkRv, thd = hexO[1].v + vibO[1].v + mO[1].v + rkPv, psd = hexO[2].v + vibO[2].v + mO[2].v;
    const phdd = hexO[0].a + vibO[0].a + mO[0].a + rkRa, thdd = hexO[1].a + vibO[1].a + mO[1].a + rkPa, psdd = hexO[2].a + vibO[2].a + mO[2].a;
    // ----------------------------------------------- 2) kinematik -----------
    const cph = Math.cos(ph), sph = Math.sin(ph), cth = Math.cos(th), sth = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps);
    const p = phd - psd * sth, q = thd * cph + psd * cth * sph, r = -thd * sph + psd * cth * cph;
    const pd = phdd - psdd * sth - psd * thd * cth;
    const qd = thdd * cph - thd * phd * sph + psdd * cth * sph - psd * thd * sth * sph + psd * cth * phd * cph;
    const rd = -thdd * sph - thd * phd * cph + psdd * cth * cph - psd * thd * sth * cph - psd * cth * phd * sph;
    {
      const r00 = cps * cth, r01 = cps * sth * sph - sps * cph, r02 = cps * sth * cph + sps * sph;
      const r10 = sps * cth, r11 = sps * sth * sph + cps * cph, r12 = sps * sth * cph - cps * sph;
      L00 = cb * r00 - sbt * r10; L01 = cb * r01 - sbt * r11; L02 = cb * r02 - sbt * r12;
      L10 = sbt * r00 + cb * r10; L11 = sbt * r01 + cb * r11; L12 = sbt * r02 + cb * r12;
      L20 = -sth; L21 = cth * sph; L22 = cth * cph;
    }
    let ca, sa, ce, se;
    if (stab) {
      const bx = L00 * lx + L10 * ly + L20 * lz, by = L01 * lx + L11 * ly + L21 * lz, bz = L02 * lx + L12 * ly + L22 * lz;
      se = clamp(bz, -1, 1); ce = Math.sqrt(bx * bx + by * by); ca = bx / ce; sa = by / ce;
      e = Math.asin(se); a = Math.atan2(by, bx);
    } else { a = a0; e = e0; ca = ca0; sa = sa0; ce = ce0; se = se0; }
    // E eksenleri (gövdede) ve laboratuvarda
    const xBx = ca * ce, xBy = sa * ce, xBz = se;
    const yBx = -sa, yBy = ca;                          // yBz = 0
    const zBx = -ca * se, zBy = -sa * se, zBz = ce;
    const xLx = L00 * xBx + L01 * xBy + L02 * xBz, xLy = L10 * xBx + L11 * xBy + L12 * xBz, xLz = L20 * xBx + L21 * xBy + L22 * xBz;
    const yLx = L00 * yBx + L01 * yBy, yLy = L10 * yBx + L11 * yBy, yLz = L20 * yBx + L21 * yBy;
    const zLx = L00 * zBx + L01 * zBy + L02 * zBz, zLy = L10 * zBx + L11 * zBy + L12 * zBz, zLz = L20 * zBx + L21 * zBy + L22 * zBz;
    if (!stab) { lx = xLx; ly = xLy; lz = xLz; }
    // taban eylemsiz hızı (gövde) ve A çerçevesi
    const oBx = p + (L00 * OmL[0] + L10 * OmL[1] + L20 * OmL[2]);
    const oBy = q + (L01 * OmL[0] + L11 * OmL[1] + L21 * OmL[2]);
    const oBz = r + (L02 * OmL[0] + L12 * OmL[1] + L22 * OmL[2]);
    const oAx = ca * oBx + sa * oBy, oAy = -sa * oBx + ca * oBy, oAz = oBz;
    let Oez, Oex;
    if (stab) { Oez = -oAx * se + Oaz * ce; Oex = oAx * ce + Oaz * se; }
    else { Oey = oAy; Oaz = oAz; Oez = -oAx * se + oAz * ce; Oex = oAx * ce + oAz * se; }
    const wE = Oey - oAy, wA = Oaz - oAz;             // bağıl hızlar (+y_E, +z_A etrafında)
    const etaE = -(e - e0); let etaA = a - a0; if (etaA > Math.PI) etaA -= TAU; else if (etaA < -Math.PI) etaA += TAU;
    // ----------------------------------------------- 3) LOS hatası ----------
    const lzr = lx * zr[0] + ly * zr[1] + lz * zr[2], lyr = lx * yr[0] + ly * yr[1] + lz * yr[2], lxr = lx * xr[0] + ly * xr[1] + lz * xr[2];
    const elR = Math.asin(clamp(lzr, -1, 1)), xelR = Math.atan2(lyr, lxr);
    const rot = Math.atan2(yLx * zr[0] + yLy * zr[1] + yLz * zr[2], yLx * yr[0] + yLy * yr[1] + yLz * yr[2]);
    // ----------------------------------------------- 4) doğrusal ivme ------
    // gimbal merkezinde (gövde): ötelenme + doğrudan + α×r + ω×(ω×r)
    const wxr0 = q * rpg[2] - r * rpg[1], wxr1 = r * rpg[0] - p * rpg[2], wxr2 = p * rpg[1] - q * rpg[0];
    const aBx = trO[0].a + accv[0] + accmL * accmv[0] + (qd * rpg[2] - rd * rpg[1]) + (q * wxr2 - r * wxr1);
    const aBy = trO[1].a + accv[1] + accmL * accmv[1] + (rd * rpg[0] - pd * rpg[2]) + (r * wxr0 - p * wxr2);
    const aBz = trO[2].a + accv[2] + accmL * accmv[2] + (pd * rpg[1] - qd * rpg[0]) + (p * wxr1 - q * wxr0);
    const aLx = L00 * aBx + L01 * aBy + L02 * aBz, aLy = L10 * aBx + L11 * aBy + L12 * aBz, aLz = L20 * aBx + L21 * aBy + L22 * aBz;
    const fLz = aLz + G0;
    const fEx = xLx * aLx + xLy * aLy + xLz * fLz, fEy = yLx * aLx + yLy * aLy + yLz * fLz, fEz = zLx * aLx + zLy * aLy + zLz * fLz;
    // ----------------------------------------------- 5) gyro + kontrol ------
    if (stab) {
      const gyT = Oey + epsE * Oex, gzT = Oez + epsX * Oex;
      gFy += kgy * (gyT - gFy); gFz += kgy * (gzT - gFz);
      if (k % m === 0) {
        gMy = sf * gFy + b0Y + gmY.step() + nStd * rG.gauss();
        gMz = sf * gFz + b0Z + gmZ.step() + nStd * rG.gauss();
        // FOG ekleri (v11)
        const gaY = Math.abs(gFy), gaZ = Math.abs(gFz); if (gaY > gMaxY) gMaxY = gaY; if (gaZ > gMaxZ) gMaxZ = gaZ;
        if (fogNL) { gMy += k3 * gFy * gFy * gFy - bNL * gFy; gMz += k3 * gFz * gFz * gFz - bNL * gFz; }
        if (kgR !== 0) { gMy += kgR * (fEy - fEy0); gMz += kgR * (fEz - fEz0); }
        if (gMy > FSr) { gMy = FSr; gSat++; } else if (gMy < -FSr) { gMy = -FSr; gSat++; }
        if (gMz > FSr) { gMz = FSr; gSat++; } else if (gMz < -FSr) { gMz = -FSr; gSat++; }
        if (lsbR > 0) { gMy = lsbR * Math.round(gMy / lsbR); gMz = lsbR * Math.round(gMz / lsbR); }
        if (latY) {
          latY[latI % latN] = gMy; latZ[latI % latN] = gMz;
          const lq = latI - nLat, lq0 = Math.floor(lq), lfr = lq - lq0;
          if (lq0 >= 0) { const a0i = lq0 % latN, a1i = (lq0 + 1) % latN; gMy = latY[a0i] + lfr * (latY[a1i] - latY[a0i]); gMz = latZ[a0i] + lfr * (latZ[a1i] - latZ[a0i]); }
          else { gMy = latY[0]; gMz = latZ[0]; }
          latI++;
        }
        let cy = 0, cz = 0;
        if (comp) { cy = yLx * OmH[0] + yLy * OmH[1] + yLz * OmH[2]; cz = zLx * OmH[0] + zLy * OmH[1] + zLz * OmH[2]; }
        // izleyici ve dönüş komutları
        wCmdY = 0; wCmdZ = slewRate(t);
        if (TR) {
          while (trQ.length && trQ[0].t <= t) {
            const q0 = trQ.shift();
            const gateR = TR.gate_px * IFOV;
            const lostNow = !q0.valid || Math.abs(q0.el) > gateR || Math.abs(q0.xel) > gateR;
            if (lostNow && !trLostState) trLost++;
            trLostState = lostNow;
            if (lostNow) continue;                      // kilit yokken son komut korunur
            trErrE = q0.el; trErrX = q0.xel;
            trIy += trErrE * Tf; trIz += trErrX * Tf;
            trWy = trK * (trErrE + trWi * trIy); trWz = -trK * (trErrX + trWi * trIz);
          }
          wCmdY += trWy; wCmdZ += trWz;
        }
        if (resTrack && t >= nextRT) {
          const fr = resTrack(t);
          if (inBand(fr)) { const nb = bqBP(fr, fctl, 1 / (2 * res.zeta)); rbE.setCoef(nb); rbA.setCoef(nb); resGt = 1; } else resGt = 0;
          nextRT = t + 0.05;
        }
        if (resOn) resG += kResG * (resGt - resG);
        // yükseklik: PII + (rezonans) + AGF ; çıkış bir kontrol periyodu gecikmeli
        {
          const err = wCmdY - (gMy - cy);
          I1e += err * dtc; const u1 = err + wie * I1e; I2e += u1 * dtc; let u2 = u1 + wie * I2e;
          if (resOn) u2 += gr * resG * rbE.step(u2);
          const u3 = lpE.step(u2);
          if (ffOn && ffHys > 0) { if (wEf > ffHys) sgE = 1; else if (wEf < -ffHys) sgE = -1; if (wAf > ffHys) sgA = 1; else if (wAf < -ffHys) sgA = -1; }
          let T = Ke * u3 + (ffOn ? (ffLu ? FF.eta * obsE.s0 * zhE : FF.eta * obsE.Fc * (ffHys > 0 ? sgE : Math.tanh(wEf / FF.w_ff))) : 0);
          if (T > EL.Tmax) { T = EL.Tmax; I2e -= u1 * dtc; satCount++; } else if (T < -EL.Tmax) { T = -EL.Tmax; I2e -= u1 * dtc; satCount++; }
          TappE = TnextE; TnextE = T;
        }
        {
          const err = wCmdZ - (gMz - cz);
          I1a += err * dtc; const u1 = err + wia * I1a; I2a += u1 * dtc; let u2 = u1 + wia * I2a;
          if (resOn) u2 += gr * resG * rbA.step(u2);
          const u3 = lpA.step(u2);
          let T = Ka * u3 / (CT.secant ? Math.max(ce, 0.1) : 1) + (ffOn ? (ffLu ? FF.eta * obsA.s0 * zhA : FF.eta * obsA.Fc * (ffHys > 0 ? sgA : Math.tanh(wAf / FF.w_ff))) : 0);
          if (T > AZ.Tmax) { T = AZ.Tmax; I2a -= u1 * dtc; satCount++; } else if (T < -AZ.Tmax) { T = -AZ.Tmax; I2a -= u1 * dtc; satCount++; }
          TappA = TnextA; TnextA = T;
        }
      }
      // akım döngüsü (birinci derece, ZOH girişte tam); adım boyunca etkiyen tork, adım başı ve sonu değerlerinin
      // ortalamasıdır (adım sonu değerini kullanmak Δt/2 faz öncülü üretir; V&V D1)
      const TmE0 = TmE, TmA0 = TmA;
      TmE += kcur * (TappE - TmE); TmA += kcur * (TappA - TmA);
      const TmEa = 0.5 * (TmE + TmE0), TmAa = 0.5 * (TmA + TmA0);
      if (ffOn) {
        wEf += kff * (wE - wEf); wAf += kff * (wA - wAf);
        if (ffLu) {   // LuGre gözlemcisi: kestirilen bağıl hızla kıl modeli (Canudas de Wit ve ark. 1995); v13.10: gözlemcinin kendi parametreleri
          const gE = obsE.Fc + (obsE.Fs - obsE.Fc) * Math.exp(-sq(wEf / obsE.ws));
          if (Math.abs(wEf) > 1e-15) { const zs = (wEf > 0 ? 1 : -1) * gE / obsE.s0; zhE = zs + (zhE - zs) * Math.exp(-obsE.s0 * Math.abs(wEf) * dt / gE); }
          const gA = obsA.Fc + (obsA.Fs - obsA.Fc) * Math.exp(-sq(wAf / obsA.ws));
          if (Math.abs(wAf) > 1e-15) { const zs = (wAf > 0 ? 1 : -1) * gA / obsA.s0; zhA = zs + (zhA - zs) * Math.exp(-obsA.s0 * Math.abs(wAf) * dt / gA); }
        }
      }
      // sürtünme (LuGre, tam z güncellemesi)
      let FfE = 0, FfA = 0;
      if (fricE) {
        const gE = fricE.Fc + (fricE.Fs - fricE.Fc) * Math.exp(-sq(wE / fricE.ws));
        if (Math.abs(wE) > 1e-15) { const zs = (wE > 0 ? 1 : -1) * gE / fricE.s0; zE = zs + (zE - zs) * Math.exp(-fricE.s0 * Math.abs(wE) * dt / gE); }
        FfE = fricE.s0 * zE;
        const gA = fricA.Fc + (fricA.Fs - fricA.Fc) * Math.exp(-sq(wA / fricA.ws));
        if (Math.abs(wA) > 1e-15) { const zs = (wA > 0 ? 1 : -1) * gA / fricA.s0; zA = zs + (zA - zs) * Math.exp(-fricA.s0 * Math.abs(wA) * dt / gA); }
        FfA = fricA.s0 * zA;
      }
      const TiE = -(Ue[2] * fEx - Ue[0] * fEz);
      const fBx = L00 * aLx + L10 * aLy + L20 * fLz, fBy = L01 * aLx + L11 * aLy + L21 * fLz;
      const fAx = ca * fBx + sa * fBy, fAy = -sa * fBx + ca * fBy;
      const UAx = Ua[0] + ce * Ue[0] - se * Ue[2], UAy = Ua[1] + Ue[1];
      const TiA = -(UAx * fAy - UAy * fAx);
      const TtE = TmEa - FfE - be * wE - ke * etaE - cogAe * Math.sin(EL.cogN * etaE) + TiE;
      const TtA = TmAa - FfA - ba * wA - ka * etaA - cogAa * Math.sin(AZ.cogN * etaA) + TiA;
      const Jaz = AZ.Ja + AZ.Jex * se * se + AZ.Jez * ce * ce;
      const Oey0 = Oey, Oaz0 = Oaz;
      Oey += TtE / Je * dt; Oaz += TtA / Jaz * dt;
      // LOS yönünü laboratuvara göre döndür (yalnız y_E, z_E bileşenleri). Adım içinde tork sabit → hız doğrusal:
      // açı, adımın ortalama hızıyla (yamuk) ilerletilir; bu, tork → açı yolunu ZOH için tam yapar (açık Euler'in
      // ωΔt/2 faz öncülünü giderir; V&V D1)
      const OeyM = 0.5 * (Oey + Oey0), OazM = 0.5 * (Oaz + Oaz0);
      const OezN = -oAx * se + OazM * ce;
      const wy = OeyM - (yLx * OmL[0] + yLy * OmL[1] + yLz * OmL[2]);
      const wz = OezN - (zLx * OmL[0] + zLy * OmL[1] + zLz * OmL[2]);
      lx += dt * (wz * yLx - wy * zLx); ly += dt * (wz * yLy - wy * zLy); lz += dt * (wz * yLz - wy * zLz);
      const nl = 1 / Math.sqrt(lx * lx + ly * ly + lz * lz); lx *= nl; ly *= nl; lz *= nl;
      if (doDr) {
        // döngü düşük frekansta (g − c) = 0 tutar: y_E, z_E eksenlerinde LOS'un laboratuvara göre hızına dünya dönüşü
        // artığı (Ω̂ − Ω)·{y_E, z_E} ve gyro bias'ı −b girer (θ/n → −1/s). Görüntü eksenlerine izdüşüm, yukarıdaki
        // LOS güncellemesiyle aynı: δl = Δt·(w_z·y_E − w_y·z_E); el ≈ δl·z_r, xel ≈ δl·y_r
        const ey = yLx * dOm[0] + yLy * dOm[1] + yLz * dOm[2], ez = zLx * dOm[0] + zLy * dOm[1] + zLz * dOm[2];
        const by = -(b0Y + gmY.v), bz = -(b0Z + gmZ.v);
        const yz = yLx * zr[0] + yLy * zr[1] + yLz * zr[2], zz = zLx * zr[0] + zLy * zr[1] + zLz * zr[2];
        const yy = yLx * yr[0] + yLy * yr[1] + yLz * yr[2], zy = zLx * yr[0] + zLy * yr[1] + zLz * yr[2];
        drEe += dt * (ez * yz - ey * zz); drEx += dt * (ez * yy - ey * zy);
        drBe += dt * (bz * yz - by * zz); drBx += dt * (bz * yy - by * zy);
      }
      const ae = Math.abs(wE), aa = Math.abs(wA); if (ae > maxRelE) maxRelE = ae; if (aa > maxRelA) maxRelA = aa;
    }
    // ----------------------------------------------- 6) esnek/optik modlar --
    const aEyB = -sa * pd + ca * qd, aEzB = -ca * se * pd - sa * se * qd + ce * rd;   // taban açısal ivmesi E'de
    gimY.step(gGim * aEyB); gimZ.step(gGim * aEzB);
    // optik alt montaj, yapıya etkiyen özgül kuvvetle (ivme − yerçekimi; eşdeğerlik ilkesi) yüklenir. Nominal statik
    // sarkma boresight'a gömülüdür; yalnız değişimi LOS'a girer (ör. LOS etrafında dönmede yerçekimi yönü döner).
    optY.step(gOpt * (fEy - fEy0)); optZ.step(gOpt * (fEz - fEz0));
    let cEl = 0, cXel = 0;
    if (cAmp > 0) {
      cEl = cAmp * (oscS[0] + CL.h2 * oscS[1] + CL.h3 * oscS[2]);
      cXel = 0.7 * cAmp * (oscS[3] + CL.h2 * oscS[4] + CL.h3 * oscS[5]);
      for (let j = 0; j < 6; j++) { const c0 = oscC[j], s0 = oscS[j]; oscC[j] = c0 * oscCd[j] - s0 * oscSd[j]; oscS[j] = s0 * oscCd[j] + c0 * oscSd[j]; }
      if ((k & 4095) === 0) for (let j = 0; j < 6; j++) { const nn = 1 / Math.hypot(oscC[j], oscS[j]); oscC[j] *= nn; oscS[j] *= nn; }
    }
    const mechEl = elR - gimY.x, mechXel = xelR + gimZ.x;
    const optEl = mechEl + optZ.x + cEl, optXel = mechXel + optY.x + cXel;
    // türetme artığı
    rotBuf[k % rotBufN] = rot;
    const rotDel = rotBuf[(k + 1) % rotBufN];
    const rotRes = derotOn ? rot - (1 + DR.sf) * rotDel : rot;
    // ----------------------------------------------- 7) ölçüm zinciri -------
    if (parK !== 0) {
      const ux = trO[0].x - parV[0], uy = trO[1].x - parV[1], uz = trO[2].x - parV[2];
      const dx = cb * ux - sbt * uy + L00 * parV[0] + L01 * parV[1] + L02 * parV[2];
      const dy = sbt * ux + cb * uy + L10 * parV[0] + L11 * parV[1] + L12 * parV[2];
      const dz = uz + L20 * parV[0] + L21 * parV[1] + L22 * parV[2];
      parE = -parK * (dx * zr[0] + dy * zr[1] + dz * zr[2]); parX = -parK * (dx * yr[0] + dy * yr[1] + dz * yr[2]);
    }
    const tgE = (airE ? airE(t) : 0) + floorK * phdd + parE, tgX = (airX ? airX(t) : 0) + floorK * psdd + parX;
    const relEl = optEl - tgE, relXel = optXel - tgX;
    if (doVideo && fi < nF) {
      if (t >= fStart && t < fEnd) {
        s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel; stt += t;
        oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++;
      } else if (t >= fEnd) {
        if (fn > 0) {
          const me = s1e / fn, mx = s1x / fn;
          V.t[fi] = stt / fn + vidLat; V.mEl[fi] = me; V.mXel[fi] = mx;
          V.vEl[fi] = Math.max(0, s2e / fn - me * me); V.vXel[fi] = Math.max(0, s2x / fn - mx * mx);
          V.oEl[fi] = Math.hypot(oce, ose) / fn; V.oXel[fi] = Math.hypot(ocx, osx) / fn;
          // odak düzlemi: piksel, distorsiyon, piksel kilitlenmesi, centroid gürültüsü
          const xp = mx / IFOVt + x0, yp = me / IFOVt + y0;
          const rr2 = (xp * xp + yp * yp) / rRef2, dd = 1 + k1 * rr2;
          const xd = xp * dd, yd = yp * dd;
          const ok = Math.abs(xd) < Nh / 2 - edge && Math.abs(yd) < Nv / 2 - edge;
          V.valid[fi] = ok ? 1 : 0; if (!ok) { invalid++; if (firstInvalidT == null) firstInvalidT = V.t[fi]; }
          V.x[fi] = xd + plA * Math.sin(TAU * xd) + cNoise * rM.gauss();
          V.y[fi] = yd + plA * Math.sin(TAU * yd) + cNoise * rM.gauss();
          if (TR) trQ.push({ t: fEnd + TR.lat_frames * Tf, valid: ok, el: (V.y[fi] - y0) * IFOV, xel: (V.x[fi] - x0) * IFOV });
          fi++; V.n = fi;
        }
        fStart = tOff + fi * Tf; fEnd = fStart + Tint;
        s1e = s2e = s1x = s2x = oce = ose = ocx = osx = 0; fn = 0; stt = 0;
        if (t >= fStart && t < fEnd) { s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel; stt += t;
          oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++; }
      }
    }
    if (doRoi && ri < nRoi) {
      if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rst += t; rn++; }
      else if (t >= rEnd) {
        if (rn > 0) { RO.t[ri] = rst / rn; RO.el[ri] = rsE / rn + roiNoise * rM.gauss(); RO.xel[ri] = rsX / rn + roiNoise * rM.gauss(); ri++; RO.n = ri; }
        rStart = ri / roiF; rEnd = rStart + TroiInt; rsE = rsX = 0; rn = 0; rst = 0;
        if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rst += t; rn++; }
      }
    }
    // IMU: 500 Hz AGF + senkron gecikmesi
    const bfR = imuLP[0].step(imuA && anyImu ? ph + imuA * rI.gauss() : ph), bfP = imuLP[1].step(imuA && anyImu ? th + imuA * rI.gauss() : th), bfY = imuLP[2].step(imuA && anyImu ? ps + imuA * rI.gauss() : ps);
    imuBuf[0][k % imuBufN] = bfR; imuBuf[1][k % imuBufN] = bfP; imuBuf[2][k % imuBufN] = bfY;
    // ----------------------------------------------- 8) kayıt ---------------
    if (k % recEvery === 0 && ir < nRec) {
      if (r_opt_el) r_opt_el[ir] = optEl;
      if (r_opt_xel) r_opt_xel[ir] = optXel;
      if (r_mech_el) r_mech_el[ir] = mechEl;
      if (r_mech_xel) r_mech_xel[ir] = mechXel;
      if (r_rel_el) r_rel_el[ir] = relEl;
      if (r_rel_xel) r_rel_xel[ir] = relXel;
      if (r_ac_el) r_ac_el[ir] = mechEl + (airAE ? airAE(t) : 0) + acN * rM.gauss();
      if (r_ac_xel) r_ac_xel[ir] = mechXel + (airAX ? airAX(t) : 0) + acN * rM.gauss();
      if (r_base_r) r_base_r[ir] = ph;
      if (r_base_p) r_base_p[ir] = th;
      if (r_base_y) r_base_y[ir] = ps;
      if (anyImu) {
        const kd = k - imuDel, k0 = Math.floor(kd), fr = kd - k0;
        for (let i = 0; i < 3; i++) {
          const b = imuBuf[i], v0 = b[((k0 % imuBufN) + imuBufN) % imuBufN], v1 = b[(((k0 + 1) % imuBufN) + imuBufN) % imuBufN];
          const gI = rM.gauss(), v = (k0 < 0 ? 0 : v0 + (v1 - v0) * fr) + imuN * gI;      // gI 'asd' kipinde kullanılmaz (rM akışı korunur)
          if (i === 0) { if (r_imu_r) r_imu_r[ir] = v; } else if (i === 1) { if (r_imu_p) r_imu_p[ir] = v; } else if (r_imu_y) r_imu_y[ir] = v;
        }
      }
      if (r_cmd_r) r_cmd_r[ir] = cmdv[0];
      if (r_cmd_p) r_cmd_p[ir] = cmdv[1];
      if (r_cmd_y) r_cmd_y[ir] = cmdv[2];
      if (r_enc_a) r_enc_a[ir] = etaA;
      if (r_enc_e) r_enc_e[ir] = e - e0;
      if (r_gyr_y) r_gyr_y[ir] = gMy;
      if (r_gyr_z) r_gyr_z[ir] = gMz;
      if (r_rot) r_rot[ir] = rot;
      if (r_rot_res) r_rot_res[ir] = rotRes;
      if (r_tq_e) r_tq_e[ir] = TmE;
      if (r_tq_a) r_tq_a[ir] = TmA;
      if (r_w_e) r_w_e[ir] = wE;
      if (r_w_a) r_w_a[ir] = wA;
      if (r_acc_e) r_acc_e[ir] = fEx;      // LOS boyunca özgül kuvvet (bilgi)
      if (r_acc_y) r_acc_y[ir] = aBy;
      if (r_trk_el) r_trk_el[ir] = trErrE;
      if (r_tr_x) r_tr_x[ir] = trO[0].x;
      if (r_tr_y) r_tr_y[ir] = trO[1].x;
      if (r_tr_z) r_tr_z[ir] = trO[2].x;
      if (r_par_el) r_par_el[ir] = parE;
      if (r_par_xel) r_par_xel[ir] = parX;
      if (doDr) { if (r_dre_el) r_dre_el[ir] = drEe; if (r_dre_xel) r_dre_xel[ir] = drEx; if (r_drb_el) r_drb_el[ir] = drBe; if (r_drb_xel) r_drb_xel[ir] = drBx; }
      ir++;
    }
    if (onProg && k % prog === 0) onProg(k / N);
  }
  for (const c of Object.keys(rec)) if (rec[c].length !== ir) rec[c] = rec[c].slice(0, ir);    // ayrılmış ama yazılmamış son örnek kalmasın
  if (RUNLOG) RUNLOG.push({ label: S.label, T: S.T, stab, comp, isLab, frames: V.n, invalid, firstInvalidT, tracker: !!TR, slew: !!S.slew });
  return {
    S, meta: { fs, T: S.T, N, fRec, nRec: ir, dt, IFOV, IFOVt, Tint, fps, a0, e0, beta, comp, stab, isLab,
      K: { el: Ke, az: Ka }, earthImg: d.earthImg, OmH, los0 },
    rec, video: V, roi: RO,
    stats: { satCount, invalidFrames: invalid, firstInvalidT, maxRelE, maxRelA, trackLost: trLost, gyroSat: gSat, gyroMax: Math.max(gMaxY, gMaxZ) },
  };
}
let RUNLOG = null;          // runTest süresince her koşunun geçerlilik özeti
function runSim(P, S, onProgress) { return simIter(P, S, onProgress); }

// ============================================================================
// 04_analysis.js — istatistik, sinüs+trend uydurma, Welch PSD/CSD, H1,
// koherans, wander/smear/PDE/MTF, Allan, EIS, gecikme kestirimi
// ============================================================================
function aMean(x, i0, i1) { i0 = i0 || 0; i1 = i1 == null ? x.length : i1; let s = 0; for (let i = i0; i < i1; i++) s += x[i]; return s / Math.max(1, i1 - i0); }
function aRms(x, i0, i1) { i0 = i0 || 0; i1 = i1 == null ? x.length : i1; let s = 0; for (let i = i0; i < i1; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); }
function aStd(x, i0, i1) { i0 = i0 || 0; i1 = i1 == null ? x.length : i1; const m = aMean(x, i0, i1); let s = 0; for (let i = i0; i < i1; i++) s += sq(x[i] - m); return Math.sqrt(s / Math.max(1, i1 - i0)); }
function aPctAbs(x, p) { const a = Float64Array.from(x, v => Math.abs(v)).sort(); if (!a.length) return 0; const k = clamp((a.length - 1) * p / 100, 0, a.length - 1); const i = Math.floor(k), f = k - i; return a[i] + (i + 1 < a.length ? (a[i + 1] - a[i]) * f : 0); }
function aMaxAbs(x) { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; }
// doğrusal trendi (veya ortalamayı) çıkar
function detrend(x, mode) {
  const n = x.length, y = new Float64Array(n);
  if (!n) return y;
  if (mode === 'none') { for (let i = 0; i < n; i++) y[i] = x[i]; return y; }
  if (mode === 'mean' || n < 3) { const m = aMean(x); for (let i = 0; i < n; i++) y[i] = x[i] - m; return y; }
  const tm = (n - 1) / 2; let sx = 0, sxx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const u = i - tm; sxx += u * u; sx += u * x[i]; sy += x[i]; }
  const b = sx / sxx, a = sy / n;
  for (let i = 0; i < n; i++) y[i] = x[i] - a - b * (i - tm);
  return y;
}
// 4×4 (veya n×n) normal denklem çözücü (Gauss eleme, kısmi pivot)
function solveLin(A, b) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
    const d = M[c][c] || 1e-300;
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / d; if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-300));
}
// x(t) = a cos(ωt) + b sin(ωt) + c0 + c1·(t − t̄) en küçük kareler
function sineFit(t, x, f, opt) {
  opt = opt || {};
  const i0 = opt.i0 || 0, i1 = opt.i1 == null ? x.length : opt.i1, trend = opt.trend !== false, valid = opt.valid;
  const w = TAU * f;
  let tb = 0, n = 0;
  for (let i = i0; i < i1; i++) { if (valid && !valid[i]) continue; tb += t[i]; n++; }
  if (n < 6) return null;
  tb /= n;
  const m = trend ? 4 : 3;
  const A = Array.from({ length: m }, () => new Array(m).fill(0)), B = new Array(m).fill(0);
  const row = new Array(m);
  for (let i = i0; i < i1; i++) {
    if (valid && !valid[i]) continue;
    const tt = t[i];
    row[0] = Math.cos(w * tt); row[1] = Math.sin(w * tt); row[2] = 1; if (trend) row[3] = tt - tb;
    for (let r = 0; r < m; r++) { B[r] += row[r] * x[i]; for (let c = 0; c < m; c++) A[r][c] += row[r] * row[c]; }
  }
  const s = solveLin(A, B);
  let rss = 0;
  for (let i = i0; i < i1; i++) {
    if (valid && !valid[i]) continue;
    const tt = t[i]; const yh = s[0] * Math.cos(w * tt) + s[1] * Math.sin(w * tt) + s[2] + (trend ? s[3] * (tt - tb) : 0);
    rss += sq(x[i] - yh);
  }
  const resRms = Math.sqrt(rss / Math.max(1, n - m));
  const Amp = Math.hypot(s[0], s[1]);
  return { A: Amp, ph: Math.atan2(-s[1], s[0]), a: s[0], b: s[1], c0: s[2], c1: trend ? s[3] : 0, resRms, seA: resRms * Math.sqrt(2 / n), n };
}
// Hann (periyodik) pencere
const _winCache = new Map();
function hann(n) { let w = _winCache.get(n); if (w) return w; w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / n); _winCache.set(n, w); return w; }
// Welch PSD / CSD (scipy.signal.welch/csd ile aynı ölçek: density, Hann, %50, segment ortalaması çıkarılır)
function welchCSD(x, y, fs, nseg, opt) {
  opt = opt || {};
  const n = x.length;
  { let ns = 1; while (ns * 2 <= Math.min(nseg, n)) ns *= 2; nseg = Math.max(8, ns); }
  const step = Math.floor(nseg * (1 - (opt.overlap == null ? 0.5 : opt.overlap)));
  const w = hann(nseg); let s2 = 0; for (let i = 0; i < nseg; i++) s2 += w[i] * w[i];
  const nf = nseg / 2 + 1;
  const Pxx = new Float64Array(nf), Pyy = y ? new Float64Array(nf) : null, Cr = y ? new Float64Array(nf) : null, Ci = y ? new Float64Array(nf) : null;
  const xr = new Float64Array(nseg), xi = new Float64Array(nseg), yr = new Float64Array(nseg), yi = new Float64Array(nseg);
  let K = 0;
  for (let st = 0; st + nseg <= n; st += step) {
    let mx = 0, my = 0;
    for (let i = 0; i < nseg; i++) { mx += x[st + i]; if (y) my += y[st + i]; }
    mx /= nseg; my /= nseg;
    for (let i = 0; i < nseg; i++) { xr[i] = (x[st + i] - mx) * w[i]; xi[i] = 0; if (y) { yr[i] = (y[st + i] - my) * w[i]; yi[i] = 0; } }
    fft(xr, xi, false); if (y) fft(yr, yi, false);
    for (let k = 0; k < nf; k++) {
      Pxx[k] += xr[k] * xr[k] + xi[k] * xi[k];
      if (y) { Pyy[k] += yr[k] * yr[k] + yi[k] * yi[k]; Cr[k] += xr[k] * yr[k] + xi[k] * yi[k]; Ci[k] += xr[k] * yi[k] - xi[k] * yr[k]; }
    }
    K++;
  }
  const sc = 1 / (fs * s2 * Math.max(K, 1));
  const f = new Float64Array(nf);
  for (let k = 0; k < nf; k++) {
    const g = (k === 0 || k === nf - 1) ? 1 : 2;
    f[k] = k * fs / nseg; Pxx[k] *= sc * g;
    if (y) { Pyy[k] *= sc * g; Cr[k] *= sc * g; Ci[k] *= sc * g; }
  }
  return { f, Pxx, Pyy, Cr, Ci, nseg, navg: K, df: fs / nseg };
}
function welch(x, fs, nseg, opt) { const r = welchCSD(x, null, fs, nseg, opt); return { f: r.f, P: r.Pxx, navg: r.navg, df: r.df, nseg: r.nseg }; }
// H1 = Sxy/Sxx, γ² = |Sxy|²/(Sxx·Syy)
function tfH1(x, y, fs, nseg) {
  const r = welchCSD(x, y, fs, nseg);
  const n = r.f.length, mag = new Float64Array(n), ph = new Float64Array(n), coh = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const hr = r.Cr[k] / r.Pxx[k], hi = r.Ci[k] / r.Pxx[k];
    mag[k] = Math.hypot(hr, hi); ph[k] = Math.atan2(hi, hr) * R2D;
    coh[k] = (r.Cr[k] * r.Cr[k] + r.Ci[k] * r.Ci[k]) / (r.Pxx[k] * r.Pyy[k] || 1e-300);
  }
  return { f: r.f, mag, ph, coh, navg: r.navg, df: r.df, Pxx: r.Pxx, Pyy: r.Pyy };
}
// PSD üzerinde bant RMS (yamuk) ve kümülatif RMS
function bandRms(f, P, f1, f2) {
  let s = 0;
  for (let k = 1; k < f.length; k++) {
    const a = Math.max(f[k - 1], f1), b = Math.min(f[k], f2);
    if (b <= a) continue;
    const pa = P[k - 1] + (P[k] - P[k - 1]) * (a - f[k - 1]) / (f[k] - f[k - 1]);
    const pb = P[k - 1] + (P[k] - P[k - 1]) * (b - f[k - 1]) / (f[k] - f[k - 1]);
    s += 0.5 * (pa + pb) * (b - a);
  }
  return Math.sqrt(Math.max(s, 0));
}
function cumRms(f, P) { const c = new Float64Array(f.length); let s = 0; for (let k = 1; k < f.length; k++) { s += 0.5 * (P[k] + P[k - 1]) * (f[k] - f[k - 1]); c[k] = Math.sqrt(s); } return c; }
// PSD ağırlıklandırma: wander/smear ayrımı (yamuk kuralı, W_w = sinc²(πfT_int) ağırlığı)
function psdWeighting(f, P, Tint, b1 = 1, b2 = 20) {
  const n = f.length; let tot = 0, wan = 0, sme = 0; const bands = { B1: [0, 0, 0], B2: [0, 0, 0], B3: [0, 0, 0] };
  for (let k = 0; k < n; k++) {
    const df = k === 0 ? (n > 1 ? (f[1] - f[0]) / 2 : 0) : (k === n - 1 ? (f[k] - f[k - 1]) / 2 : (f[k + 1] - f[k - 1]) / 2);
    const c = P[k] * df, w = f[k] <= 0 ? 1 : Ww(f[k], Tint);
    tot += c; wan += c * w; sme += c * (1 - w);
    const bd = f[k] < b1 ? 'B1' : (f[k] <= b2 ? 'B2' : 'B3');
    bands[bd][0] += c; bands[bd][1] += c * w; bands[bd][2] += c * (1 - w);
  }
  const R = (v) => Math.sqrt(Math.max(v, 0));
  return { total: R(tot), wander: R(wan), smear: R(sme), bands: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, { total: R(v[0]), wander: R(v[1]), smear: R(v[2]) }])) };
}
// Allan sapması (örtüşmeli), hız verisi (rad/s)
function allanDev(rate, fs, taus) {
  const n = rate.length, th = new Float64Array(n + 1); const dt = 1 / fs;
  for (let i = 0; i < n; i++) th[i + 1] = th[i] + rate[i] * dt;
  const out = [];
  for (const tau of taus) {
    const mm = Math.round(tau * fs); if (mm < 1 || 2 * mm >= n) continue;
    let s = 0, c = 0;
    for (let k = 0; k + 2 * mm <= n; k++) { const v = th[k + 2 * mm] - 2 * th[k + mm] + th[k]; s += v * v; c++; }
    const T = mm * dt;
    out.push({ tau: T, adev: Math.sqrt(s / (2 * T * T * c)), K: Math.floor(n / mm) });
  }
  return out;
}
// kare dizisinden metrikler: pencereli wander (trend çıkarılmış), P99, PDE, smear, MTF
function frameSeries(V, which, opt) {
  opt = opt || {};
  const n = V.n, el = new Float64Array(n), xel = new Float64Array(n), ok = new Uint8Array(n);
  const IF = opt.IFOVcal || V.IFOV;
  for (let i = 0; i < n; i++) {
    if (which === 'true') { el[i] = V.mEl[i]; xel[i] = V.mXel[i]; ok[i] = 1; }
    else { el[i] = (V.y[i] - V.y0) * IF; xel[i] = (V.x[i] - V.x0) * IF; ok[i] = V.valid[i]; }
  }
  return { t: V.t.subarray(0, n), el, xel, ok };
}
function windowedWander(x, ok, perWin, mode) {
  const n = x.length; let s = 0, c = 0; const res = [];
  for (let st = 0; st < n; st += perWin) {
    // yarım pencereden kısa son parça atılır: kısa pencerede doğrusal trend düşük frekansları fazla siler (RMS'i küçültür)
    const en = Math.min(n, st + perWin); if (st > 0 && en - st < Math.max(10, perWin / 2)) break;
    const seg = []; for (let i = st; i < en; i++) if (!ok || ok[i]) seg.push(x[i]);
    if (seg.length < 5) continue;
    const r = detrend(seg, mode);
    for (const v of r) { s += v * v; c++; res.push(v); }
  }
  return { rms: Math.sqrt(s / Math.max(c, 1)), resid: Float64Array.from(res), n: c };
}
function pdeStats(x, ok, fps, tau, win) {
  const n = x.length, lag = Math.round(tau * fps), w = Math.max(1, Math.round(win * fps));
  const cs = new Float64Array(n + 1), cn = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const g = !ok || ok[i]; cs[i + 1] = cs[i] + (g ? x[i] : 0); cn[i + 1] = cn[i] + (g ? 1 : 0); }
  const d = [];
  for (let i = 0; i + lag + w <= n; i += Math.max(1, Math.floor(w / 2))) {
    const c1 = cn[i + w] - cn[i], c2 = cn[i + lag + w] - cn[i + lag];
    if (c1 < w / 2 || c2 < w / 2) continue;
    d.push((cs[i + lag + w] - cs[i + lag]) / c2 - (cs[i + w] - cs[i]) / c1);
  }
  const a = Float64Array.from(d);
  return { rms: aRms(a), p99: aPctAbs(a, 99), max: aMaxAbs(a), n: a.length };
}
function videoMetrics(V, opt) {
  opt = opt || {};
  const which = opt.which || 'true', fps = V.fps, IF = V.IFOV;
  const Tw = opt.Tw || 120, mode = opt.detrend || 'linear';
  const fsr = frameSeries(V, which, opt);
  const perWin = Math.max(5, Math.round(Tw * fps));
  const wE = windowedWander(fsr.el, fsr.ok, perWin, mode), wX = windowedWander(fsr.xel, fsr.ok, perWin, mode);
  const out = { n: V.n, validFrac: 0, wander: { el: wE.rms, xel: wX.rms, radial: Math.hypot(wE.rms, wX.rms) },
    p99: { el: aPctAbs(wE.resid, 99), xel: aPctAbs(wX.resid, 99) }, p95: { el: aPctAbs(wE.resid, 95), xel: aPctAbs(wX.resid, 95) } };
  let nv = 0; for (let i = 0; i < V.n; i++) nv += which === 'true' ? 1 : V.valid[i]; out.validFrac = nv / Math.max(1, V.n);
  out.pde = { el: pdeStats(fsr.el, fsr.ok, fps, opt.tau || 1, opt.pdeWin || 0.1), xel: pdeStats(fsr.xel, fsr.ok, fps, opt.tau || 1, opt.pdeWin || 0.1) };
  // gerçek kare içi dağılımdan smear ve MTF (yalnız simülasyonda erişilebilir)
  let sve = 0, svx = 0, soe = 0, sox = 0;
  for (let i = 0; i < V.n; i++) { sve += V.vEl[i]; svx += V.vXel[i]; soe += V.oEl[i]; sox += V.oXel[i]; }
  const nn = Math.max(1, V.n);
  out.smear = { el: Math.sqrt(sve / nn), xel: Math.sqrt(svx / nn) };
  out.mtf = { el: soe / nn, xel: sox / nn,
    gaussEl: Math.exp(-sq(Math.PI) * sq(out.smear.el) / (2 * sq(IF))), gaussXel: Math.exp(-sq(Math.PI) * sq(out.smear.xel) / (2 * sq(IF))) };
  out.series = fsr; out.residEl = wE.resid; out.residXel = wX.resid;
  return out;
}
// EIS: birinci derece yol yumuşatma (f_c'de ön-bükmeli bilineer/Tustin ayrıklaştırma: sürekli zaman modelinin — bütçenin
// EIS artık çarpanı — yanıtını Nyquist'e kadar korur), registrasyon verimi η, registrasyon artığı (px RMS)
function applyEIS(x, ok, fps, fc, eta, regRad, rng) {
  const n = x.length, y = new Float64Array(n);
  const wa = fc > 0 ? 2 * fps * Math.tan(Math.PI * fc / fps) : 0, kk = wa / (2 * fps + wa), pp = (2 * fps - wa) / (2 * fps + wa);
  let s = null, xp = 0;
  for (let i = 0; i < n; i++) {
    if (ok && !ok[i]) { y[i] = x[i]; continue; }
    if (s === null) { s = x[i]; xp = x[i]; } else if (fc > 0) { s = pp * s + kk * (x[i] + xp); xp = x[i]; }
    y[i] = x[i] - eta * (x[i] - s) + regRad * (rng ? rng.gauss() : 0);
  }
  return y;
}
// iki seri arasındaki gecikme: y(t) ≈ g·x(t − τ) ; τ ayrık çapraz ilinti + parabolik tepe
function delayEstimate(tx, x, ty, y, fsGrid, maxLag) {
  // her ikisini ortak ızgaraya doğrusal ara değerle taşı
  const t0 = Math.max(tx[0], ty[0]), t1 = Math.min(tx[tx.length - 1], ty[ty.length - 1]);
  const n = Math.floor((t1 - t0) * fsGrid); if (n < 10) return null;
  const interp = (tt, xx, t) => { let lo = 0, hi = tt.length - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (tt[md] <= t) lo = md; else hi = md; } const f = (t - tt[lo]) / ((tt[hi] - tt[lo]) || 1); return xx[lo] + (xx[hi] - xx[lo]) * f; };
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = t0 + i / fsGrid; a[i] = interp(tx, x, t); b[i] = interp(ty, y, t); }
  // taban: medyan (darbe pencerenin küçük bir kısmını kaplarken ortalama, kayan örtüşmede kenar yanlılığı üretir)
  const med = (x) => { const c = Float64Array.from(x).sort(); return c[c.length >> 1]; };
  const ma = med(a), mb = med(b); for (let i = 0; i < n; i++) { a[i] -= ma; b[i] -= mb; }
  const L = Math.round(maxLag * fsGrid); let best = -Infinity, bl = 0; const cc = new Float64Array(2 * L + 1);
  for (let l = -L; l <= L; l++) { let s = 0; for (let i = Math.max(0, -l); i < Math.min(n, n - l); i++) s += a[i] * b[i + l]; cc[l + L] = s; if (s > best) { best = s; bl = l; } }
  let frac = 0; const i0 = bl + L;
  if (i0 > 0 && i0 < 2 * L) { const y0 = cc[i0 - 1], y1 = cc[i0], y2 = cc[i0 + 1]; const den = y0 - 2 * y1 + y2; if (den !== 0) frac = 0.5 * (y0 - y2) / den; }
  return (bl + frac) / fsGrid;   // y, x'e göre bu kadar gecikmeli
}
// Bessel J0 (görüntü MTF'i, tek ton)
function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 8) { const y = x * x;
    const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * (-184.9052456)))));
    const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a / b; }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const p = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const q = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

// ============================================================================
// 05_scen.js — işletme (mast başı) senaryosu, kaynak ayrıştırma, LOS metrikleri
// ============================================================================
const SRC_IDS = ['sea_r', 'sea_p', 'sea_y', 'viv', 'slap', 'lat', 'plat', 'aux', 'hfa', 'hfl', 'sea_s', 'sea_w', 'sea_h'];
const SRC_LABEL = {
  sea_r: 'Deniz: roll', sea_p: 'Deniz: pitch', sea_y: 'Deniz: yaw', sea_s: 'Deniz: surge (x)', sea_w: 'Deniz: sway (y)', sea_h: 'Deniz: heave (z)',
  viv: 'VIV / mast modu', slap: 'Dalga çarpması',
  lat: 'Yanal doğrusal ivme', plat: 'Platform titreşimi (4–33 Hz)', aux: 'Yardımcı makine (50 Hz, yapı yolu)',
  hfa: 'Yüksek frekans açısal titreşim', hfl: 'Yüksek frekans doğrusal titreşim',
};
// seri başına yükselen/inen kosinüs rampası
function rampSeries(d, fsg, rampS) {
  const n = d.length, nr = Math.min(Math.floor(n / 2), Math.round(rampS * fsg));
  for (let i = 0; i < nr; i++) { const g = 0.5 - 0.5 * Math.cos(Math.PI * i / nr); d[i] *= g; d[n - 1 - i] *= g; }
  return d;
}
// deniz profili, açısal eksen. 'dar': eşdeğer sinüs genliği A → σ = A/√2, log-Gauss dar bant;
// '6dof': bant sınırlı (f1–f2), σ = A_tepe/kp. Tam RMS. opt.der: türevler de döner (kaldıraç kolu ivmesi için).
function seaSeries(P, T, rng, axis, opt) {
  opt = opt || {};
  const sea = P.wb.sea, scale = opt.scale == null ? 1 : opt.scale;
  const fsg = 20, n = Math.ceil((T + 2) * fsg), rp = opt.ramp == null ? 10 : opt.ramp;
  if (sea.mode !== '6dof' && !opt.der) {          // önceki sürümle bit düzeyinde aynı yol
    const A = [sea.roll_A, sea.pitch_A, sea.yaw_A][axis] * D2R * scale, Tp = [sea.roll_T, sea.pitch_T, sea.yaw_T][axis];
    const d = synthSeries(shapeLogGauss(1 / Tp, P.env.seaWidth), fsg, n, rng, A / Math.SQRT2);
    return { type: 'series', axis, data: rampSeries(d, fsg, rp), fs: fsg };
  }
  const q = seaDOF(P).ang[axis];
  const tgt = sea.mode !== '6dof' ? [sea.roll_A, sea.pitch_A, sea.yaw_A][axis] * D2R * scale / Math.SQRT2 : q.sigma * scale;
  const s = synthSeriesDer(q.shape, fsg, n, rng, tgt);
  rampSeries(s.x, fsg, rp); rampSeries(s.v, fsg, rp); rampSeries(s.a, fsg, rp);
  return { type: 'series', axis, data: s.x, fs: fsg, der: { v: s.v, a: s.a } };
}
// 6-DOF deniz hareketi: açısal komutlar + doğrusal etki. İşletme ('op'): ağırlık merkezi ötelemesinin ivmesi (tam ikinci
// türev) ve LOS referans noktasındaki kaldıraç kolu ivmesi, rijit cisim ifadesiyle tam: a = ω̇_B × r + ω_B × (ω_B × r),
// r = (rx, ry, rz) gövdede; ω_B Euler hızlarından (ZYX, benzetimin taban kinematiğiyle aynı ifadeler):
//   p = φ̇ − ψ̇·sinθ,  q = θ̇·cosφ + ψ̇·cosθ·sinφ,  r = −θ̇·sinφ + ψ̇·cosθ·cosφ   (ω̇_B bunların zaman türevi)  → 'acc' (gövde)
// v13.1: önceki küçük açı ifadesi (ω ≈ (φ̇, θ̇, ψ̇)) düşey kolda %1–2 doğruydu, ama boyuna kolda pitch ivmesinin roll'la
// izdüşümünü (−r_x·θ̈·φ) kaçırıyor ve y ivmesini SS4'te %19, SS5'te %36 yanlış veriyordu (probe/k3/exactacc.js, V&V S2).
// Kaldıraç kolu yalnız deniz hareketinden üretilir (VIV, darbe ve yüksek frekans açısal titreşim yerel yapı hareketidir).
// Laboratuvar ('lab'): hexapod öteleme yer değiştirmesi = ağırlık merkezi ötelemesi + (R − I)·r, R = Rz(ψ)·Ry(θ)·Rx(φ)
// (benzetimin taban duruşuyla aynı dönüş sırası); stroku aşmayacak ortak q oranıyla ölçeklenir.
function seaMotion(P, T, rngf, o) {
  o = o || {};
  const on = o.on || { sea_r: true, sea_p: true, sea_y: true, sea_s: true, sea_w: true, sea_h: true };
  const D = seaDOF(P), scale = o.scale == null ? 1 : o.scale, ramp = o.ramp;
  const needDer = D.rOn && (on.sea_r || on.sea_p || on.sea_y);
  const ids = ['sea_r', 'sea_p', 'sea_y'], cmd = [], A = [null, null, null];
  for (let ax = 0; ax < 3; ax++) {
    if (!on[ids[ax]]) continue;
    const c = seaSeries(P, T, rngf(ids[ax]), ax, { scale, ramp, der: needDer });
    A[ax] = c; const e = Object.assign({}, c); delete e.der;
    if (o.angCmd !== false) cmd.push(e);          // angCmd: false → yalnız kaldıraç kolu ivmesi (açısal hareketin kendisi uygulanmaz)
  }
  const out = { cmd, acc: [], trans: [], q: 1, demand: 0, h: D.h, r: D.r, six: D.six };
  const lidx = ['sea_s', 'sea_w', 'sea_h'], L = [null, null, null];
  if (D.six) for (let ax = 0; ax < 3; ax++) {
    const q = D.lin[ax]; if (!on[lidx[ax]] || !q.active) continue;
    const fsg = 20, n = Math.ceil((T + 2) * fsg), s = synthSeriesDer(q.shape, fsg, n, rngf(lidx[ax]), q.sigma * scale);
    const rp = ramp == null ? 10 : ramp; rampSeries(s.x, fsg, rp); rampSeries(s.a, fsg, rp);
    L[ax] = s;
  }
  const fsg = 20, nS = Math.ceil((T + 2) * fsg), z = new Float64Array(nS);
  const get = (s, k) => s ? s : z;
  if (o.world === 'lab') {
    // hexapod yer değiştirmesi (m): ağırlık merkezi ötelemesi + kaldıraç kolunun kinematik konumu (R − I)·r
    const phi = A[0] ? A[0].data : z, th = A[1] ? A[1].data : z, ps = A[2] ? A[2].data : z, rx = D.r[0], ry = D.r[1], rz = D.r[2];
    const dx = new Float64Array(nS), dy = new Float64Array(nS), dz = new Float64Array(nS);
    const lx = get(L[0] && L[0].x), ly = get(L[1] && L[1].x), lz = get(L[2] && L[2].x);
    for (let i = 0; i < nS; i++) {
      const cf = Math.cos(phi[i]), sf = Math.sin(phi[i]), ct = Math.cos(th[i]), st = Math.sin(th[i]), cp = Math.cos(ps[i]), sp = Math.sin(ps[i]);
      const r00 = cp * ct, r01 = cp * st * sf - sp * cf, r02 = cp * st * cf + sp * sf;
      const r10 = sp * ct, r11 = sp * st * sf + cp * cf, r12 = sp * st * cf - cp * sf;
      const r20 = -st, r21 = ct * sf, r22 = ct * cf;
      dx[i] = lx[i] + (r00 - 1) * rx + r01 * ry + r02 * rz;
      dy[i] = ly[i] + r10 * rx + (r11 - 1) * ry + r12 * rz;
      dz[i] = lz[i] + r20 * rx + r21 * ry + (r22 - 1) * rz;
    }
    let pk = 0; for (const d of [dx, dy, dz]) for (let i = 0; i < nS; i++) pk = Math.max(pk, Math.abs(d[i]));
    const stroke = P.lab.hexStroke, q = pk > stroke ? stroke / pk : 1;
    out.q = q; out.demand = pk;
    if (pk > 0) [dx, dy, dz].forEach((d, ax) => { let any = false; for (let i = 0; i < nS; i++) if (d[i] !== 0) { any = true; break; } if (any) out.trans.push({ type: 'series', axis: ax, data: d, fs: fsg, scale: q }); });
    return out;
  }
  // işletme: ivme (m/s², gövde)
  const rx = D.r[0], ry = D.r[1], rz = D.r[2], ax = new Float64Array(nS), ay = new Float64Array(nS), az = new Float64Array(nS);
  let any = false;
  if (D.rOn && (A[0] || A[1] || A[2])) {
    const ph = A[0] ? A[0].data : z, pv = A[0] ? A[0].der.v : z, pa = A[0] ? A[0].der.a : z;
    const th = A[1] ? A[1].data : z, qv = A[1] ? A[1].der.v : z, qa = A[1] ? A[1].der.a : z;
    const yv = (A[2] && A[2].der) ? A[2].der.v : z, ya = (A[2] && A[2].der) ? A[2].der.a : z;
    for (let i = 0; i < nS; i++) {
      const cf = Math.cos(ph[i]), sf = Math.sin(ph[i]), ct = Math.cos(th[i]), st = Math.sin(th[i]);
      const p = pv[i] - yv[i] * st, q = qv[i] * cf + yv[i] * ct * sf, w = -qv[i] * sf + yv[i] * ct * cf;
      const pd = pa[i] - ya[i] * st - yv[i] * qv[i] * ct;
      const qd = qa[i] * cf - qv[i] * pv[i] * sf + ya[i] * ct * sf - yv[i] * qv[i] * st * sf + yv[i] * pv[i] * ct * cf;
      const wd = -qa[i] * sf - qv[i] * pv[i] * cf + ya[i] * ct * cf - yv[i] * qv[i] * st * cf - yv[i] * pv[i] * ct * sf;
      const cx = q * rz - w * ry, cy = w * rx - p * rz, cz = p * ry - q * rx;            // ω_B × r
      ax[i] = (qd * rz - wd * ry) + (q * cz - w * cy);
      ay[i] = (wd * rx - pd * rz) + (w * cx - p * cz);
      az[i] = (pd * ry - qd * rx) + (p * cy - q * cx);
    }
    any = true;
  }
  for (let k = 0; k < 3; k++) if (L[k]) { const d = [ax, ay, az][k]; for (let i = 0; i < nS; i++) d[i] += L[k].a[i]; any = true; }
  if (any) [ax, ay, az].forEach((d, k) => { let nz = false; for (let i = 0; i < nS; i++) if (d[i] !== 0) { nz = true; break; } if (nz) out.acc.push({ type: 'series', axis: k, data: d, fs: fsg }); });
  return out;
}
function narrowSeries(fp, bw, rms, T, rng, axis, ramp) {
  const fsg = Math.max(40, Math.ceil(20 * (fp + 3 * bw))), n = Math.ceil((T + 2) * fsg);
  const d = synthSeries(shapeGauss(fp, bw), fsg, n, rng, rms);
  return { type: 'series', axis, data: rampSeries(d, fsg, ramp == null ? 5 : ramp), fs: fsg };
}
// Rüzgâr VIV'i (gemi direği): kilitlenmede f_n'de dar bantlı direk modu. Tek bir birim RMS gerçekleşme u(t) ve
// tam ikinci türevi ü(t) üretilir; açı = A/√2·u (roll, pitch bileşenleri), öteleme ivmesi = y/√2·ü (x, y bileşenleri).
// Açı ve öteleme aynı moddan geldiği için aynı fazdadır (tepe +y·n'e giderken direk o yana yatar).
function windVivComps(P, VS, T, rng, fOverride, ramp) {
  const f = fOverride || VS.f, bw = P.env.viv.bw;
  const fsg = Math.max(100, Math.ceil(40 * (f + 3 * bw))), n = Math.ceil((T + 2) * fsg);
  const s = synthSeriesD2(shapeGauss(f, bw), fsg, n, rng, 1);
  const rp = ramp == null ? 5 : ramp;
  rampSeries(s.x, fsg, rp); rampSeries(s.a, fsg, rp);
  const cmd = [], acc = [], k = 1 / Math.SQRT2;
  if (Math.abs(VS.roll) > 1e-12) cmd.push({ type: 'series', axis: 0, data: s.x, fs: fsg, scale: VS.roll * VS.A * k });
  if (Math.abs(VS.pitch) > 1e-12) cmd.push({ type: 'series', axis: 1, data: s.x, fs: fsg, scale: VS.pitch * VS.A * k });
  if (VS.lin) {
    if (Math.abs(VS.tx) > 1e-12) acc.push({ type: 'series', axis: 0, data: s.a, fs: fsg, scale: VS.tx * VS.y * k });
    if (Math.abs(VS.ty) > 1e-12) acc.push({ type: 'series', axis: 1, data: s.a, fs: fsg, scale: VS.ty * VS.y * k });
  }
  return { cmd, acc, f };
}
// v13.3: deniz ötelemesi (6-DOF ya da kaldıraç kolu) ile VIV tonunun ötelemesi aynı hexapod strokunu paylaşır. Ton için
// yer ayrılır: deniz ötelemesinin ölçeği q' = min(q, (strok − y_ton)/talep). SM.trans bileşenlerinin ölçeği yerinde değişir.
function reserveStroke(P, SM, yV) {
  if (!SM.trans.length || !(yV > 0) || !(SM.demand > 0)) return SM.q;
  const q2 = Math.max(0, Math.min(SM.q, (P.lab.hexStroke - yV) / SM.demand));
  for (const c of SM.trans) c.scale = q2;
  return q2;
}
// Laboratuvarda rüzgâr VIV tonu (T2.2/T2.3/T4.2 ve düzenek): hexapod açısal sinüs (roll/pitch) + öteleme sinüsü (x/y,
// m) aynı fazda. Genlik hexapod erişimiyle sınırlanırsa öteleme de aynı oranda ölçeklenir (mod biçimi korunur).
function windTone(P, VS, f, t0, t1, ramp, scale) {
  // ölçek: istenen × sc; hexapod açısal erişimi (θ/ω/α) ve öteleme stroku aşılmayacak biçimde ortak oranla küçültülür
  const sc = scale == null ? 1 : scale, qa = VS.A > 0 ? Math.min(sc, derive(P).reach(f) * D2R / VS.A) : 0;
  const q = (VS.lin && VS.y > 0) ? Math.min(qa, P.lab.hexStroke / VS.y) : qa, Ar = VS.A * q, yA = VS.y * q;
  const cmd = [], trans = [], base = { type: 'sine', f, t0, ramp };
  if (t1 != null) base.t1 = t1;
  if (Math.abs(VS.roll) > 1e-12) cmd.push(Object.assign({}, base, { axis: 0, A: VS.roll * Ar }));
  if (Math.abs(VS.pitch) > 1e-12) cmd.push(Object.assign({}, base, { axis: 1, A: VS.pitch * Ar }));
  if (VS.lin) {
    if (Math.abs(VS.tx) > 1e-12) trans.push(Object.assign({}, base, { axis: 0, A: VS.tx * yA }));
    if (Math.abs(VS.ty) > 1e-12) trans.push(Object.assign({}, base, { axis: 1, A: VS.ty * yA }));
  }
  return { cmd, trans, A: Ar, y: yA, acc: sq(TAU * f) * yA, limited: q < sc * (1 - 1e-9) };
}
function slapEvents(P, T, rng, t0) {
  const sl = P.env.slap, ev = [];
  let t = t0 || 10;
  while (true) {
    t += -Math.log(rng.uniform()) / sl.rate;
    if (t > T - 1) break;
    const Tp = sl.Tmin + (sl.Tmax - sl.Tmin) * rng.uniform();
    const A = sl.A * URAD * Math.sqrt(-2 * Math.log(rng.uniform())) / Math.SQRT2 * (rng.uniform() < 0.5 ? -1 : 1);
    ev.push({ t0: t, Tp, A });
  }
  return ev;
}
// İşletme senaryosu: o.src {id:bool}, o.mech {..}
function opScenario(P, o) {
  o = o || {};
  const T = o.T || 600, seed = ((o.seed == null ? 11 : o.seed) + 7919 * ((P.ana && P.ana.seedOffset) || 0)) >>> 0, rngf = makeRngFactory(seed);
  const on = Object.assign(Object.fromEntries(SRC_IDS.map(k => [k, true])), o.src || {});
  const env = P.env, wb = P.wb;
  const cmd = [], vib = [], acc = [], accMount = [];
  const seaScale = o.seaScale == null ? 1 : o.seaScale;
  // deniz: açısal komutlar; 6-DOF kipinde ağırlık merkezi ötelemesi ve kaldıraç kolu (r ≠ 0) ivmesi 'acc' kanalına
  const SM = seaMotion(P, T, rngf, { scale: seaScale, on, world: 'op', angCmd: o.seaAngCmd });
  cmd.push(...SM.cmd); acc.push(...SM.acc);
  const VS = vivSpec(P);
  if (on.viv && VS.present) {
    if (VS.kind === 'hydro' && !VS.lin) cmd.push(narrowSeries(o.vivF || wb.viv.fn, env.viv.bw, wb.viv.amp_deg * D2R / Math.SQRT2, T, rngf('viv'), 0, 5));   // denizaltı, yalnız açısal (uyum kipi)
    else { const wv = windVivComps(P, VS, T, rngf('viv'), o.vivF, 5); cmd.push(...wv.cmd); acc.push(...wv.acc); }   // gemi: rüzgâr VIV'i; v13.3 denizaltı: açı + mast başı ötelemesi ivmesi
  }
  if (on.slap && sourceActive(P, 'slap')) cmd.push({ type: 'halfsine', axis: 0, events: slapEvents(P, T, rngf('slap'), 10) });   // gemi direğinde dalga çarpması yok
  if (on.lat) acc.push(narrowSeries(env.lat.f, env.lat.bw, env.lat.a_rms, T, rngf('lat'), 1, 5));
  if (on.plat) for (let i = 0; i < 3; i++) accMount.push({ type: 'noise', axis: i, rms: env.plat.a_rms, hp: env.plat.f1, hp2: env.plat.f1, lp: env.plat.f2, lp2: env.plat.f2, stream: 'plat' + i, t0: 0, ramp: 5 });
  // yardımcı makine: kafada yapı yolu doğrusal titreşim tonu (optik alt montaj + dengesizlik üzerinden LOS'a)
  if (on.aux) { const r = rngf('aux'); for (let i = 0; i < 3; i++) acc.push({ type: 'sine', axis: i, A: env.aux.a, f: env.aux.f, ph: TAU * r.uniform(), t0: 0, ramp: 2 }); }
  if (on.hfa) for (let i = 0; i < 3; i++) vib.push({ type: 'noise', axis: i, rms: env.hf.ang_rms * URAD, hp: env.hf.f1, lp: env.hf.f2, stream: 'hfa' + i, ramp: 2 });
  if (on.hfl) for (let i = 0; i < 3; i++) acc.push({ type: 'noise', axis: i, rms: env.hf.acc_rms, hp: env.hf.f1, lp: env.hf.f2, stream: 'hfl' + i, ramp: 2 });
  const mech = o.mech ? Object.assign(Object.fromEntries(Object.keys(MECH_DEFAULT).map(k => [k, false])), o.mech) : Object.assign({}, MECH_DEFAULT);
  if (o.mechAll) Object.assign(mech, MECH_DEFAULT);
  return {
    label: o.label || 'İşletme', T, fs: o.fs || 4000, world: 'op', stab: true, seed, hexF: 1500,
    cmd, vib, acc, accMount, mech, earthComp: o.earthComp != null ? o.earthComp : true, derot: o.derot,
    meas: { video: true, ac: false, imu: false, air: false, microvib: false, noise: false },
    rec: { fs: 1000, ch: o.ch || ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'rot', 'rot_res', 'base_r', 'base_p', 'base_y'] },
    vivF: o.vivF, resF: o.vivF || (VS.kind === 'wind' ? VS.f : wb.viv.fn),
  };
}
// kayıttan ve karelerden LOS metrikleri (ilk 'skip' saniye atılır)
function sliceVideo(V, t0) {
  let i0 = 0; while (i0 < V.n && V.t[i0] < t0) i0++;
  const sub = (a) => a.subarray(i0, V.n);
  return { n: V.n - i0, t: sub(V.t), x: sub(V.x), y: sub(V.y), valid: sub(V.valid), mEl: sub(V.mEl), mXel: sub(V.mXel),
    vEl: sub(V.vEl), vXel: sub(V.vXel), oEl: sub(V.oEl), oXel: sub(V.oXel), fps: V.fps, Tint: V.Tint, IFOV: V.IFOV, x0: V.x0, y0: V.y0 };
}
function losMetrics(R, P, opt) {
  opt = opt || {};
  const skip = opt.skip == null ? 20 : opt.skip, fr = R.meta.fRec, i0 = Math.min(R.meta.nRec - 10, Math.round(skip * fr)), n = R.meta.nRec;
  const out = { skip };
  const ser = (c) => R.rec[c] ? Float64Array.from(R.rec[c].subarray(i0, n)) : null;
  const el = ser('opt_el'), xel = ser('opt_xel');
  // RMS: doğrusal trend çıkarılmış (drift ayrı raporlanır)
  if (el) { const de = detrend(el, 'linear'), dx = detrend(xel, 'linear');
    out.rms = { el: aRms(de), xel: aRms(dx) }; out.p99 = { el: aPctAbs(de, 99), xel: aPctAbs(dx, 99) }; }
  const me = ser('mech_el'); if (me) out.rmsMech = { el: aRms(detrend(me, 'linear')), xel: aRms(detrend(ser('mech_xel'), 'linear')) };
  const rr = ser('rot_res'); if (rr) { out.rotRes = aRms(detrend(rr, 'linear')); out.rot = aRms(detrend(ser('rot'), 'linear')); }
  if (opt.psd !== false && el) {
    const nseg = opt.nseg || 32768;
    const pe = welch(el, fr, nseg), px = welch(xel, fr, nseg);
    out.psd = { f: pe.f, el: pe.P, xel: px.P, df: pe.df };
    out.band = { el: { B1: bandRms(pe.f, pe.P, 0, 1), B2: bandRms(pe.f, pe.P, 1, 20), B3: bandRms(pe.f, pe.P, 20, fr / 2), hp1: bandRms(pe.f, pe.P, 1, fr / 2) },
                 xel: { B1: bandRms(px.f, px.P, 0, 1), B2: bandRms(px.f, px.P, 1, 20), B3: bandRms(px.f, px.P, 20, fr / 2), hp1: bandRms(px.f, px.P, 1, fr / 2) } };
  }
  if (R.video && R.video.n > 10) {
    const V = sliceVideo(R.video, skip);
    out.video = videoMetrics(V, { which: 'true', Tw: P.ana.Tw, detrend: P.ana.detrend, tau: P.wb.tau, pdeWin: P.ana.pdeWin });
  }
  return out;
}
// Bütçe satırı → işletme ayrıştırma koşusu tanımı
const OP_ROWS = [
  { id: 'B1-01', src: ['sea_r'], mech: ['coupling', 'earth'] },
  { id: 'B1-02', src: ['sea_p'], mech: ['coupling', 'earth'] },
  { id: 'B1-03', src: ['sea_y'], mech: ['coupling', 'earth'] },
  { id: 'B1-04', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['misalign', 'earth'] },
  { id: 'B1-05', src: [], mech: ['gyroNoise', 'earth'], metric: 'arw' },
  { id: 'B1-06', src: [], mech: ['gyroBias', 'earth'], metric: 'bias' },
  { id: 'B1-07', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['friction', 'earth'] },
  { id: 'B2-01', src: ['viv'], mech: ['coupling', 'earth'] },
  { id: 'B2-02', src: ['slap'], mech: ['coupling', 'earth'] },
  { id: 'B2-03', src: ['lat'], mech: ['imbalance', 'earth'] },
  { id: 'B2-04', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['cogging', 'earth'] },
  { id: 'B2-05', src: [], mech: ['gyroNoise', 'earth'], metric: 'gyroband', same: 'B1-05' },
  { id: 'B2-06', src: ['plat'], mech: ['coupling', 'imbalance', 'optMode', 'earth'] },
  { id: 'B3-01', src: ['aux'], mech: ['optMode', 'imbalance', 'earth'] },
  { id: 'B3-02', src: [], mech: ['cooler', 'earth'] },
  { id: 'B3-03', src: ['hfl'], mech: ['optMode', 'earth'] },
  { id: 'B3-04', src: ['hfa'], mech: ['gimMode', 'earth'] },
  { id: 'R-01', src: ['sea_r', 'sea_p', 'sea_y'], mech: ['coupling', 'earth'], metric: 'rot' },
  { id: 'H7', src: [], mech: ['compErr', 'earth'], metric: 'drift' },
  // ek satır (v11): deniz ötelemesi (6-DOF ağırlık merkezi + kaldıraç kolu) ivmesinin dengesizlik ve optik montaj
  // yoluyla LOS'a etkisi. Açısal diziler yalnız kaldıraç kolu ivmesini üretmek için kullanılır; tabanın kendisi döndürülmez
  // (yerçekiminin eğilen az boyunduruğundaki dengesizlik torku açısal harekete aittir, öteleme değildir).
  { id: 'B1-08', src: ['sea_s', 'sea_w', 'sea_h', 'lever'], srcRun: ['sea_r', 'sea_p', 'sea_y', 'sea_s', 'sea_w', 'sea_h'], seaAngCmd: false, mech: ['imbalance', 'optMode', 'earth'], ext: true },
];
function rowScenario(P, row, o) {
  o = o || {};
  const src = Object.fromEntries(SRC_IDS.map(k => [k, (row.srcRun || row.src).includes(k)]));
  // gemi: rüzgâr VIV'i direk tepesini de öteler → dengesizlik torku ve optik montaj esnemesi de B2-01'in parçasıdır (v13.3:
  // denizaltında da mast başı ötelemesi açıkken)
  const mechL = (row.id === 'B2-01' && vivSpec(P).lin) ? ['coupling', 'imbalance', 'optMode', 'earth'] : row.mech;
  const mech = Object.fromEntries(mechL.map(k => [k, true]));
  const T = o.T || 600;
  const hf = row.src.some(s => s === 'aux' || s === 'hfa' || s === 'hfl') || row.mech.includes('cooler');
  return opScenario(P, { T: hf ? Math.min(T, 60) : T, seed: o.seed, src, mech, fs: o.fs || (hf ? 4000 : 2000), seaAngCmd: row.seaAngCmd,
    derot: row.metric === 'rot' ? true : undefined, label: row.id, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'rot', 'rot_res'] });
}

// ============================================================================
// 06_tests_a.js — test yardımcıları ve B0 (kalibrasyon / taban) testleri
// ============================================================================
const AXN = ['roll', 'pitch', 'yaw'];
const AXTR = { roll: 'roll', pitch: 'pitch', yaw: 'yaw' };
// gövde ekseni → birincil LOS ekseni (LOS azimutuna göre)
function axisMap(P, ax) {
  const a0 = P.dut.geom.a0 * D2R;
  // LOS el hatası (yukarı +) = p·sin a0 − q·cos a0 ; LOS ekseni etrafında dönme = p·cos a0 + q·sin a0 ; xel = r (e = 0)
  if (ax === 2) return { los: 'xel', w: 1, rotW: 0, elW: 0 };
  const wEl = ax === 0 ? Math.sin(a0) : -Math.cos(a0), wRot = ax === 0 ? Math.cos(a0) : Math.sin(a0);
  return Math.abs(wEl) >= Math.abs(wRot) ? { los: 'el', w: wEl, rotW: wRot, elW: wEl } : { los: 'rot', w: wRot, elW: wEl, rotW: wRot };
}
// tohum kaydırma: P.ana.seedOffset ≠ 0 tüm rastgele süreçlerin başka bir gerçekleşmesini üretir (istatistiksel tekrar)
function seedOf(P, s) { return ((s == null ? 0 : s) + 7919 * ((P.ana && P.ana.seedOffset) || 0)) >>> 0; }
function labScenario(P, o) {
  const S = Object.assign({
    T: 60, fs: 2000, world: 'lab', stab: true, seed: 101, cmd: [], vib: [], trans: [], acc: [], accMount: [],
    meas: { video: true, ac: true, imu: true, air: true, microvib: true, noise: true },
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y', 'base_r', 'base_p', 'base_y', 'cmd_r', 'cmd_p', 'cmd_y'] },
  }, o);
  S.seed = seedOf(P, S.seed);
  return S;
}
// sinüs segmentleri: her öğe {axis, f, A(rad), nper, ramp(periyot)}; arada boşluk
function segSines(list, gap) {
  gap = gap == null ? 2 : gap;
  let t = 1; const cmd = [], segs = [];
  for (const s of list) {
    const Tp = 1 / s.f, ramp = Math.max(1.0, (s.ramp == null ? 0.5 : s.ramp) * Tp), core = s.nper * Tp;
    const t0 = t, t1 = t + 2 * ramp + core;
    cmd.push({ type: 'sine', axis: s.axis, A: s.A, f: s.f, t0, t1, ramp });
    segs.push(Object.assign({}, s, { tS: t0, tE: t1, c0: t0 + ramp + 0.25 * Tp, c1: t1 - ramp - 0.25 * Tp }));
    t = t1 + gap;
  }
  return { cmd, segs, T: t + 1 };
}
const recT = (R) => { const n = R.meta.nRec, f = R.meta.fRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / f; return t; };
function idxRange(t, a, b) { let i0 = 0; while (i0 < t.length && t[i0] < a) i0++; let i1 = i0; while (i1 < t.length && t[i1] <= b) i1++; return [i0, i1]; }
// video ölçümünü (kalibre ölçekle) açıya çevir
function videoAngles(R, ctx) {
  const V = R.video, IF = (ctx && ctx.IFOVcal) || V.IFOV, n = V.n;
  const el = new Float64Array(n), xel = new Float64Array(n);
  for (let i = 0; i < n; i++) { el[i] = (V.y[i] - V.y0) * IF; xel[i] = (V.x[i] - V.x0) * IF; }
  return { t: V.t.subarray(0, n), el, xel, ok: V.valid.subarray(0, n) };
}
// kayıt kanalını verilen zamanlara doğrusal ara değerle taşı
function sampleAt(R, ch, times) {
  const x = R.rec[ch], f = R.meta.fRec, n = R.meta.nRec, out = new Float64Array(times.length);
  for (let i = 0; i < times.length; i++) { const u = times[i] * f, k = Math.floor(u), fr = u - k; out[i] = k + 1 < n ? x[k] + (x[k + 1] - x[k]) * fr : x[Math.min(k, n - 1)]; }
  return out;
}
// çizim için min/max seyreltme
function decim(t, y, maxPts) {
  const n = y.length; maxPts = maxPts || 2400;
  if (n <= maxPts) return { x: Float32Array.from(t), y: Float32Array.from(y) };
  const bins = Math.floor(maxPts / 2), step = n / bins, xo = new Float32Array(bins * 2), yo = new Float32Array(bins * 2);
  for (let b = 0; b < bins; b++) {
    const i0 = Math.floor(b * step), i1 = Math.min(n, Math.floor((b + 1) * step));
    let mn = Infinity, mx = -Infinity, imn = i0, imx = i0;
    for (let i = i0; i < i1; i++) { if (y[i] < mn) { mn = y[i]; imn = i; } if (y[i] > mx) { mx = y[i]; imx = i; } }
    const a = imn < imx ? imn : imx, c = imn < imx ? imx : imn;
    xo[2 * b] = t[a]; yo[2 * b] = y[a]; xo[2 * b + 1] = t[c]; yo[2 * b + 1] = y[c];
  }
  return { x: xo, y: yo };
}
function scaleArr(a, k) { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * k; return o; }
// log ekseninde PSD seyreltme (çizim/dışa aktarma)
function logDecimPSD(f, P, nOut, fmin) {
  const out = { f: [], P: [] }; fmin = fmin || f[1];
  const lf0 = Math.log(fmin), lf1 = Math.log(f[f.length - 1]);
  let k = 1;
  for (let b = 0; b < nOut; b++) {
    const e = Math.exp(lf0 + (lf1 - lf0) * (b + 1) / nOut);
    let s = 0, c = 0, fs = 0;
    while (k < f.length && f[k] <= e) { if (f[k] >= fmin) { s += P[k]; fs += f[k]; c++; } k++; }
    if (c) { out.f.push(fs / c); out.P.push(s / c); }
  }
  return { f: Float64Array.from(out.f), P: Float64Array.from(out.P) };
}
function mkResult(id, o) { return Object.assign({ id, status: 'BİLGİ', plots: [], notes: [], kv: [], fill: {} }, o); }
const fmt = (x, d) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d == null ? 2 : d);
const urad = (x, d) => fmt(x * 1e6, d);
function stat(ok) { return ok ? 'OK' : 'AŞIM'; }
// v13.6: piksel fazı (S-eğrisi) yanlılığı. Modeldeki biçim: ölçülen konum x_m = x + a·sin(2πx), a = √2·pixlock_px (fazlar üzerinde
// RMS = pixlock_px). Hedef noktası sabitken (takip, durağan koşu) küçük hareketin kazancı 1 + 2πa·cos(2πφ); genlik A_px'lik
// sinüste kazanç sapması 2J1(2πA_px)/(2πA_px) kadar, Gauss harekette exp(−2π²σ_px²) kadar azalır (σ ≥ 0,5 px'te ortalanır,
// hata toplanır a/√2 olur: U-06). S(φ) = A·sin 2πφ + B·cos 2πφ için kazanç 1 + 2π(A·cos 2πφ − B·sin 2πφ).
const frac01 = (x) => ((x % 1) + 1) % 1;
function pixGain(A, B, ph) { return 1 + 2 * Math.PI * (A * Math.cos(2 * Math.PI * ph) - B * Math.sin(2 * Math.PI * ph)); }
function pixPhaseInfo(P, ctx) {
  const est = ctx && ctx.T01 && ctx.T01.pix, a = Math.SQRT2 * P.wb.chain.pixlock_px;
  const A = est ? est.A : a, B = est ? est.B : 0, phX = frac01(P.dut.video.x0), phY = frac01(P.dut.video.y0);
  return { src: est ? 'T0.1' : 'model', A, B, amp: Math.hypot(A, B), phX, phY, gX: pixGain(A, B, phX), gY: pixGain(A, B, phY), gMax: 1 + 2 * Math.PI * Math.hypot(A, B) };
}
// v13.7 (kullanıcı kararı K4): IMU ve otokolimatör gürültüsünün kayıttaki RMS'i (µrad). 'asd' kipinde IMU gürültüsü IMU süzgecinden
// geçer: analog ikinci derece Butterworth'ün eşdeğer gürültü bant genişliği ENBW = f_IMU·(π/4)/sin(π/4) = 1,111·f_IMU; otokolimatör
// gürültüsü 1 kHz kayıtta 0–500 Hz beyaz. 'sample' (compatV10): v13.6'ya kadarki örnek başına RMS.
function chainNoise(P) {
  const ch = P.wb.chain, fRec = 1000;
  if (ch.noiseModel === 'sample') return { model: 'sample', imu: ch.imu_noise, ac: ch.ac_noise, fRec, enbw: null };
  const enbw = ch.imu_bw * (Math.PI / 4) / Math.sin(Math.PI / 4);
  return { model: 'asd', imu: ch.imu_asd * Math.sqrt(enbw), ac: ch.ac_asd * Math.sqrt(fRec / 2), fRec, enbw };
}
function turInfo(P) {
  const wb = P.wb, d = derive(P), IF = d.IFOV * 1e6, ch = wb.chain, cn = chainNoise(P), asd = cn.model === 'asd';
  const U = [
    { id: 'U-01', name: 'Centroid gürültüsü', v: ch.centroid_px * IF, vid: true, hs: false },
    { id: 'U-02', name: 'Hava türbülansı + kolimatör kararlılığı', v: ch.air, vid: true, hs: true },
    { id: 'U-03', name: 'Hexapod statik mikro-titreşimi', v: wb.hex.microvib, vid: true, hs: true },
    { id: 'U-04', name: asd ? 'Referans IMU gürültüsü (yoğunluk × √ENBW, IMU süzgecinden)' : 'Referans IMU gürültüsü', v: cn.imu, vid: false, hs: true },
    // v13.6: ölçek hatası çarpımsaldır; gereksinim düzeyinde katkısı zincirin karar büyüklüğüyle ölçeklenir (video wander W, yüksek hızlı smear S)
    { id: 'U-05', name: 'Plaka ölçeği (gereksinim düzeyinde: ε·W video, ε·S yüksek hızlı)', v: ch.scale_eps * d.req.wander * 1e6, vh: ch.scale_eps * d.req.smear * 1e6, vid: true, hs: true, mult: true },
    { id: 'U-06', name: 'Piksel fazı yanlılığı', v: ch.pixlock_px * IF, vid: true, hs: false },
    { id: 'U-07', name: asd ? 'Otokolimatör gürültüsü (yoğunluk × √(f_kayıt/2))' : 'Otokolimatör gürültüsü', v: cn.ac, vid: false, hs: true },
  ];
  const uv = Math.sqrt(U.filter(u => u.vid).reduce((s, u) => s + u.v * u.v, 0));
  const uh = Math.sqrt(U.filter(u => u.hs).reduce((s, u) => s + (u.vh != null ? u.vh : u.v) ** 2, 0));
  // v13.6: taban düzeltmesinde düşülebilecek toplanır kısım (çarpımsal U-05 düşülmez; düzeltilmiş değerin göreli belirsizliği olarak kalır)
  const uvAdd = Math.sqrt(U.filter(u => u.vid && !u.mult).reduce((s, u) => s + u.v * u.v, 0)), uhAdd = Math.sqrt(U.filter(u => u.hs && !u.mult).reduce((s, u) => s + u.v * u.v, 0));
  const mult = String(wb.TUR_def).startsWith('Z540') ? wb.k_exp : 1;
  return { U, uv, uh, uvAdd, uhAdd, turW: d.req.wander * 1e6 / uv / mult, turS: d.req.smear * 1e6 / uh / mult, mult,
    turW_k1: d.req.wander * 1e6 / uv, turW_z: d.req.wander * 1e6 / (wb.k_exp * uv), turS_k1: d.req.smear * 1e6 / uh, turS_z: d.req.smear * 1e6 / (wb.k_exp * uh),
    maxFloor: d.req.wander * 1e6 / (wb.TUR_target * mult) };
}
// v13.7 (kullanıcı kararı K2): TUR (taban oranı) ile birlikte karar belirsizliği ve koruma bandı. Ölçülen RMS x için standart
// belirsizlik u_c = √(u_ist² + (x·u_rel)²): istatistik (tekrarlar ya da pencereler) ve çarpımsal terimler (kalibre ölçek: T0.1
// koşulduysa onun belirsizliği, yoksa ε). Genişletilmiş U = k·u_c (k = wb.k_exp). Koruma bandlı karar: x + U ≤ R → KABUL,
// x − U > R → RED, arada BELİRSİZ; uygunluk olasılığı P(gerçek ≤ R) = Φ((R − x)/u_c) (normal yaklaşım). Düzeltilmemiş toplanır
// taban tek yönlü yanlılıktır, u_c'ye katılmaz: x tabanı içeriyorsa ('in') ölçülen değer DUT'u x − √(x² − f²) kadar kötü gösterir;
// x gerçek LOS ise ('add') videoyla ölçüm √(x² + f²) − x kadar yüksek çıkardı. Durum (OK/AŞIM) basit kabul kuralıyla kalır.
// Φ: Hart (1968) rasyonel yaklaşımı, West (2005) biçimi (çift duyarlık).
function normCdf(z) {
  const x = Math.abs(z); let c;
  if (x > 37) c = 0;
  else {
    const e = Math.exp(-x * x / 2);
    if (x < 7.07106781186547) {
      let b = 3.52624965998911e-02 * x + 0.700383064443688; b = b * x + 6.37396220353165; b = b * x + 33.912866078383; b = b * x + 112.079291497871; b = b * x + 221.213596169931; b = b * x + 220.206867912376;
      let dd = 8.83883476483184e-02 * x + 1.75566716318264; dd = dd * x + 16.064177579207; dd = dd * x + 86.7807322029461; dd = dd * x + 296.564248779674; dd = dd * x + 637.333633378831; dd = dd * x + 793.826512519948; dd = dd * x + 440.413735824752;
      c = e * b / dd;
    } else { let b = x + 0.65; b = x + 4 / b; b = x + 3 / b; b = x + 2 / b; b = x + 1 / b; c = e / b / 2.506628274631; }
  }
  return z > 0 ? 1 - c : c;
}
function decisionGuard(P, o) {
  const k = P.wb.k_exp || 2, x = o.x, R = o.R, rel = o.rel || [];
  const uRel = Math.sqrt(rel.reduce((s, v) => s + v * v, 0)), uStat = o.uStat || 0;
  const uc = Math.sqrt(uStat * uStat + sq(x * uRel)), U = k * uc;
  const verdict = x + U <= R ? 'KABUL' : (x - U > R ? 'RED' : 'BELİRSİZ');
  const pConf = uc > 0 ? normCdf((R - x) / uc) : (x <= R ? 1 : 0);
  let bias = null;
  if (o.floor != null && o.floor > 0) bias = o.floorMode === 'add' ? Math.sqrt(x * x + o.floor * o.floor) - x : (x > o.floor ? x - Math.sqrt(x * x - o.floor * o.floor) : x);
  return { label: o.label, x, R, k, uStat, uRel, uc, U, verdict, pConf, bias, floorMode: o.floorMode || 'in' };
}
const pctConf = (p) => (p > 0.999 ? '> %99,9' : (p < 0.001 ? '< %0,1' : '%' + fmt(100 * p, 1)));
function guardTxt(g) { return `${g.label} ${urad(g.x)} ± ${urad(g.U)} µrad → ${g.verdict} (P(uygun) ${pctConf(g.pConf)})`; }
// kalibre ölçeğin göreli belirsizliği: T0.1 koşulduysa onun kestirimi, yoksa kabul sınırı ε
const scaleRelOf = (P, ctx) => (ctx && ctx.T01 && isFinite(ctx.T01.relU) ? ctx.T01.relU : P.wb.chain.scale_eps);
// Masa (hexapod üst tablası) statik mikro-titreşiminin ölçüm zincirlerine geçen payı. Yalıtılmış koşu: yalnız
// mikro-titreşim (Model → Hexapod: masa mikro-titreşimi), DUT dinamiği açık (kuplaj, sürtünme ön-kayması, dengesizlik, gimbal ve optik modlar);
// gyro gürültüsü/bias'ı, soğutucu, hava ve ölçüm gürültüsü kapalı. Video: T1.3 ile aynı pencereli wander metriği;
// otokolimatör (yüksek hızlı zincir): geniş bant RMS; gerçek optik LOS: bilgi. Taban düzeltmesinin 'tam' kipi
// U-03'ü tam değeriyle düşer; stab ON'da DUT tabla hareketini filtreler, bu yüzden düşülecek pay zincire özgüdür.
const MV_CACHE = new Map();
function tableShare(P) {
  const key = JSON.stringify([P.wb, P.dut, P.lab, P.ana]);
  if (MV_CACHE.has(key)) return MV_CACHE.get(key);
  const T = Math.max(P.ana.Tw, 60) + 10, out = { T, nominal: P.wb.hex.microvib * URAD };
  const mech = Object.assign({}, MECH_DEFAULT, { gyroNoise: false, gyroBias: false, cooler: false, earth: false, compErr: false });
  for (const stab of [true, false]) {
    const S = labScenario(P, { label: 'Masa payı', T, fs: 4000, stab, seed: 391, cmd: [], mech,
      meas: { video: true, ac: true, imu: true, air: false, microvib: true, noise: false },
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y'] } });
    const R = runSim(P, S, null), fr = R.meta.fRec, i0 = Math.round(10 * fr);
    const v = videoAngles(R, {}), perWin = Math.round(P.ana.Tw * R.video.fps);
    const sel = (a) => { const o = [], ok = []; for (let i = 0; i < a.length; i++) if (v.t[i] > 10) { o.push(a[i]); ok.push(v.ok[i]); } return { x: Float64Array.from(o), ok: Uint8Array.from(ok) }; };
    const e = sel(v.el), x = sel(v.xel);
    const r = (c) => aRms(detrend(Float64Array.from(R.rec[c].subarray(i0)), 'linear'));
    out[stab ? 'on' : 'off'] = { vid: { el: windowedWander(e.x, e.ok, perWin, P.ana.detrend).rms, xel: windowedWander(x.x, x.ok, perWin, P.ana.detrend).rms },
      ac: { el: r('ac_el'), xel: r('ac_xel') }, los: { el: r('opt_el'), xel: r('opt_xel') }, table: Math.max(r('imu_r'), r('imu_p'), r('imu_y')) };
  }
  if (MV_CACHE.size > 8) MV_CACHE.clear();
  MV_CACHE.set(key, out);
  return out;
}
// Taban düzeltmesi — masa mikro-titreşimi: σ_DUT = √(σ_ölç² − s²). Kip (Model → Hexapod):
// 'zincir' s = ölçüm zincirine geçen pay (tableShare), 'tam' s = masa mikro-titreşimi (2 µrad), 'kapalı' düzeltme yok.
// Güvenilirlik: s² ölçülen varyansın yarısını aşarsa düzeltme belirsizleşir (ör. ham 3 µrad, u_v = 2,66 µrad → 1,38 µrad).
function tableCorr(P, raw, chainShare) {
  const m = P.wb.hex.mvCorr || 'kapalı';
  const s = m === 'tam' ? P.wb.hex.microvib * URAD : (m === 'zincir' ? chainShare : 0);
  return { mode: m, s, corr: Math.sqrt(Math.max(0, raw * raw - s * s)), reliable: s * s <= 0.5 * raw * raw };
}
const MV_MODE_TXT = { zincir: 'zincire özgü pay', tam: 'masa mikro-titreşiminin tam değeri', 'kapalı': 'kapalı' };

// ------------------------------------------------------------------ B0 -------
const TESTS = {};
// T0.1 — plaka ölçeği ve distorsiyon (stab OFF, hexapod adımları)
TESTS['T0.1'] = function (P, ctx, prog) {
  const d = derive(P), FOVh = d.FOVh * D2R, FOVv = d.FOVv * D2R;
  const grid = [-0.4, -0.2, 0, 0.2, 0.4];
  const mapX = axisMap(P, 2), mapY = axisMap(P, 0);   // xel ← yaw, el ← roll (LOS iskele)
  const dwell = 5, tr = 1.0; const pts = [];
  for (const gy of grid) for (const gx of grid) pts.push([gx, gy]);
  const order = pts.concat(pts.slice().reverse(), pts);   // her nokta 3 kez: gidiş-dönüş-gidiş (histerezis)
  const kR = [{ t: 0, v: 0 }], kY = [{ t: 0, v: 0 }];
  let t = 2; const dw = [];
  for (const [gx, gy] of order) {
    const yaw = gx * FOVh / mapX.w, roll = gy * FOVv / mapY.w;
    kR.push({ t, v: roll }); kY.push({ t, v: yaw });
    dw.push({ t0: t + tr + 1.0, t1: t + tr + dwell, gx, gy });
    t += tr + dwell;
  }
  const S = labScenario(P, { label: 'T0.1', T: t + 1, fs: 2000, stab: false,
    cmd: [{ type: 'steps', axis: 0, knots: kR, trans: tr }, { type: 'steps', axis: 2, knots: kY, trans: tr }] });
  const PX = pupilExcursion(P, S), PXt = pupilTxt(P, PX);      // v13.4: stab OFF, pivot göz bebeğinde → yalnız L_off·sin θ⊥
  const R = runSim(P, S, (f) => prog && prog(0.83 * f));
  // v13.6: sub-piksel tarama — ayrı koşu (ızgara koşusunun gerçekleşmesi değişmesin): merkezde 1/16 piksellik 16 adım, iki eksen birlikte.
  // Sıra bit-ters (0, 8, 4, 12, …: yavaş sürüklenme fazın yüksek harmoniklerine düşer) ve gidiş + dönüş (zamana göre simetrik: doğrusal
  // sürüklenme sin/cos'a izdüşmez); uydurmada eksen başına zaman trendi de var. Izgara noktalarının fazları konuma bağlı olduğu için
  // (adım 254,9 px; distorsiyon fazı konumla birlikte kaydırır: 25 noktada eksen başına 13 değer, konumla bağlantılı) S-eğrisi bu taramayla örneklenir.
  const nScan = 16, kR2 = [{ t: 0, v: 0 }], kY2 = [{ t: 0, v: 0 }], dw2 = [];
  const brev = (k) => { let r = 0; for (let b = 1, q = nScan >> 1; b < nScan; b <<= 1, q >>= 1) if (k & b) r |= q; return r; };
  const ord1 = Array.from({ length: nScan }, (_, m) => brev(m)), scanOrd = ord1.concat(ord1.slice().reverse());
  let t2 = 2;
  for (const k of scanOrd) {
    const off = (k / nScan) * d.IFOV;
    kR2.push({ t: t2, v: off / mapY.w }); kY2.push({ t: t2, v: off / mapX.w });
    dw2.push({ t0: t2 + tr + 1.0, t1: t2 + tr + dwell, gx: 0, gy: 0, scan: k });
    t2 += tr + dwell;
  }
  const R2 = runSim(P, labScenario(P, { label: 'T0.1 sub-piksel tarama', T: t2 + 1, fs: 2000, stab: false, seed: 111,
    cmd: [{ type: 'steps', axis: 0, knots: kR2, trans: tr }, { type: 'steps', axis: 2, knots: kY2, trans: tr }] }), (f) => prog && prog(0.83 + 0.17 * f));
  const V = R.video, IFn = d.IFOV;
  // her bekleme için ortalama centroid ve IMU açısı (sub-piksel tarama ayrı: yalnız S-eğrisi uydurmasına girer)
  const rows = [], scanRows = [], IFt = R.meta.IFOVt;
  let jv = 0, jn = 0;     // tarama beklemelerinde kareler arası gerçek LOS titreşimi (px², simülasyon gerçeği: S-eğrisini exp(−2π²σ²) kadar söndürür)
  for (const [Rr, dws] of [[R, dw], [R2, dw2]]) for (const w of dws) {
    const Vr = Rr.video;
    let sx = 0, sy = 0, c = 0, me = 0, mx = 0, me2 = 0, mx2 = 0;
    for (let i = 0; i < Vr.n; i++) if (Vr.t[i] >= w.t0 && Vr.t[i] <= w.t1 && Vr.valid[i]) { sx += Vr.x[i]; sy += Vr.y[i]; c++; me += Vr.mEl[i]; mx += Vr.mXel[i]; me2 += Vr.mEl[i] ** 2; mx2 += Vr.mXel[i] ** 2; }
    if (c < 10) continue;
    if (w.scan != null) { jv += (me2 / c - (me / c) ** 2 + mx2 / c - (mx / c) ** 2) / (IFt * IFt); jn += 2; }
    const ti = Float64Array.from({ length: 50 }, (_, k) => w.t0 + (w.t1 - w.t0) * k / 49);
    const ir = aMean(sampleAt(Rr, 'imu_r', ti)), iy = aMean(sampleAt(Rr, 'imu_y', ti));
    (w.scan != null ? scanRows : rows).push({ x: sx / c - Vr.x0, y: sy / c - Vr.y0, ax: iy * mapX.w, ay: ir * mapY.w, key: w.gx + ',' + w.gy, t: 0.5 * (w.t0 + w.t1) });
  }
  // model: x = (θx/IFOV)(1 + k1 r²) ; y = (θy/IFOV)(1 + k1 r²) ; r² = (x²+y²)/rRef² → [1/IFOV, k1/IFOV] doğrusal
  const rRef2 = (d.Nh * d.Nh + d.Nv * d.Nv) / 4;
  const A = [[0, 0], [0, 0]], B = [0, 0];
  const obs = [];
  for (const r of rows) {
    for (const [th, m] of [[r.ax, r.x], [r.ay, r.y]]) {
      const r2 = (sq(r.ax / IFn) + sq(r.ay / IFn)) / rRef2;
      const h = [th, th * r2]; obs.push({ h, m });
      for (let i = 0; i < 2; i++) { B[i] += h[i] * m; for (let j = 0; j < 2; j++) A[i][j] += h[i] * h[j]; }
    }
  }
  const sol = solveLin(A, B);
  let rss = 0; for (const o of obs) rss += sq(o.m - (sol[0] * o.h[0] + sol[1] * o.h[1]));
  const s2 = rss / Math.max(1, obs.length - 2);
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0], var0 = s2 * A[1][1] / det;
  const IFOVeff = 1 / sol[0], k1 = sol[1] / sol[0];
  const relU = Math.sqrt(var0) / sol[0];
  const epsMeas = IFOVeff / IFn - 1;
  ctx.IFOVcal = IFOVeff; ctx.T01 = { IFOVeff, k1, relU };
  // nokta başına 3 ziyaretin tekrarlanabilirliği (gidiş-dönüş farkı = histerezis + taban gürültüsü)
  const groups = new Map(); for (const r of rows) { if (!groups.has(r.key)) groups.set(r.key, []); groups.get(r.key).push(r); }
  let sRep = 0, nRep = 0, hysMax = 0;
  const mean = [];
  for (const g of groups.values()) {
    const mx = aMean(g.map(r => r.x - r.ax / IFOVeff)), my = aMean(g.map(r => r.y - r.ay / IFOVeff));
    for (const r of g) { sRep += sq(r.x - r.ax / IFOVeff - mx) + sq(r.y - r.ay / IFOVeff - my); nRep += 2; }
    if (g.length >= 2) hysMax = Math.max(hysMax, Math.hypot(g[0].x - g[1].x - (g[0].ax - g[1].ax) / IFOVeff, g[0].y - g[1].y - (g[0].ay - g[1].ay) / IFOVeff));
    mean.push({ x: aMean(g.map(r => r.x)), y: aMean(g.map(r => r.y)), dx: mx, dy: my });
  }
  const repPx = Math.sqrt(sRep / Math.max(1, nRep - 2 * groups.size));
  // v13.6: piksel fazı (S-eğrisi) — sub-piksel taramanın doğrusal model artığı r = A·sin 2πφ + B·cos 2πφ + C_eksen
  // (φ: ölçülen mutlak piksel konumunun kesir kısmı; A, B iki eksende ortak). Izgara noktaları uydurmaya girmez: fazları
  // kümelenir ve doğrusal model (ölçek + k1 + ötelenme) S-eğrisinin o noktalardaki değerlerinin bir kısmını soğurur.
  const useScan = scanRows.length >= 8, src = useScan ? scanRows : rows, tMid = aMean(src.map(r => r.t)), tSp = Math.max(1, Math.max(...src.map(r => Math.abs(r.t - tMid))));
  const scP = (rr) => { const r2 = (sq(rr.ax / IFn) + sq(rr.ay / IFn)) / rRef2, tn = (rr.t - tMid) / tSp;
    return [{ res: rr.x - (sol[0] * rr.ax + sol[1] * rr.ax * r2), ph: frac01(rr.x + V.x0), ax: 0, tn }, { res: rr.y - (sol[0] * rr.ay + sol[1] * rr.ay * r2), ph: frac01(rr.y + V.y0), ax: 1, tn }]; };
  const pr = [].concat(...src.map(scP)), nP = useScan ? 6 : 4;      // sin, cos, eksen sabitleri (+ taramada eksen başına zaman trendi)
  const As = Array.from({ length: nP }, () => new Array(nP).fill(0)), Bs = new Array(nP).fill(0);
  const hS = (q) => { const h0 = [Math.sin(2 * Math.PI * q.ph), Math.cos(2 * Math.PI * q.ph), q.ax === 0 ? 1 : 0, q.ax === 1 ? 1 : 0]; return useScan ? h0.concat([q.ax === 0 ? q.tn : 0, q.ax === 1 ? q.tn : 0]) : h0; };
  for (const q of pr) { const hh = hS(q); for (let i = 0; i < nP; i++) { Bs[i] += hh[i] * q.res; for (let j = 0; j < nP; j++) As[i][j] += hh[i] * hh[j]; } }
  const sc = solveLin(As, Bs), pA = sc[0], pB = sc[1];
  let rss2 = 0, rss1 = 0;
  // önce: yalnız eksen sabiti ve zaman trendi düşülmüş artık; sonra: S-eğrisi de düşülmüş
  const nuis = (q) => { const hh = hS(q); let v = 0; for (let i = 2; i < nP; i++) v += hh[i] * sc[i]; return v; };
  for (const q of pr) { const hh = hS(q); rss2 += sq(q.res - hh.reduce((t, v, i) => t + v * sc[i], 0)); rss1 += sq(q.res - nuis(q)); }
  const resAfter = Math.sqrt(rss2 / Math.max(1, pr.length - nP)), resBefore = Math.sqrt(rss1 / Math.max(1, pr.length - nP + 2));
  // genlik belirsizliği (k=1): en küçük kareler kovaryansı s²·(HᵀH)⁻¹, genlik yönünde
  const inv = [0, 1].map(i => solveLin(As, Array.from({ length: nP }, (_, j) => j === i ? 1 : 0)));
  const ampE = Math.hypot(pA, pB) || 1, uAmp = resAfter * Math.sqrt(Math.max(0, (pA * pA * inv[0][0] + 2 * pA * pB * inv[0][1] + pB * pB * inv[1][1]) / (ampE * ampE)));
  const phX = frac01(V.x0), phY = frac01(V.y0), gX = pixGain(pA, pB, phX), gY = pixGain(pA, pB, phY);
  const aMod = Math.SQRT2 * P.wb.chain.pixlock_px, sigJ = Math.sqrt(jv / Math.max(1, jn)), aExp = aMod * Math.exp(-2 * Math.PI * Math.PI * sigJ * sigJ);
  // ızgara uydurma artığı S-eğrisi düzeltmesiyle (bilgi; IFOV_eff düzeltmesiz ölçümden kalır)
  let rssC = 0; { const Ac = [[0, 0], [0, 0]], Bc = [0, 0], oc = [];
    const corr = (m, ph) => m - (pA * Math.sin(2 * Math.PI * ph) + pB * Math.cos(2 * Math.PI * ph));
    for (const r of rows) for (const [th, m, ph] of [[r.ax, corr(r.x, frac01(r.x + V.x0)), 0], [r.ay, corr(r.y, frac01(r.y + V.y0)), 0]]) {
      const r2 = (sq(r.ax / IFn) + sq(r.ay / IFn)) / rRef2, h = [th, th * r2]; oc.push({ h, m });
      for (let i = 0; i < 2; i++) { Bc[i] += h[i] * m; for (let j = 0; j < 2; j++) Ac[i][j] += h[i] * h[j]; } }
    const sC = solveLin(Ac, Bc); for (const o of oc) rssC += sq(o.m - (sC[0] * o.h[0] + sC[1] * o.h[1])); rssC = Math.sqrt(rssC / Math.max(1, oc.length - 2)); }
  const uG = 2 * Math.PI * uAmp;      // hedef noktasındaki kazanç kestiriminin belirsizliği (k=1), en kötü faz yönünde
  ctx.T01.pix = { A: pA, B: pB, amp: Math.hypot(pA, pB), uAmp, uG, resBefore, resAfter, phX, phY, gX, gY, aExp, sigJ, nScan: scanRows.length };
  const ok = relU <= P.wb.chain.scale_eps;
  const res = mkResult('T0.1', {
    status: stat(ok), measured: `IFOV_eff = ${fmt(IFOVeff * 1e6, 4)} µrad/px (nominale göre ${fmt(epsMeas * 100, 3)} %); ölçek belirsizliği ${fmt(relU * 100, 4)} % (sınır ${fmt(P.wb.chain.scale_eps * 100, 2)} %)`,
    num: { IFOVeff, relU, k1, repPx, hysMax, pix: { A: pA, B: pB, amp: Math.hypot(pA, pB), uAmp, uG, resBefore, resAfter, gX, gY, aExp, sigJ, gridResC: rssC } },
    kv: [['IFOV_eff (µrad/px)', fmt(IFOVeff * 1e6, 4)], ['Nominale göre ölçek farkı', fmt(epsMeas * 100, 3) + ' %'], ['Gerçek (model) ölçek farkı', fmt(P.dut.optics.scaleErr * 100, 3) + ' %'],
         ['Ölçek belirsizliği (k=1)', fmt(relU * 100, 4) + ' %'], ['Radyal distorsiyon k1 (kestirim / model)', fmt(k1, 5) + ' / ' + fmt(P.dut.optics.k1, 5)], ['Uydurma artığı (px RMS; S-eğrisi düzeltmesiyle)', fmt(Math.sqrt(s2), 4) + ' (' + fmt(rssC, 4) + ')'],
         ['Nokta başına 3 ziyaret: tekrarlanabilirlik / en büyük gidiş-dönüş farkı', fmt(repPx, 4) + ' / ' + fmt(hysMax, 4) + ' px'], ['Ölçüm sayısı', `${rows.length} (${groups.size} nokta × 3) + ${scanRows.length} sub-piksel tarama beklemesi (1/${nScan} px adım, bit-ters sıra, gidiş + dönüş)`],
         ['Piksel fazı (S-eğrisi): tarama artığı ↔ A·sin 2πφ + B·cos 2πφ', `genlik ${fmt(Math.hypot(pA, pB), 4)} ± ${fmt(uAmp, 4)} px (k=1; A ${fmt(pA, 4)}, B ${fmt(pB, 4)}) · tarama artığı ${fmt(resBefore, 4)} → ${fmt(resAfter, 4)} px`],
         ['S-eğrisi genliği: model √2·pixlock / bekleme içi titreşimle beklenen', `${fmt(aMod, 4)} / ${fmt(aExp, 4)} px (kareler arası gerçek LOS titreşimi σ ${fmt(sigJ, 3)} px → ×exp(−2π²σ²) = ${fmt(Math.exp(-2 * Math.PI * Math.PI * sigJ * sigJ), 3)})`],
         ['Hedef noktasında küçük hareket kazancı (xel / el)', `${fmt(gX, 3)} / ${fmt(gY, 3)} ± ${fmt(uG, 3)} (sub-piksel faz ${fmt(phX, 2)} / ${fmt(phY, 2)}); faza göre aralık ${fmt(1 - 2 * Math.PI * Math.hypot(pA, pB), 3)}–${fmt(1 + 2 * Math.PI * Math.hypot(pA, pB), 3)}`]],
    notes: ['Kalibre IFOV, sonraki testlerde videonun açıya çevrilmesinde kullanılır (bağlam: IFOV_cal).', 'Referans açı hexapod üstündeki IMU\'dan alındı; IMU gürültüsü bekleme ortalamasında ihmal edilebilir.',
            'Simülasyonda hexapod histerezisi ve kinematik kalibrasyon hatası yoktur: gidiş-dönüş farkı yalnız taban gürültüsünü gösterir. Gerçek düzenekte bu fark hexapod tekrarlanabilirliğinin ölçüsüdür.',
            'Piksel fazı (S-eğrisi) yanlılığı centroid\'in sub-piksel konuma bağlı sistematik hatasıdır; ızgara uydurma artığının büyük kısmı odur (parantez içindeki değer: S-eğrisi düzeltilmiş centroid\'lerle). Eğri, merkezdeki sub-piksel taramadan (16 adım × 1/16 px, bit-ters sırayla gidiş + dönüş; eksen başına sabit ve zaman trendi birlikte) uydurulur; kestirim, bekleme sırasındaki titreşimle sönmüş etkin genliktir. Hedef noktası sabitken (dış takip, durağan koşu) video küçük hareketleri yukarıdaki kazançla ölçer: hata çarpımsaldır. Hareket ≥ 0,5 px ise faz ortalanır ve hata toplanır (U-06). Kullanıcı kararı (v13.7): piksel fazı yalnız raporlanır; S-eğrisiyle düzeltme ya da hedefi titreştirme (dither) uygulanmaz.'],
  });
  res.kv.push(PXt.kv); if (PXt.note) res.notes.push(PXt.note); res.num.pupil = PX;
  pupilRule(P, res, PX);      // v13.5: gerçek vinyetlemede GEÇERSİZ
  res.plots.push({ title: 'Izgara: ölçülen centroid − doğrusal model (px, 3 ziyaret ortalaması), ×200 büyütülmüş', kind: 'quiver',
    pts: mean, scale: 200, xLabel: 'x (px)', yLabel: 'y (px)' });
  if (useScan) {     // v13.6: sub-piksel tarama ve uydurulan S-eğrisi (eksen sabitleri ve zaman trendi düşülmüş)
    const sx = pr.filter(q => q.ax === 0), sy = pr.filter(q => q.ax === 1), phs = Float64Array.from({ length: 101 }, (_, i) => i / 100);
    res.plots.push({ title: 'Sub-piksel tarama: centroid artığı ↔ piksel fazı (px)', xLabel: 'sub-piksel faz φ', yLabel: 'px', series: [
      { name: 'xel artığı', x: Float64Array.from(sx, q => q.ph), y: Float64Array.from(sx, q => q.res - nuis(q)), dots: true, slot: 0 },
      { name: 'el artığı', x: Float64Array.from(sy, q => q.ph), y: Float64Array.from(sy, q => q.res - nuis(q)), dots: true, slot: 1 },
      { name: 'Uydurulan S-eğrisi', x: phs, y: Float64Array.from(phs, f => pA * Math.sin(2 * Math.PI * f) + pB * Math.cos(2 * Math.PI * f)), slot: 2, width: 2 },
      { name: 'Model, titreşimle sönümlü (beklenen)', x: phs, y: Float64Array.from(phs, f => aExp * Math.sin(2 * Math.PI * f)), slot: 6, dash: [5, 3], width: 1.3 }] });
  }
  return res;
};
// T0.2 — ölçüm zinciri gürültü tabanı (granit, uyarım yok, stab ON/OFF, 3 tekrar)
TESTS['T0.2'] = function (P, ctx, prog) {
  const d = derive(P), reps = 3, T = 120;
  const out = { on: [], off: [] };
  let pk = 0;
  for (const stab of [true, false]) for (let r = 0; r < reps; r++) {
    const S = labScenario(P, { label: 'T0.2', T: T + 5, fs: 2000, stab, hexActive: false, seed: 201 + r + (stab ? 0 : 50) });
    const R = runSim(P, S, (f) => prog && prog((pk + f) / (2 * reps)));
    pk++;
    const v = videoAngles(R, ctx);
    const sel = (a) => { const o = []; for (let i = 0; i < a.length; i++) if (v.t[i] > 5 && v.ok[i]) o.push(a[i]); return Float64Array.from(o); };
    const el = detrend(sel(v.el), 'linear'), xel = detrend(sel(v.xel), 'linear');
    const white = (x) => { let s = 0; for (let i = 1; i < x.length; i++) s += sq(x[i] - x[i - 1]); return Math.sqrt(s / (2 * (x.length - 1))); };
    // yüksek hızlı kanal (otokolimatör) PSD'si: kapalı döngü bandı (≥ 1 Hz) için
    const acE = welch(detrend(Float64Array.from(R.rec.ac_el.subarray(5000)), 'linear'), R.meta.fRec, 8192);
    const acX = welch(detrend(Float64Array.from(R.rec.ac_xel.subarray(5000)), 'linear'), R.meta.fRec, 8192);
    const rec = { el: aRms(el), xel: aRms(xel), wEl: white(el), wXel: white(xel), R, v,
      hbEl: sq(bandRms(acE.f, acE.P, 1, 450)), hbXel: sq(bandRms(acX.f, acX.P, 1, 450)),
      acEl: aRms(detrend(Float64Array.from(R.rec.ac_el.subarray(5000)), 'linear')), acXel: aRms(detrend(Float64Array.from(R.rec.ac_xel.subarray(5000)), 'linear')) };
    (stab ? out.on : out.off).push(rec);
  }
  const avg = (arr, k) => Math.sqrt(aMean(arr.map(a => a[k] * a[k])));
  const on = { el: avg(out.on, 'el'), xel: avg(out.on, 'xel'), wEl: avg(out.on, 'wEl'), wXel: avg(out.on, 'wXel') };
  const off = { el: avg(out.off, 'el'), xel: avg(out.off, 'xel'), wEl: avg(out.off, 'wEl'), wXel: avg(out.off, 'wXel') };
  const loopEl = Math.sqrt(Math.max(0, on.el ** 2 - off.el ** 2)), loopXel = Math.sqrt(Math.max(0, on.xel ** 2 - off.xel ** 2));
  const mv = (arr, k) => aMean(arr.map(a => a[k]));
  const hbEl = Math.sqrt(Math.max(0, mv(out.on, 'hbEl') - mv(out.off, 'hbEl'))), hbXel = Math.sqrt(Math.max(0, mv(out.on, 'hbXel') - mv(out.off, 'hbXel')));
  const ti = turInfo(P), lim = ti.maxFloor * 1e-6;
  // kabul, ölçüm zincirinin tabanına uygulanır: stab OFF (gimbal kafesli). Stab ON, DUT'un kendi gyro gürültüsünü de taşır.
  const floor = Math.max(off.el, off.xel);
  // v13.6: bu koşulda beklenen zincir tabanı — hexapod kapalı (U-03 yok), hedef sabit (U-06 toplanmaz; küçük hareketi g kadar ölçekler),
  // centroid gürültüsü (U-01) kazançtan sonra eklenir. Fark, stab OFF'ta LOS'u oynatan DUT payıdır (soğutucu mikrofoniği, ×g).
  const ch = P.wb.chain, pp = pixPhaseInfo(P, ctx), U01 = ch.centroid_px * d.IFOV * 1e6;
  const expEl = Math.hypot(U01, pp.gY * ch.air), expXel = Math.hypot(U01, pp.gX * ch.air);
  const dutEl = Math.sqrt(Math.max(0, sq(off.el * 1e6) - sq(expEl))), dutXel = Math.sqrt(Math.max(0, sq(off.xel * 1e6) - sq(expXel)));
  const acOff = { el: avg(out.off, 'acEl'), xel: avg(out.off, 'acXel') };
  ctx.floor = { on, off, video: floor, ac: acOff };
  // v13.7 (K2): taban kararının belirsizliği — 3 tekrarın saçılımı (sd/√3) ve kalibre ölçek
  const kF = off.el >= off.xel ? 'el' : 'xel', repV = out.off.map(a => a[kF]), mR = aMean(repV);
  const sdR = repV.length > 1 ? Math.sqrt(repV.reduce((t, v) => t + sq(v - mR), 0) / (repV.length - 1)) : 0;
  const gF = decisionGuard(P, { x: floor, R: lim, uStat: sdR / Math.sqrt(repV.length), rel: [scaleRelOf(P, ctx)], label: 'σ_taban ' + kF });
  const ok = floor <= lim;
  const res = mkResult('T0.2', {
    status: stat(ok), measured: `σ_taban (ölçüm zinciri, stab OFF): ${urad(off.el)} / ${urad(off.xel)} µrad (sınır ${fmt(ti.maxFloor)}); stab ON ${urad(on.el)} / ${urad(on.xel)} µrad — DUT döngü gürültüsü dahil, bilgi (el / xel)`,
    kv: [['Stab OFF σ (el / xel)', urad(off.el) + ' / ' + urad(off.xel) + ' µrad'], ['Stab ON σ (el / xel)', urad(on.el) + ' / ' + urad(on.xel) + ' µrad'],
         ['Beyaz (kareden kareye) kısım, OFF', urad(off.wEl) + ' / ' + urad(off.wXel) + ' µrad'], ['Döngü kaynaklı (ON ⊖ OFF), video, 120 s pencere', urad(loopEl) + ' / ' + urad(loopXel) + ' µrad'],
         ['Döngü kaynaklı, kapalı döngü bandı ≥ 1 Hz (otokolimatör PSD farkı) → B2-05', urad(hbEl) + ' / ' + urad(hbXel) + ' µrad'],
         ['Kabul sınırı (seçili TUR tanımı)', fmt(ti.maxFloor) + ' µrad'], ['Bütçe tabanı u_video (U-01…U-07; deniz/masa koşusu için)', fmt(ti.uv) + ' µrad'],
         ['Bu koşulda beklenen zincir tabanı √(U-01² + (g·U-02)²): hexapod kapalı (U-03 yok), hedef sabit (U-06 kazanç g)', `${fmt(expEl)} / ${fmt(expXel)} µrad (g ${fmt(pp.gY, 3)} / ${fmt(pp.gX, 3)}, ${pp.src === 'T0.1' ? 'T0.1 S-eğrisi' : 'model'})`],
         ['Ölçülen ⊖ beklenen zincir: stab OFF\'ta DUT payı (soğutucu mikrofoniği, ×g)', `${fmt(dutEl)} / ${fmt(dutXel)} µrad`],
         ['Yüksek hızlı zincir tabanı, stab OFF (otokolimatör: hava ⊕ gürültü)', `${urad(acOff.el)} / ${urad(acOff.xel)} µrad (bütçe U-02 ⊕ U-07 = ${fmt(Math.hypot(ch.air, chainNoise(P).ac))})`],
         ['Karar belirsizliği ve koruma bandı (k = ' + gF.k + '; 3 tekrar sd/√3 ⊕ kalibre ölçek)', guardTxt(gF) + ` · sınır ${fmt(ti.maxFloor)} µrad, TUR tanımıyla birlikte raporlanır`]],
    notes: ['Kabul (σ_taban ≤ W/(m·TUR_hedef); varsayılanla 20/4 = 5 µrad) ölçüm zincirinin tabanına uygulanır, yani gimbal kafesliyken (stab OFF) alınan kayda. Stab ON kaydı DUT\'un kendi gyro ARW rastgele yürüyüşünü de taşır; bu ölçüm tabanı değil DUT performansıdır (B1-05/B2-05) ve 120 s pencerede gerçekleşmeden gerçekleşmeye 4–6 µrad arasında değişir (Yöntem → istatistiksel tekrarlanabilirlik). Önceki sürüm ON\'u da kabule katıyordu; tohum tekrarında bir gerçekleşme yalnız bu yüzden reddediliyordu.',
            'Stab ON koşusunda dünya dönüşü kompanzasyonu açık; her pencerede doğrusal trend çıkarıldı (drift T0.7\'de).',
            'Soğutucu (B3-02) videoda 10 Hz\'e katlanarak tabana girer; gerçek MWIR kanalında soğutucu kapatılamaz.',
            '120 s penceredeki ON ⊖ OFF farkının çoğu gyro ARW rastgele yürüyüşüdür (B1-05 türü, düşük frekans); B2-05 (kapalı döngü bandında gyro gürültüsü) için ≥ 1 Hz bandındaki PSD farkı kullanıldı.',
            'Kareden kareye beyaz kısım yalnız centroid gürültüsü (U-01) değildir: 10 ve 20 Hz\'e katlanan soğutucu tonları ile hava türbülansının hızlı bileşenini de içerir. Centroid gürültüsünün tek başına doğrulaması: Yöntem → V&V M2.',
            'u_v (U-01…U-07) bu testin beklenen değeri değildir: T0.2\'de hexapod kapalıdır (U-03 yok), hedef sabit durduğu için piksel fazı (U-06) toplanmaz, küçük hareketleri g kadar ölçekler (Model → TUR, T0.1); soğutucu mikrofoniği ise DUT\'a aittir ama stab OFF tabanına girer. Kabul sınırı bu yüzden temkinlidir: ölçülen taban zincirin kendisinden büyüktür.'],
    fill: { 'B2-05': hbEl },
    num: { onEl: on.el, onXel: on.xel, offEl: off.el, offXel: off.xel, wOffEl: off.wEl, wOffXel: off.wXel, hbEl, hbXel, expEl, expXel, dutEl, dutXel, acOffEl: acOff.el, acOffXel: acOff.xel, guard: [gF] },
  });
  const R0 = out.on[0].R, v0 = out.on[0].v, R1 = out.off[0].v;
  const el0 = [], t0 = [], el1 = [];
  for (let i = 0; i < v0.t.length; i++) if (v0.t[i] > 5) { t0.push(v0.t[i]); el0.push(v0.el[i] * 1e6); el1.push(R1.el[i] * 1e6); }
  const dOn = decim(t0, detrend(el0, 'linear')), dOff = decim(t0, detrend(el1, 'linear'));
  res.plots.push({ title: 'Video LOS (el), trend çıkarılmış', xLabel: 's', yLabel: 'µrad', series: [{ name: 'Stab ON', x: dOn.x, y: dOn.y }, { name: 'Stab OFF', x: dOff.x, y: dOff.y }] });
  const pOn = welch(detrend(el0, 'linear'), 50, 1024), pOff = welch(detrend(el1, 'linear'), 50, 1024);
  res.plots.push({ title: 'Video LOS PSD (el)', xLabel: 'Hz', yLabel: 'µrad²/Hz', xLog: true, yLog: true,
    series: [{ name: 'Stab ON', x: Float32Array.from(pOn.f.subarray(1)), y: Float32Array.from(pOn.P.subarray(1)) }, { name: 'Stab OFF', x: Float32Array.from(pOff.f.subarray(1)), y: Float32Array.from(pOff.P.subarray(1)) }] });
  return res;
};
// T0.3 — hexapod statik mikro-titreşimi
TESTS['T0.3'] = function (P, ctx, prog) {
  // Test tanımı: ≥ 2 dk; 3 tekrar; nominal + 2 uç poz; stab ON ve OFF. Uç pozlarda hedef yalnız stab ON'da alanda
  // kalır (gimbal tabanı izler); stab OFF nominal pozda koşulur.
  const T = 120, tSet = 10, th = P.wb.hex.theta_test * D2R;
  const runs = [
    { pose: 'nominal', ang: [0, 0, 0], stab: true, rep: 1 }, { pose: 'nominal', ang: [0, 0, 0], stab: true, rep: 2 }, { pose: 'nominal', ang: [0, 0, 0], stab: true, rep: 3 },
    { pose: 'uç +', ang: [th, th, th], stab: true, rep: 1 }, { pose: 'uç −', ang: [-th, -th, -th], stab: true, rep: 1 },
    { pose: 'nominal', ang: [0, 0, 0], stab: false, rep: 1 },
  ];
  let k = 0;
  for (const q of runs) {
    const cmd = q.ang.some(v => v !== 0) ? q.ang.map((v, i) => ({ type: 'steps', axis: i, knots: [{ t: 0, v: 0 }, { t: 1, v }], trans: 4 })) : [];
    const S = labScenario(P, { label: 'T0.3 ' + q.pose, T: T + tSet, fs: 4000, stab: q.stab, cmd, seed: 301 + k });
    q.px = pupilExcursion(P, S);      // v13.4: göz bebeği ↔ kolimatör demeti (uç pozda stab ON: L_pg·sin θ⊥)
    q.R = runSim(P, S, (f) => prog && prog((k + f) / runs.length)); k++;
    const R = q.R, fr = R.meta.fRec, i0 = tSet * fr;
    q.imu = [0, 1, 2].map(i => aRms(detrend(Float64Array.from(R.rec[['imu_r', 'imu_p', 'imu_y'][i]].subarray(i0)), 'linear')));
    q.base = [0, 1, 2].map(i => aRms(detrend(Float64Array.from(R.rec[['base_r', 'base_p', 'base_y'][i]].subarray(i0)), 'linear')));
    const v = videoAngles(R, ctx), e = [], x = []; for (let i = 0; i < v.t.length; i++) if (v.t[i] > tSet && v.ok[i]) { e.push(v.el[i]); x.push(v.xel[i]); }
    q.vid = { el: aRms(detrend(e, 'linear')), xel: aRms(detrend(x, 'linear')) };
    q.ac = { el: aRms(detrend(Float64Array.from(R.rec.ac_el.subarray(i0)), 'linear')), xel: aRms(detrend(Float64Array.from(R.rec.ac_xel.subarray(i0)), 'linear')) };
  }
  const worst = Math.max(...runs.map(q => Math.max(...q.imu)));
  const nom = runs.filter(q => q.pose === 'nominal' && q.stab);
  const rep = [0, 1, 2].map(i => { const v = nom.map(q => q.imu[i]); return { m: aMean(v), s: aStd(v) * Math.sqrt(v.length / Math.max(1, v.length - 1)) }; });
  const lim = turInfo(P).maxFloor * 1e-6;
  const ok = worst <= lim;
  ctx.hexNoise = worst;
  const R = runs[0].R, fr = R.meta.fRec, i0 = tSet * fr;
  const on0 = runs[0], off0 = runs.find(q => !q.stab);
  // masa mikro-titreşiminin ölçüm zincirlerine geçen payı (taban düzeltmesi) — düzeltme kapalıysa koşulmaz
  const sh = (P.wb.hex.mvCorr || 'kapalı') !== 'kapalı' ? tableShare(P) : null;
  const res = mkResult('T0.3', {
    status: stat(ok), measured: `Hexapod açısal gürültüsü (IMU, ${runs.length} koşunun en kötüsü) ${urad(worst)} µrad RMS (sınır ${fmt(lim * 1e6)}); nominal pozda 3 tekrar: roll ${urad(rep[0].m)} ± ${urad(rep[0].s)}, pitch ${urad(rep[1].m)} ± ${urad(rep[1].s)}, yaw ${urad(rep[2].m)} ± ${urad(rep[2].s)} µrad`,
    kv: runs.map(q => [`${q.pose}${q.rep > 1 ? ' (tekrar ' + q.rep + ')' : ''}, stab ${q.stab ? 'ON' : 'OFF'}`,
      `IMU r/p/y ${q.imu.map(v => urad(v)).join(' / ')} µrad · video el/xel ${urad(q.vid.el)} / ${urad(q.vid.xel)} · otokolimatör el ${urad(q.ac.el)} µrad`])
      .concat([['Gerçek üst tabla RMS (nominal, tekrar 1)', on0.base.map(v => urad(v)).join(' / ') + ' µrad'],
               ['Uç poz', `roll, pitch, yaw = ±θ_test (${P.wb.hex.theta_test}°)`], ['Kabul sınırı', fmt(lim * 1e6) + ' µrad']]),
    notes: ['Stab ON\'da DUT, hexapodun mikro-titreşimini kendi DRR\'ı kadar bastırır; belirsizlik bütçesi U-03\'ü iki zincire de tam ekler (muhafazakâr).',
            'Model sınırı: hexapod mikro-titreşimi Model → Hexapod düzeyinde, poza bağlı olmayan şekillendirilmiş gürültüdür; pozlar arası fark burada yalnız istatistikseldir. Gerçek hexapodda uç pozlarda bacak/eklem rijitliği ve servo gürültüsü değişir — testin amacı budur.',
            `Stab OFF yalnız nominal pozda: uç pozda (±${P.wb.hex.theta_test}°) hedef stab-OFF sınırını (${fmt(derive(P).stabOffMax, 2)}°) aşar ve alan dışına çıkar.`],
  });
  res.kv.splice(runs.length, 0, ['Video LOS, stab OFF − ON (nominal)', `el ${urad(off0.vid.el)} / ${urad(on0.vid.el)} µrad`]);
  { const W = runs.map(q => Object.assign({}, q.px, { run: q.pose + (q.stab ? ', stab ON' : ', stab OFF') })).reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü poz: ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  if (sh) {
    const z = (o) => `video ${urad(o.vid.el)} / ${urad(o.vid.xel)} · otokolimatör ${urad(o.ac.el)} / ${urad(o.ac.xel)} · gerçek LOS ${urad(o.los.el)} / ${urad(o.los.xel)} µrad`;
    res.kv.push(['Masa titreşiminin ölçüme geçen payı, stab ON (yalıtılmış koşu, el / xel)', z(sh.on)],
      ['Masa titreşiminin ölçüme geçen payı, stab OFF', z(sh.off)],
      ['Taban düzeltmesinde düşülecek masa payı (' + MV_MODE_TXT[P.wb.hex.mvCorr] + ')', P.wb.hex.mvCorr === 'tam' ? `${fmt(P.wb.hex.microvib)} µrad (masa mikro-titreşimi, her zincir)` : `stab ON: video ${urad(Math.max(sh.on.vid.el, sh.on.vid.xel))}, yüksek hızlı ${urad(Math.max(sh.on.ac.el, sh.on.ac.xel))} µrad; stab OFF: video ${urad(Math.max(sh.off.vid.el, sh.off.vid.xel))} µrad`]);
    res.notes.push(`Taban düzeltmesi σ_DUT = √(σ_ölç² − s²): U-03'ün tamamı (${fmt(P.wb.hex.microvib)} µrad) ancak titreşim ölçülen LOS'a olduğu gibi geçiyorsa düşülebilir. Stab ON'da DUT tabla hareketini filtreler; geçen pay zincire bağlıdır (video entegrasyonu yüksek frekansı ortalar). Tam değeri düşmek DUT'u olduğundan iyi gösterir. Yalıtılmış koşu: yalnız mikro-titreşim, DUT dinamiği açık, gyro gürültüsü/bias'ı, soğutucu, hava ve ölçüm gürültüsü kapalı.`);
    res.num = Object.assign({}, res.num || {}, { mvShare: sh });
  }
  const x = Float64Array.from(R.rec.imu_r.subarray(i0)), pw = welch(detrend(x, 'linear'), fr, 8192);
  res.plots.push({ title: 'Hexapod üst tabla açısal PSD (IMU, roll)', xLabel: 'Hz', yLabel: 'µrad²/Hz', xLog: true, yLog: true,
    series: [{ name: 'IMU roll', x: Float32Array.from(pw.f.subarray(1)), y: Float32Array.from(scaleArr(pw.P.subarray(1), 1e12)) }] });
  return res;
};
// T0.4 — senkronizasyon ve gecikme (stab OFF, yarım-sinüs darbeler; darbe başına kestirim)
TESTS['T0.4'] = function (P, ctx, prog) {
  const d = derive(P), A = Math.min(0.05, 0.5 * d.stabOffMax) * D2R, Tp = 0.2;
  const ev = []; for (let i = 0; i < 10; i++) ev.push({ t0: 3 + i * 4, Tp, A: A * (i % 2 ? -1 : 1) });
  const map = axisMap(P, 0);
  const S = labScenario(P, { label: 'T0.4', T: 45, fs: 4000, stab: false, cmd: [{ type: 'halfsine', axis: 0, events: ev }] });
  const R = runSim(P, S, prog);
  const v = videoAngles(R, ctx), tr = recT(R);
  const imu = scaleArr(R.rec.imu_r, map.w);
  const est = [];
  for (const e of ev) {
    const [i0, i1] = idxRange(tr, e.t0 - 0.6, e.t0 + 0.9);
    const tv = [], yv = []; for (let i = 0; i < v.t.length; i++) if (v.ok[i] && v.t[i] >= e.t0 - 0.5 && v.t[i] <= e.t0 + 0.8) { tv.push(v.t[i]); yv.push(v.el[i]); }
    const dl = delayEstimate(tr.subarray(i0, i1), imu.subarray(i0, i1), Float64Array.from(tv), Float64Array.from(yv), 4000, 0.01);
    if (dl != null && isFinite(dl)) est.push(dl);
  }
  const m = aMean(est), se = aStd(est) / Math.sqrt(Math.max(1, est.length - 1));
  const trueOff = (P.dut.video.lat_ms - P.wb.chain.dt_sync_ms) * 1e-3;
  const imuGd = Math.SQRT2 / (TAU * P.wb.chain.imu_bw);
  const phRaw = 360 * P.wb.hex.fbw * Math.abs(m), phRes = 360 * P.wb.hex.fbw * 2 * se;
  ctx.syncDt = m;
  const ok = phRes <= 5;
  const res = mkResult('T0.4', { num: { m, se, n: est.length, model: trueOff - imuGd },
    status: stat(ok), measured: `Video − IMU gecikmesi ${fmt(m * 1e3, 3)} ± ${fmt(se * 1e3, 3)} ms (${est.length} darbe); kompanze edilmezse f_bw'de ${fmt(phRaw, 2)}°, kompanzasyon sonrası belirsizlik (2σ) ${fmt(phRes, 2)}°`,
    kv: [['Kestirilen gecikme (video − IMU)', fmt(m * 1e3, 3) + ' ± ' + fmt(se * 1e3, 3) + ' ms (1σ, ortalamanın)'],
         ['Model: senkron kayması + IMU süzgeç grup gecikmesi', fmt(trueOff * 1e3, 3) + ' ms − ' + fmt(imuGd * 1e3, 3) + ' ms = ' + fmt((trueOff - imuGd) * 1e3, 3) + ' ms'],
         ['Faz hatası @ f_bw = ' + P.wb.hex.fbw + ' Hz, kompanze edilmezse', fmt(phRaw, 2) + '°'], ['Kompanzasyon sonrası (2σ)', fmt(phRes, 2) + '° (sınır 5°)'],
         ['Fark-tabanlı artıkta göreli hata 2·sin(πfΔt) @ 0,125 Hz', fmt(2 * Math.sin(Math.PI * 0.125 * Math.abs(m)) * 100, 4) + ' %']],
    notes: ['IMU\'nun ' + P.wb.chain.imu_bw + ' Hz bant genişliği ~' + fmt(imuGd * 1e3, 2) + ' ms grup gecikmesi ekler; senkron kaymasıyla toplanır. Ölçülen gecikme sonraki analizlerde girdiden çıkarılmalıdır.',
            'Darbe genliği stab-OFF sınırının yarısı ile sınırlandı; hedef FOV içinde kalır.'],
  });
  const [s0, s1] = idxRange(tr, 2.5, 4.5);
  const xs = [], ys1 = []; for (let i = s0; i < s1; i++) { xs.push(tr[i]); ys1.push(imu[i] * 1e6); }
  const vx = [], vy = []; for (let i = 0; i < v.t.length; i++) if (v.ok[i] && v.t[i] >= 2.5 && v.t[i] <= 4.5) { vx.push(v.t[i]); vy.push(v.el[i] * 1e6); }
  res.plots.push({ title: 'İlk darbe: IMU (LOS eksenine izdüşüm) ve video', xLabel: 's', yLabel: 'µrad',
    series: [{ name: 'IMU', x: Float32Array.from(xs), y: Float32Array.from(ys1) }, { name: 'Video (50 fps)', x: Float32Array.from(vx), y: Float32Array.from(vy), dots: true }] });
  return res;
};
// T0.5 — boresight referansı (basit istatistiksel model)
TESTS['T0.5'] = function (P, ctx) {
  const rng = new RNG(hash32(seedOf(P, 505), ctx.block || 0));
  const chans = ['MWIR-NFOV', 'MWIR-WFOV', 'HDTV-NFOV', 'SWIR-NFOV', 'LRF'];
  if (!ctx.bore) ctx.bore = chans.map((c, i) => ({ c, az: i ? 40 * rng.gauss() : 0, el: i ? 40 * rng.gauss() : 0 }));
  const acc = 15;    // µrad (Honlet & Wehrenberg 2015: ≈ 15 µrad / 3″)
  const meas = ctx.bore.map(b => ({ c: b.c, az: b.az + acc / Math.SQRT2 * rng.gauss(), el: b.el + acc / Math.SQRT2 * rng.gauss() }));
  ctx.boreRef = meas;
  const res = mkResult('T0.5', { status: 'BİLGİ', measured: 'Kanal paralellik referansı kaydedildi (ölçüm doğruluğu ≈ 15 µrad).',
    kv: meas.map(m => [m.c, `az ${fmt(m.az, 1)} µrad, el ${fmt(m.el, 1)} µrad`]),
    notes: ['Basit istatistiksel model: kanal eksenleri arasındaki sabit farklar ve 15 µrad ölçüm doğruluğu. Kabul için proje boresight gereksinimini girin (Model sekmesi).', 'Her dinamik blok öncesi ve sonrası tekrarlanır; kalıcı kayma T4.1\'de değerlendirilir.'] });
  return res;
};
// T0.6 — gyro Allan varyansı (gyro ham çıkışı, döngü dışında; birkaç saat)
TESTS['T0.6'] = function (P, ctx, prog) {
  const G = P.dut.gyro, fs = 100, hours = 4, n = Math.round(hours * 3600 * fs);
  const rng = new RNG(hash32(606, seedOf(P, 1))), gm = new BiasProcess(G.bi * DEGPH, new RNG(hash32(606, seedOf(P, 2))), 1 / fs);
  const nstd = G.arw * DEGPSQH * Math.sqrt(fs), b0 = G.bias0 * DEGPH;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = b0 + gm.step() + nstd * rng.gauss(); if (prog && (i % 200000 === 0)) prog(i / n * 0.7); }
  const taus = logspace(0.02, 3600, 46);
  const ad = allanDev(x, fs, Array.from(taus));
  if (prog) prog(0.95);
  // ARW: −1/2 eğimli bölgede σ(τ)·√τ (τ = 1 s'ye en yakın); bias kararsızlığı: düz taban / 0.664
  let i1 = 0; for (let i = 0; i < ad.length; i++) if (Math.abs(Math.log(ad[i].tau)) < Math.abs(Math.log(ad[i1].tau))) i1 = i;
  const arw = ad[i1].adev * Math.sqrt(ad[i1].tau) / DEGPSQH;
  let mn = Infinity, im = 0; for (let i = 0; i < ad.length; i++) if (ad[i].adev < mn) { mn = ad[i].adev; im = i; }
  const bi = mn / 0.664 / DEGPH;
  const relErr = (K) => 1 / Math.sqrt(2 * Math.max(1, K - 1));
  const okA = arw <= P.wb.H.arw, okB = bi <= P.wb.H.bias;
  ctx.gyro = { arw, bi };
  const tau = P.wb.tau, e96 = arw * DEGPSQH * Math.sqrt(tau), e99 = bi * DEGPH * tau;     // ARW·√τ ve B·τ (B1-05 / B1-06, τ metriği)
  // v13.9 (§8 K2): B1-05 wander penceresinin metriğiyle (ARW·√(T_w/15)); B1-06 drift satırıdır (B·τ)
  const rwWin = rwWindow(P), Tw = P.ana.Tw, e96w = arw * DEGPSQH * Math.sqrt(Tw / 15);
  const res = mkResult('T0.6', {
    status: stat(okA && okB), measured: `ARW ${fmt(arw, 5)} °/√h (sınır ${P.wb.H.arw}), bias kararsızlığı ${fmt(bi, 4)} °/h (sınır ${P.wb.H.bias})`,
    kv: [['ARW (τ = ' + fmt(ad[i1].tau, 2) + ' s)', fmt(arw, 5) + ' °/√h ± ' + fmt(relErr(ad[i1].K) * 100, 1) + ' %'], ['Bias kararsızlığı (taban τ = ' + fmt(ad[im].tau, 0) + ' s)', fmt(bi, 4) + ' °/h ± ' + fmt(relErr(ad[im].K) * 100, 1) + ' %'],
         ['Model değerleri (DUT)', `ARW ${G.arw} °/√h, BI ${G.bi} °/h`], ['Kayıt', hours + ' saat, ' + fs + ' Hz'],
         ...(rwWin ? [['B1-05 karşılığı ARW·√(T_w/15) (wander penceresi T_w = ' + Tw + ' s, doğrusal trend)', urad(e96w, 3) + ' µrad'], ['Drift karşılığı ARW·√τ (τ = ' + tau + ' s)', urad(e96, 3) + ' µrad']]
                  : [['B1-05 karşılığı ARW·√τ (τ = ' + tau + ' s)', urad(e96, 3) + ' µrad']]),
         ['B1-06 karşılığı B·τ (τ = ' + tau + ' s' + (rwWin ? '; yalnız drift' : '') + ')', urad(e99, 3) + ' µrad']],
    notes: ['Allan sapmasının göreli tahmin hatası ≈ 1/√(2(K−1)); uzun τ\'da kayıt kısa kalırsa bias kararsızlığı iyimser görünür (IEEE Std 952-1997).'],
    fill: { 'B1-05': rwWin ? e96w : e96, 'B1-06': e99 },
    num: { arw, bi, relA: relErr(ad[i1].K), relB: relErr(ad[im].K) },
  });
  res.plots.push({ title: 'Allan sapması (gyro ham çıkışı)', xLabel: 'τ (s)', yLabel: '°/h', xLog: true, yLog: true,
    series: [{ name: 'σ(τ)', x: Float32Array.from(ad.map(a => a.tau)), y: Float32Array.from(ad.map(a => a.adev / DEGPH)), dots: true }],
    refLines: [{ y: P.wb.H.bias * 0.664, label: '0,664 × bias sınırı' }] });
  return res;
};
// T0.7 — dünya dönüşü kompanzasyonu ve drift sağlaması
// v13.7 (§7): T0.7 eşikleri bütçenin drift satırıyla aynı bileşimle. Gyro bias payı = H.bias (kararsızlık) + ek satırlar açıksa
// sabit bias artığı H.b0_res ve sıcaklık kayması |tc_bias·ΔT| (computeBudget: E99 + Eb0); kompanzasyon artığı Ω·δ (E119).
// KAPALI: |ölçülen − hesap| ≤ %10·hesap + bias payı (hesabın 0 olduğu eksende göreli ölçüt tanımsızdı).
function earthLimits(P) {
  const H = P.wb.H, E = P.wb.earth, ext = P.wb.extRows !== false;
  const biasDph = H.bias + (ext ? (H.b0_res || 0) + Math.abs((H.tc_bias || 0) * (H.dT || 0)) : 0);
  const bias = biasDph * DEGPH, comp = E.Omega * E.delta_deg * D2R;
  return { biasDph, bias, comp, on: comp + bias, offTol: (calc) => 0.1 * calc + bias, ext };
}
TESTS['T0.7'] = function (P, ctx, prog) {
  const d = derive(P);
  const tOff = Math.min(120, 0.8 * (Math.min(d.Nh / 2 * d.IFOV / Math.max(d.earthImg.h, 1e-12), d.Nv / 2 * d.IFOV / Math.max(d.earthImg.v, 1e-12))));
  const Ton = P.wb.unc.Trec;
  const fitRate = (R) => {
    const v = videoAngles(R, ctx); const t = [], e = [], x = [];
    for (let i = 0; i < v.t.length; i++) if (v.t[i] > 3 && v.ok[i]) { t.push(v.t[i]); e.push(v.el[i]); x.push(v.xel[i]); }
    const lin = (y) => { const n = t.length, tm = aMean(t), ym = aMean(y); let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (t[i] - tm) * (y[i] - ym); b += sq(t[i] - tm); } return a / b; };
    return { h: lin(x), v: lin(e), t, e, x, validFrac: t.length / Math.max(1, v.t.length) };
  };
  const Roff = runSim(P, labScenario(P, { label: 'T0.7 KAPALI', T: tOff + 3, fs: 2000, earthComp: false, seed: 701 }), (f) => prog && prog(f * tOff / (tOff + Ton)));
  const Ron = runSim(P, labScenario(P, { label: 'T0.7 AÇIK', T: Ton + 3, fs: 2000, earthComp: true, seed: 702, rec: { fs: 200, ch: ['opt_el', 'opt_xel', 'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel'] } }), (f) => prog && prog((tOff + f * Ton) / (tOff + Ton)));
  const off = fitRate(Roff), on = fitRate(Ron);
  const calcH = d.earthImg.h, calcV = d.earthImg.v, EL = earthLimits(P);
  const okOff = Math.abs(Math.abs(off.h) - calcH) <= EL.offTol(calcH) && Math.abs(Math.abs(off.v) - calcV) <= EL.offTol(calcV);
  const limOn = EL.on;
  const okOn = Math.abs(on.h) <= limOn && Math.abs(on.v) <= limOn;
  // v13.7: AÇIK kaymanın ayrıştırması (benzetim gerçeği; yalnız kayıt): kompanzasyon artığı (Ω̂ − Ω) ve gyro bias'ı, eğimleri
  const trA = recT(Ron), [ja, jb] = idxRange(trA, 3, Ton + 3);
  const slp = (ch) => { const x = trA.subarray(ja, jb), y = Ron.rec[ch].subarray(ja, jb), xm = aMean(x), ym = aMean(y); let a = 0, b = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - xm) * (y[i] - ym); b += sq(x[i] - xm); } return a / b; };
  const dec = { eEl: slp('dr_e_el'), eXel: slp('dr_e_xel'), bEl: slp('dr_b_el'), bXel: slp('dr_b_xel') };
  ctx.earth = { off, on };
  const res = mkResult('T0.7', {
    status: stat(okOff && okOn), measured: `KAPALI: yatay ${urad(Math.abs(off.h))}, düşey ${urad(Math.abs(off.v))} µrad/s (hesap ${urad(calcH, 1)} / ${urad(calcV, 1)}); AÇIK: ${urad(Math.abs(on.h), 3)} / ${urad(Math.abs(on.v), 3)} µrad/s (sınır ${urad(limOn)})`,
    kv: [['KAPALI kayıt süresi', fmt(tOff, 0) + ' s'], ['KAPALI yatay / düşey hız', urad(Math.abs(off.h), 2) + ' / ' + urad(Math.abs(off.v), 2) + ' µrad/s'],
         ['Hesaplanan (Model → Dünya dönüşü)', urad(calcH, 2) + ' / ' + urad(calcV, 2) + ' µrad/s'], ['Göreli fark', fmt((Math.abs(off.h) / calcH - 1) * 100, 2) + ' % / ' + fmt((Math.abs(off.v) / calcV - 1) * 100, 2) + ' %'],
         ['AÇIK kayıt süresi', fmt(Ton, 0) + ' s'], ['AÇIK yatay / düşey hız', urad(Math.abs(on.h), 3) + ' / ' + urad(Math.abs(on.v), 3) + ' µrad/s'],
         [`AÇIK eşik: Ω·δ + gyro bias payı (${EL.ext ? 'H.bias + sabit bias artığı + sıcaklık kayması' : 'H.bias'} = ${fmt(EL.biasDph, 3)} °/h; bütçe drift satırıyla aynı)`, `${urad(EL.comp, 3)} + ${urad(EL.bias, 3)} = ${urad(limOn, 2)} µrad/s`],
         ['KAPALI tolerans (%10·hesap + gyro bias payı)', `${urad(EL.offTol(calcH), 2)} / ${urad(EL.offTol(calcV), 2)} µrad/s`],
         ['AÇIK kaymanın ayrıştırması (benzetim gerçeği): kompanzasyon artığı / gyro bias el · xel', `${urad(Math.abs(dec.eEl), 3)} / ${urad(dec.bEl, 3)} · ${urad(Math.abs(dec.eXel), 3)} / ${urad(dec.bXel, 3)} µrad/s (bias payı varsayımı ${urad(EL.bias, 3)})`],
         ['Hedef alan dışına çıkma (KAPALI, hesap; kenar payı ' + P.ana.edgeMargin_px + ' px)', fmt(earthSheet(P).off.exit, 0) + ' s']],
    notes: ['AÇIK durumdaki artık, LOS\'a ve Ω\'ya dik yönde Ω·δ büyüklüğünde bir kompanzasyon hatası olarak modellenir; eksen başına izdüşümü Ω·δ sınırının altında kalır.',
            'v13.7: AÇIK eşiği gyro bias payını bütçenin drift satırıyla aynı bileşimle alır (kararsızlık + sabit bias artığı + sıcaklık kayması); KAPALI ölçütü, hesaplanan hızın sıfır olduğu eksende de tanımlı olacak biçimde mutlak toleranslıdır. Ayrıştırma satırı yalnız benzetimde vardır: gerçek düzenekte kompanzasyon artığı ile gyro bias\'ı tek kayıttan ayrılamaz.',
            'Drift ölçümünde kör trend çıkarılmaz; burada eğim zaten ölçülen büyüklüktür.'],
    fill: { 'H7': Math.max(Math.abs(on.h), Math.abs(on.v)) },
    num: { offH: off.h, offV: off.v, onH: on.h, onV: on.v, calcH, calcV, limOn, offTolH: EL.offTol(calcH), offTolV: EL.offTol(calcV), dec },
  });
  const dOff = decim(off.t, off.e.map(v => v * 1e6)), dOn = decim(on.t, on.e.map(v => v * 1e6));
  res.plots.push({ title: 'Video LOS (el) — kompanzasyon KAPALI / AÇIK', xLabel: 's', yLabel: 'µrad', series: [{ name: 'KAPALI', x: dOff.x, y: dOff.y }, { name: 'AÇIK', x: dOn.x, y: dOn.y }] });
  return res;
};

// ============================================================================
// 06_tests_b.js — B1 (deniz durumu, < 1 Hz) testleri
// ============================================================================
// Bütçe tahsisleri IFOV cinsindendir (v13): tablo, 40 µrad'lık referans IFOV (12 µm / 300 mm) için µrad olarak yazılmıştır;
// q = Q / 40 µrad (ör. B1-01 = 0,125 IFOV). Etkin tahsis Q = tablo × IFOV / IFOV_ref; IFOV_ref derive() ile aynı ifadeyle
// hesaplanır, varsayılan kanalda oran tam 1'dir. R-01 tahsisi k_roll·IFOV'dur (bütçe satırında).
const BUDGET_ALLOC = { 'B1-01': 5, 'B1-02': 3, 'B1-03': 3, 'B1-04': 4, 'B1-05': 2, 'B1-06': 1, 'B1-07': 4, 'B2-01': 6, 'B2-02': 3, 'B2-03': 3, 'B2-04': 2,
  'B2-05': 1, 'B2-06': 3, 'B3-01': 4, 'B3-02': 2, 'B3-03': 3, 'B3-04': 2 };
const ALLOC_IFOV_REF = 12 / 300 * 1e-3;
function ifovOf(P) { const wb = P.wb, ch = wb.channels.find(c => c.name === wb.refChannel) || wb.channels[0]; return ch.p_um / ch.f_mm * 1e-3; }
function budgetAlloc(P) { const r = ifovOf(P) / ALLOC_IFOV_REF, o = {}; for (const k of Object.keys(BUDGET_ALLOC)) o[k] = BUDGET_ALLOC[k] * r; return o; }
// tahsis metni: tamsayıysa olduğu gibi (varsayılan kanal), değilse iki ondalık
const fA = (x) => Number.isInteger(x) ? String(x) : fmt(x, 2);
// kaldıraç kolu metni: yalnız düşey bileşen varsa önceki sürümün ifadesi (h = … m), değilse r = (rx, ry, rz) m
function armTxt(P) { const r = seaArm(P); return r[0] === 0 && r[1] === 0 ? `h = ${fA(r[2])} m` : `r = (${r.map(fA).join(', ')}) m`; }
// sinüs testlerinin genliği (°): 'dar' eşdeğer sinüs genliği, '6dof' ± tepe genlik (kullanıcı kararı: sinüs testinde A)
function seaAmpDeg(P, ax) { const s = P.wb.sea; return s.mode === '6dof' ? s.dof[SEA_ANG[ax]].A : [s.roll_A, s.pitch_A, s.yaw_A][ax]; }
// baskın periyot (s): 'dar' girilen periyot, '6dof' bant merkezi 1/√(f1·f2)
function seaPeriod(P, ax) { const s = P.wb.sea; return s.mode === '6dof' ? 1 / seaDOF(P).ang[ax].fdom : [s.roll_T, s.pitch_T, s.yaw_T][ax]; }
// RMS (rad): gerekli DRR = tahsis / σ ('dar' ifadesi önceki sürümle aynı: A·D2R/√2)
function seaSigma(P, ax) { return seaDOF(P).ang[ax].sigma; }
// segment uydurmaları: giriş (IMU), çıkış (video el/xel, otokolimatör, gerçek LOS)
function fitSegments(P, R, segs, ctx) {
  const v = videoAngles(R, ctx), tr = recT(R), out = [];
  const imuCh = ['imu_r', 'imu_p', 'imu_y'];
  for (const s of segs) {
    const [i0, i1] = idxRange(tr, s.c0, s.c1);
    const fin = sineFit(tr, R.rec[imuCh[s.axis]], s.f, { i0, i1 });
    const [j0, j1] = idxRange(v.t, s.c0, s.c1);
    const fe = sineFit(v.t, v.el, s.f, { i0: j0, i1: j1, valid: v.ok }), fx = sineFit(v.t, v.xel, s.f, { i0: j0, i1: j1, valid: v.ok });
    const te = R.rec.opt_el ? sineFit(tr, R.rec.opt_el, s.f, { i0, i1 }) : null, tx = R.rec.opt_xel ? sineFit(tr, R.rec.opt_xel, s.f, { i0, i1 }) : null;
    const ae = R.rec.ac_el ? sineFit(tr, R.rec.ac_el, s.f, { i0, i1 }) : null, ax = R.rec.ac_xel ? sineFit(tr, R.rec.ac_xel, s.f, { i0, i1 }) : null;
    let nv = 0; for (let j = j0; j < j1; j++) nv += v.ok[j];
    const vf = nv / Math.max(1, j1 - j0), vok = vf >= 0.95;          // hedef alan dışına çıktıysa video uydurması geçersiz
    out.push({ seg: s, fin, fe: vok ? fe : null, fx: vok ? fx : null, te, tx, ae, ax, validFrac: vf });
  }
  return out;
}
function drrOf(fo, fi) { return fo && fi ? db(fo.A / fi.A) : NaN; }
function signif(fo) { return fo && fo.A > 3 * fo.seA; }
// deniz spektrumu ağırlıklı artık kestirimi: ölçülen DRR noktalarından log-log ara değer
function seaWeightedResidual(P, ax, pts) {
  const Dq = seaDOF(P), six = Dq.six, q6 = Dq.ang[ax];
  const A = six ? q6.sigma * Math.SQRT2 : seaAmpDeg(P, ax) * D2R, fp = 1 / seaPeriod(P, ax), sh = six ? q6.shape : shapeLogGauss(fp, P.env.seaWidth);
  const fA = six ? q6.f1 / 2 : fp / 3, fB = six ? q6.f2 * 2 : fp * 3;     // 6-DOF: bant ±1 oktav; dar: önceki sürümle aynı
  const fs = []; let norm = 0;
  for (let f = fA; f <= fB; f *= 1.01) { const s = sh(f); fs.push([f, s]); norm += s * f * 0.00995; }
  const g = (f) => {
    const p = pts.slice().sort((a, b) => a.f - b.f);
    if (f <= p[0].f) return p[0].drr + (p.length > 1 ? (p[1].drr - p[0].drr) / Math.log10(p[1].f / p[0].f) * Math.log10(f / p[0].f) : 0);
    for (let i = 1; i < p.length; i++) if (f <= p[i].f) return p[i - 1].drr + (p[i].drr - p[i - 1].drr) * Math.log10(f / p[i - 1].f) / Math.log10(p[i].f / p[i - 1].f);
    return p[p.length - 1].drr;
  };
  let s = 0; for (const [f, v] of fs) s += v * f * 0.00995 * Math.pow(10, g(f) / 10);
  return (A / Math.SQRT2) * Math.sqrt(s / norm);
}
// T1.1 — tek eksen sinüs, DRR(f)
TESTS['T1.1'] = function (P, ctx, prog) {
  const d = derive(P), AL = budgetAlloc(P);
  // test frekansları (0,05–1 Hz) + her eksenin baskın deniz frekansı (gerekli DRR bu frekansta tanımlıdır)
  const D6 = seaDOF(P), edges = D6.six ? [0, 1, 2].flatMap(ax => [D6.ang[ax].f1, D6.ang[ax].f2]) : [];    // 6-DOF: bant kenarları da
  const freqs = Array.from(new Set([0.05, 0.1, 0.2, 0.5, 1, 1 / seaPeriod(P, 0), 1 / seaPeriod(P, 1), 1 / seaPeriod(P, 2), ...edges].map(f => Math.round(f * 1e4) / 1e4))).sort((a, b) => a - b);
  const rowOf = ['B1-01', 'B1-02', 'B1-03'];
  const allRes = [], plots = [];
  let ok = true, okB = true; const kv = [], fill = {}, invalidAx = [], badB = [];
  const axes = [0, 2, 1];
  axes.forEach((ax, ia) => {
    const list = freqs.map(f => ({ axis: ax, f, A: Math.min(seaAmpDeg(P, ax), d.reach(f)) * D2R, nper: 10 }));
    // baskın frekansta yarım genlik ek segmenti: doğrusal artık genlikle ölçeklenir, Coulomb sürtünmesinin temel bileşeni ölçeklenmez
    const fDom0 = Math.round(1 / seaPeriod(P, ax) * 1e4) / 1e4;
    list.push({ axis: ax, f: fDom0, A: 0.5 * Math.min(seaAmpDeg(P, ax), d.reach(fDom0)) * D2R, nper: 10, half: true });
    const sg = segSines(list);
    const S = labScenario(P, { label: 'T1.1 ' + AXN[ax], T: sg.T, fs: 2000, cmd: sg.cmd, seed: 1100 + ax });
    const R = runSim(P, S, (f) => prog && prog((ia + f) / 3));
    const fits = fitSegments(P, R, sg.segs, ctx);
    const map = axisMap(P, ax);
    const req = db(AL[rowOf[ax]] * 1e-6 / seaSigma(P, ax));
    const pts = [], fDom = fDom0;
    let twoAmp = null;
    {
      const full = fits.find(r => !r.seg.half && Math.abs(r.seg.f - fDom) < 1e-6), half = fits.find(r => r.seg.half);
      const pr = (r) => map.los === 'el' ? r.fe : (map.los === 'xel' ? r.fx : null);
      if (full && half && pr(full) && pr(half) && full.fin && half.fin) {
        // giriş fazına göre normalize edilmiş çıkış fazörü: R/X̂ = L·|X| + F
        const nrm = (r) => { const fo = pr(r), xi = r.fin; const xr = xi.a / xi.A, xim = xi.b / xi.A; return { re: fo.a * xr + fo.b * xim, im: fo.b * xr - fo.a * xim, A: xi.A }; };
        const n1 = nrm(full), n2 = nrm(half), dA = n1.A - n2.A;
        const Lr = (n1.re - n2.re) / dA, Li = (n1.im - n2.im) / dA;
        const Fr = n1.re - Lr * n1.A, Fi = n1.im - Li * n1.A;
        twoAmp = { L: Math.hypot(Lr, Li), F: Math.hypot(Fr, Fi) };
      }
    }
    for (const r of fits) {
      if (r.seg.half) continue;
      const f = r.seg.f;
      const prim = map.los === 'el' ? r.fe : (map.los === 'xel' ? r.fx : null);
      const primT = map.los === 'el' ? r.te : (map.los === 'xel' ? r.tx : null);
      if (!prim && map.los !== 'rot') { allRes.push({ ax, f, A: r.fin ? r.fin.A : NaN, drr: NaN, drrT: primT ? drrOf(primT, r.fin) : NaN, sig: false, bound: NaN, req, isDom: Math.abs(f - fDom) < 1e-6, el: null, xel: null, prim: map.los, invalid: true }); continue; }
      const drr = prim ? drrOf(prim, r.fin) : NaN, drrT = primT ? drrOf(primT, r.fin) : NaN;
      const sig = prim ? signif(prim) : false;
      const bound = prim ? db((prim.A + 3 * prim.seA) / r.fin.A) : NaN;
      const isDom = Math.abs(f - fDom) < 1e-6;
      if (prim && isDom && (twoAmp ? db(twoAmp.L) : (sig ? drr : bound)) > req) ok = false;
      pts.push({ f, drr: sig ? drr : bound, drrT, sig });
      allRes.push({ ax, f, A: r.fin.A, drr, drrT, sig, bound, req, isDom, el: r.fe, xel: r.fx, prim: map.los });
    }
    if (map.los !== 'rot') {
      const dom = allRes.find(q => q.ax === ax && q.isDom);
      if (!dom || dom.invalid) { invalidAx.push(AXN[ax]); kv.push([`${AXN[ax]} → ${map.los}`, 'baskın frekans segmenti geçersiz (hedef görüş alanı dışında)']); return; }
      const resid = seaWeightedResidual(P, ax, pts.filter(p => isFinite(p.drr)));
      kv.push([`${AXN[ax]} → ${map.los}: ölçülen DRR @ baskın ${fmt(fDom, 4)} Hz`, (dom.sig ? fmt(dom.drr, 1) : '≤ ' + fmt(dom.bound, 1)) + ' dB (gerçek LOS ' + fmt(dom.drrT, 1) + ' dB)'],
              [`${AXN[ax]}: iki genlikten doğrusal DRR / gerekli`, (twoAmp ? fmt(db(twoAmp.L), 1) : '—') + ' / ' + fmt(req, 1) + ' dB'],
              [`${AXN[ax]}: genlikten bağımsız bileşen (sürtünme temel harmoniği)`, twoAmp ? urad(twoAmp.F / Math.SQRT2, 2) + ' µrad RMS' : '—'],
              [`${AXN[ax]}: deniz spektrumu ağırlıklı artık (ölçülen DRR'dan)`, fmt(resid * 1e6, 2) + ' µrad RMS (tahsis ' + fA(AL[rowOf[ax]]) + ')']);
      fill[rowOf[ax]] = resid;
      if (resid > AL[rowOf[ax]] * 1e-6) { okB = false; badB.push(`${AXN[ax]} ${fmt(resid * 1e6, 2)} > ${fA(AL[rowOf[ax]])} µrad`); }
      plots.push({ ax, pts });
    } else {
      // LOS ekseni etrafında uyarım: el/xel'deki çapraz eksen yanıtı = ε × açı (B1-04)
      const cr = fits.filter(r => r.seg.f <= 0.3 && r.fe && r.fx && r.fin).map(r => Math.max(r.fe.A, r.fx.A) / r.fin.A);
      if (!cr.length) { invalidAx.push(AXN[ax]); kv.push([`${AXN[ax]} (LOS ekseni etrafında)`, 'segmentler geçersiz (hedef görüş alanı dışında)']); return; }
      const eps = aMean(cr), opRms = seaSigma(P, ax);
      // v13.11 (§11): el ve xel katsayıları ayrı da yazılır (xel eksen kaçıklığı Model'de ayrı girilir); kabul ve dolgu önceki gibi büyük olanla
      const sel = fits.filter(r => r.seg.f <= 0.3 && r.fe && r.fx && r.fin), cE = aMean(sel.map(r => r.fe.A / r.fin.A)), cX = aMean(sel.map(r => r.fx.A / r.fin.A));
      kv.push([`${AXN[ax]} (LOS ekseni etrafında): çapraz eksen katsayısı`, fmt(eps * 1e3, 4) + ' mrad/rad (el ' + fmt(cE * 1e3, 4) + ' / xel ' + fmt(cX * 1e3, 4) + '; model ε el ' + P.dut.gyro.epsEl + ' / xel ' + P.dut.gyro.epsXel + ' mrad)'],
              [`${AXN[ax]}: işletme karşılığı ε·θ_RMS (B1-04 tipi)`, fmt(eps * opRms * 1e6, 2) + ' µrad RMS (tahsis ' + fA(AL['B1-04']) + ')']);
      fill['B1-04'] = eps * opRms;
    }
  });
  // her eksen ve her frekansta DRR(f) ≤ gerekli DRR sayımı (bilgi; kabul baskın frekansta)
  const lit = allRes.filter(r => r.prim !== 'rot' && !r.invalid && isFinite(r.sig ? r.drr : r.bound));
  const litFail = lit.filter(r => (r.sig ? r.drr : r.bound) > r.req);
  kv.push(['Her eksen ve frekansta DRR ≤ gerekli DRR (bilgi)', `${lit.length - litFail.length}/${lit.length} nokta sağlıyor` + (litFail.length ? '; aşanlar: ' + litFail.map(r => `${AXN[r.ax]} ${fmt(r.f, 3)} Hz (${fmt(r.sig ? r.drr : r.bound, 1)} > ${fmt(r.req, 1)} dB)`).join(', ') : '')]);
  const res = mkResult('T1.1', {
    status: invalidAx.length ? 'GEÇERSİZ' : stat(ok && okB), measured: (invalidAx.length ? `geçersiz eksen ${invalidAx.join(', ')}; ` : '') + (badB.length ? `deniz spektrumu ağırlıklı artık tahsisi aşıyor (${badB.join(', ')}); ` : '') + 'DRR(f) eğrisi: ' + allRes.filter(r => r.prim !== 'rot' && r.f <= 0.3).map(r => `${AXN[r.ax]} ${fmt(r.f, 3)} Hz ${r.invalid ? 'geçersiz' : (r.sig ? fmt(r.drr, 1) : '≤ ' + fmt(r.bound, 1)) + ' dB'}${r.isDom ? '*' : ''}`).join('; ') + ' (* baskın frekans, kabul burada)' +
      `; her frekansta DRR ≤ gerekli: ${lit.length - litFail.length}/${lit.length} nokta`,
    kv, fill,
    notes: ['Giriş referans IMU\'dan (komuttan değil), çıkış sonsuzdaki hedefi izleyen videodan alındı; her segmentte sinüs + doğrusal trend uyduruldu (dünya dönüşü rampası).',
            'Baskın frekansta iki genlikte (A ve A/2) ölçülür: doğrusal artık genlikle ölçeklenir, Coulomb sürtünmesinin temel bileşeni ölçeklenmez; ikisi fazörlerle ayrılır. Kabul doğrusal DRR\'a uygulanır, sürtünme bileşeni B1-07 ile karşılaştırılır.',
            'Kabul iki koşulludur: (1) girdi genliğinin tanımlandığı baskın deniz frekansında doğrusal DRR ≤ gerekli DRR; (2) deniz spektrumu ağırlıklı artık ≤ tahsis (bandın tamamı; sürtünmenin temel bileşenini de içerdiği için muhafazakâr). Diğer frekanslardaki tekil karşılaştırmalar bilgi amaçlıdır. Her eksen ve frekansta DRR ≤ gerekli DRR sayımı ayrıca raporlanır: test genliği her frekansta deniz genliğine eşit tutulduğu, integratörlü bir döngünün DRR\'ı ise frekansla 20–30 dB/dekad arttığı için bu sayım, bütçenin B1-01 varsayımını (−80 dB, baskın roll frekansında) taşıyan bir döngüyü bile 0,5–1 Hz\'de aşıyor gösterir. Tutarlı ölçüt frekansa bağlı gerekli DRR\'dır: DRR_req(f) = tahsis / (o frekanstaki deniz genliği); spektrum ağırlıklı artık bunu uygular. Bu değer sürtünmenin temel bileşenini de içerir (B1-07 ile örtüşür).',
            'Genlik yeterince büyük değilse (A < 3σ) yalnız üst sınır raporlanır.',
            'LOS iskele yönündeyken pitch, LOS ekseni etrafında döner: el/xel\'deki yanıtı gyro eksen kaçıklığıdır (B1-04), asıl etkisi görüntü rotasyonudur (T1.5). xel yanıtına ayrıca optik alt montajın yerçekimi sarkmasının görüntüyle birlikte dönmesi eklenir (ε_g = g·∂θ/∂a ≈ ' + fmt(P.dut.modes.opt.gAcc * 9.80665 * 1e3, 4) + ' mrad/rad); bu test iki mekanizmayı ayıramaz.'],
    rows: allRes,
  });
  const ser = [];
  for (const p of plots) { const q2 = p.pts.filter(q => isFinite(q.drr)); ser.push({ name: AXN[p.ax] + ' (ölçülen)', x: Float32Array.from(q2.map(q => q.f)), y: Float32Array.from(q2.map(q => q.drr)), dots: true }); }
  const fa = logspace(0.03, 2, 60);
  ser.push({ name: 'Model (el döngüsü)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(d.loopEl.drr(TAU * f))))) });
  ser.push({ name: 'Model (az döngüsü)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(d.loopAz.drr(TAU * f))))) });
  res.plots.push({ title: 'Bozucu bastırma oranı DRR(f)', xLabel: 'Hz', yLabel: 'dB', xLog: true, series: ser,
    refLines: [{ y: db(AL['B1-01'] * 1e-6 / seaSigma(P, 0)), label: 'Gerekli DRR, roll (B1-01)' }] });
  return res;
};
// T1.2 — stab OFF sağlaması (kazanç = 1)
TESTS['T1.2'] = function (P, ctx, prog) {
  const d = derive(P), freqs = [0.05, 0.1, 0.2, 0.5, 1], A = Math.min(0.5, d.stabOffMax) * D2R;
  const kv = []; let ok = true; let worst = 0; const pts = [];
  [0, 2].forEach((ax, ia) => {
    const list = freqs.map(f => ({ axis: ax, f, A: Math.min(A, d.reach(f) * D2R), nper: 5 }));
    const sg = segSines(list);
    const R = runSim(P, labScenario(P, { label: 'T1.2', T: sg.T, fs: 2000, stab: false, cmd: sg.cmd, seed: 1200 + ax }), (f) => prog && prog((ia + f) / 2));
    const fits = fitSegments(P, R, sg.segs, ctx), map = axisMap(P, ax);
    for (const r of fits) {
      const fo = map.los === 'el' ? r.fe : r.fx;
      const g = fo.A / (r.fin.A * Math.abs(map.w));
      worst = Math.max(worst, Math.abs(g - 1));
      if (Math.abs(g - 1) > 0.02) ok = false;
      pts.push({ ax, f: r.seg.f, g, valid: r.validFrac });
      if (r.validFrac < 0.999) ok = false;
    }
  });
  const res = mkResult('T1.2', { num: { worst, pts },
    status: stat(ok), measured: `En büyük |kazanç − 1| = ${fmt(worst * 100, 3)} % (genlik ${fmt(A * R2D, 2)}° ≤ ${fmt(d.stabOffMax, 2)}°)`,
    kv: pts.map(p => [`${AXN[p.ax]} ${p.f} Hz`, `kazanç ${fmt(p.g, 4)}, geçerli kare ${fmt(p.valid * 100, 1)} %`]),
    notes: [ctx.IFOVcal ? 'Ölçek T0.1\'deki kalibre IFOV ile çevrildi.' : 'T0.1 çalıştırılmadı: nominal IFOV kullanıldı; plaka ölçeği hatası doğrudan kazanca yansır.',
            'Kazanç 1 çıkmıyorsa ölçek, işaret veya eksen eşlemesi yanlıştır ve bütün DRR sonuçları da yanlış olur.'],
  });
  res.plots.push({ title: 'Stab OFF kazancı', xLabel: 'Hz', yLabel: 'kazanç', xLog: true,
    series: [0, 2].map(ax => ({ name: AXN[ax], x: Float32Array.from(pts.filter(p => p.ax === ax).map(p => p.f)), y: Float32Array.from(pts.filter(p => p.ax === ax).map(p => p.g)), dots: true })),
    refLines: [{ y: 1.02, label: '+%2' }, { y: 0.98, label: '−%2' }] });
  return res;
};
// deniz profili senaryosu (laboratuvar, hexapod)
function seaLabScenario(P, o) {
  const T = o.T || 600, rngf = makeRngFactory(seedOf(P, o.seed));
  // açısal deniz profili; 6-DOF kipinde ve kaldıraç kolunda hexapod ötelemesi (strokla sınırlı, ortak q oranı)
  const SM = seaMotion(P, T, rngf, { world: 'lab' });
  const cmd = SM.cmd;
  let trans = SM.trans.length ? SM.trans.slice() : null, resF;
  if (o.viv) {
    const VS = vivSpec(P);
    if (!isShip(P) && !VS.lin) { resF = o.vivF || P.wb.viv.fn; cmd.push({ type: 'sine', axis: 0, A: P.wb.viv.amp_deg * D2R, f: resF, t0: 10, ramp: 5 }); }   // denizaltı, yalnız açısal (uyum kipi)
    else if (VS.present) {      // gemi ve (v13.3) denizaltı: açısal + öteleme tonu; deniz ötelemesi tona strok bırakır (v13.3)
      resF = o.vivF || VS.f; const tn = windTone(P, VS, resF, 10, null, 5); cmd.push(...tn.cmd);
      if (tn.y > 0 && SM.trans.length) SM.q = reserveStroke(P, SM, tn.y);
      trans = (trans || []).concat(tn.trans);
    }
  }
  const base = { label: o.label || 'Deniz profili', T, fs: 2000, cmd, seed: o.seed,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y', 'rot', 'rot_res', 'trk_el'] } };
  if (trans && trans.length) base.trans = trans;
  if (resF) base.resF = resF;          // uyarlanır dar bant kontrol VIV tonunu izler (T2.2 ve işletme benzetimiyle aynı)
  const S = labScenario(P, Object.assign(base, o.extra || {}));
  if (SM.trans.length) {
    S.seaQ = SM.q; S.seaDemand = SM.demand;     // laboratuvarda üretilebilen öteleme oranı (bilgi)
    // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırılır (göz bebeği kayması e ≤ e_free); açısal komut ve VIV
    // tonu değişmez. Ötelemenin işletme ivmesindeki etkisini T2.5 ivme eşdeğeriyle ölçer.
    // sığdırma stab ON geometrisiyle yapılır (test planının hareketi); stab OFF koşuları aynı ötelemeyi kullanır
    const F = fitTransToColl(P, Object.assign({}, S, { stab: true }), SM.trans); S.seaQc = F.qc; S.seaE1 = F.e1;
  }
  return S;
}
function profileMetrics(P, R, ctx, skip) {
  const v = videoAngles(R, ctx), fps = R.video.fps, perWin = Math.round(P.ana.Tw * fps);
  const sel = (a) => { const o = [], k = []; for (let i = 0; i < a.length; i++) if (v.t[i] > skip) { o.push(a[i]); k.push(v.ok[i]); } return { x: Float64Array.from(o), ok: Uint8Array.from(k) }; };
  const e = sel(v.el), x = sel(v.xel);
  const wE = windowedWander(e.x, e.ok, perWin, P.ana.detrend), wX = windowedWander(x.x, x.ok, perWin, P.ana.detrend);
  let nOk = 0; for (let i = 0; i < e.ok.length; i++) nOk += e.ok[i];
  const Vt = sliceVideo(R.video, skip), tm = videoMetrics(Vt, { which: 'true', Tw: P.ana.Tw, detrend: P.ana.detrend, tau: P.wb.tau, pdeWin: P.ana.pdeWin });
  // EIS (yol yumuşatma) — ölçülen kare dizisine
  const eis = P.wb.eis, rng = new RNG(seedOf(P, 4242));
  const eisE = applyEIS(e.x, e.ok, fps, eis.fc, eis.eta, eis.reg_px * R.meta.IFOV, rng), eisX = applyEIS(x.x, x.ok, fps, eis.fc, eis.eta, eis.reg_px * R.meta.IFOV, rng);
  const lockE = applyEIS(e.x, e.ok, fps, 0, eis.eta, eis.reg_px * R.meta.IFOV, rng);
  const wEisE = windowedWander(eisE, e.ok, perWin, P.ana.detrend), wEisX = windowedWander(eisX, x.ok, perWin, P.ana.detrend), wLockE = windowedWander(lockE, e.ok, perWin, P.ana.detrend);
  return { wander: { el: wE.rms, xel: wX.rms, radial: Math.hypot(wE.rms, wX.rms) }, p99: { el: aPctAbs(wE.resid, 99), xel: aPctAbs(wX.resid, 99) },
    p95: { el: aPctAbs(wE.resid, 95), xel: aPctAbs(wX.resid, 95) }, fovStay: nOk / Math.max(1, e.ok.length), trueM: tm,
    eis: { el: wEisE.rms, xel: wEisX.rms, lockEl: wLockE.rms }, residE: wE.resid, series: { t: v.t, el: v.el, xel: v.xel, ok: v.ok } };
}
const R0fps = (out) => { const s0 = out[0].m.series; return s0.t.length > 1 ? 1 / (s0.t[1] - s0.t[0]) : 50; };
// T1.3 — gerçekçi deniz profili (çok eksenli, ≥ 10 dk, 3 tohum)
TESTS['T1.3'] = function (P, ctx, prog) {
  const d = derive(P), nS = Math.max(1, P.ana.seeds | 0), T = 600, out = [];
  const wf = P.wb.channels.find(c => c.name === 'MWIR-WFOV' && c.name !== P.wb.refChannel), nTot = nS + (wf ? 1 : 0);
  for (let s = 0; s < nS; s++) {
    const S = seaLabScenario(P, { T: T + 20, seed: 1301 + s });
    const lim = hexLimitCheck(P, S);
    const R = runSim(P, S, (f) => prog && prog((s + f) / nTot));
    out.push({ m: profileMetrics(P, R, ctx, 20), lim, R, q: S.seaQ, qc: S.seaQc, e1: S.seaE1, dem: S.seaDemand, S });
  }
  // v13.4: göz bebeği ↔ kolimatör demeti (tohum 1; deniz profili + kaldıraç kolu ötelemesi)
  const PX = pupilExcursion(P, out[0].S), PXt = pupilTxt(P, PX);
  // WFOV kanalı (test tanımı: NFOV ve WFOV): aynı taban hareketi (tohum 1), kanalın kendi IFOV'u ve gereksinimi k_wander·IFOV_WFOV
  let W = null;
  if (wf) {
    const Rw = runSim(P, seaLabScenario(P, { T: T + 20, seed: 1301, extra: { channel: wf.name } }), (f) => prog && prog((nS + f) / nTot));
    const IFw = wf.p_um / wf.f_mm * 1e-3, ctxW = { IFOVcal: ctx.IFOVcal ? IFw * ctx.IFOVcal / d.IFOV : IFw };
    const mW = profileMetrics(P, Rw, ctxW, 20);
    W = { name: wf.name, IF: IFw, m: mW, req: P.wb.k_wander * IFw, p99req: P.wb.k_conf * P.wb.k_wander * IFw };
  }
  const mx = (k1, k2) => Math.max(...out.map(o => o.m[k1][k2]));
  const wEl = mx('wander', 'el'), wXel = mx('wander', 'xel'), p99 = Math.max(mx('p99', 'el'), mx('p99', 'xel'));
  const fov = Math.min(...out.map(o => o.m.fovStay)), clip = Math.max(...out.map(o => o.lim.clipFrac));
  const okW = !W || (Math.max(W.m.wander.el, W.m.wander.xel) <= W.req && Math.max(W.m.p99.el, W.m.p99.xel) <= W.p99req && W.m.fovStay >= 0.9999);
  const ok = wEl <= d.req.wander && wXel <= d.req.wander && p99 <= d.req.p99 && fov >= 0.9999 && okW;
  // hexapod θ/ω/α sınırları profilin bir kısmında aşılıyorsa test tanımlandığı gibi üretilemez: GEÇERSİZ (DUT kararı verilmez)
  ctx.T13 = { wEl, wXel, perSeed: out.map(o => o.m.wander) };
  const m0 = out[0].m;
  // taban düzeltmesi: masa mikro-titreşiminin video zincirine geçen payı karesel düşülür (kip: Model → Hexapod)
  const mvOn = (P.wb.hex.mvCorr || 'kapalı') !== 'kapalı', sh = mvOn ? tableShare(P) : null;
  const cE = mvOn ? tableCorr(P, wEl, sh.on.vid.el) : null, cX = mvOn ? tableCorr(P, wXel, sh.on.vid.xel) : null;
  const fullE = Math.sqrt(Math.max(0, wEl * wEl - sq(P.wb.hex.microvib * URAD)));
  // v13.7 (K2): karar belirsizliği — tohumlar arası saçılım (tek gerçekleşme) ⊕ kalibre ölçek; düzeltilmemiş toplanır video tabanı yanlılık
  const sdOf = (k) => { const v = out.map(o => o.m.wander[k]), m = aMean(v); return v.length > 1 ? Math.sqrt(v.reduce((t, y) => t + sq(y - m), 0) / (v.length - 1)) : 0; };
  const fl3 = turInfo(P).uvAdd * URAD, sr3 = scaleRelOf(P, ctx);
  const G13 = [decisionGuard(P, { x: wEl, R: d.req.wander, uStat: sdOf('el'), rel: [sr3], floor: fl3, label: 'wander el' }),
               decisionGuard(P, { x: wXel, R: d.req.wander, uStat: sdOf('xel'), rel: [sr3], floor: fl3, label: 'wander xel' })];
  const res = mkResult('T1.3', {
    status: clip > 0 ? 'GEÇERSİZ' : stat(ok), measured: `Wander (en kötü tohum) el ${urad(wEl)} / xel ${urad(wXel)} µrad RMS; P99 ${urad(p99)} µrad; FOV'da kalma ${fmt(fov * 100, 2)} %; kırpma ${fmt(clip * 100, 3)} %` +
      (W ? `; ${W.name}: ${urad(W.m.wander.el)} / ${urad(W.m.wander.xel)} µrad (gereksinim ${urad(W.req, 0)})` : ''),
    kv: [['Tohum başına wander el/xel (µrad)', out.map(o => urad(o.m.wander.el) + '/' + urad(o.m.wander.xel)).join(' · ')],
         ...(W ? [[`${W.name} (IFOV ${fmt(W.IF * 1e6, 0)} µrad), tohum 1`, `wander el/xel ${urad(W.m.wander.el)} / ${urad(W.m.wander.xel)} µrad = ${fmt(W.m.wander.el / W.IF, 3)} / ${fmt(W.m.wander.xel / W.IF, 3)} px; P99 ${urad(Math.max(W.m.p99.el, W.m.p99.xel))} µrad (gereksinim ${urad(W.req, 0)} / ${urad(W.p99req, 0)} µrad)`]] : []),
         ['Radyal wander (tohum 1)', urad(m0.wander.radial) + ' µrad = ' + fmt(m0.wander.radial / d.IFOV, 3) + ' px'],
         ['P95 / P99 (el, tohum 1)', urad(m0.p95.el) + ' / ' + urad(m0.p99.el) + ' µrad'],
         ['Gerçek LOS (simülasyon): wander / smear el', urad(m0.trueM.wander.el) + ' / ' + urad(m0.trueM.smear.el) + ' µrad'],
         [(P.wb.eis.eta === 0 ? (P.wb.eis.reg_px > 0 ? 'EIS düzeltmesiz (η = 0) + registrasyon artığı ' + P.wb.eis.reg_px + ' px' : 'EIS kapalı (η = 0, registrasyon artığı 0)') : 'EIS AÇIK (f_c = ' + P.wb.eis.fc + ' Hz, η = ' + P.wb.eis.eta + ')') + ' wander el/xel', urad(m0.eis.el) + ' / ' + urad(m0.eis.xel) + ' µrad'],
         ['EIS referans kareye kilit (f_c = 0) wander el', urad(m0.eis.lockEl) + ' µrad'],
         ['Hexapod tepe θ/ω/α (roll)', fmt(out[0].lim.axes[0].peakDeg, 2) + '° / ' + fmt(out[0].lim.axes[0].peakRate, 2) + '°/s / ' + fmt(out[0].lim.axes[0].peakAcc, 2) + '°/s²'],
         PXt.kv,
         ['Gereksinim', 'wander ≤ ' + urad(d.req.wander, 1) + ' µrad, P99 ≤ ' + urad(d.req.p99, 1) + ' µrad'],
         [`Karar belirsizliği ve koruma bandı (en kötü tohum; k = ${G13[0].k}; tohumlar arası sd ⊕ kalibre ölçek)`, G13.map(guardTxt).join(' · ') + `; düzeltilmemiş video tabanı (u_v,top ${fmt(turInfo(P).uvAdd)} µrad) ölçülen değeri en çok el +${urad(G13[0].bias)} / xel +${urad(G13[1].bias)} µrad yükseltir (temkinli)`]],
    notes: ['Wander: ' + P.ana.Tw + ' s pencerelerde doğrusal trend çıkarılarak kare ortalamalarının saçılımı (drift ayrı raporlanır). Pencere seçimi ARW katkısını belirgin değiştirir (Bütçe sekmesi).',
            'Ölçülen wander, video ölçüm tabanını (centroid, piksel fazı, hava) da içerir; taban düzeltmesi Bütçe sekmesinde.',
            'WFOV: aynı taban hareketiyle (tohum 1) ayrı koşu. LOS hareketi kanaldan bağımsızdır; px cinsinden tanımlı ölçüm tabanı (centroid, piksel fazı) µrad cinsinden IFOV oranında büyür. Gereksinim kanalın IFOV\'una ölçeklenir (k_wander·IFOV, k_conf·k_wander·IFOV).'],
    fill: { 'T1.3': wEl },
    num: { pupil: PX, guard: G13 },
  });
  if (PXt.note) res.notes.push(PXt.note);
  if (clip > 0) res.notes.unshift(`Komut edilen deniz profili hexapodun θ/ω/α sınırlarını (${P.wb.hex.theta_max}° / ${P.wb.hex.omega_max}°/s / ${P.wb.hex.alpha_max}°/s²) aşıyor (aşım süresi oranı %${fmt(clip * 100, 1)}, roll tepesi ${fmt(out[0].lim.axes[0].peakDeg, 1)}°): hexapod bu profili üretemez, sonuç GEÇERSİZ. Genliği küçültün ya da daha büyük erişimli bir hexapod tanımlayın.`);
  // 6-DOF ötelemesi ya da kaldıraç kolu: hexapod deniz ötelemesini strokuna sığacak q oranıyla küçültür (v13 bilgi satırı)
  if (out[0].q != null) {
    const qc0 = out[0].qc == null ? 1 : out[0].qc;
    res.kv.splice(res.kv.length - 1, 0, ['Deniz ötelemesi (laboratuvar, tohum 1)', `talep ±${fmt(out[0].dem, 2)} m → hexapod ±${fmt(out[0].dem * out[0].q * 1e3, 0)} mm (q = ${fmt(out[0].q, 4)})` +
      (qc0 < 1 - 1e-9 ? ` → kolimatör sınırı (e ≤ ${fmt(PX.eFree * 1e3, 1)} mm) için ×${fmt(qc0, 3)}: ±${fmt(out[0].dem * out[0].q * qc0 * 1e3, 1)} mm (ölçeksiz kayma ${fmt((out[0].e1 || 0) * 1e3, 1)} mm)` : '')]);
    const srcT = [P.wb.sea.mode === '6dof' ? '6-DOF ağırlık merkezi ötelemesi' : null, seaDOF(P).rOn ? `${armTxt(P)} kaldıraç kolunun ötelemesi` : null].filter(Boolean).join(' ve ');
    if (qc0 < 1 - 1e-9) res.notes.push(`Deniz ötelemesi kolimatör demetine sığacak biçimde ayrıca ×${fmt(qc0, 3)} küçültüldü (v13.5): göz bebeği en çok ${fmt(PX.eMax * 1e3, 1)} mm kayar (sınır ${fmt(PX.eFree * 1e3, 1)} mm). Ötelemenin işletme ivmesindeki etkisi T2.5'te ölçülür.`);
    res.notes.push(`Laboratuvar deniz ötelemesini (${srcT}) hexapod stroku içinde q = ${fmt(out[0].q, 4)} oranında üretir; ötelemenin LOS etkisi bu testte tam ölçekte yoktur. İşletme ivmesindeki etkisi T2.5'te ivme eşdeğeriyle ölçülür (B1-08).`);
  }
  // v13.5 (kullanıcı kararı): varsayılan kip kapalı — masa titreşimi düşülmez (bilgi satırı)
  if (!mvOn && P.wb.hex.microvib > 0) res.kv.splice(1, 0, ['Taban düzeltmesi', `kapalı: masa mikro-titreşimi (U-03, ${fmt(P.wb.hex.microvib, 1)} µrad) düşülmez — örnek DUT'ta ölçüme karesel eklenmiyor (sürtünme ditheri, V&V M7); düşüm iyimser olurdu`]);
  if (mvOn) {
    res.kv.splice(1, 0, ['Masa mikro-titreşiminin video zincirine geçen payı (stab ON, yalıtılmış koşu)', `el ${urad(sh.on.vid.el)} / xel ${urad(sh.on.vid.xel)} µrad (tabla ${urad(sh.on.table)} µrad, masa parametresi ${fmt(P.wb.hex.microvib)} µrad)`],
      [`Taban düzeltmeli wander σ = √(σ_ölç² − s²), ${MV_MODE_TXT[cE.mode]}`, `el ${urad(cE.corr)} / xel ${urad(cX.corr)} µrad (s = ${urad(cE.s)} / ${urad(cX.s)})${cE.reliable && cX.reliable ? '' : ' — s² ölçülen varyansın yarısını aşıyor: düzeltme güvenilmez'}; ${fmt(P.wb.hex.microvib)} µrad tam düşülseydi el ${urad(fullE)} µrad`]);
    res.notes.push('Taban düzeltmesi yalnız masa mikro-titreşimini düşer (seçili kip); centroid, piksel fazı ve hava katkısı ölçülen değerde kalır. Ham değer kabul kararında, düzeltilmiş değer Bütçe sekmesinde kullanılır (ikisi birlikte raporlanır). Yöntemin doğrulaması: Yöntem → V&V M7.');
    res.num = Object.assign({}, res.num || {}, { guard: G13, wander: { el: wEl, xel: wXel }, corr: { el: cE.corr, xel: cX.corr, sEl: cE.s, sXel: cX.s, mode: cE.mode, reliable: cE.reliable && cX.reliable }, fullEl: fullE, mvShare: sh });
  }
  // değerlendirilen dizi: Tw pencerelerinde doğrusal trend çıkarılmış kare ortalamaları (ham dizide dünya dönüşü/bias rampası vardır, T0.7)
  const fps0 = R0fps(out), rE = m0.residE, tt = [], yy = [];
  for (let i = 0; i < rE.length; i++) { tt.push(20 + i / fps0); yy.push(rE[i] * 1e6); }
  const dd = decim(tt, yy);
  res.plots.push({ title: `Video LOS artığı (el), tohum 1 — ${P.ana.Tw} s pencerelerde trend çıkarılmış`, xLabel: 's', yLabel: 'µrad', series: [{ name: 'el', x: dd.x, y: dd.y }],
    refLines: [{ y: d.req.p99 * 1e6, label: 'P99 sınırı' }, { y: -d.req.p99 * 1e6, label: '' }] });
  return pupilRule(P, res, PX);      // v13.5: gerçek vinyetlemede GEÇERSİZ
};
// T1.4 — elevasyon bağımlılığı
TESTS['T1.4'] = function (P, ctx, prog) {
  const d = derive(P), els = [0, 30, 60, 75], out = [], Tpr = 320, nRun = 2 * els.length;
  els.forEach((el, ie) => {
    const fR = 1 / seaPeriod(P, 0), fY = 1 / seaPeriod(P, 2), aR = seaAmpDeg(P, 0), aY = seaAmpDeg(P, 2);
    const list = [{ axis: 0, f: fR, A: Math.min(aR, d.reach(fR)) * D2R, nper: 10 }, { axis: 0, f: 0.5, A: Math.min(aR, d.reach(0.5)) * D2R, nper: 10 },
                  { axis: 2, f: fY, A: Math.min(aY, d.reach(fY)) * D2R, nper: 10 }, { axis: 2, f: 0.5, A: Math.min(aY, d.reach(0.5)) * D2R, nper: 10 }];
    list.push({ axis: 0, f: fR, A: 0.5 * list[0].A, nper: 10 }, { axis: 2, f: fY, A: 0.5 * list[2].A, nper: 10 });
    const sg = segSines(list);
    const R = runSim(P, labScenario(P, { label: 'T1.4 el=' + el, T: sg.T, fs: 2000, cmd: sg.cmd, e0: el, seed: 1400 + ie }), (f) => prog && prog((2 * ie + f) / nRun));
    const fits = fitSegments(P, R, sg.segs, ctx);
    // T1.3 spektrumundan deniz profili, aynı tohum, her elevasyonda (test tanımı: "+ T1.3'ten bir profil")
    const Rp = runSim(P, seaLabScenario(P, { T: Tpr, seed: 1301, label: 'T1.4 profil el=' + el, extra: { e0: el } }), (f) => prog && prog((2 * ie + 1 + f) / nRun));
    const mp = profileMetrics(P, Rp, ctx, 20);
    // iki genlik: doğrusal DRR (sürtünmenin genlikten bağımsız temel bileşeni ayrılır)
    const lin = (r1, r2, key) => {
      if (!r1 || !r2 || !r1[key] || !r2[key] || !r1.fin || !r2.fin) return NaN;
      const nrm = (r) => { const fo = r[key], xi = r.fin; const xr = xi.a / xi.A, xim = xi.b / xi.A; return { re: fo.a * xr + fo.b * xim, im: fo.b * xr - fo.a * xim, A: xi.A }; };
      const n1 = nrm(r1), n2 = nrm(r2), dA = n1.A - n2.A; return db(Math.hypot((n1.re - n2.re) / dA, (n1.im - n2.im) / dA));
    };
    out.push({ el, roll01: lin(fits[0], fits[4], 'fe'), roll05: drrOf(fits[1].fe, fits[1].fin), yaw01: lin(fits[2], fits[5], 'fx'), yaw05: drrOf(fits[3].fx, fits[3].fin),
      rawR: drrOf(fits[0].fe, fits[0].fin), rawY: drrOf(fits[2].fx, fits[2].fin), sig: [true, signif(fits[1].fe), true, signif(fits[3].fx)],
      xRX: drrOf(fits[0].fx, fits[0].fin), xYE: drrOf(fits[2].fe, fits[2].fin), wEl: mp.wander.el, wXel: mp.wander.xel, fov: mp.fovStay });
  });
  const invalid14 = out.filter(o => !isFinite(o.roll01) || !isFinite(o.yaw01)).map(o => o.el + '°');
  const AL = budgetAlloc(P), reqR = db(AL['B1-01'] * 1e-6 / seaSigma(P, 0)), reqY = db(AL['B1-03'] * 1e-6 / seaSigma(P, 2));
  const ok = out.every(o => (!o.sig[0] || !isFinite(o.roll01) || o.roll01 <= reqR) && (!o.sig[2] || !isFinite(o.yaw01) || o.yaw01 <= reqY));
  const res = mkResult('T1.4', {
    status: invalid14.length ? 'GEÇERSİZ' : stat(ok), measured: (invalid14.length ? `geçersiz elevasyon ${invalid14.join(', ')}; ` : '') + out.map(o => `el ${o.el}°: roll→el ${fmt(o.roll01, 1)} dB, yaw→xel ${fmt(o.yaw01, 1)} dB`).join('; ') + ' (baskın frekanslarda)',
    kv: out.map(o => [`Elevasyon ${o.el}°`, `roll→el ${fmt(1 / seaPeriod(P, 0), 3)} Hz doğrusal ${fmt(o.roll01, 1)} dB (ham ${fmt(o.rawR, 1)}), 0,5 Hz ${fmt(o.roll05, 1)} dB · yaw→xel ${fmt(1 / seaPeriod(P, 2), 3)} Hz doğrusal ${fmt(o.yaw01, 1)} dB (ham ${fmt(o.rawY, 1)}), 0,5 Hz ${fmt(o.yaw05, 1)} dB`])
      .concat(out.map(o => [`Elevasyon ${o.el}°: çapraz eksen kuplajı / deniz profili`, `roll→xel ${fmt(o.xRX, 1)} dB, yaw→el ${fmt(o.xYE, 1)} dB · profil wander el/xel ${urad(o.wEl)} / ${urad(o.wXel)} µrad, alanda kalma ${fmt(o.fov * 100, 2)} %`]))
      .concat([['Gerekli DRR (baskın frekansta)', `roll ${fmt(reqR, 1)} dB, yaw ${fmt(reqY, 1)} dB`], ['Profil', `T1.3 spektrumu, tohum 1301, ${Tpr - 20} s değerlendirme (bilgi; kabul DRR üzerinden)`]]),
    notes: ['Azimut döngüsünün kazancı elevasyonla sekant çarpanıyla düzeltilir; eylemsizlik J_az(e) değişir, kontrolcü sabittir.',
            'Yüksek elevasyonda taban yaw\'ı çapraz-el\'e cos(e), görüntü rotasyonuna sin(e) oranında yansır.',
            'Çapraz eksen kuplajı: roll uyarımının xel\'de, yaw uyarımının el\'de bıraktığı artık (girdiye göre dB). "Maks." elevasyon örnek DUT için 75° alındı.'],
  });
  res.plots.push({ title: 'DRR — elevasyona göre', xLabel: 'elevasyon (°)', yLabel: 'dB',
    series: [{ name: 'roll→el (baskın)', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.roll01)), dots: true },
             { name: 'roll→el 0,5 Hz', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.roll05)), dots: true },
             { name: 'yaw→xel (baskın)', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.yaw01)), dots: true },
             { name: 'yaw→xel 0,5 Hz', x: Float32Array.from(els), y: Float32Array.from(out.map(o => o.yaw05)), dots: true }] });
  return res;
};
// T1.5 — görüntü rotasyonu (LOS ekseni etrafında), türetme OFF/ON
TESTS['T1.5'] = function (P, ctx, prog) {
  const d = derive(P), map0 = axisMap(P, 0), map1 = axisMap(P, 1);
  const ax = Math.abs(map0.rotW || 0) > Math.abs(map1.rotW || 0) ? 0 : 1;          // LOS ekseni etrafındaki gövde ekseni
  const A = seaAmpDeg(P, ax) * D2R, f = 1 / seaPeriod(P, ax);
  const sepPx = 0.5 * d.Nh, sigRot = Math.SQRT2 * P.wb.chain.centroid_px / sepPx;     // iki noktalı retikül, kare başına
  // ölçüm benzetimi: türetme artığının kare içi ortalaması (T_int) + iki nokta centroid gürültüsünden açı gürültüsü;
  // değerlendirmede gürültü varyansı karesel olarak çıkarılır
  const frameMeas = (R, t0, t1, rng) => {
    const x = R.rec.rot_res, fr = R.meta.fRec, Tf = 1 / d.fps, nI = Math.max(1, Math.round(d.Tint * fr)), y = [], yt = [];
    for (let tk = t0; tk + d.Tint <= t1; tk += Tf) { const j = Math.round(tk * fr); let s = 0; for (let q = 0; q < nI; q++) s += x[j + q]; yt.push(s / nI); y.push(s / nI + sigRot * rng.gauss()); }
    const meas = aRms(detrend(y, 'linear')), tru = aRms(detrend(yt, 'linear'));
    return { meas, tru, corr: Math.sqrt(Math.max(0, meas * meas - sigRot * sigRot)) };
  };
  // ölçüt noktası: köşe pikseli (yarı köşegen) ya da alan kenarı (Nh/2) — Model → Görüntü rotasyonu
  const edgeOf = (c) => d.rot.of(c), cn = d.rot.ref === 'corner', nmPt = cn ? 'köşe' : 'kenar', nmPtC = cn ? 'Alan köşesi' : 'Alan kenarı';
  const out = [], Tpr = 320; let k = 0;
  [false, true].forEach((der) => {
    const sg = segSines([{ axis: ax, f, A, nper: 10 }]);
    const R = runSim(P, labScenario(P, { label: 'T1.5', T: sg.T, fs: 2000, cmd: sg.cmd, derot: der, seed: 1500 + k,
      rec: { fs: 1000, ch: ['rot', 'rot_res', 'imu_r', 'imu_p', 'imu_y', 'opt_el', 'opt_xel'] } }), (p) => prog && prog((k + p) / 4)); k++;
    const s = sg.segs[0], mS = frameMeas(R, s.c0, s.c1, new RNG(hash32(seedOf(P, 1550), k)));
    // T1.3 profili (test tanımı: "+ T1.3 profili")
    const Rp = runSim(P, seaLabScenario(P, { T: Tpr, seed: 1301, label: 'T1.5 profil', extra: { derot: der } }), (p) => prog && prog((k + p) / 4)); k++;
    const mP = frameMeas(Rp, 20, Tpr - 1, new RNG(hash32(seedOf(P, 1560), k)));
    const px = (c) => cn ? c * d.rot.rCpx : c * d.Nh / 2;      // kenar kipinde önceki sürümle aynı işlem sırası
    out.push({ der, sine: mS, prof: mP, edge: edgeOf(mS.corr), edgePx: px(mS.corr), edgeP: edgeOf(mP.corr), edgePxP: px(mP.corr) });
  });
  const lim = d.req.rot, on = out[1];
  const ok = Math.max(on.edge, on.edgeP) <= lim;
  const res = mkResult('T1.5', {
    status: stat(ok), measured: `${nmPtC} yer değiştirmesi (türetme ON): sinüs ${urad(on.edge, 2)}, deniz profili ${urad(on.edgeP, 2)} µrad RMS (sınır ${urad(lim, 1)}); türetme OFF sinüs ${urad(out[0].edge, 1)} µrad`,
    kv: out.map(o => [`Türetme ${o.der ? 'ON' : 'OFF'}`, `sinüs: artık rotasyon ${fmt(o.sine.corr * 1e3, 3)} mrad RMS (gerçek ${fmt(o.sine.tru * 1e3, 3)}) → ${nmPt} ${urad(o.edge, 2)} µrad = ${fmt(o.edgePx, 3)} px · profil: ${fmt(o.prof.corr * 1e3, 3)} mrad → ${urad(o.edgeP, 2)} µrad = ${fmt(o.edgePxP, 3)} px`])
      .concat([['Uyarım', `${AXN[ax]} ${fmt(A * R2D, 2)}° @ ${fmt(f, 3)} Hz (LOS ekseni etrafında) + T1.3 spektrumundan ${Tpr - 20} s profil`], ['İki noktalı hedef açı gürültüsü (kare başına)', fmt(sigRot * 1e3, 4) + ' mrad (çıkarıldı)']])
      .concat(cn ? [[`Roll sınırı (LOS etrafında, ${d.Nh}×${d.Nv}): ψ = k_roll·IFOV/θ_köşe`, `${fmt(d.rot.lim * 1e6, 0)} µrad RMS (köşe r = ${fmt(d.rot.rCpx, 1)} px); türetme ON artığı ${fmt(Math.max(on.sine.corr, on.prof.corr) * 1e6, 0)} µrad → %${fmt(100 * Math.max(on.sine.corr, on.prof.corr) / d.rot.lim, 0)}; alan kenarı ölçütüyle ${fmt(d.rot.limE * 1e6, 0)} µrad`]] : []),
    notes: ['2 eksenli gimbal LOS etrafındaki dönmeyi düzeltemez; türetme (optik veya sayısal) gecikme ve ölçek hatasıyla artık bırakır.',
            'Ölçüm: retikülün iki noktası arasındaki açı her karede (T_int ortalaması) centroid gürültüsüyle ölçülür; gürültü varyansı karesel çıkarılır. "Gerçek" değer gürültüsüz kare ortalamasıdır.',
            '"Roll ekseni sinüs" burada LOS ekseni etrafındaki dönmedir; LOS iskele yönünde olduğundan bu eksen gövdenin ' + AXN[ax] + ' eksenidir.'],
    fill: { 'R-01': Math.max(on.edge, on.edgeP) },
  });
  return res;
};
// T1.6 — hız yön değişimi / sürtünme (stick-slip)
// Senkron ortalama (TSA): uyarım periyoduna kilitli tekrarlanan bileşeni (sürtünme/vuruntu geçişleri) rastgele
// tabandan (ARW rastgele yürüyüşü, mikro-titreşim, ölçüm gürültüsü) ayırır. K tam periyot, i0'dan başlar.
function tsaAnalysis(tr, x, f, i0, K, fr, smooth_s) {
  const np = Math.round(fr / f), i1 = i0 + K * np;
  const fit = sineFit(tr, x, f, { i0, i1 });
  const n = i1 - i0, r = new Float64Array(n), tm = (tr[i0] + tr[i1 - 1]) / 2;
  for (let i = i0; i < i1; i++) { const t = tr[i]; r[i - i0] = x[i] - (fit.a * Math.cos(TAU * f * t) + fit.b * Math.sin(TAU * f * t) + fit.c0 + fit.c1 * (t - tm)); }
  // bir periyot uzunluğunda kayan ortalama çıkarılır: periyodik içerik korunur, yavaş sürüklenme ayıklanır
  const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + r[i];
  const hp = new Float64Array(n), h = Math.floor(np / 2);
  for (let i = 0; i < n; i++) { let a = i - h, b = a + np; if (a < 0) { a = 0; b = np; } if (b > n) { b = n; a = n - np; } hp[i] = r[i] - (cs[b] - cs[a]) / np; }
  const avg = new Float64Array(np);
  for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) avg[j] += hp[k * np + j] / K;
  let v = 0; for (let k = 0; k < K; k++) for (let j = 0; j < np; j++) v += sq(hp[k * np + j] - avg[j]);
  const varN = v / (np * Math.max(1, K - 1));
  let ra = 0; for (let j = 0; j < np; j++) ra += avg[j] * avg[j]; ra /= np;
  const det = Math.sqrt(Math.max(0, ra - varN / K));
  // tepe: geçiş süresine göre kısa (≈ 25 ms) dairesel kayan ortalama ile gürültü yanlılığı azaltılır
  const w = Math.max(1, Math.round((smooth_s || 0.025) * fr)), sm = new Float64Array(np);
  for (let j = 0; j < np; j++) { let s = 0; for (let q = -Math.floor(w / 2); q < w - Math.floor(w / 2); q++) s += avg[(j + q + np) % np]; sm[j] = s / w; }
  let pk = 0, ipk = 0; for (let j = 0; j < np; j++) if (Math.abs(sm[j]) > pk) { pk = Math.abs(sm[j]); ipk = j; }
  return { fit, r, hp, avg: sm, np, K, det, noise: Math.sqrt(varN), pk, ipk, rmsRaw: aRms(r), rmsHp: aRms(hp) };
}
// T1.6 — hız yön değişimi / sürtünme
TESTS['T1.6'] = function (P, ctx, prog) {
  const d = derive(P), f = 0.05, Adeg = Math.min(5, d.reach(f));
  const out = [];
  [0, 2].forEach((ax, k) => {
    const sg = segSines([{ axis: ax, f, A: Adeg * D2R, nper: 11 }]);
    const R = runSim(P, labScenario(P, { label: 'T1.6', T: sg.T, fs: 4000, cmd: sg.cmd, seed: 1600 + ax }), (p) => prog && prog((k + p) / 2));
    const map = axisMap(P, ax), tr = recT(R), s = sg.segs[0], fr = R.meta.fRec;
    const ch = map.los === 'el' ? 'ac_el' : 'ac_xel';
    let i0 = 0; while (i0 < tr.length && tr[i0] < s.c0) i0++;
    const K = Math.floor((s.c1 - s.c0) * f + 1e-9);
    const A = tsaAnalysis(tr, R.rec[ch], f, i0, K, fr);
    // yön değişim anları (komut A·sin(2πf(t − tS)) tepeleri) ve tek tek geçiş tepeleri (taban gürültüsü dahil)
    const peaks = [], durs = [];
    for (let nn = 0; ; nn++) {
      const tc = s.tS + (0.25 + 0.5 * nn) / f; if (tc > tr[i0 + K * A.np - 1]) break; if (tc < tr[i0]) continue;
      const [j0, j1] = idxRange(tr, tc - 1.0, tc + 1.5);
      let pk = 0; for (let j = Math.max(j0, i0); j < Math.min(j1, i0 + K * A.np); j++) pk = Math.max(pk, Math.abs(A.hp[j - i0]));
      peaks.push(pk);
      // süre (TSA dalga biçiminde, yarı tepe genişliği)
      const jc = Math.round((tc - tr[i0]) * fr) % A.np, half = 0.5 * Math.max(...Array.from({ length: Math.round(2.5 * fr) }, (_, q) => Math.abs(A.avg[(jc - Math.round(fr) + q + A.np) % A.np])));
      let wN = 0; for (let q = -Math.round(fr); q < Math.round(1.5 * fr); q++) if (Math.abs(A.avg[(jc + q + A.np) % A.np]) > half) wN++;
      durs.push(wN / fr);
    }
    out.push({ ax, los: map.los, A, peaks, durs, n: peaks.length, t0: tr[i0] });
  });
  const lim = P.wb.k_conf * budgetAlloc(P)['B1-07'] * 1e-6;
  const pTSA = Math.max(...out.map(o => o.A.pk));
  const allP = out.flatMap(o => o.peaks), pmed = aPctAbs(Float64Array.from(allP), 50), pmax = Math.max(...allP);
  const ok = pTSA <= lim;
  const elO = out.find(o => o.los === 'el');
  const res = mkResult('T1.6', {
    status: stat(ok), measured: `Yön değişimi geçişi (senkron ortalama): tepe ${urad(pTSA, 1)} µrad (sınır ${urad(lim, 1)}), tekrarlanan bileşen el ${urad(elO.A.det, 2)} µrad RMS; ${allP.length} sıfır geçişi`,
    kv: out.map(o => [`${AXN[o.ax]} → ${o.los}`, `TSA tepe ${urad(o.A.pk, 1)} µrad, tekrarlanan RMS ${urad(o.A.det, 2)} µrad, geçiş süresi (yarı tepe) ${fmt(aMean(o.durs) * 1e3, 0)} ms; ${o.A.K} periyot`])
      .concat(out.map(o => [`${AXN[o.ax]} → ${o.los}: tek tek geçişler`, `tepe ortanca ${urad(aPctAbs(Float64Array.from(o.peaks), 50), 1)} / en büyük ${urad(Math.max(...o.peaks), 1)} µrad (taban gürültüsü ${urad(o.A.noise, 2)} µrad RMS dahil)`]))
      .concat([['Ham artık RMS (el; trend çıkarılmış, ARW yürüyüşü dahil)', urad(elO.A.rmsRaw, 2) + ' µrad'],
               ['Uyarım', `${fmt(Adeg, 1)}° @ ${f} Hz, 11 periyot (bağıl hız tepe ${fmt(Adeg * D2R * TAU * f * 1e3, 1)} mrad/s)`],
               ['Sürtünme modeli', `LuGre: el F_c ${P.dut.el.Fc} N·m, az F_c ${P.dut.az.Fc} N·m (yağ dolu keçe); ileri besleme ${P.dut.ctl.ff.on ? 'açık, η = ' + P.dut.ctl.ff.eta : 'kapalı'}`]]),
    notes: ['Yüksek hızlı kanal (otokolimatör, 1 kHz). Sinüs + trend çıkarıldıktan sonra artık, uyarım periyoduna kilitli ortalanır (senkron ortalama): sürtünme ve vuruntu geçişleri her periyotta tekrarlar, gyro ARW yürüyüşü ve mikro-titreşim tekrarlamaz ve 1/√K ile söner.',
            'Tek tek geçişlerde ölçülen tepeler taban gürültüsünü de içerir; kabul tekrarlanan bileşenin tepesine uygulanmıştır. Ham artığı doğrudan B1-07 diye raporlamak, 200 s kayıtta ARW rastgele yürüyüşünü sürtünmeye yazar.',
            'Sürtünme sıçramaları Gauss değildir: RMS tahsise uyarken k_conf × tahsis tepe ölçütü aşılabilir. Soğukta tekrar: T4.2.',
            'Test tanımındaki "yaw/pitch sinüs" ileri bakan LOS içindir. LOS iskele yönündeyken el gimbalını roll, az gimbalını yaw sürer; pitch LOS ekseni etrafında kalır ve gimbal bağıl hızı üretmez. Bu yüzden roll ve yaw uygulandı.'],
    fill: { 'B1-07': elO.A.det },
  });
  // v12 proje gereksinimi: hız yön değişimi geçişinin tepe-tepe değeri (senkron ortalama dalga biçimi, stick-slip)
  const ppvAx = out.map(o => { let a = Infinity, b = -Infinity; for (const v of o.A.avg) { if (v < a) a = v; if (v > b) b = v; } return b - a; }), ppvRev = Math.max(...ppvAx);
  if (P.ana.los && P.ana.los.on !== false) {      // uyum kipinde (değerlendirme kapalı) sonuç v10 ile aynı kalır
    res.num = { ppvRev, ppvRevAx: ppvAx, los: out.map(o => o.los) };
    const limRev = P.ana.los.kRev * d.IFOV;
    res.kv.push(['Proje gereksinimi (v12): geçiş tepe-tepe (stick-slip, senkron ortalama)', `${out.map((o, i) => `${o.los} ${urad(ppvAx[i], 1)}`).join(' / ')} µrad; sınır ${urad(limRev, 1)} µrad (${P.ana.los.kRev}·IFOV) → ${ppvRev <= limRev ? 'OK' : 'AŞIM'} (Gereksinimler sekmesi)`]);
    res.num.limRev = limRev;
  }
  const tt = (o) => Float32Array.from({ length: o.A.np }, (_, j) => j / (o.A.np / (1 / f)));
  const dsel = (o) => decim(Array.from(tt(o)), Array.from(o.A.avg, v => v * 1e6), 1600);
  res.plots.push({ title: 'Senkron ortalanmış artık (bir periyot, otokolimatör)', xLabel: 's (periyot içi)', yLabel: 'µrad',
    series: out.map(o => { const q = dsel(o); return { name: AXN[o.ax] + '→' + o.los, x: q.x, y: q.y }; }),
    refLines: [{ y: lim * 1e6, label: 'k_conf × tahsis' }, { y: -lim * 1e6, label: '' }] });
  res.plots.push({ title: 'Tek tek geçiş tepeleri (taban gürültüsü dahil)', xLabel: 'geçiş no', yLabel: 'µrad',
    series: out.map(o => ({ name: AXN[o.ax] + '→' + o.los, x: Float32Array.from(o.peaks.map((_, i) => i + 1)), y: Float32Array.from(o.peaks.map(p => p * 1e6)), dots: true })),
    refLines: [{ y: lim * 1e6, label: 'k_conf × tahsis' }] });
  return res;
};
// T1.7 — hedef kilidi / video izleyici
TESTS['T1.7'] = function (P, ctx, prog) {
  const d = derive(P), req = d.req.wander;
  const S = seaLabScenario(P, { T: 620, seed: 1701, extra: { tracker: { bw: 0.5, lat_frames: 2, gate_px: 32 } } });
  const R = runSim(P, S, prog);
  const v = videoAngles(R, ctx), e = [], x = [];
  for (let i = 0; i < v.t.length; i++) if (v.t[i] > 20 && v.ok[i]) { e.push(v.el[i]); x.push(v.xel[i]); }
  const rE = aRms(detrend(e, 'mean')), rX = aRms(detrend(x, 'mean'));
  const p99 = Math.max(aPctAbs(detrend(e, 'mean'), 99), aPctAbs(detrend(x, 'mean'), 99));
  const lost = R.stats.trackLost, rq = P.ana.req.trackErr_urad;
  const ok = lost > 0 ? false : (rq == null ? null : Math.max(rE, rX) <= rq * 1e-6);      // v13.13: gereksinim yoksa BİLGİ (kilit kaybı varsa AŞIM)
  const res = mkResult('T1.7', {
    status: ok == null ? 'BİLGİ' : stat(ok), measured: `Nişan noktası hatası el ${urad(rE)} / xel ${urad(rX)} µrad RMS, P99 ${urad(p99)} µrad; kilit kaybı ${lost}`,
    kv: [['İzleyici', 'PI, bant 0,5 Hz, 2 kare gecikme, kapı ±32 px'], ['Hata RMS (el / xel)', urad(rE) + ' / ' + urad(rX) + ' µrad'], ['P99', urad(p99) + ' µrad'], ['Kilit kaybı', String(lost)],
         ['Hata gereksinimi', rq == null ? 'girilmedi (Model → Proje gereksinimleri); kilit kaybı yoksa sonuç BİLGİ' : rq + ' µrad']],
    notes: ['İzleyici döngüsü düşük frekanslı artığı ve dünya dönüşü/bias rampasını da taşır; trend çıkarılmadan raporlandı.', 'Hata eşiği proje gereksinimidir (Model → Proje gereksinimleri); girilmezse sonuç BİLGİ olur, kilit kaybı varsa AŞIM (T1.8, T2.4, T4.1 gibi).'],
  });
  return res;
};
// T1.8 — dönüş ve oturma (slew & settle)
TESTS['T1.8'] = function (P, ctx, prog) {
  const d = derive(P), thr = d.req.wander;
  const reps = 10, settle = [], over = [], driftRates = [];          // 10 tekrar
  const fogX = P.wb.extRows !== false, holdOff = []; let gMax = 0, gSat = 0;     // v11: FOG ölçek hatası ve ölçüm menzili
  for (let k = 0; k < reps; k++) {
    const S = seaLabScenario(P, { T: 16, seed: 1801 + k, extra: { slew: { t0: 6, ang: 10, rate: 30, acc: 200, hold: 1.0 }, fs: 2000,
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'imu_y'] } } });
    S.cmd.forEach(c => { if (c.type === 'series') c.data = c.data; });
    const R = runSim(P, S, (p) => prog && prog((k + p) / reps));
    // dönüş profilinin bitişi
    const sl = S.slew, wmx = sl.rate, amx = sl.acc; let tc = sl.ang / wmx - wmx / amx, wpk = wmx; if (tc < 0) { tc = 0; wpk = Math.sqrt(sl.ang * amx); }
    const Tm = 2 * wpk / amx + tc, tEnd = sl.t0 + Tm + sl.hold + Tm;
    const tr = recT(R), y0 = R.rec.opt_xel, [i0, i1] = idxRange(tr, tEnd, tEnd + 4);
    if (fogX) {
      // gidiş sonundaki bekleme: LOS komut açısına göre eksik/fazla döner (gyro ölçek hatası: δθ ≈ −S_f·θ, gidiş-dönüşte sıfırlanır)
      const [h0, h1] = idxRange(tr, sl.t0 + Tm + 0.4, sl.t0 + Tm + sl.hold - 0.05);
      holdOff.push(Math.abs(aMean(y0, h0, h1)) - sl.ang * D2R);
      gMax = Math.max(gMax, R.stats.gyroMax || 0); gSat += R.stats.gyroSat || 0;
    }
    // dönüş öncesi penceredeki doğrusal kayma (dünya dönüşü / bias) çıkarılır; aksi halde |hata| eşiğe hiç inmez
    const [p0, p1] = idxRange(tr, 2, sl.t0 - 0.2), tp = Array.from(tr.subarray(p0, p1)), yp = Array.from(y0.subarray(p0, p1));
    const tmP = aMean(tp), slope = tp.reduce((s2, t, i) => s2 + (t - tmP) * (yp[i] - aMean(yp)), 0) / Math.max(1e-12, tp.reduce((s2, t) => s2 + sq(t - tmP), 0));
    driftRates.push(slope);
    const y = Float64Array.from(y0, (v, i) => v - slope * (tr[i] - tmP));
    const [k0, k1] = idxRange(tr, tEnd + 2.5, tEnd + 4);
    const fin = aMean(y, k0, k1);
    let tset = 4, ov = 0;
    for (let i = i1 - 1; i >= i0; i--) if (Math.abs(y[i] - fin) > thr) { tset = tr[i] - tEnd; break; }
    for (let i = i0; i < i1; i++) ov = Math.max(ov, Math.abs(y[i] - fin));
    if (tset === 4) tset = 0;
    settle.push(Math.max(0, tset)); over.push(ov);
  }
  const rq = P.ana.req.settle_ms;
  const ok = rq == null ? null : Math.max(...settle) <= rq * 1e-3;
  let sfPart = NaN;
  if (fogX) {
    // ölçek hatasının payı: aynı tohumla S_f = 0 (ve doğrusalsızlık 0) koşusunun bekleme ortalamasıyla fark (model ayrıştırması)
    const P0 = cloneParams(P); P0.dut.gyro.sf_ppm = 0; P0.dut.gyro.sfnl_ppm = 0;
    const S0 = seaLabScenario(P0, { T: 16, seed: 1801, extra: { slew: { t0: 6, ang: 10, rate: 30, acc: 200, hold: 1.0 }, fs: 2000, rec: { fs: 1000, ch: ['opt_xel'] } } });
    const R0 = runSim(P0, S0, null), sl = S0.slew, wpk = Math.min(sl.rate, Math.sqrt(sl.ang * sl.acc)), Tm = 2 * wpk / sl.acc + Math.max(0, sl.ang / sl.rate - sl.rate / sl.acc), tr0 = recT(R0);
    const [h0, h1] = idxRange(tr0, sl.t0 + Tm + 0.4, sl.t0 + Tm + sl.hold - 0.05);
    sfPart = holdOff[0] - (Math.abs(aMean(R0.rec.opt_xel, h0, h1)) - sl.ang * D2R);
  }
  // beklenen: döngü ölçülen hızı komuta eşitler → gerçek hız ω_c/(1 + S_etkin); S_etkin = S_f − 1,5·S_nl + 2,5·S_nl·⟨ω²⟩/FS² (kübik model)
  const sfEffP = fogScaleEff(P.dut.gyro, slewW2(10 * D2R, 30 * D2R, 200 * D2R)), sfExp = -sfEffP * 1e-6 * 10 * D2R;
  const fogKv = fogX ? [['Gidiş sonu açı hatası (gyro ölçek hatası; dönüşte sıfırlanır)', `bekleme ortalaması ${fmt(aMean(holdOff) * 1e6, 1)} µrad (oturma artığı dahil, 10 tekrar); ölçek hatasının payı (aynı tohum, S_f = S_nl = 0 ile fark) ${fmt(sfPart * 1e6, 1)} µrad; beklenen −S_etkin·θ = ${fmt(sfExp * 1e6, 1)} µrad (S_f = ${P.dut.gyro.sf_ppm} ppm${P.dut.gyro.sfnl_ppm ? `, doğrusalsızlık ${P.dut.gyro.sfnl_ppm} ppm·FS → kübik modelde etkin ${fmt(sfEffP, 1)} ppm` : ''}). Jitter değil, pointing hatası; görüntü izleyici ya da enkoder döngüsü kapatır.`],
    ['Gyro ölçüm menzili', `dönüşte en büyük eylemsiz hız ${fmt(gMax * R2D, 1)} °/s (menzil ±${P.dut.gyro.range_dps} °/s)` + (gSat ? `; ${gSat} örnekte doyum — gyro bu dönüş hızını ölçemiyor, döngü denetimi kaybeder (DUT sınırı; ölçüm zinciri hatası değil)` : '; doyum yok')]] : [];
  return mkResult('T1.8', {
    status: ok == null ? 'BİLGİ' : stat(ok), measured: `Oturma süresi (|hata| ≤ ${urad(thr, 0)} µrad): en büyük ${fmt(Math.max(...settle) * 1e3, 0)} ms, ortalama ${fmt(aMean(settle) * 1e3, 0)} ms; aşma en büyük ${fmt(Math.max(...over) * 1e3, 2)} mrad`,
    kv: settle.map((s, i) => [`Tekrar ${i + 1}`, `oturma ${fmt(s * 1e3, 0)} ms, aşma ${fmt(over[i] * 1e6, 0)} µrad`]).concat([['Dönüş', '10° @ 30°/s, 200°/s², 1 s bekleme, geri dönüş; taban deniz profilinde'],
      ['Dönüş öncesi kayma (çıkarıldı)', `${fmt(aMean(driftRates.map(Math.abs)) * 1e6, 2)} µrad/s${P.wb.earth.comp ? '' : ' — dünya dönüşü kompanzasyonu kapalı'}`],
      ['Gereksinim', rq == null ? 'girilmedi (Model → Proje gereksinimleri)' : rq + ' ms']]).concat(fogKv),
    notes: ['Gerçek LOS (1 kHz) üzerinden. Oturma, PII integratörlerinin düşük köşesi (' + P.dut.el.fi.toFixed(2) + ' Hz) nedeniyle yavaştır; gerçek sistemlerde dönüş için konum döngüsü ve ileri besleme kullanılır.'],
    num: fogX ? { sfPart, hold: aMean(holdOff), sfExp, sfEff: sfEffP, gMax, gSat } : undefined,
  });
};

// ============================================================================
// 06_tests_c.js — B2 (1–20 Hz), B3 (> 20 Hz) ve B4 (kalıcı etkiler) testleri
// ============================================================================
// Hidrodinamik VIV taraması: hıza göre f_v, K0 = f_v/f_n ve T2.2 aday frekansları
// v13.4: kolimatör uygunluğu — testlerin komut profillerinden göz bebeği kayması (Model paneli ve kılavuz §5; testler
// kendi koşularının senaryosuyla aynı hesabı yapar). Senaryolar testlerdekiyle aynı biçim ve tohumla kurulur; benzetim koşulmaz.
const COLLX_CACHE = new Map();
// v13.5 (kullanıcı kararı): T2.5 6-DOF öteleme segmentleri — 2 m/s², 2 ve 3 Hz (40 ve 60 periyot; önceden 1 ve 2 Hz, 30 ve 40)
const T25_FQ = [{ f: 2, a: 2, nper: 40 }, { f: 3, a: 2, nper: 60 }];
function collExcursions(P) {
  const key = JSON.stringify([P.wb, P.dut.geom, P.dut.L_pg, P.lab]);
  if (COLLX_CACHE.has(key)) return COLLX_CACHE.get(key);
  const d = derive(P), out = [], add = (id, label, S) => out.push(Object.assign(pupilExcursion(P, S), { id, label, qc: S.seaQc, e1: S.seaE1 }));
  // T0.1: stab OFF, ±%40 alan ızgarası (yaw ve roll adımları), pivot göz bebeğinde
  { const mapX = axisMap(P, 2), mapY = axisMap(P, 0), kR = [{ t: 0, v: 0 }], kY = [{ t: 0, v: 0 }]; let t = 2;
    for (const gy of [-0.4, 0.4]) for (const gx of [-0.4, 0.4]) { kR.push({ t, v: gy * d.FOVv * D2R / mapY.w }); kY.push({ t, v: gx * d.FOVh * D2R / mapX.w }); t += 6; }
    add('T0.1', 'ızgara ±%40 alan, stab OFF', labScenario(P, { T: t + 1, stab: false, cmd: [{ type: 'steps', axis: 0, knots: kR, trans: 1 }, { type: 'steps', axis: 2, knots: kY, trans: 1 }] })); }
  // T0.3: uç poz ±θ_test üç eksende, stab ON
  { const th = P.wb.hex.theta_test * D2R;
    for (const sg of [1, -1]) add('T0.3', `uç poz ${sg > 0 ? '+' : '−'}θ_test (${P.wb.hex.theta_test}°), stab ON`, labScenario(P, { T: 8, stab: true, cmd: [0, 1, 2].map(i => ({ type: 'steps', axis: i, knots: [{ t: 0, v: 0 }, { t: 1, v: sg * th }], trans: 4 })) })); }
  // T2.1: süpürme başı (1 Hz, erişim genliği), roll ve yaw ayrı, stab ON
  for (const ax of [0, 2]) add('T2.1', `${AXN[ax]} süpürmesi (1 Hz'de ${fmt(d.reach(1), 2)}°), stab ON`,
    labScenario(P, { T: 70, stab: true, cmd: [{ type: 'chirp', axis: ax, f0: 1, f1: Math.min(20, P.wb.hex.fbw), octPerMin: 1, ampFn: (f) => d.reach(f) * D2R, t0: 2, ramp: 2 }] }));
  // T2.2: VIV tonu (f_n, açısal + öteleme)
  { const VS = vivSpec(P); if (VS.present) { const tn = windTone(P, VS, VS.f, 1, 21, 2); add('T2.2', `VIV tonu ${fmt(VS.f, 2)} Hz${VS.lin ? ' (açısal + öteleme)' : ''}`, labScenario(P, { T: 23, stab: true, cmd: tn.cmd, trans: tn.trans })); } }
  // T1.3 ve T2.3: deniz profili (tohum 1301) + kaldıraç kolu / 6-DOF ötelemesi; T2.3'te VIV tonu
  add('T1.3', 'deniz profili + öteleme (tohum 1301)', seaLabScenario(P, { T: 620, seed: 1301 }));
  if (vivSpec(P).present) add('T2.3', 'deniz profili + VIV tonu', seaLabScenario(P, { T: 620, seed: 1301, viv: true }));
  // T2.5: öteleme segmentleri (T25_FQ: 2 ve 3 Hz, 2 m/s², strokla sınırlı), x / y / z
  if (P.wb.extRows !== false) for (let ax = 0; ax < 3; ax++) {
    const sgT = segSines(T25_FQ.map(q => ({ axis: ax, f: q.f, A: Math.min(q.a / sq(TAU * q.f), 0.9 * P.lab.hexStroke), nper: q.nper })));
    add('T2.5', 'öteleme ' + 'xyz'[ax] + ` (${T25_FQ.map(q => q.f).join(' ve ')} Hz, 2 m/s²)`, labScenario(P, { T: sgT.T, stab: true, cmd: [], trans: sgT.cmd }));
  }
  if (COLLX_CACHE.size > 6) COLLX_CACHE.clear();
  COLLX_CACHE.set(key, out);
  return out;
}
// v13.3: işletme hız zarfında VIV oluşmadığında test metni (T2.1–T2.3, T4.2)
function vivNoRiskTxt(P) {
  const v = P.wb.viv, rk = vivRisk(P), hi = isFinite(rk.hi) ? fmt(rk.hi, 2) : '∞';
  return `İşletme hız zarfında (${fmt(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${fmt(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn) riskli ya da sınırda hız yok: K0 ${fmt(rk.K0a, 2)}–${fmt(rk.K0b, 2)}, tarama bandı (paylı) ${fmt(rk.lo, 2)}–${hi}; VIV oluşmaz, B2-01 = 0.`;
}
// v13.3: hızlar işletme zarfından (U_min–U_max, kn; ızgara noktaları + uçlar; varsayılan 2–12 kn önceki tabloyla aynı);
// K0 üst sınırı kütle oranıyla ölçeklenir (vivMass; m* ≤ 0,54 → sınırsız)
function vivSpeeds(P) {
  const v = P.wb.viv, a = Math.min(v.Umin_kn, v.Umax_kn), b = Math.max(v.Umin_kn, v.Umax_kn), grid = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 25, 30];
  return Array.from(new Set(grid.filter(k => k >= a - 1e-9 && k <= b + 1e-9).concat([a, b]).map(k => Math.round(k * 100) / 100))).sort((x, y) => x - y);
}
function vivTable(P) {
  const v = P.wb.viv, hx = P.wb.hex, d = derive(P), speeds = vivSpeeds(P), M = vivMass(P), hiR = M.inf ? Infinity : M.k0hi;
  return speeds.map(kn => {
    const V = kn * 0.514444, Re = V * v.D / v.nu, fv = v.St * V / v.D, K0 = fv / v.fn, Ur = V / (v.fn * v.D);
    const scr = (K0 >= v.K0_lo && K0 <= hiR) ? 'TARAMA: RİSK' : ((K0 >= v.K0_lo * (1 - v.margin) && K0 <= hiR * (1 + v.margin)) ? 'Sınırda' : 'Düşük');
    const reach = Math.min(hx.theta_max, hx.omega_max / (TAU * fv), hx.alpha_max / sq(TAU * fv));
    return { kn, V, Re, fv, K0, Ur, scr, reWarn: v.section === 'Dairesel' && Re > v.Re_crit, reach, prod: reach >= v.amp_deg,
      band: fv > hx.fbw ? 'f_bw üstü' : (fv > hx.rel_ratio * hx.fbw ? 'Güvenilir bant üstü' : 'OK'), nyq: fv > d.fps / 2 ? 'Nyquist üstü' : 'OK', dwell: scr !== 'Düşük' };
  });
}
// Gemi direği: görünür rüzgâr hızına göre girdap kopma frekansı ve kilitlenme taraması (EN 1991-1-4 Ek E)
function windVivTable(P) {
  const W = P.wb.wviv, w = windVivCalc(P), hx = P.wb.hex;
  const us = Array.from(new Set([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40].concat([w.vcrit]).map(u => Math.round(u * 100) / 100))).sort((a, b) => a - b);
  return us.map(U => {
    const Re = U * W.D / W.nu, fs = W.St * U / W.D, r = U / w.vcrit;
    const lock = U >= w.lock[0] - 1e-9 && U <= w.lock[1] + 1e-9, env = U <= W.Umax;
    return { U, kn: U / 0.514444, Re, fs, r, lock, env, isCrit: Math.abs(U - Math.round(w.vcrit * 100) / 100) < 1e-9,
      regime: Re < 3e5 ? 'alt-kritik' : (Re < 5e5 ? 'kritik geçiş' : (Re <= 5e6 ? 'süperkritik' : 'transkritik')),
      scr: lock ? (env ? 'KİLİTLENME' : 'kilitlenme (zarf dışı)') : (r < 1 ? 'f_s < f_n' : 'f_s > f_n'),
      reach: Math.min(hx.theta_max, hx.omega_max / (TAU * W.fn), hx.alpha_max / sq(TAU * W.fn)) };
  });
}
// Etkin VIV kaynağının test bandı ve dwell adayları. Denizaltı: VIV taraması (hıza göre f_v adayları) ve f_n
// (kilitlenmede yanıt yapının kendi frekansındadır; v13.2: f_n aday listesinin dışında kalsa da banda girer — T2.2
// zaten f_n'de dwell yapar); gemi: havada kilitlenme yapının kendi modunda olur (f_v → f_n); bant, f_n'nin
// belirsizliğidir (±ftol: mesnet esnekliği, tepe kütlesi, sıcaklık)
function vivBand(P) {
  const VS = vivSpec(P);
  if (VS.kind === 'hydro') {
    const vt = vivTable(P).filter(r => r.dwell), fn = P.wb.viv.fn, fv = vt.map(r => r.fv), M = vivMass(P), rk = vivRisk(P);
    // v13.3: kütle oranıyla kilitlenmede alt dal frekansı f*_alt·f_n de adaydır (hafif mastta f_n'nin üstüne kayar);
    // yalnız zarfta erişilebiliyorsa (vivRisk.lock: en yüksek hızın f_v'si, paylı, f_n,vak'a ulaşıyor)
    const flock = rk.lock ? M.flock : null;
    const cand = Array.from(new Set(fv.concat([fn]).concat(flock ? [flock] : []))).sort((a, b) => a - b);
    let fLo = cand[0], fHi = cand[cand.length - 1];
    // tek aday (tarama riski yok, yalnız f_n): bant H1 çözünürlüğünün (≈ 0,12 Hz) en az iki katı genişlikte
    if (fHi - fLo < 0.25) { const fc = 0.5 * (fLo + fHi); fLo = fc - 0.125; fHi = fc + 0.125; }
    return { VS, fLo, fHi, cand, fv, nRisk: vt.length, flock, flockAll: M.flock, rk };
  }
  const t = P.wb.wviv.ftol;
  return { VS, fLo: VS.f * (1 - t), fHi: VS.f * (1 + t), cand: [VS.f * (1 - t), VS.f, VS.f * (1 + t)] };
}
// T2.1 — açısal sinüs süpürme (1 → 20 Hz, 1 oktav/dk), stab ON ve OFF
TESTS['T2.1'] = function (P, ctx, prog) {
  const d = derive(P), f0 = 1, f1 = Math.min(20, P.wb.hex.fbw), opm = 1;
  const runs = [], PX21 = []; let k = 0;
  const axes = [0, 2], resCfg = !!P.dut.ctl.res.on;
  const confs = resCfg ? [{ stab: true, feat: true }, { stab: true, feat: false }, { stab: false, feat: false }] : [{ stab: true, feat: false }, { stab: false, feat: false }];
  // Test tanımı: eksen başına 3 süpürme. Yapılandırılmış DUT (stab ON) 3 ardışık süpürmeyle koşulur ve H1 üçünün
  // üzerinden ortalanır; karşılaştırma koşuları (dar bant kapalı, stab OFF) tek süpürmedir.
  const nswOf = (cf) => (cf.stab && (cf.feat || !resCfg)) ? 3 : 1;
  const wTot = axes.length * confs.reduce((s, cf) => s + nswOf(cf), 0);
  let wDone = 0;
  for (const ax of axes) for (const cf of confs) {
    const stab = cf.stab, Pc = (resCfg && !cf.feat) ? cloneParams(P) : P;
    if (Pc !== P) Pc.dut.ctl.res.on = false;
    const ampFn = stab ? (f) => d.reach(f) * D2R : (f) => Math.min(d.reach(f), 0.9 * d.stabOffMax) * D2R;
    const nsw = nswOf(cf), Tsw = makeComponent({ type: 'chirp', axis: ax, f0, f1, octPerMin: opm, ampFn, t0: 0, ramp: 2 }, 1000, makeRngFactory(1)).T, gap = 4;
    const cmd = [], chs = [];
    for (let q = 0; q < nsw; q++) {
      const c = { type: 'chirp', axis: ax, f0, f1, octPerMin: opm, ampFn, t0: 2 + q * (Tsw + gap), ramp: 2 };
      cmd.push(c); chs.push(makeComponent(c, 1000, makeRngFactory(1)));
    }
    const T = 2 + nsw * (Tsw + gap) + 2;
    const S = labScenario(P, { label: 'T2.1', T, fs: 2000, stab, seed: 2100 + ax + (stab ? 0 : 10) + (cf.feat ? 0 : 20), cmd,
      resTrack: (t) => { for (const c of chs) { const fq = c.freqAt(t); if (fq) return fq; } return 0; },          // adaptif rezonans kontrolcü (açıksa) süpürmeyi izler
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'imu_r', 'imu_p', 'imu_y'] } });
    if (stab && (cf.feat || !resCfg)) PX21.push(Object.assign(pupilExcursion(P, S), { run: AXN[ax] + ' süpürmesi' }));     // v13.4: göz bebeği
    const R = runSim(Pc, S, (p) => prog && prog((wDone + p * nsw) / wTot)); k++; wDone += nsw;
    const map = axisMap(P, ax), imuCh = ['imu_r', 'imu_p', 'imu_y'][ax];
    // video: IMU'yu kare zamanlarına örnekle
    const v = videoAngles(R, ctx);
    const xin = sampleAt(R, imuCh, v.t), yv = map.los === 'el' ? v.el : v.xel;
    const hv = tfH1(xin, yv, R.video.fps, 512);
    const xa = Float64Array.from(R.rec[imuCh]), ya = Float64Array.from(R.rec[map.los === 'el' ? 'ac_el' : 'ac_xel']);
    const ha = tfH1(xa, ya, R.meta.fRec, 8192);
    runs.push({ ax, stab, feat: cf.feat, hv, ha, los: map.los, w: Math.abs(map.w), nsw });
  }
  // değerlendirme: VIV bandında (aday f_v; gemide f_n ± ftol) γ² ≥ eşik noktalarda DRR ≤ gerekli
  const VB = vivBand(P), VS = VB.VS, ship = VS.kind === 'wind', fLo = VB.fLo, fHi = VB.fHi;
  const req = db(budgetAlloc(P)['B2-01'] * 1e-6 / (VS.A / Math.SQRT2));
  const coh = P.wb.unc.coh;
  let ok = true, nvalid = 0, nlow = 0;
  const worst = { el: -Infinity, xel: -Infinity }, worstF = { el: NaN, xel: NaN };
  // koheransı düşük bant noktaları için üst sınır: |H1| ≤ √(S_yy/S_xx) (γ² ≤ 1); yalnız bantta geçerli
  // nokta hiç yoksa kullanılır (sürtünme harmonikleri ve izleyen dar bant kontrol koheransı düşürebilir)
  const worstB = { el: -Infinity, xel: -Infinity }, worstBF = { el: NaN, xel: NaN };
  const on = runs.filter(r => r.stab && (r.feat || !resCfg)), base = runs.filter(r => r.stab && !r.feat), resonances = [];
  for (const r of on) {
    const h = r.ha;
    for (let i = 0; i < h.f.length; i++) {
      const f = h.f[i]; if (f < fLo || f > fHi) continue;
      if (h.coh[i] < coh) { nlow++; const gb = db(Math.sqrt(h.Pyy[i] / h.Pxx[i]) / r.w); if (gb > worstB[r.los]) { worstB[r.los] = gb; worstBF[r.los] = f; } continue; }
      nvalid++;
      const g = db(h.mag[i] / r.w); if (g > worst[r.los]) { worst[r.los] = g; worstF[r.los] = f; }
      if (g > req && r.los === 'el') ok = false;
    }
  }
  const boundMode = nvalid === 0 && nlow > 0;              // bantta geçerli nokta yok → yalnız üst sınır
  if (boundMode) ok = worstB.el <= req;
  // rezonans tepeleri (1–20 Hz, ≥ 3 dB belirginlik) — dar bant özelliği kapalı taban döngüde aranır
  for (const r of base) {
    const h = r.ha, fs = [], gs = []; for (let i = 0; i < h.f.length; i++) if (h.f[i] >= 1 && h.f[i] <= 20 && h.coh[i] >= coh) { fs.push(h.f[i]); gs.push(db(h.mag[i] / r.w)); }
    for (let i = 2; i < gs.length - 2; i++) if (gs[i] > gs[i - 1] && gs[i] > gs[i + 1] && gs[i] - Math.min(gs[i - 2], gs[i + 2]) > 3) resonances.push({ ax: r.ax, f: fs[i], g: gs[i] });
  }
  ctx.res = resonances;
  const offG = runs.filter(r => !r.stab).map(r => { let s = 0, c = 0; for (let i = 0; i < r.ha.f.length; i++) if (r.ha.f[i] >= 1 && r.ha.f[i] <= 10 && r.ha.coh[i] > 0.9) { s += db(r.ha.mag[i] / r.w); c++; } return c ? s / c : NaN; });
  // VIV yoksa (kapalı ya da gemide işletme zarfında kilitlenme yok): bant kabulü yok; süpürme 1–20 Hz bastırmasını ve
  // rezonansları yine karakterize eder
  const vivOn = VS.present;
  const offTxt = ship ? (VS.on ? `Rüzgâr VIV'i işletme zarfında oluşmaz (v_crit = ${fmt(VS.w.vcrit, 1)} m/s > 1,25·U_max = ${fmt(1.25 * P.wb.wviv.Umax, 1)} m/s): bant kabulü uygulanmaz, değerler bilgi amaçlı. `
    : 'Rüzgâr VIV etkisi kapalı: bant kabulü uygulanmaz, değerler bilgi amaçlı. ') : (VS.on ? vivNoRiskTxt(P) + ' Bant kabulü uygulanmaz, değerler bilgi amaçlı. ' : 'VIV kapalı: VIV bandı kabulü uygulanmaz, değerler bilgi amaçlı. ');
  const ampLbl = ship ? fmt(VS.A * R2D, 3).replace('.', ',') : String(P.wb.viv.amp_deg).replace('.', ',');
  const noPts = nvalid === 0 && nlow === 0;
  const bandTxt = ship ? `Rüzgâr VIV bandında (f_n ± %${fmt(100 * P.wb.wviv.ftol, 0)}: ${fmt(fLo)}–${fmt(fHi)} Hz)` : `VIV bandında (${fmt(fLo)}–${fmt(fHi)} Hz${VB.nRisk === 0 ? '; taramada riskli hız yok, yalnız f_n çevresi' : ''})`;
  const fnV = VS.f, fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');
  const res = mkResult('T2.1', {
    status: !vivOn || noPts ? 'BİLGİ' : (boundMode ? (ok ? 'OK' : 'BİLGİ') : stat(ok)),
    measured: (vivOn ? '' : offTxt) + bandTxt + (boundMode
      ? ` γ² ≥ ${coh} nokta yok (${nlow} düşük koheranslı nokta); koherans üst sınırı: roll→el DRR ≤ ${fmt(worstB.el, 1)} dB @ ${fmt(worstBF.el, 2)} Hz (gerekli ${fmt(req, 1)} dB)${vivOn ? (ok ? ' → sınır gereksinimi sağlıyor' : ' → karar verilemez; bant kabulü T2.2 dwell\'iyle') : ''}; yaw→xel ≤ ${fmt(worstB.xel, 1)} dB (bilgi); ${resonances.length} rezonans adayı`
      : ` γ² ≥ ${coh} noktalarda en kötü DRR: roll→el ${fmt(worst.el, 1)} dB @ ${fmt(worstF.el, 2)} Hz (gerekli ${fmt(req, 1)} dB); yaw→xel ${fmt(worst.xel, 1)} dB (bilgi); ${resonances.length} rezonans adayı`),
    kv: [[`Gerekli DRR (B2-01: ${ampLbl}° → ${fA(budgetAlloc(P)['B2-01'])} µrad)`, vivOn ? fmt(req, 2) + ' dB' : '— (VIV yok)'], ['Geçerli nokta sayısı (γ² ≥ ' + coh + ')', String(nvalid) + (boundMode ? ` (bantta ${nlow} nokta eşiğin altında: üst sınır √(S_yy/S_xx) raporlandı)` : '')],
         ...(nlow > 0 && !boundMode ? [['Bantta koherans eşiğinin altında kalan nokta (karara girmez)', `${nlow}; üst sınır roll→el ≤ ${fmt(worstB.el, 1)} dB @ ${fmt(worstBF.el, 2)} Hz (koherans üst sınırı) — bu kısım T2.2 dwell'iyle doğrulanır`]] : []),
         ['Dar bant (adaptif rezonans) kontrol', P.dut.ctl.res.on ? `açık, ${P.dut.ctl.res.fmin}–${P.dut.ctl.res.fmax} Hz bandında süpürme frekansını izler (ideal frekans kestirimi)` : 'kapalı'],
         ['Stab OFF ortalama kazanç (1–10 Hz)', offG.map((g, i) => AXN[axes[i]] + ' ' + fmt(g, 2) + ' dB').join(', ')],
         ['Rezonans adayları', resonances.length ? resonances.map(r => `${AXN[r.ax]} ${fmt(r.f, 2)} Hz (${fmt(r.g, 1)} dB)`).join(', ') : 'yok (1–20 Hz)'],
         ['Süpürme', `${f0} → ${f1} Hz, ${opm} oktav/dk; stab ON genliği hexapod erişimi, stab OFF ≤ ${fmt(0.9 * d.stabOffMax, 2)}°; yapılandırılmış DUT eksen başına 3 süpürme (H1 üçünün ortalaması), karşılaştırma koşuları 1 süpürme`]],
    notes: [...(vivOn ? [] : [ship ? 'Gemi direğinde rüzgâr VIV\'i bu ayarlarla oluşmuyor; süpürme DUT\'un 1–20 Hz bozucu bastırmasını ve rezonans adaylarını (platform titreşimi, T3.1) yine karakterize eder.'
              : (VS.on ? 'İşletme hız zarfında VIV oluşmuyor' : 'VIV kapalı') + '; süpürme DUT\'un 1–20 Hz bozucu bastırmasını ve rezonans adaylarını (platform titreşimi, T3.1) yine karakterize eder.']),
            ...(boundMode ? ['Bantta koherans eşiğini geçen nokta kalmadı. Süpürme bu bandın üçte birindeyken sürtünmenin ürettiği 3. harmonik bu banda düşer; süpürmeyi izleyen dar bant kontrol temel bileşeni çok bastırdığı için bu girdiyle ilişkisiz içerik baskın olur ve γ² ≈ 0,7\'ye iner (aynı koşu sürtünmesiz ya da izlemesiz sabit dar bantla γ² ≈ 0,94–0,99 verir). Bu durumda yalnız üst sınır raporlanır: |H1| ≤ √(S_yy/S_xx). Sınır gereksinimin üstündeyse süpürme karar veremez; kabul T2.2\'nin durağan dwell\'iyle verilir.'] : []),
            ...(ship ? [`Gemi direği: havada kilitlenme, yapının kendi modunda (f_n = ${fmt(VS.f, 2)} Hz) olur; bant, f_n'nin belirsizliğidir (mesnet esnekliği, tepe kütlesi). Süpürme yalnız açısal yolu ölçer; direk tepesi ötelemesinin LOS'a etkisi (dengesizlik torku, optik montaj esnemesi) T2.2'nin açısal + öteleme dwell'inde ölçülür.`] : []),
            'H1 = S_xy/S_xx: girdi IMU, çıktı video (≤ 25 Hz) ve otokolimatör (≤ 500 Hz). Koherans eşiğinin altındaki noktalar raporlanmaz.',
            ship ? `Süpürme genliği hexapod erişimi kadar büyüktür (${fmt(VS.f, 1)} Hz'de ≈ ${fmt(d.reach(VS.f), 2)}°), rüzgâr VIV genliği ise ${ampLbl}°. Sürtünme genlikten bağımsız bir tork olduğu için küçük genlikte DRR kötüleşir: kabulü gerçek genlikteki dwell (T2.2) belirler.`
              : `Süpürme genliği hexapod erişimi kadar büyüktür (f_n = ${fcm(fnV, 1)} Hz'de ≈ ${fcm(d.reach(fnV), 2)}°), VIV genliği ise ${ampLbl}°. Sürtünme genlikten bağımsız bir tork olduğu için küçük genlikte DRR kötüleşir: kabulü gerçek genlikteki dwell (T2.2) belirler.`,
            ...(!ship ? [`Bant, taramanın aday f_v değerlerini${VB.flock ? ', ' : ' ve '}f_n'yi${VB.flock ? ` ve kütle oranının verdiği alt dal frekansını (m* = ${fcm(P.wb.viv.mstar, 2)}: f*·f_n = ${fcm(VB.flock, 2)} Hz)` : ''} kapsar: kilitlenmede yanıt yapının kendi modundadır, hafif mastta frekansı f_n'nin üstüne kayar${VB.nRisk === 0 ? '; taramada riskli ya da sınırda hız yok, bant yalnız f_n çevresidir' : ''}.` +
              (VB.flockAll && !VB.flock && VS.present ? ` Kütle oranının alt dal frekansı (f*·f_n = ${fcm(VB.flockAll, 2)} Hz) zarfta erişilmez: alt dala geçişte yanıt vakumdaki doğal frekanstan (f_n,vak = ${fcm(VB.rk.fvac, 2)} Hz) geçer, en yüksek hızdaki f_v ise payıyla ${fcm(VB.rk.fvMax * (1 + P.wb.viv.margin), 2)} Hz'dir; aday değildir.` : '')] : []),
            ...(!ship && VS.lin ? ['Süpürme yalnız açısal yolu ölçer; mast başı ötelemesinin LOS\'a etkisi (dengesizlik torku, optik montaj esnemesi) T2.2\'nin açısal + öteleme dwell\'inde ölçülür.'] : []),
            'f > video Nyquist bölgesinde yalnız yüksek hızlı kanal geçerlidir; f > f_bw/2\'de hexapod çıkışı komuttan sapar, bu yüzden girdi IMU\'dan alınır.'],
  });
  const ser = [];
  for (const r of runs) {
    if (r.ax !== 0 && !(r.stab && (r.feat || !resCfg))) continue;      // yaw: yalnız yapılandırılmış ON
    const h = r.ha, sel = []; for (let i = 0; i < h.f.length; i++) if (h.f[i] >= 0.8 && h.f[i] <= 22 && h.coh[i] >= coh) sel.push(i);
    const tag = r.stab ? (resCfg ? (r.feat ? 'ON' : 'ON, dar bant kapalı') : 'ON') : 'OFF';
    ser.push({ name: `${AXN[r.ax]}→${r.los} ${tag}`, x: Float32Array.from(sel.map(i => h.f[i])), y: Float32Array.from(sel.map(i => db(h.mag[i] / r.w))) });
  }
  const fa = logspace(1, 20, 60), RS = P.dut.ctl.res;
  const baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RS, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
  const mdl = (f) => {
    if (!RS.on) return baseL.drr(TAU * f);
    const fr = RS.adaptive ? f : RS.f;
    return (fr >= RS.fmin && fr <= RS.fmax) ? loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, fr).drr(TAU * f) : baseL.drr(TAU * f);
  };
  ser.push({ name: 'Model el (doğrusal)', x: Float32Array.from(fa), y: Float32Array.from(Array.from(fa, f => db(cabs(mdl(f))))) });
  res.plots.push({ title: 'H1 — bozucu bastırma (γ² ≥ eşik noktalar)', xLabel: 'Hz', yLabel: 'dB', xLog: true, series: ser, refLines: isFinite(req) ? [{ y: req, label: 'Gerekli DRR (B2-01)' }] : [] });
  const r0 = runs[0];
  res.plots.push({ title: 'Koherans (roll, stab ON)', xLabel: 'Hz', yLabel: 'γ²', xLog: true,
    series: [{ name: 'video', x: Float32Array.from(r0.hv.f.subarray(1)), y: Float32Array.from(r0.hv.coh.subarray(1)) }, { name: 'otokolimatör', x: Float32Array.from(r0.ha.f.subarray(1, 400)), y: Float32Array.from(r0.ha.coh.subarray(1, 400)) }],
    refLines: [{ y: coh, label: 'eşik' }] });
  // v13.4: göz bebeği ↔ kolimatör demeti (yapılandırılmış DUT, stab ON süpürmeleri; en büyük genlik süpürmenin başında, 1 Hz)
  if (PX21.length) { const W = PX21.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// T2.2 (açısal + öteleme tonu) — gemi direği (rüzgâr VIV) ve v13.3'ten beri denizaltı mastı (mast başı ötelemesi açıkken):
// modun LOS referans noktasında doğurduğu açısal hareket + aynı fazda öteleme (hexapod), VIV adaylarında ve T2.1
// rezonanslarında; dar bant kontrol OFF/ON. f_n'de yapılandırılmış DUT ayrıca yalnız açısal uyarımla koşulur: ötelemenin payı
// ayrılır. Denizaltı adayları: tarama f_v'leri, f_n ve kütle oranının alt dal frekansı f*·f_n; gemi: f_n ve f_n ± ftol.
function t22Tone(P, ctx, prog) {
  const VB = vivBand(P), VS = VB.VS, ship = VS.kind === 'wind', W = P.wb.wviv, v = P.wb.viv, w = VS.w;
  if (!VS.present) return mkResult('T2.2', { status: 'BİLGİ',
    measured: ship ? (VS.on ? `Rüzgâr VIV'i işletme zarfında oluşmaz: v_crit = ${fmt(w.vcrit, 1)} m/s > 1,25·U_max = ${fmt(1.25 * W.Umax, 1)} m/s (EN 1991-1-4 E.1.2(2)); dwell uygulanmaz, B2-01 = 0 ve bütçeye ölçüm aktarılmaz.`
      : 'Rüzgâr VIV etkisi kapalı: dwell uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.')
      : (VS.on ? vivNoRiskTxt(P) + ' Dwell uygulanmaz; bütçeye ölçüm aktarılmaz.' : 'VIV kapalı: VIV dwell testi uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.'),
    notes: [ship ? 'Model sekmesinde rüzgâr VIV\'i açıkken ve kritik hız işletme zarfının içindeyken test koşulur.'
      : 'Model sekmesinde VIV açıkken ve işletme hız zarfında riskli ya da sınırda hız varken test koşulur.'] });
  const freqs = Array.from(new Set(VB.cand.concat((ctx.res || []).map(r => r.f)).map(f => Math.round(f * 100) / 100))).sort((a, b) => a - b);
  const cfgOn = !!P.dut.ctl.res.on, out = [], nTot = 2 * freqs.length + 1;
  let k = 0;
  const dwell = (P2, f, lin, seed) => {
    const VSx = lin ? VS : Object.assign({}, VS, { lin: false });
    const ramp = Math.max(1.0, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core;
    const tn = windTone(P2, VSx, f, t0, t1, ramp);
    const seg = { axis: Math.abs(VS.roll) >= Math.abs(VS.pitch) ? 0 : 1, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f };
    const Sd = labScenario(P2, { label: 'T2.2', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed }), px = pupilExcursion(P2, Sd);   // v13.4: göz bebeği
    const R = runSim(P2, Sd, (p) => prog && prog((k + p) / nTot)); k++;
    const fit = fitSegments(P2, R, [seg], ctx)[0];
    const vEl = fit.fe ? fit.fe.A / Math.SQRT2 : NaN, vXel = fit.fx ? fit.fx.A / Math.SQRT2 : NaN;
    // yol ayrımı (T2.5 ile aynı): ayna (otokolimatör) = gimbal yolu (açısal artık + dengesizlik torku; gyro'nun gördüğü);
    // video − ayna (fazör farkı) = optik alt montaj esnemesi (gyro görmez, dar bant kontrol bastıramaz)
    const ph = (a, b) => (a && b) ? Math.hypot(a.a - b.a, a.b - b.b) / Math.SQRT2 : NaN;
    const mEl = fit.ae ? fit.ae.A / Math.SQRT2 : NaN, mXel = fit.ax ? fit.ax.A / Math.SQRT2 : NaN;
    return { f, A: tn.A, y: tn.y, acc: tn.acc, limited: tn.limited, vEl, vXel, vid: Math.max(vEl, vXel), tru: Math.max(fit.te.A, fit.tx.A) / Math.SQRT2,
      mEl, mXel, oEl: ph(fit.fe, fit.ae), oXel: ph(fit.fx, fit.ax), drr: drrOf(fit.fe, fit.fin), px,
      // v13.4: hexapod iletimi τ = θ_ölç / θ_komut (IMU sinüs uydurması, baskın eksen); artık gerçekleşen uyarımdadır
      tau: fit.fin && tn.A > 0 ? fit.fin.A / (tn.A * Math.abs(seg.axis === 0 ? VS.roll : VS.pitch)) : NaN };
  };
  for (const resOn of [false, true]) for (const f of freqs) {
    const P2 = cloneParams(P); P2.dut.ctl.res.on = resOn;
    out.push(Object.assign(dwell(P2, f, true, 2200 + k), { resOn }));
  }
  const angOnly = VS.lin ? dwell(P, VS.f, false, 2290) : null;
  const lim = budgetAlloc(P)['B2-01'] * 1e-6, cur = out.filter(o => o.resOn === cfgOn), worst = Math.max(...cur.map(o => o.vid));
  const ok = worst <= lim;
  const near = (o) => Math.abs(o.f - Math.round(VS.f * 100) / 100) < 0.006;
  const atFn = out.find(o => !o.resOn && near(o)), atFnOn = out.find(o => o.resOn && near(o)), atCfg = cfgOn ? atFnOn : atFn;
  const bAng = (o) => db(o.vid / (o.A / Math.SQRT2));
  // hexapod erişimi (θ/ω/α) ya da öteleme stroku VIV adaylarında uyarımı küçültüyorsa test tanımlandığı gibi üretilemez:
  // GEÇERSİZ (v13.2). Yalnız rezonans adayında sınırlıysa bilgi olarak işaretlenir.
  const candR = VB.cand.map(f => Math.round(f * 100) / 100), isCand = (o) => candR.some(c => Math.abs(c - o.f) < 0.006);
  const limC = out.filter(o => !o.resOn && o.limited && isCand(o)), limR = out.filter(o => !o.resOn && o.limited && !isCand(o));
  const RSc = P.dut.ctl.res, outBand = freqs.filter(f => f < RSc.fmin || f > RSc.fmax);
  // dar bant kontrol f_n'de artığı büyüttüyse (ör. yandan rüzgâr): yol ayrımıyla açıklanır
  const worse = atFnOn.vid > atFn.vid * 1.05, axW = atFnOn.vXel >= atFnOn.vEl ? 'Xel' : 'El';
  const pathTxt = (o) => `ayna el ${urad(o.mEl)} / xel ${urad(o.mXel)} · video − ayna el ${urad(o.oEl)} / xel ${urad(o.oXel)}`;
  const fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');
  // denizaltı: aday etiketi (f_n, alt dal), doğrusal model, bütçe tahmini (eski denizaltı dwell'iyle aynı bilgiler)
  const flockR = VB.flock ? Math.round(VB.flock * 100) / 100 : null;
  const tag = (f) => ship ? '' : (Math.abs(f - Math.round(VS.f * 100) / 100) < 0.006 ? ' (f_n)' : (flockR && Math.abs(f - flockR) < 0.006 ? ' (alt dal f*·f_n)' : ''));
  let subKv = [], subNotes = [];
  if (!ship) {
    const baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RSc, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
    const linFn = db(cabs(baseL.drr(TAU * v.fn))), est = VS.A / Math.SQRT2 * Math.pow(10, VS.H / 20), M = vivMass(P), rk = VS.risk;
    const drrOff = db(atFn.vid / (atFn.A / Math.SQRT2));
    subKv = [[`Doğrusal model (dar bant kapalı taban döngü) DRR @ f_n = ${v.fn} Hz`, `${fmt(linFn, 1)} dB; ölçülen (OFF, açısal + öteleme) ${fmt(drrOff, 1)} dB`],
      ['Uyarımın kaynağı (senaryo, denizaltı)', `θ = ${fmt(VS.A * R2D, 3)}° (f_n = ${fmt(v.fn, 2)} Hz) · mast başı ötelemesi y = θ·L/κ = ±${fmt(VS.y * 1e3, 2)} mm (L = ${v.L} m, κ = ${v.kth}), ${fmt(sq(TAU * v.fn) * VS.y, 3)} m/s²` +
        (M.on ? ` · kütle oranı m* = ${v.mstar}: ${M.inf ? 'm* ≤ 0,54, kilitlenme üst sınırı yok' : `f*_alt = ${fmt(M.fstar, 3)} → K0 üst ${fmt(M.k0hi, 2)}, alt dal ${fmt(M.flock, 2)} Hz` + (VB.flock ? '' : ` (zarfta erişilmez: en yüksek hızda f_v·(1 + pay) ${fmt(rk.fvMax * (1 + v.margin), 2)} Hz < f_n,vak ${fmt(rk.fvac, 2)} Hz; aday değil)`)}` : '') +
        ` · hız zarfı ${fmt(Math.min(v.Umin_kn, v.Umax_kn), 1)}–${fmt(Math.max(v.Umin_kn, v.Umax_kn), 1)} kn (K0 ${fmt(rk.K0a, 2)}–${fmt(rk.K0b, 2)})`],
      ['Eksenler', 'ileri harekette akış pruvadan: kuvvet ve öteleme y (iskele) yönünde, dönme roll (−x); açı ve öteleme aynı modda, aynı fazda']];
    subNotes = ['ON: uyarlanır dar bantlı (rezonans) kontrolcü, dwell frekansına ayarlı, +' + RSc.gain_dB + ' dB (çalışma bandı ' + RSc.fmin + '–' + RSc.fmax + ' Hz; dışında devreye girmez). Analitik bütçe tahmini yalnız açısal yolu içerir (' + fcm(VS.H, 0) + ' dB varsayımıyla ' + fcm(est * 1e6, 2) + ' µrad) ve B2-01 tahsisini (' + fA(lim * 1e6) + ' µrad) ' +
        (est <= lim ? 'aşmaz.' : 'aşar; ' + (atFnOn.vid <= lim ? 'f_n\'de bu açığı dar bant kontrol kapatır.' : (v.fn < RSc.fmin || v.fn > RSc.fmax ? 'f_n dar bant kontrolün çalışma bandının dışında olduğu için açık kapanmaz.' : 'dar bant kontrol de f_n\'de açığı kapatamıyor.'))),
      (isFinite(atFn.drr) && drrOff > linFn + 1 ? `Kapalıyken artık, doğrusal modelin verdiği ${fcm(linFn, 1)} dB'den (f_n = ${fcm(v.fn, 2)} Hz) kötüdür (ölçülen ${fcm(drrOff, 1)} dB): ${String(v.amp_deg).replace('.', ',')}° genlikte bağıl hız her periyotta iki kez sıfırdan geçer ve sürtünme geçişleri tonda temel bileşen üretir.`
        : `Kapalıyken ölçülen DRR (${fcm(drrOff, 1)} dB) doğrusal modele (${fcm(linFn, 1)} dB, f_n = ${fcm(v.fn, 2)} Hz) yakındır.`),
      'Bütçeye f_n\'deki ölçüm geçer (senaryo frekansı); kabul bütün VIV adaylarının en kötüsüyle verilir. Akış yönündeki titreşim (2·f_v, pitch + x) modellenmez.'];
  }
  // v13.4: hexapod iletimi — dwell frekanslarında en düşük τ; < 0,98 ise artık o oranda eksik ölçülür (bilgi; sonuç ölçeklenmez)
  const tauRows = out.filter(o => isFinite(o.tau)), tauMin = tauRows.length ? tauRows.reduce((a, b) => (b.tau < a.tau ? b : a)) : null;
  const tauRow = tauMin ? [['Hexapod iletimi τ = θ_ölç / θ_komut (IMU), dwell frekanslarında en düşük', `${fmt(tauMin.tau, 3)} @ ${fmt(tauMin.f, 2)} Hz (analitik 1/√(1 + (f/f_bw)⁴) = ${fmt(1 / Math.sqrt(1 + Math.pow(tauMin.f / P.wb.hex.fbw, 4)), 3)}; f_bw = ${P.wb.hex.fbw} Hz)` + (tauMin.tau < 0.98 ? ' — artık bu oranda eksik ölçülür' : '')]] : [];
  const tauNote = tauMin && tauMin.tau < 0.98 ? [`Hexapod ${fmt(tauMin.f, 2)} Hz'de komutun ancak %${fmt(100 * tauMin.tau, 1)}'ini iletiyor (f_bw = ${P.wb.hex.fbw} Hz): artık ve bütçeye geçen değer bu oranda eksiktir. Genliği IMU'ya göre eşitleyin (sürüş düzeltmesi) ya da sonucu 1/τ ile ölçekleyin.`] : [];
  const res = mkResult('T2.2', {
    status: limC.length ? 'GEÇERSİZ' : stat(ok), measured: (limC.length ? `Hexapod erişimi VIV uyarımını ${limC.map(o => fmt(o.f, 2)).join(', ')} Hz'de küçültüyor (θ/ω/α ya da öteleme stroku): sonuç GEÇERSİZ. ` : '') +
      `Tondaki artık (yapılandırılmış DUT, dar bant kontrol ${cfgOn ? 'ON' : 'OFF'}; el ve xel'in büyüğü): en kötü ${urad(worst)} µrad RMS (tahsis ${urad(lim, 1)}); f_n = ${fmt(VS.f, 2)} Hz'de OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad` +
      (angOnly ? `; yalnız açısal uyarımla ${urad(angOnly.vid)} µrad (öteleme payı)` : ''),
    kv: freqs.map(f => { const a = out.find(o => o.f === f && !o.resOn), b = out.find(o => o.f === f && o.resOn);
      return [`${fmt(f, 2)} Hz${tag(f)} · θ ${fmt(a.A * R2D, 3)}°${VS.lin ? ` · öteleme ±${fmt(a.y * 1e3, ship ? 1 : 2)} mm (${fmt(a.acc, 2)} m/s²)` : ''}${a.limited ? ' (hexapod erişimiyle sınırlı)' : ''}`,
        `OFF el ${urad(a.vEl)} / xel ${urad(a.vXel)} µrad · ON el ${urad(b.vEl)} / xel ${urad(b.vXel)} µrad (açısal DRR karşılığı ${fmt(bAng(b), 1)} dB)`]; })
      .concat(angOnly ? [[`${fmt(VS.f, 2)} Hz, yalnız açısal (öteleme yok), yapılandırılmış DUT`, `el ${urad(angOnly.vEl)} / xel ${urad(angOnly.vXel)} µrad → öteleme yolu karesel ${urad(Math.sqrt(Math.max(0, sq(atCfg.vid) - sq(angOnly.vid))))} µrad`]] : [])
      .concat([[`${fmt(VS.f, 2)} Hz yol ayrımı (µrad RMS): ayna = gimbal yolu (açısal artık + dengesizlik torku), video − ayna = optik alt montaj`, `OFF: ${pathTxt(atFn)} → ON: ${pathTxt(atFnOn)}`],
               ['Dar bant kontrol çalışma bandı', `${RSc.fmin}–${RSc.fmax} Hz: ${outBand.length ? 'bandın DIŞINDAKİ dwell frekansları ' + outBand.map(f => fmt(f, 2)).join(', ') + ' Hz (ON = OFF)' : 'bütün dwell frekansları bant içinde'}`]])
      .concat(ship ? [['Uyarımın kaynağı (EN 1991-1-4 Ek E, yaklaşım 1)', `v_crit = ${fmt(w.vcrit, 2)} m/s (${fmt(w.vcrit / 0.514444, 1)} kn), Re = ${fmt(w.Re / 1e5, 2)}·10⁵ (${w.regime}), c_lat = ${fmt(w.clat, 3)}, Sc = ${fmt(w.Sc, 1)}, K_W = ${fmt(w.Kw, 3)} → y_F = ${fmt(w.yF * 1e3, 2)} mm, θ = κ·y/l = ${fmt(w.thCalc * R2D, 4)}°${w.meas ? ` (Model: ölçülmüş genlik ${W.amp_deg}° kullanıldı)` : ''}`],
               ['Rüzgâr yönü ve eksenler', `β = ${W.beta}° (pruvadan): dönme roll ${fmt(VS.roll, 2)} · pitch ${fmt(VS.pitch, 2)}; öteleme x ${fmt(VS.tx, 2)} · y ${fmt(VS.ty, 2)}${VS.lin ? '' : ' (öteleme kapalı)'}`]] : subKv).concat(tauRow),
    notes: [ship ? 'Rüzgâr kuvvetinin kendisi değil, direk modunun direktör tabanında doğurduğu hareket yeniden üretilir: hexapod açısal sinüs + aynı fazda öteleme. Laboratuvarda sonsuzdaki hedefin görüntüsü ötelemeyle kaymaz; öteleme LOS\'a gimbal kütle dengesizliği torku ve optik alt montajın esnemesiyle girer.'
              : 'Hidrodinamik kuvvet değil, mast modunun mast başında doğurduğu hareket yeniden üretilir: hexapod roll sinüsü + aynı fazda y ötelemesi (konsol mast: y = θ·L/κ). Laboratuvarda sonsuzdaki hedefin görüntüsü ötelemeyle kaymaz; öteleme LOS\'a gimbal kütle dengesizliği torku ve optik alt montajın esnemesiyle girer.',
            ship ? 'Dwell frekansları f_n ve f_n ± ' + fmt(100 * W.ftol, 0) + ' % (direk modunun belirsizliği) ile T2.1\'in rezonans adaylarıdır; her frekansta 60 s. ON: uyarlanır dar bant (rezonans) kontrolcü dwell frekansına ayarlı (çalışma bandı ' + P.dut.ctl.res.fmin + '–' + P.dut.ctl.res.fmax + ' Hz; dışında devreye girmez).'
              : 'Dwell frekansları VIV taramasının adayları (f_v), f_n' + (VB.flock ? ', kütle oranının verdiği alt dal frekansı f*·f_n = ' + fcm(VB.flock, 2) + ' Hz' : '') + ' ve T2.1\'in rezonans adaylarıdır; her frekansta 60 s.',
            ship ? 'Artık, LOS\'un el ve xel bileşenlerinin büyüğüdür: rüzgâr yönüne göre direk iki eksende de salınabilir. "Açısal DRR karşılığı" yalnız bilgi amaçlıdır; öteleme yolunun katkısını da içerir.'
              : 'Artık, LOS\'un el ve xel bileşenlerinin büyüğüdür. "Açısal DRR karşılığı" yalnız bilgi amaçlıdır; öteleme yolunun katkısını da içerir.',
            'Yol ayrımı (T2.5 ile aynı yöntem): referans aynası (otokolimatör) gimbalın mekanik açısını, yani gyro\'nun algıladığı yolu (açısal artık + dengesizlik torku) ölçer; video − ayna fazör farkı optik alt montaj esnemesidir. Bu esnemeyi gyro görmez, dar bant kontrol de bastıramaz.',
            ...subNotes,
            ...(worse ? [`Dar bant kontrol f_n'de artığı büyüttü (OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad). Yol ayrımı nedenini gösterir: kontrol gimbal yolunu bastırır (ayna ${axW.toLowerCase()} ${urad(atFn['m' + axW])} → ${urad(atFnOn['m' + axW])} µrad), optik montaj yolu değişmez (${urad(atFn['o' + axW])} → ${urad(atFnOn['o' + axW])} µrad). OFF'ta iki yol ters fazda kısmen birbirini götürüyordu; ON'da optik yol açıkta kalır. Kabul ve bütçe yapılandırılmış DUT'un (ON) değerini kullanır; düzeltme optik montajın rijitliğinde ya da dengelenmesindedir, kontrolde değil.`] : []),
            ...(limC.length || limR.length ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²) ya da öteleme stroku (±${fmt(P.lab.hexStroke * 1e3, 0)} mm) uyarımı ${limC.concat(limR).map(o => fmt(o.f, 2)).join(', ')} Hz'de küçülttü (mod biçimi korunarak açı ve öteleme aynı oranda). ${limC.length ? 'VIV adaylarında uyarım üretilemediği için sonuç GEÇERSİZ: daha büyük erişimli düzenek gerekir.' : 'Yalnız rezonans adayı etkilendi: o frekanstaki artık iyimser olabilir (bilgi).'}`] : []), ...tauNote],
    fill: { 'B2-01': atCfg.vid },
  });
  res.plots.push({ title: (ship ? 'Rüzgâr VIV dwell' : 'VIV dwell (açısal + mast başı ötelemesi)') + ': tondaki artık (el ve xel\'in büyüğü)', xLabel: 'Hz', yLabel: 'µrad RMS',
    series: [{ name: 'dar bant OFF', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && !o.resOn).vid * 1e6)), dots: true },
             { name: 'dar bant ON', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && o.resOn).vid * 1e6)), dots: true }],
    refLines: [{ y: lim * 1e6, label: 'B2-01 tahsisi' }] });
  // v13.4: göz bebeği ↔ kolimatör demeti — dwell'lerin en kötüsü (öteleme ve açısal yürüme)
  { const W = out.map(o => Object.assign({}, o.px, { run: fmt(o.f, 2) + ' Hz' })).reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü dwell ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
}
// T2.2 — VIV ve rezonans frekanslarında sinüs dwell; dar bantlı kontrol OFF/ON
TESTS['T2.2'] = function (P, ctx, prog) {
  const VS0 = vivSpec(P);
  // gemi ve (v13.3) mast başı ötelemesi açık denizaltı: açısal + öteleme tonu; öteleme kapalı denizaltı: yalnız açısal (eski biçim)
  if (isShip(P) || (VS0.lin && VS0.present)) return t22Tone(P, ctx, prog);
  if (!VS0.present) return mkResult('T2.2', { status: 'BİLGİ',
    measured: VS0.on ? vivNoRiskTxt(P) + ' Dwell uygulanmaz; bütçeye ölçüm aktarılmaz.' : 'VIV kapalı: VIV dwell testi uygulanmaz; B2-01 = 0 ve bütçeye ölçüm aktarılmaz.',
    notes: [VS0.on ? 'İşletme hız zarfında K0 tarama bandına girmiyor (Model → Hidrodinamik VIV: hız zarfı, f_n, D, St, kütle oranı). Zarf değişirse test koşulur.'
      : 'Hidrodinamik VIV kapalı (ör. mast durgun suda ya da girdap kopması bastırılmış). Model sekmesinde VIV açılınca test koşulur.'] });
  const d = derive(P), v = P.wb.viv, VS = vivSpec(P), VBo = vivBand(P);
  const freqs = Array.from(new Set(VBo.cand.concat((ctx.res || []).map(r => r.f)).map(f => Math.round(f * 100) / 100))).sort((a, b) => a - b);
  const A = v.amp_deg * D2R, out = [];
  // VIV adayları (tarama f_v'leri, f_n ve v13.3'te kütle oranının alt dal frekansı): hexapod erişimi uyarımı küçültürse test
  // tanımlandığı gibi üretilemez (v13.2)
  const candR = VBo.cand.map(f => Math.round(f * 100) / 100), isCand = (f) => candR.some(c => Math.abs(c - f) < 0.006);
  let k = 0;
  const PXo = [];
  for (const resOn of [false, true]) for (const f of freqs) {
    const P2 = cloneParams(P); P2.dut.ctl.res.on = resOn;
    const Ar = Math.min(A, d.reach(f) * D2R);
    const sg = segSines([{ axis: 0, f, A: Ar, nper: Math.round(60 * f) }]);
    const Sd = labScenario(P2, { label: 'T2.2', T: sg.T, fs: 2000, cmd: sg.cmd, resF: f, seed: 2200 + k });
    if (resOn) PXo.push(Object.assign(pupilExcursion(P2, Sd), { run: fmt(f, 2) + ' Hz' }));       // v13.4: göz bebeği
    const R = runSim(P2, Sd, (p) => prog && prog((k + p) / (2 * freqs.length))); k++;
    const fit = fitSegments(P2, R, sg.segs, ctx)[0];
    out.push({ f, resOn, A: Ar, limited: Ar < A * (1 - 1e-9), vid: fit.fe.A / Math.SQRT2, ac: fit.ae ? fit.ae.A / Math.SQRT2 : NaN, tru: fit.te.A / Math.SQRT2, drr: drrOf(fit.fe, fit.fin) });
  }
  // analitik bütçe tahmini (bütçe varsayımı wb.viv.drr_dB, v13.2 parametre) ve dar bant kapalı taban döngünün doğrusal DRR'ı @ f_n
  const lim = budgetAlloc(P)['B2-01'] * 1e-6, cfgOn = !!P.dut.ctl.res.on, est = A / Math.SQRT2 * Math.pow(10, VS.H / 20);
  const RSc = P.dut.ctl.res, baseL = loopModel(P.dut.el, Object.assign({}, P.dut.ctl, { res: Object.assign({}, RSc, { on: false }) }), P.dut.gyro, P.dut.cur, P.dut.el.J);
  const linFn = db(cabs(baseL.drr(TAU * v.fn))), fcm = (x, n) => fmt(x, n).replace('.', ',').replace(/^-/, '−');      // düz yazı: virgül, eksi işareti
  const cur = out.filter(o => o.resOn === cfgOn), worst = Math.max(...cur.map(o => o.vid));
  const ok = worst <= lim;
  const atFn = out.find(o => !o.resOn && Math.abs(o.f - v.fn) < 0.01), atFnOn = out.find(o => o.resOn && Math.abs(o.f - v.fn) < 0.01);
  const limC = out.filter(o => !o.resOn && o.limited && isCand(o.f)), limR = out.filter(o => !o.resOn && o.limited && !isCand(o.f));
  const outBand = freqs.filter(f => f < RSc.fmin || f > RSc.fmax);
  const offWorse = isFinite(atFn.drr) && atFn.drr > linFn + 1;
  const res = mkResult('T2.2', {
    status: limC.length ? 'GEÇERSİZ' : stat(ok), measured: (limC.length ? `Hexapod erişimi VIV genliğini (${String(v.amp_deg).replace('.', ',')}°) ${limC.map(o => fmt(o.f, 2)).join(', ')} Hz'de küçültüyor: sonuç GEÇERSİZ. ` : '') +
      `Tondaki artık (yapılandırılmış DUT, dar bant kontrol ${cfgOn ? 'ON' : 'OFF'}): en kötü ${urad(worst)} µrad RMS (tahsis ${urad(lim, 1)}); f_n = ${v.fn} Hz'de OFF ${urad(atFn.vid)} → ON ${urad(atFnOn.vid)} µrad`,
    kv: freqs.map(f => { const a = out.find(o => o.f === f && !o.resOn), b = out.find(o => o.f === f && o.resOn);
      return [`${fmt(f, 2)} Hz${a.limited ? ` (hexapod erişimiyle sınırlı: θ ${fmt(a.A * R2D, 3)}°)` : ''}`, `OFF ${urad(a.vid)} µrad (DRR ${fmt(a.drr, 1)} dB) · ON ${urad(b.vid)} µrad (DRR ${fmt(b.drr, 1)} dB)`]; })
      .concat([['Dar bant kontrol çalışma bandı', `${RSc.fmin}–${RSc.fmax} Hz: ${outBand.length ? 'bandın DIŞINDAKİ dwell frekansları ' + outBand.map(f => fmt(f, 2)).join(', ') + ' Hz (ON = OFF)' : 'bütün dwell frekansları bant içinde'}`],
               [`Doğrusal model (dar bant kapalı taban döngü) DRR @ f_n = ${v.fn} Hz`, `${fmt(linFn, 1)} dB; ölçülen (OFF) ${fmt(atFn.drr, 1)} dB`]]),
    notes: [`Hidrodinamik kuvvet değil, mast başında doğurduğu açısal hareket (${String(v.amp_deg).replace('.', ',')}°, roll) yeniden üretilir; mast başı ötelemesi kapalı (Model → Hidrodinamik VIV; yalnız açısal yol). Dwell frekansları VIV taramasının adayları (Model → VIV), f_n ve T2.1'in rezonans adaylarıdır.`,
            'ON: uyarlanır dar bantlı (rezonans) kontrolcü, dwell frekansına ayarlı, +' + RSc.gain_dB + ' dB (çalışma bandı ' + RSc.fmin + '–' + RSc.fmax + ' Hz; dışında devreye girmez). Analitik bütçe tahmini (' + fcm(VS.H, 0) + ' dB varsayımıyla ' + fcm(est * 1e6, 2) + ' µrad) B2-01 tahsisini (' + fA(lim * 1e6) + ' µrad) ' +
              (est <= lim ? 'aşmaz.' : 'aşar; ' + (atFnOn.vid <= lim ? 'f_n\'de bu açığı dar bant kontrol kapatır.' : (v.fn < RSc.fmin || v.fn > RSc.fmax ? 'f_n dar bant kontrolün çalışma bandının dışında olduğu için açık kapanmaz.' : 'dar bant kontrol de f_n\'de açığı kapatamıyor.'))),
            offWorse ? `Kapalıyken artık, doğrusal modelin verdiği ${fcm(linFn, 1)} dB'den (f_n = ${fcm(v.fn, 2)} Hz) kötüdür (ölçülen ${fcm(atFn.drr, 1)} dB): ${String(v.amp_deg).replace('.', ',')}° genlikte bağıl hız her periyotta iki kez sıfırdan geçer ve sürtünme geçişleri tonda temel bileşen üretir.`
              : `Kapalıyken ölçülen DRR (${fcm(atFn.drr, 1)} dB) doğrusal modele (${fcm(linFn, 1)} dB, f_n = ${fcm(v.fn, 2)} Hz) yakındır: bu genlikte sürtünme geçişlerinin tondaki payı küçüktür.`,
            ...(limC.length || limR.length ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²) uyarımı ${limC.concat(limR).map(o => fmt(o.f, 2)).join(', ')} Hz'de küçülttü. ${limC.length ? 'VIV adaylarında uyarım üretilemediği için sonuç GEÇERSİZ: daha büyük erişimli düzenek gerekir.' : 'Yalnız rezonans adayı etkilendi: küçük genlikte doğrusal artık küçülür, sürtünme payı kalır; o frekanstaki artık iyimser olabilir (bilgi).'}`] : [])],
    fill: { 'B2-01': cfgOn ? atFnOn.vid : atFn.vid },
  });
  res.plots.push({ title: 'VIV dwell: tondaki artık', xLabel: 'Hz', yLabel: 'µrad RMS',
    series: [{ name: 'dar bant OFF', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && !o.resOn).vid * 1e6)), dots: true },
             { name: 'dar bant ON', x: Float32Array.from(freqs), y: Float32Array.from(freqs.map(f => out.find(o => o.f === f && o.resOn).vid * 1e6)), dots: true }],
    refLines: [{ y: lim * 1e6, label: 'B2-01 tahsisi' }] });
  if (PXo.length) { const W = PXo.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü dwell ' + W.run, Wt.kv[1]]); if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// T2.3 — kombine: deniz profili + VIV tonu (doğrusallık sınavı)
TESTS['T2.3'] = function (P, ctx, prog) {
  const VS = vivSpec(P), ship = VS.kind === 'wind';
  if (!VS.present) return mkResult('T2.3', { status: 'BİLGİ',
    measured: ship ? (VS.on ? 'Rüzgâr VIV\'i işletme zarfında oluşmaz (v_crit > 1,25·U_max): deniz profili + VIV doğrusallık sınaması uygulanmaz.' : 'Rüzgâr VIV etkisi kapalı: deniz profili + VIV doğrusallık sınaması uygulanmaz.')
      : (VS.on ? vivNoRiskTxt(P) + ' Deniz profili + VIV doğrusallık sınaması uygulanmaz.' : 'VIV kapalı: deniz profili + VIV doğrusallık sınaması uygulanmaz.'),
    notes: ['Deniz profilinin tek başına artığı T1.3\'te ölçülür. Model sekmesinde VIV açılınca test koşulur.'] });
  const d = derive(P);
  // ayrı koşular (aynı tohum): yalnız deniz, yalnız ton; sonra kombine
  const Sse = seaLabScenario(P, { T: 620, seed: 1301 });
  const Rse = runSim(P, Sse, (p) => prog && prog(p / 3));
  let Rto, toneFit;
  if (!ship && !VS.lin) {
    // v13.2: dar bant kontrol tona ayarlı (resF = f_n), kombine koşudaki (seaLabScenario, viv) ve T2.2'deki gibi —
    // önceden varsayılan merkez frekansında (res.f) kalıyordu ve f_n ≠ res.f iken RSS'i şişiriyordu
    const sg = segSines([{ axis: 0, f: P.wb.viv.fn, A: P.wb.viv.amp_deg * D2R, nper: Math.round(60 * P.wb.viv.fn) }]);
    Rto = runSim(P, labScenario(P, { label: 'T2.3 ton', T: sg.T, fs: 2000, cmd: sg.cmd, resF: P.wb.viv.fn, seed: 2301 }), (p) => prog && prog((1 + p) / 3));
    toneFit = fitSegments(P, Rto, sg.segs, ctx)[0];
  } else {      // gemi ve (v13.3) denizaltı: VIV tonu (açısal + öteleme), T2.2 ile aynı biçim
    const f = VS.f, ramp = Math.max(1.0, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core, tn = windTone(P, VS, f, t0, t1, ramp);
    Rto = runSim(P, labScenario(P, { label: 'T2.3 ton', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed: 2301 }), (p) => prog && prog((1 + p) / 3));
    toneFit = fitSegments(P, Rto, [{ axis: Math.abs(VS.roll) >= Math.abs(VS.pitch) ? 0 : 1, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f }], ctx)[0];
  }
  const Sco = seaLabScenario(P, { T: 620, seed: 1301, viv: true });
  const PX = pupilExcursion(P, Sco), PXt = pupilTxt(P, PX);      // v13.4: göz bebeği ↔ kolimatör demeti (deniz + VIV)
  // v13.2: hexapod θ/ω/α sınırı (deniz profili + VIV tonu) aşılıyorsa ya da gemide ton erişimle küçültüldüyse test
  // tanımlandığı gibi üretilemez: GEÇERSİZ (T1.3 ve T2.2 ile aynı kural)
  const tnL = (ship || VS.lin) ? windTone(P, VS, VS.f, 10, null, 5) : null, limCo = hexLimitCheck(P, Sco), limTone = tnL ? tnL.limited : false;
  const trPk = transPeak(P, Sco), limTr = trPk > P.lab.hexStroke * (1 + 1e-3);      // v13.3: deniz + ton ötelemesi strok içinde mi (ölçekli deniz tepesi tam strokta; 0,1 mm sayısal pay)
  const invalid = limCo.clipFrac > 0 || limTone || limTr;
  const Rco = runSim(P, Sco, (p) => prog && prog((2 + p) / 3));
  const mSe = profileMetrics(P, Rse, ctx, 20), mCo = profileMetrics(P, Rco, ctx, 20);
  // değerlendirilen eksen: denizaltında el (roll → el); gemide tonun büyük olduğu eksen (rüzgâr yönüne bağlı)
  const ax = ((ship || VS.lin) && toneFit.fx && toneFit.fe && toneFit.fx.A > toneFit.fe.A) ? 'xel' : 'el';
  const tone = (ax === 'el' ? toneFit.fe : toneFit.fx).A / Math.SQRT2;
  const rss = Math.hypot(mSe.wander[ax], tone), comb = mCo.wander[ax], dev = comb / rss - 1;
  const al = budgetAlloc(P), rssOf = (ids) => Math.sqrt(ids.reduce((s, k) => s + sq(al[k]), 0));
  // B1 tahsis toplamı (G1 grubu B1-01 + B1-04 doğrusal toplanır)
  const b1 = Math.sqrt(sq(al['B1-01'] + al['B1-04']) + ['B1-02', 'B1-03', 'B1-05', 'B1-06', 'B1-07'].reduce((s, k) => s + sq(al[k]), 0));
  const b2 = rssOf(['B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-05', 'B2-06']);
  const limWb = Math.sqrt(Math.max(0, sq(b1) + sq(b2) - sq(al['B2-06']))) * 1e-6;
  const ok = Math.abs(dev) <= 0.2 && comb <= limWb;
  const res = mkResult('T2.3', {
    // v13.3: GEÇERSİZ'in bütün nedenleri birlikte yazılır (ton erişimle küçültüldü; deniz + ton θ/ω/α sınırını aştı; öteleme stroku aştı)
    status: invalid ? 'GEÇERSİZ' : stat(ok), measured: (invalid ? [limTone ? `VIV tonu hexapod erişimiyle küçültüldü (${fmt(VS.A * R2D, 3)}° → ${fmt(tnL.A * R2D, 3)}° @ ${fmt(VS.f, 2)} Hz)` : '',
        limCo.clipFrac > 0 ? `deniz profili + VIV tonu hexapodun θ/ω/α sınırlarını aşıyor (aşım süresi oranı %${fmt(limCo.clipFrac * 100, 1)})` : '',
        limTr ? `deniz + VIV ötelemesi hexapod strokunu aşıyor (tepe ${fmt(trPk * 1e3, 1)} mm > ±${fmt(P.lab.hexStroke * 1e3, 0)} mm)` : ''].filter(Boolean).join('; ').replace(/^./, c => c.toUpperCase()) + ': sonuç GEÇERSİZ. ' : '') +
      `Kombine artık ${urad(comb)} µrad; ayrı testlerin RSS'i ${urad(rss)} µrad → sapma ${fmt(dev * 100, 1)} % (sınır ±20 %); tahsis sınırı ${urad(limWb, 1)} µrad`,
    kv: ship ? [[`Yalnız deniz profili (wander ${ax})`, urad(mSe.wander[ax]) + ' µrad'], [`Yalnız rüzgâr VIV tonu (${fmt(VS.f, 2)} Hz, açısal${VS.lin ? ' + öteleme' : ''}; artık RMS, ${ax})`, urad(tone) + ' µrad'], ['RSS', urad(rss) + ' µrad'],
                 [`Kombine (wander ${ax})`, urad(comb) + ' µrad'], ['Sapma', fmt(dev * 100, 2) + ' %'], ['Kabul (B1⊕B2 açısal tahsis; B2-06 hariç)', urad(limWb, 1) + ' µrad']]
      : [[`Yalnız deniz profili (wander ${ax})`, urad(mSe.wander[ax]) + ' µrad'], [`Yalnız VIV tonu (f_n = ${fmt(P.wb.viv.fn, 2)} Hz${VS.lin ? ', açısal + mast başı ötelemesi' : ''}; artık RMS, ${ax})`, urad(tone) + ' µrad'], ['RSS', urad(rss) + ' µrad'],
         [`Kombine (wander ${ax})`, urad(comb) + ' µrad'], ['Sapma', fmt(dev * 100, 2) + ' %'], ['Kabul (B1⊕B2 açısal tahsis; B2-06 hariç)', urad(limWb, 1) + ' µrad']],
    notes: ['Sürtünme, doygunluk ve kazanç programlama süperpozisyonu bozabilir. Sapma büyükse doğrusal (RSS) bütçe geçersizdir.',
            dev < -0.2 ? 'Kombine < RSS: deniz hareketi gimbalı sürekli kayma rejiminde tutar; tonun tek başına ürettiği sürtünme yön değişimleri (ve onların tondaki temel bileşeni) kaybolur. Ayrı testler bu DUT için muhafazakârdır, ama RSS bütçesi de doğru değildir.'
              : dev > 0.2 ? 'Kombine > RSS: katkılar etkileşiyor (doygunluk, kazanç programlama ya da büyük genlikte sürtünme). Doğrusal bütçe iyimserdir.'
              : (ship ? 'Sapma sınır içinde: bu DUT ve uyarım düzeyinde doğrusal toplama (RSS) savunulabilir.' : `Sapma sınır içinde: bu DUT ve uyarım düzeyinde doğrusal toplama (RSS) savunulabilir. Dar bant kontrol kapatılırsa (Model) ${fmt(P.wb.viv.fn, 2).replace('.', ',')} Hz artığı sürtünme baskın hale gelir ve sapma büyür.`),
            ...(ship ? ['Gemi: rüzgâr VIV tonu açısal hareket ve aynı fazda direk tepesi ötelemesiyle uygulanır (T2.2 ile aynı biçim); değerlendirilen eksen tonun büyük olduğu eksendir.']
              : (VS.lin ? ['Denizaltı: VIV tonu roll ve aynı fazda mast başı ötelemesiyle (y = θ·L/κ) uygulanır (T2.2 ile aynı biçim).'] : [])),
            ...(Sco.seaQ != null && (ship || VS.lin) ? [`Deniz ötelemesi ile tonun ötelemesi aynı hexapod strokunu paylaşır: deniz ötelemesi tona yer bırakacak biçimde ölçeklenir (q = ${fmt(Sco.seaQ, 3)}; talep ±${fmt(Sco.seaDemand, 2)} m); birleşik tepe ${fmt(trPk * 1e3, 1)} mm (strok ±${fmt(P.lab.hexStroke * 1e3, 0)} mm).`] : []),
            ...(invalid ? [`Hexapod erişimi (θ ${P.wb.hex.theta_max}° / ω ${P.wb.hex.omega_max}°/s / α ${P.wb.hex.alpha_max}°/s²${ship ? `, öteleme stroku ±${fmt(P.lab.hexStroke * 1e3, 0)} mm` : ''}) birleşik uyarımı üretemiyor (roll tepesi ${fmt(limCo.axes[0].peakDeg, 2)}°, ${fmt(limCo.axes[0].peakRate, 1)}°/s, ${fmt(limCo.axes[0].peakAcc, 0)}°/s²): doğrusallık sınaması gerçek uyarım düzeyinde yapılamaz.`] : [])],
  });
  res.kv.push(PXt.kv); if (PXt.note) res.notes.push(PXt.note); res.num = Object.assign({}, res.num || {}, { pupil: PX });
  // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırıldıysa bilgi
  if (Sco.seaQc != null && Sco.seaQc < 1 - 1e-9) res.notes.push(`Deniz ötelemesi kolimatör demetine sığacak biçimde ×${fmt(Sco.seaQc, 3)} küçültüldü (v13.5; ölçeksiz kayma ${fmt((Sco.seaE1 || 0) * 1e3, 1)} mm, sınır ${fmt(PX.eFree * 1e3, 1)} mm). Ötelemenin işletme ivmesindeki etkisi T2.5'te ölçülür.`);
  return pupilRule(P, res, PX);      // v13.5: gerçek vinyetlemede GEÇERSİZ
};
// T2.4 — geçici darbe (dalga çarpması temsili)
TESTS['T2.4'] = function (P, ctx, prog) {
  const d = derive(P), hx = P.wb.hex, Tps = [0.05, 0.1, 0.2];
  // v13.12 (§12): değerlendirme penceresi oturma gereksinimine uyar — gereksinim 2,4 s'den uzunsa darbe aralığı ve pencere uzatılır
  // (önce pencere 2,5 s'de sabitti; daha uzun bir gereksinimde oturmayan darbe için karar verilemiyor, sonuç AŞIM çıkıyordu)
  const rqS = P.ana.req.shockSettle_ms != null ? P.ana.req.shockSettle_ms * 1e-3 : 0, Wn = Math.max(2.5, rqS + Math.max(...Tps) + 0.6), gapE = Wn + 0.5;
  const mkEvents = (scale) => { const ev = [], meta = []; let t = 3;
    for (const Tp of Tps) {
      const Amax = pulseAmpDeg(P, Tp) * scale * D2R;      // v13.14: genlik kuralı pulseAmpDeg (wb.hex.pulseRule)
      for (let i = 0; i < 10; i++) { ev.push({ t0: t, Tp, A: Amax * (i % 2 ? -1 : 1) }); meta.push({ t0: t, Tp, A: Amax }); t += gapE; }
    }
    return { ev, meta, T: t + 2 }; };
  // (a) durgun gimbal (test tanımı: "eksen başına 10 darbe") — el (roll) ve az (yaw) eksenleri
  const E1 = mkEvents(0.9);
  const pulseStats = (R, chName) => {
    const tr = recT(R), fr = R.meta.fRec;
    // darbe öncesi pencerelerin tümünden doğrusal kayma (dünya dönüşü / bias rampası) kestirilip çıkarılır
    const y = Float64Array.from(R.rec[chName]);
    let st = 0, sy = 0, stt = 0, sty = 0, nq = 0;
    for (const m of E1.meta) { const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05); for (let i = b0; i < b1; i++) { st += tr[i]; sy += y[i]; stt += tr[i] * tr[i]; sty += tr[i] * y[i]; nq++; } }
    const slp = (nq * sty - st * sy) / Math.max(1e-30, nq * stt - st * st), ic = (sy - slp * st) / Math.max(1, nq);
    for (let i = 0; i < y.length; i++) y[i] -= ic + slp * tr[i];
    // 10 ms kayan ortalama (oturma tespiti için)
    const wv = Math.round(0.01 * fr), ys = new Float64Array(y.length);
    { let acc = 0; for (let i = 0; i < y.length; i++) { acc += y[i]; if (i >= wv) acc -= y[i - wv]; ys[i] = acc / Math.min(i + 1, wv); } }
    let nv = 0, nn = 0, nvs = 0;
    for (const m of E1.meta) { const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05), bm = aMean(y, b0, b1), bms = aMean(ys, b0, b1);
      for (let i = b0; i < b1; i++) { nv += sq(y[i] - bm); nvs += sq(ys[i] - bms); nn++; } }
    const varFloor = nv / Math.max(1, nn - E1.meta.length), sdFloorS = Math.sqrt(nvs / Math.max(1, nn - E1.meta.length));
    const per = Tps.map(Tp => ({ Tp, pk: [], st: [], en: [], A: 0 }));
    for (const m of E1.meta) {
      const [i0, i1] = idxRange(tr, m.t0 - 0.5, m.t0 + Wn);
      const [b0, b1] = idxRange(tr, m.t0 - 0.5, m.t0 - 0.05), base = aMean(y, b0, b1), baseS = aMean(ys, b0, b1);
      let pk = 0, ipk = i0; for (let i = i0; i < i1; i++) { const v = Math.abs(y[i] - base); if (v > pk) { pk = v; ipk = i; } }
      const thr = Math.max(0.1 * pk, 3 * sdFloorS);
      let tset = 0; for (let i = i1 - 1; i > ipk; i--) if (Math.abs(ys[i] - baseS) > thr) { tset = tr[i] - (m.t0 + m.Tp); break; }
      if (tset > (m.t0 + Wn - 0.1) - (m.t0 + m.Tp)) tset = Infinity;      // değerlendirme penceresinde (varsayılan 2,5 s) oturmadı
      let en = 0; for (let i = i0; i < i1; i++) en += sq(y[i] - base) / fr;
      en = Math.max(0, en - varFloor * (i1 - i0) / fr);             // taban enerjisi çıkarılır
      const p = per.find(q => q.Tp === m.Tp); p.pk.push(pk); p.st.push(Math.max(0, tset)); p.en.push(en); p.A = m.A;
    }
    return { tr, fr, y, per, drift: slp, sdFloorS };
  };
  const R = runSim(P, labScenario(P, { label: 'T2.4 roll', T: E1.T, fs: 4000, cmd: [{ type: 'halfsine', axis: 0, events: E1.ev }], seed: 2401,
    rec: { fs: 1000, ch: ['opt_el', 'ac_el', 'imu_r'] } }), (p) => prog && prog(p / 4));
  const Ry = runSim(P, labScenario(P, { label: 'T2.4 yaw', T: E1.T, fs: 4000, cmd: [{ type: 'halfsine', axis: 2, events: E1.ev }], seed: 2403,
    rec: { fs: 1000, ch: ['opt_xel', 'ac_xel', 'imu_y'] } }), (p) => prog && prog((1 + p) / 4));
  const PE = pulseStats(R, 'ac_el'), PX = pulseStats(Ry, 'ac_xel');
  const tr = PE.tr, fr = PE.fr, y = PE.y, per = PE.per, driftAC = PE.drift, sdFloorS = PE.sdFloorS;
  const sl = P.env.slap, EA2 = sq(sl.A * URAD);
  const opRms = Math.sqrt(sl.rate * EA2 * aMean(per.map(p => aMean(p.en) / sq(p.A))));
  // (b) işletme benzeri: aynı darbeler deniz profili üzerinde; aynı profil darbesiz tekrarlanır, fark darbenin katkısıdır
  const E2 = mkEvents(0.8);
  const Ssea = (withP) => { const S = seaLabScenario(P, { T: E2.T, seed: 2402, extra: { fs: 4000, rec: { fs: 1000, ch: ['ac_el', 'imu_r'] } } });
    if (withP) S.cmd = S.cmd.concat([{ type: 'halfsine', axis: 0, events: E2.ev }]); return S; };
  const Rw = runSim(P, Ssea(true), (p) => prog && prog((2 + p) / 4)), Rn = runSim(P, Ssea(false), (p) => prog && prog((3 + p) / 4));
  const tr2 = recT(Rw), dy = new Float64Array(Rw.meta.nRec); for (let i = 0; i < dy.length; i++) dy[i] = Rw.rec.ac_el[i] - Rn.rec.ac_el[i];
  const per2 = Tps.map(Tp => ({ Tp, en: [], pk: [], A: 0 }));
  for (const m of E2.meta) { const [i0, i1] = idxRange(tr2, m.t0 - 0.5, m.t0 + Wn); let en = 0, pk = 0; for (let i = i0; i < i1; i++) { en += sq(dy[i]) / fr; pk = Math.max(pk, Math.abs(dy[i])); }
    const p = per2.find(q => q.Tp === m.Tp); p.en.push(en); p.pk.push(pk); p.A = m.A; }
  const opRmsSea = Math.sqrt(sl.rate * EA2 * aMean(per2.map(p => aMean(p.en) / sq(p.A))));
  const rq = P.ana.req, hasReq = rq.shockPeak_urad != null || rq.shockSettle_ms != null;
  const both = per.concat(PX.per);
  const pkMax = Math.max(...both.map(p => Math.max(...p.pk)));
  const nUns = both.reduce((s, p) => s + p.st.filter(v => !isFinite(v)).length, 0), nAll = both.reduce((s, p) => s + p.st.length, 0);
  const fin = (a) => a.filter(isFinite), stMax = Math.max(0, ...both.map(p => Math.max(0, ...fin(p.st))));
  const stTxt = (p) => { const f = fin(p.st), u = p.st.length - f.length; return (f.length ? `ortanca ${fmt(aPctAbs(Float64Array.from(f), 50) * 1e3, 0)} ms` : '—') + (u ? `, ${u}/${p.st.length} darbe ${fmt(Wn - 0.1, 1).replace('.', ',')} s içinde oturmadı` : ''); };
  const ok = hasReq ? ((rq.shockPeak_urad == null || pkMax <= rq.shockPeak_urad * 1e-6) && (rq.shockSettle_ms == null || (nUns === 0 && stMax <= rq.shockSettle_ms * 1e-3))) : null;
  const shipT = isShip(P);      // gemi direği: dalga çarpması kaynağı yok — test geçici yanıtı karakterize eder, B2-02'ye aktarılmaz
  const res = mkResult('T2.4', {
    status: hasReq ? stat(ok) : 'BİLGİ',
    measured: (shipT ? 'Gemi direği: dalga çarpması yok (B2-02 aktarılmaz); darbeler geçici yanıt karakterizasyonudur. ' : '') + `Tepe hata en büyük ${urad(pkMax, 1)} µrad; oturma en uzun ${fmt(stMax * 1e3, 0)} ms` + (nUns ? ` (${nUns}/${nAll} darbe ${fmt(Wn - 0.1, 1).replace('.', ',')} s içinde oturmadı: küçük darbelerde ön-kayma/stiction)` : '') + ` (el ve az eksenleri, eksen başına ${E1.meta.length} darbe); işletme kestirimi B2-02: durgun gimbal ${urad(opRms)} / deniz profili üzerinde ${urad(opRmsSea)} µrad RMS (tahsis ${BUDGET_ALLOC['B2-02']})`,
    kv: per.map(p => [`roll→el, T_p = ${p.Tp * 1e3} ms, A = ${fmt(p.A * R2D, 3)}°`, `tepe ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad), oturma ${stTxt(p)}`])
      .concat(PX.per.map(p => [`yaw→xel, T_p = ${p.Tp * 1e3} ms`, `tepe ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad), oturma ${stTxt(p)}`]))
      .concat(per2.map(p => [`Deniz profili üzerinde (roll), T_p = ${p.Tp * 1e3} ms`, `tepe (fark) ${urad(aMean(p.pk), 1)} µrad (${fmt(aMean(p.pk) / p.A * 1e3, 2)} mrad/rad)`]))
      .concat([['Oturma eşiği', `max(%10 tepe, 3σ taban) — σ taban (10 ms ortalama) ${urad(sdFloorS, 2)} µrad`],
               ['Çıkarılan doğrusal kayma (durgun koşu)', `${fmt(driftAC * 1e6, 2)} µrad/s${P.wb.earth.comp ? '' : ' — dünya dönüşü kompanzasyonu kapalı'}`],
               ['Dalga çarpması istatistiği (örnek)', `λ = ${sl.rate}/s, T_p ∈ [${sl.Tmin * 1e3}, ${sl.Tmax * 1e3}] ms, A_RMS = ${fmt(sl.A, 0)} µrad`],
               ['Gereksinim (tepe / oturma)', hasReq ? `${rq.shockPeak_urad ?? '—'} µrad / ${rq.shockSettle_ms ?? '—'} ms` : 'girilmedi (Model → Proje gereksinimleri)']]),
    notes: [...(shipT ? ['Gemi direği: mast başı sudan yüksekte olduğu için dalga çarpması yoktur; B2-02 sıfırdır ve "işletme kestirimi" satırı yalnız denizaltı darbe istatistiğiyle (Model: işletme ortamı) hesaplanmış bilgi amaçlı bir sayıdır. Gemide geçici olaylar (baş vurması sonrası gövde kırbaçlanması, top atışı şoku) gemi verisiyle ayrıca tanımlanmalıdır.'] : []),
            'RMS değil tepe ve toparlanma izlenir; tepe ve oturma eşikleri proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).',
            'İşletme kestirimi: ölçülen darbe yanıtı enerjisi + Poisson darbe modeli (Campbell teoremi, σ² = λ·E[∫h²dt]); yanıtın genlikle doğrusal ölçeklendiği varsayılır. Durgun koşuda taban gürültüsü enerjisi çıkarıldı.',
            'Laboratuvarda gimbal darbe öncesi durgundur: her darbe bir sürtünme yön değişimi tetikler. Deniz profili üzerinde gimbal kayma rejimindedir; iki kestirimin farkı sürtünmenin payıdır. Simülasyonda iki koşu aynı gürültü gerçekleşmesini paylaşır; gerçek testte fark √2 × taban gürültüsü taşır ve enerjisi çıkarılmalıdır.'],
    fill: shipT ? {} : { 'B2-02': opRmsSea },
  });
  const [j0, j1] = idxRange(tr, E1.meta[10].t0 - 0.3, E1.meta[10].t0 + 1.5);
  const dd = decim(Array.from(tr.subarray(j0, j1)), Array.from(y.subarray(j0, j1), v => v * 1e6));
  const [k0, k1] = idxRange(tr2, E2.meta[10].t0 - 0.3, E2.meta[10].t0 + 1.5);
  const de = decim(Array.from(tr2.subarray(k0, k1), t => t - E2.meta[10].t0 + E1.meta[10].t0), Array.from(dy.subarray(k0, k1), v => v * 1e6 * E1.meta[10].A / E2.meta[10].A));
  const dz = decim(Array.from(tr.subarray(j0, j1)), Array.from(PX.y.subarray(j0, j1), v => v * 1e6));
  res.plots.push({ title: 'Darbe yanıtı (T_p = 100 ms), otokolimatör', xLabel: 's', yLabel: 'µrad',
    series: [{ name: 'roll→el, durgun gimbal', x: dd.x, y: dd.y }, { name: 'yaw→xel, durgun gimbal', x: dz.x, y: dz.y }, { name: 'roll→el, deniz profili üzerinde (fark, ölçekli)', x: de.x, y: de.y }] });
  return res;
};
// T2.5 — doğrusal ivme kuplajı (pivot ofseti)
TESTS['T2.5'] = function (P, ctx, prog) {
  const d = derive(P), h = P.lab.pivotHull, stroke = P.lab.hexStroke;
  const aOp = P.env.lat.a_rms * Math.SQRT2;                         // işletme yanal ivme genliği (m/s²)
  const freqs = [0.5, 1, 2, 5, 8];
  const list = freqs.map(f => { const th = Math.min(aOp / (sq(TAU * f) * h), d.reach(f) * D2R, stroke / h); return { axis: 0, f, A: th, nper: Math.max(10, Math.round(10 * f)) }; });
  const sg = segSines(list);
  const fitsP = [], ext6 = P.wb.extRows !== false, nRun = ext6 ? 5 : 2;
  const PXs = [];      // v13.4: göz bebeği ↔ kolimatör demeti (her koşu; en kötüsü raporlanır)
  for (const [k, hh] of [[0, 0], [1, h]]) {
    const Sp = labScenario(P, { label: 'T2.5', T: sg.T, fs: 2000, cmd: sg.cmd, pivotH: hh, seed: 2501 });
    PXs.push(Object.assign(pupilExcursion(P, Sp), { run: hh ? `pivot ${h} m aşağıda` : 'pivot göz bebeğinde' }));
    const R = runSim(P, Sp, (p) => prog && prog((k + p) / nRun));
    fitsP.push(fitSegments(P, R, sg.segs, ctx));
  }
  // v11 — 6-DOF öteleme ivme duyarlılığı ("ivme eşdeğeri"): deniz ötelemesinin laboratuvarda tam üretilemeyen ivmesi
  // (SS5 heave ±1,2 m; strok ±0,10 m) daha yüksek frekansta küçük strokla uygulanır. Pivot göz bebeğinde (açısal hareket
  // yok); x (surge), y (sway), z (heave) ekseninde T25_FQ frekanslarında (v13.5: 2 ve 3 Hz; 2 m/s²). Optik LOS (video) yanıtı =
  // optik montaj esnemesi (yarı statik, frekanstan bağımsız) + dengesizlik torku (döngü bastırması frekansla azalır): düşük
  // frekansa taşıma muhafazakârdır. İşletme kestirimi: en düşük frekansın duyarlılığı × direktördeki deniz ivmesi RMS'i (eksen başına).
  let tr6 = null;
  if (ext6) {
    // v13.5 (kullanıcı kararı): segmentler 2 ve 3 Hz (önceden 1 ve 2 Hz) — aynı 2 m/s² ivme 12,7 / 5,6 mm genlikle üretilir ve göz
    // bebeği kolimatör demetinde kalır (1 Hz'de ±50,7 mm demetten taşıyordu). Deniz frekansına taşıma 2 Hz'den yapılır.
    const acc = seaAccDirector(P), fq = T25_FQ, segs6 = [];
    for (let ax = 0; ax < 3; ax++) {
      const sgT = segSines(fq.map(q => ({ axis: ax, f: q.f, A: Math.min(q.a / sq(TAU * q.f), 0.9 * stroke), nper: q.nper })));
      const St = labScenario(P, { label: 'T2.5 öteleme ' + 'xyz'[ax], T: sgT.T, fs: 2000, cmd: [], trans: sgT.cmd, seed: 2510 + ax });
      PXs.push(Object.assign(pupilExcursion(P, St), { run: 'öteleme ' + 'xyz'[ax] }));
      const R = runSim(P, St, (p) => prog && prog((2 + ax + p) / nRun));
      const v = videoAngles(R, ctx), tr = recT(R);
      for (const s of sgT.segs) {
        const [j0, j1] = idxRange(v.t, s.c0, s.c1), [i0, i1] = idxRange(tr, s.c0, s.c1);
        const fe = sineFit(v.t, v.el, s.f, { i0: j0, i1: j1, valid: v.ok }), fx = sineFit(v.t, v.xel, s.f, { i0: j0, i1: j1, valid: v.ok });
        const me = sineFit(tr, R.rec.ac_el, s.f, { i0, i1 }), mx = sineFit(tr, R.rec.ac_xel, s.f, { i0, i1 });
        const a = sq(TAU * s.f) * s.A;
        // yol ayrımı: ayna (otokolimatör) mekanik LOS'u = dengesizlik yolu; video − ayna (fazör farkı) = optik montaj yolu
        segs6.push({ ax, f: s.f, a, x: s.A, el: fe.A / a, xel: fx.A / a, seEl: fe.seA / a, seXel: fx.seA / a, mEl: me.A / a, mXel: mx.A / a,
          oEl: Math.hypot(fe.a - me.a, fe.b - me.b) / a, oXel: Math.hypot(fx.a - mx.a, fx.b - mx.b) / a });
      }
    }
    // İşletme kestirimi (muhafazakâr): optik yol yarı statik (en düşük ölçüm frekansındaki değer); dengesizlik yolu iki
    // frekanstan S ∝ f^n (0 ≤ n ≤ 1) ile deniz frekansına taşınır; iki yol doğrusal toplanır (faz bilinmiyor → aynı işaret).
    // Tek frekanstaki toplam duyarlılık iki yolun kısmi sönümlemesini taşır ve iyimser olabilir (bilgi olarak verilir).
    const pick = (ax, f) => segs6.find(r => r.ax === ax && r.f === f), accAx = [acc.x, acc.y, acc.z], sd6 = seaDOF(P);
    // deniz frekansı (eksen başına): o eksene ivme katan terimlerin (öteleme, kaldıraç kolu) en yüksek baskın frekansı (muhafazakâr)
    const fOp = [0, 1, 2].map(ax => Math.max(...[sd6.lin[ax].active ? sd6.lin[ax].fdom : 0, ...acc.terms[ax].map(t => (t.v > 0 ? t.f : 0))].filter(v => v > 0), 0.01));
    const pred = (key, mkey, okey, AA) => Math.hypot(...[0, 1, 2].map(ax => {
      const r1 = pick(ax, fq[0].f), r2 = pick(ax, fq[1].f);
      const n = clamp(Math.log(Math.max(r2[mkey], 1e-15) / Math.max(r1[mkey], 1e-15)) / Math.log(fq[1].f / fq[0].f), 0, 1);
      return (r1[okey] + r1[mkey] * Math.pow(Math.min(1, fOp[ax] / fq[0].f), n)) * (AA || accAx)[ax];
    }));
    const predEl = pred('el', 'mEl', 'oEl'), predXel = pred('xel', 'mXel', 'oXel');
    // bilgi: bir eksendeki ivme terimleri tam ilişkili (aynı fazda) olsaydı (model serbestlik derecelerini bağımsız üretir)
    const upAx = [acc.corrUp.x, acc.corrUp.y, acc.corrUp.z], corrGain = acc.eff > 0 ? acc.corrUp.eff / acc.eff : 1;
    const predElUp = pred('el', 'mEl', 'oEl', upAx), predXelUp = pred('xel', 'mXel', 'oXel', upAx);
    const dirEl = Math.hypot(...[0, 1, 2].map(ax => pick(ax, fq[0].f).el * accAx[ax])), dirXel = Math.hypot(...[0, 1, 2].map(ax => pick(ax, fq[0].f).xel * accAx[ax]));
    tr6 = { segs: segs6, acc, predEl, predXel, dirEl, dirXel, fLo: fq[0].f, fOp, predElUp, predXelUp, corrGain };
  }
  // v13.4: hexapod iletimi τ = θ_ölç / θ_komut (IMU sinüs uydurması, iki pivot koşusunun ortalaması). Duyarlılık gerçekleşen
  // ivmeye bölünür; işletme düzeyindeki fark komut (= hedef) düzeyine 1/τ ile ölçeklenir. Önceden komut ivmesine bölünüyordu:
  // f_bw'ye yakın frekansta (8 Hz) hexapod uyarımı eksik iletince fark ve duyarlılık eksik çıkıyordu (f_bw = 20 Hz'de %1,3,
  // 10 Hz'de %16; probe/k6/tests.js K2).
  const rows = sg.segs.map((s, i) => {
    const a = fitsP[0][i].ae || fitsP[0][i].fe, b = fitsP[1][i].ae || fitsP[1][i].fe;
    const diffLab = Math.hypot(b.a - a.a, b.b - a.b) / Math.SQRT2;       // vektörel fark RMS (gerçekleşen hareketle)
    const fi = [fitsP[0][i].fin, fitsP[1][i].fin].filter(q => q && q.A > 0), tau = fi.length ? fi.reduce((x, q) => x + q.A, 0) / fi.length / s.A : 1;
    const accCmd = sq(TAU * s.f) * s.A * h, acc = accCmd * tau, rr = s.f / P.wb.hex.fbw;
    return { f: s.f, A: s.A, tau, tauA: 1 / Math.sqrt(1 + rr * rr * rr * rr), accCmd, acc, diffLab, diff: diffLab / tau, sens: diffLab / (acc / Math.SQRT2) };
  });
  const r8 = rows[rows.length - 1];
  const ok = r8.diff <= budgetAlloc(P)['B2-03'] * 1e-6;
  const tauTxt = Math.abs(1 - r8.tau) > 0.005 ? ` (hexapod iletimi τ = ${fmt(r8.tau, 3)}: laboratuvar farkı ${urad(r8.diffLab)} µrad komut düzeyine ölçeklendi)` : '';
  const res = mkResult('T2.5', {
    status: stat(ok), measured: `İşletme ivme düzeyinde (8 Hz, ${fmt(aOp, 2)} m/s² genlik) artık farkı ${urad(r8.diff)} µrad RMS (tahsis ${fA(budgetAlloc(P)['B2-03'])}); duyarlılık ${fmt(r8.sens * 1e6, 3)} µrad/(m/s²)` + tauTxt,
    kv: rows.map(r => [`${r.f} Hz, θ = ${fmt(r.A * R2D, 3)}°`, `ivme ${fmt(r.acc, 3)} m/s² (komut ${fmt(r.accCmd, 3)}, τ = ${fmt(r.tau, 3)}) → fark ${urad(r.diffLab, 3)} µrad RMS (${fmt(r.sens * 1e6, 3)} µrad per m/s² RMS)`])
      .concat([['Hexapod iletimi τ = θ_ölç / θ_komut (IMU), ölçülen ↔ analitik 1/√(1 + (f/f_bw)⁴)', rows.map(r => `${r.f} Hz ${fmt(r.tau, 3)} ↔ ${fmt(r.tauA, 3)}`).join(' · ') + ` (f_bw = ${P.wb.hex.fbw} Hz)`],
        ['Pivotlar', `göz bebeği / ${h} m aşağıda (ölçekli gövde dönme merkezi)`], ['Öteleme stroku sınırı', `r·θ ≤ ${stroke * 1e3} mm`]]),
    notes: ['Aynı açısal girdi iki pivotta uygulanır; fark, gimbal kütle dengesizliğinin (T = m·r × a) doğrusal ivmeye duyarlılığıdır.', 'Gerçek mastta dönme merkezi metrelerce aşağıdadır; duyarlılık işletme ivme spektrumuyla çarpılarak B2-03 kestirilir.'],
    fill: { 'B2-03': r8.sens * P.env.lat.a_rms },
  });
  res.plots.push({ title: 'İvme duyarlılığı', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, series: [{ name: 'fark / ivme', x: Float32Array.from(rows.map(r => r.f)), y: Float32Array.from(rows.map(r => r.sens * 1e6)), dots: true }] });
  if (tr6) {
    const AXL = ['x (surge)', 'y (sway)', 'z (heave)'], A6 = tr6.acc, sd = seaDOF(P);
    res.kv.push(...tr6.segs.map(r => [`Öteleme ${AXL[r.ax]}, ${r.f} Hz, ±${fmt(r.x * 1e3, 1)} mm (${fmt(r.a, 2)} m/s²)`, `optik LOS el ${fmt(r.el * 1e6, 3)} / xel ${fmt(r.xel * 1e6, 3)} µrad per m/s² (±${fmt(2 * r.seEl * 1e6, 3)}) · yollar: ayna (dengesizlik) el ${fmt(r.mEl * 1e6, 3)} / xel ${fmt(r.mXel * 1e6, 3)}, optik montaj (video − ayna) el ${fmt(r.oEl * 1e6, 3)} / xel ${fmt(r.oXel * 1e6, 3)}`]),
      ['Direktördeki deniz ivmesi RMS (x / y / z)', `${fmt(A6.x, 3)} / ${fmt(A6.y, 3)} / ${fmt(A6.z, 3)} m/s²` + (sd.rOn ? (A6.r[0] === 0 && A6.r[1] === 0 ? ` (kaldıraç kolu h = ${fmt(A6.h, 1)} m: x ${fmt(A6.lever[0], 3)}, y ${fmt(A6.lever[1], 3)} m/s²)` : ` (kaldıraç kolu r = (${A6.r.map(v => fmt(v, 1)).join(', ')}) m: x ${fmt(A6.lever[0], 3)}, y ${fmt(A6.lever[1], 3)}, z ${fmt(A6.lever[2], 3)} m/s²)`) : '') + (sd.six ? '; 6-DOF profil' : '; dar profil (yalnız açısal + kaldıraç kolu)')],
      ['İşletme kestirimi B1-08 (yollar ayrı taşınıp doğrusal toplandı, muhafazakâr)', `el ${urad(tr6.predEl)} / xel ${urad(tr6.predXel)} µrad RMS (deniz frekansı x/y/z ${tr6.fOp.map(f => fmt(f, 2)).join(' / ')} Hz)`],
      ['Bilgi: ' + tr6.fLo + ' Hz toplam duyarlılığı × ivme (yol ayrımı olmadan)', `el ${urad(tr6.dirEl)} / xel ${urad(tr6.dirXel)} µrad RMS — iki yol bu frekansta kısmen birbirini söndürebilir; iyimser olabilir`]);
    if (tr6.corrGain > 1.0001) res.kv.push(['Bilgi: serbestlik dereceleri tam ilişkili olsaydı (bir eksendeki terimler aynı fazda)', `ivme |a| ${fmt(A6.corrUp.eff, 3)} m/s² (×${fmt(tr6.corrGain, 2)}); B1-08 kestirimi el ${urad(tr6.predElUp)} / xel ${urad(tr6.predXelUp)} µrad RMS. Model serbestlik derecelerini bağımsız üretir (çapraz spektrum yok); gerçek gemide roll–sway–yaw ve pitch–heave–surge faz ilişkilidir, ters fazda değer bağımsız tahminin de altına inebilir`]);
    res.notes.push('6-DOF öteleme ("ivme eşdeğeri"): kolimatör hedefi sonsuzda olduğu için öteleme LOS\'u geometrik olarak değiştirmez; etkisi ivme üzerindendir. Deniz ötelemesi laboratuvarda tam üretilemediğinden (strok ' + fmt(stroke * 1e3, 0) + ' mm) aynı ivme daha yüksek frekansta küçük strokla uygulanır (v13.5: ' + T25_FQ.map(q => q.f).join(' ve ') + ' Hz; genlik göz bebeğini kolimatör demetinde tutar). İki yol farklı frekans bağımlılığı taşır: optik montaj esnemesi yarı statiktir (frekanstan bağımsız), dengesizlik torkunun döngü bastırması frekansla değişir. Bu yüzden yollar ayrılır: ayna (otokolimatör) mekanik LOS\'u yani dengesizlik yolunu, video − ayna fazör farkı optik montaj yolunu verir. Her yol kendi frekans bağımlılığıyla deniz frekansına taşınır ve doğrusal toplanır. Tek frekanstaki toplam duyarlılık iki yolun kısmi sönümlemesini içerir; deniz frekansında sönümleme değiştiği için iyimser olabilir. Kestirim, işletme benzetimindeki B1-08 satırıyla Bütçe sekmesinde karşılaştırılır.');
    res.fill['B1-08'] = tr6.predEl;
    res.num = Object.assign({}, res.num || {}, { tr6: { predEl: tr6.predEl, predXel: tr6.predXel, predElUp: tr6.predElUp, predXelUp: tr6.predXelUp, corrGain: tr6.corrGain, fOp: tr6.fOp, dirEl: tr6.dirEl, dirXel: tr6.dirXel, acc: { x: A6.x, y: A6.y, z: A6.z, eff: A6.eff }, segs: tr6.segs } });
    const sr = [0, 1, 2].map(ax => ({ name: AXL[ax] + ' → el', x: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.f)), y: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.el * 1e6)), dots: true }))
      .concat([0, 1, 2].map(ax => ({ name: AXL[ax] + ' → xel', x: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.f)), y: Float32Array.from(tr6.segs.filter(r => r.ax === ax).map(r => r.xel * 1e6)), dots: true })));
    res.plots.push({ title: '6-DOF öteleme ivme duyarlılığı (optik LOS, video)', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, series: sr });
  }
  // v13.4: göz bebeği ↔ kolimatör demeti — koşuların en kötüsü (öteleme segmentleri yanal ise baskın)
  { const W = PXs.reduce((a, b) => (b.eMax > a.eMax ? b : a)), Wt = pupilTxt(P, W);
    res.kv.push([Wt.kv[0] + ', en kötü koşu: ' + W.run, Wt.kv[1] + ' · koşular: ' + PXs.map(x => `${x.run} ${fmt(x.eMax * 1e3, 1)} mm`).join(', ')]);
    if (Wt.note) res.notes.push(Wt.note); res.num = Object.assign({}, res.num || {}, { pupil: W });
    pupilRule(P, res, W); }      // v13.5: gerçek vinyetlemede GEÇERSİZ
  return res;
};
// bant sınırlı yer değiştirme serisi: ivme spektrumu düz (f1–f2), RMS ivmeye normalize
// Bant sınırlı ivme profilinden yer değiştirme dizisi (shaker sürüşü). m = 0: ideal bant; m ≥ 1: işletme
// modelindeki 'noise' bileşeniyle aynı spektral biçim (m adet 2. derece Butterworth YG(f1) ve AG(f2) kesiti).
function bandDispSeries(f1, f2, aRms, T, fsg, rng, m) {
  const n = Math.ceil((T + 2) * fsg), N = nextPow2(n);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) {
    const f = k * fsg / N; let w = 1;
    if (!m) { if (f < f1 || f > f2) continue; } else { const a = Math.pow(f / f1, 4), b = Math.pow(f / f2, 4); w = Math.pow(a / (1 + a) / (1 + b), m); }
    const s = Math.sqrt(w * fsg * N / 2) / Math.SQRT2; const xr = s * rng.gauss(), xi = s * rng.gauss(); const w2 = sq(TAU * f); re[k] = -xr / w2; im[k] = -xi / w2; re[N - k] = re[k]; im[N - k] = -im[k]; }
  // ivme RMS (Parseval): Σ|A_k|² ... doğrudan zaman alanında ölç
  const ar = new Float64Array(N), ai = new Float64Array(N);
  for (let k = 1; k < N / 2; k++) { const f = k * fsg / N, w2 = sq(TAU * f); ar[k] = -re[k] * w2; ai[k] = -im[k] * w2; ar[N - k] = ar[k]; ai[N - k] = -ai[k]; }
  fft(re, im, true); fft(ar, ai, true);
  let s2 = 0; for (let i = 0; i < n; i++) s2 += sq(ar[i] / N);
  const g = aRms / Math.sqrt(s2 / n), d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = re[i] / N * g;
  return d;
}
function shakerScenario(P, o) {
  const axis = o.axis, T = o.T || 60, rng = new RNG(hash32(3100 + axis, seedOf(P, o.seed || 1)));
  const trans = [];
  if (o.mode === 'sweep') {
    const A = 0.254e-3;                // MIL-STD-167-1A Type I keşif titreşimi: 0,010 in tek genlik
    trans.push({ type: 'chirp', axis, f0: 4, f1: 33, octPerMin: o.opm || 1, ampFn: () => A, t0: 2, ramp: 2 });
  } else if (o.mode === 'platform') {
    const fsg = 1600, env = P.env;
    const dPlat = bandDispSeries(env.plat.f1, env.plat.f2, env.plat.a_rms, T, fsg, rng, 2);   // işletmedeki 'plat' ile aynı biçim
    const dHf = bandDispSeries(env.hf.f1, env.hf.f2, env.hf.acc_rms, T, fsg, rng, 1);          // işletmedeki 'hfl' ile aynı biçim
    for (let i = 0; i < dPlat.length; i++) dPlat[i] += dHf[i];
    trans.push({ type: 'series', axis, data: rampSeries(dPlat, fsg, 2), fs: fsg });
    trans.push({ type: 'sine', axis, A: env.aux.a / sq(TAU * env.aux.f), f: env.aux.f, ph: 0.3, t0: 0, ramp: 2 });
  }                                    // mode 'off': taban koşusu (shaker kapalı)
  return labScenario(P, { label: 'T3.1', T: o.mode === 'sweep' ? 190 : T, fs: 4000, hexActive: false, trans, rocking: o.rocking,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y'] }, seed: 3100 + axis + (o.mode === 'off' ? 7 : 0) });
}
// Direk tepesi açısal hareketinin (direk modu, yapı yolu) açısal uyarıcıyla yeniden üretimi — öneri koşusu
function mastAngScenario(P, o) {
  o = o || {};
  const env = P.env, accMount = [];
  for (let i = 0; i < 3; i++) accMount.push({ type: 'noise', axis: i, rms: env.plat.a_rms, hp: env.plat.f1, hp2: env.plat.f1, lp: env.plat.f2, lp2: env.plat.f2, stream: 'plat' + i, t0: 0, ramp: 2 });
  return labScenario(P, { label: 'T3.1 açısal', T: o.T || 60, fs: 4000, hexActive: false, accMount, mount: true, accMountLinear: false,
    rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y'] }, seed: 3150 });
}
// T3.1 — öteleme titreşimi (shaker, 3 eksen ayrı)
TESTS['T3.1'] = function (P, ctx, prog) {
  const d = derive(P), runs = []; let k = 0; const angOn = P.dut.mount.kappa > 0, nTot = angOn ? 7 : 6;
  const step = (S) => { const R = runSim(P, S, (p) => prog && prog((k + p) / nTot)); k++; return R; };
  const met = (R) => losMetrics(R, P, { skip: 3, nseg: 8192 });
  const Rb = step(shakerScenario(P, { axis: 1, mode: 'off' })), Mb = met(Rb);
  for (const axis of [0, 1, 2]) { const R = step(shakerScenario(P, { axis, mode: 'platform', rocking: P.lab.rocking.controlled })); runs.push({ axis, R, M: met(R) }); }
  const Rang = angOn ? step(mastAngScenario(P)) : null, Mang = angOn ? met(Rang) : null;
  const Rfree = step(shakerScenario(P, { axis: 1, mode: 'platform', rocking: P.lab.rocking.free })), Mfree = met(Rfree);
  const Rsw = step(shakerScenario(P, { axis: 1, mode: 'sweep', rocking: P.lab.rocking.controlled }));
  const ex = (a, b) => Math.sqrt(Math.max(0, a * a - b * b));            // taban karesel olarak çıkarılır
  const f1 = P.env.plat.f1, f2 = P.env.plat.f2, fN = 0.5 * 1000;
  const bnd = (M, c) => bandRms(M.psd.f, M.psd[c], f1, f2);
  // B2-06 ⊕ B3 toplamı yalnız bu kalemlerin bandında (≥ f1 = 4 Hz) değerlendirilir: tabanın 1 Hz altındaki içeriği
  // (gyro ARW rastgele yürüyüşü, B1-05) bu tahsisin parçası değildir ve gerçekleşmeden gerçekleşmeye büyük değişir
  const hiB = (M, c) => bandRms(M.psd.f, M.psd[c], f1, fN);
  const acPsd = (R, c) => welch(detrend(Float64Array.from(R.rec[c].subarray(3000)), 'linear'), 1000, 8192);
  const acB = (R, c) => { const w = acPsd(R, c); return bandRms(w.f, w.P, f1, fN); };
  const acR = (R, c) => aRms(detrend(Float64Array.from(R.rec[c].subarray(3000)), 'linear'));
  const tot = {}, acTot = {}, b206 = {}, lin = {}, ang = {}, totFull = {};
  for (const c of ['el', 'xel']) {
    lin[c] = Math.sqrt(runs.reduce((s, r) => s + sq(ex(hiB(r.M, c), hiB(Mb, c))), 0));
    ang[c] = angOn ? ex(hiB(Mang, c), hiB(Mb, c)) : 0;
    tot[c] = Math.sqrt(sq(hiB(Mb, c)) + sq(lin[c]) + sq(ang[c]));
    totFull[c] = Math.sqrt(sq(Mb.rms[c]) + runs.reduce((s, r) => s + sq(ex(r.M.rms[c], Mb.rms[c])), 0) + (angOn ? sq(ex(Mang.rms[c], Mb.rms[c])) : 0));
    const ab = acB(Rb, 'ac_' + c);
    acTot[c] = Math.sqrt(sq(ab) + runs.reduce((s, r) => s + sq(ex(acB(r.R, 'ac_' + c), ab)), 0) + (angOn ? sq(ex(acB(Rang, 'ac_' + c), ab)) : 0));
    b206[c] = Math.sqrt(runs.reduce((s, r) => s + sq(ex(bnd(r.M, c), bnd(Mb, c))), 0) + (angOn ? sq(ex(bnd(Mang, c), bnd(Mb, c))) : 0));
  }
  const al = budgetAlloc(P), b3 = Math.sqrt(['B3-01', 'B3-02', 'B3-03', 'B3-04'].reduce((s, q) => s + sq(al[q]), 0));
  const lim = Math.sqrt(sq(al['B2-06']) + sq(b3)) * 1e-6;
  const ok = Math.max(tot.el, tot.xel) <= lim;
  ctx.T31 = { runs, tot, acTot, Rb };
  const pw = psdWeighting(runs[1].M.psd.f, runs[1].M.psd.el, d.Tint);
  const res = mkResult('T3.1', {
    status: stat(ok), measured: `B2-06 ⊕ B3 LOS (≥ ${f1} Hz; taban + 3 öteleme ekseni${angOn ? ' + direk açısal yolu' : ''}): optik el ${urad(tot.el)} / xel ${urad(tot.xel)} µrad; ayna kanalı el ${urad(acTot.el)} / xel ${urad(acTot.xel)} µrad (sınır ${urad(lim, 1)})`,
    kv: [['Taban (shaker kapalı: soğutucu, gyro, ölçüm zinciri), ≥ ' + f1 + ' Hz / tüm bant', `optik el ${urad(hiB(Mb, 'el'))} / ${urad(Mb.rms.el)} · xel ${urad(hiB(Mb, 'xel'))} / ${urad(Mb.rms.xel)} µrad`]]
      .concat(runs.map(r => [`Shaker ekseni ${'xyz'[r.axis]} (tabanın üstünde, ≥ ${f1} Hz)`, `optik el ${urad(ex(hiB(r.M, 'el'), hiB(Mb, 'el')))} / xel ${urad(ex(hiB(r.M, 'xel'), hiB(Mb, 'xel')))} µrad; otokolimatör el ${urad(ex(acB(r.R, 'ac_el'), acB(Rb, 'ac_el')))} µrad`]))
      .concat([['Tüm bant toplamı (bilgi; B1 gyro yürüyüşü dahil)', `optik el ${urad(totFull.el)} / xel ${urad(totFull.xel)} µrad`]])
      .concat([angOn ? ['Direk modu açısal yolu (açısal uyarıcı, öneri)', `optik el ${urad(ang.el)} / xel ${urad(ang.xel)} µrad; uyarım roll ${urad(aRms(Float64Array.from(Rang.rec.base_r.subarray(3000))), 1)} µrad RMS`]
                     : ['Direk modu açısal yolu', 'modelde kapalı (κ = 0): bütçede karşılığı olan yollar öteleme yollarıdır (Model → DUT → direk modu)'],
               ['B2-06 (4–33 Hz bandı, taban çıkarılmış)' + (angOn ? ': öteleme / açısal / toplam' : ', el / xel'), angOn ? `${urad(Math.sqrt(runs.reduce((s, r) => s + sq(ex(bnd(r.M, 'el'), bnd(Mb, 'el'))), 0)))} / ${urad(ex(bnd(Mang, 'el'), bnd(Mb, 'el')))} / ${urad(b206.el)} µrad (el)` : `${urad(b206.el)} / ${urad(b206.xel)} µrad`],
               ['Fikstür sallanması (y ekseni): bastırılmış ' + P.lab.rocking.controlled + ' / serbest ' + P.lab.rocking.free + ' µrad/mm',
                 `taban roll ${urad(aRms(detrend(Float64Array.from(runs[1].R.rec.base_r.subarray(3000)), 'linear')), 2)} / ${urad(aRms(detrend(Float64Array.from(Rfree.rec.base_r.subarray(3000)), 'linear')), 2)} µrad RMS → optik LOS el ${urad(runs[1].M.rms.el, 2)} / ${urad(Mfree.rms.el, 2)} µrad (stab ON'da DRR sallanmayı bastırır; stab OFF ölçümde doğrudan görünür)`],
               ['Wander / smear (y ekseni, PSD ağırlığı)', urad(pw.wander) + ' / ' + urad(pw.smear) + ' µrad'],
               ['Profil', 'Ölçülmüş platform PSD\'si (örnek): 4–33 Hz rastgele + 50 Hz yardımcı makine tonu + 60–400 Hz geniş bant']]),
    notes: ['Sonsuzdaki hedefte öteleme görüntüyü kaydırmaz; sallanma (rocking) kaydırır. Numune açısal hareketi ağırlık merkezi ve çok noktalı kontrolle bastırılır, kalan ölçülür (Honlet & Wehrenberg 2015).',
            'Shaker fikstürü rijittir: direk yapısı platform titreşimini direk tepesinde açısal harekete de çeviriyorsa (Model → direk modu κ > 0) bu yol shaker testinde oluşmaz. Ölçülmüş direk tepesi açısal PSD\'si açısal uyarıcıyla oynatılmalı (κ > 0 iken öneri koşusu eklenir) ya da analizle kapatılmalıdır; aksi halde B2-06 eksik doğrulanır.',
            'Taban koşusu (shaker kapalı) karesel olarak çıkarıldı: soğutucu ve gyro gürültüsü her koşuda bulunur, eksenler toplanırken bir kez sayılmalıdır.',
            'Kabul toplamı bant sınırlıdır (≥ 4 Hz, platform profilinin alt kenarı): B2-06 ⊕ B3 tahsisi tabanın düşük frekanslı gyro yürüyüşünü (B1-05) içermez. Tüm bant toplamı bilgi olarak verilir; 60 s kayıtta bu yürüyüş gerçekleşmeden gerçekleşmeye birkaç µrad değişir ve önceki sürümde bir tohum tekrarında yalnız bu yüzden sınır aşılıyordu.',
            'Referans aynası mekanik açıyı ölçer: optik içi hareket (soğutucu, optik alt montaj) aynada görünmez — ayna ile optik LOS farkına bakın.'],
    fill: { 'B2-06': b206.el },
  });
  const mE = runs[1].M;
  const sel = (f, P0) => { const xs = [], ys = []; for (let i = 1; i < f.length; i++) if (f[i] >= 2 && f[i] <= 500) { xs.push(f[i]); ys.push(P0[i] * 1e12); } return { x: Float32Array.from(xs), y: Float32Array.from(ys) }; };
  const pac = welch(detrend(Float64Array.from(runs[1].R.rec.ac_el.subarray(3000)), 'linear'), 1000, 8192);
  const a1 = sel(mE.psd.f, mE.psd.el), a2 = sel(pac.f, pac.P), a0 = sel(Mb.psd.f, Mb.psd.el);
  const psdSer = [{ name: 'Optik LOS, shaker y', x: a1.x, y: a1.y }, { name: 'Otokolimatör, shaker y', x: a2.x, y: a2.y }];
  if (angOn) { const a3 = sel(Mang.psd.f, Mang.psd.el); psdSer.push({ name: 'Optik LOS, açısal yol', x: a3.x, y: a3.y }); }
  psdSer.push({ name: 'Taban (shaker kapalı)', x: a0.x, y: a0.y });
  res.plots.push({ title: 'LOS PSD (el): shaker y ekseni ve taban', xLabel: 'Hz', yLabel: 'µrad²/Hz', xLog: true, yLog: true, series: psdSer });
  // süpürme: LOS / ivme aktarımı
  const tr = recT(Rsw), sch = makeComponent({ type: 'chirp', axis: 1, f0: 4, f1: 33, octPerMin: 1, ampFn: () => 1, t0: 2, ramp: 2 }, 1000, makeRngFactory(1));
  const fx = [], gy = [];
  for (let t0 = 4; t0 < 186; t0 += 2) {
    const fc = sch.freqAt(t0 + 1); if (!fc) continue;
    const [i0, i1] = idxRange(tr, t0, t0 + 2);
    const fit = sineFit(tr, Rsw.rec.opt_el, fc, { i0, i1 }); if (!fit) continue;
    fx.push(fc); gy.push(fit.A / (sq(TAU * fc) * 0.254e-3) * 1e6);
  }
  res.plots.push({ title: 'MIL-STD-167-1A Type I keşif süpürmesi (0,254 mm), y ekseni: LOS / ivme', xLabel: 'Hz', yLabel: 'µrad per m/s²', xLog: true, yLog: true,
    series: [{ name: 'el', x: Float32Array.from(fx), y: Float32Array.from(gy), dots: true }] });
  return res;
};
// T3.2 — titreşim altında MTF
TESTS['T3.2'] = function (P, ctx, prog) {
  const d = derive(P);
  if (!ctx.T31) TESTS['T3.1'](P, ctx, prog);
  const rng = new RNG(seedOf(P, 3201)), nM = 3;
  // Test tanımı: statik ve titreşimli, her biri ≥ 3 ölçüm. Statik = shaker kapalı taban koşusu (soğutucu vb. kare içi
  // jitter'ı her iki ölçümde de vardır ve oranda sadeleşir). Kayıt 3 eşit parçaya bölünür; her parça bir eğik kenar ölçümüdür.
  const mtfSeg = (Rr) => {
    const V = sliceVideo(Rr.video, 3), n = V.n, L = Math.floor(n / nM), o = [];
    for (let q = 0; q < nM; q++) {
      let se = 0, sx = 0, ve = 0, vx = 0; for (let i = q * L; i < (q + 1) * L; i++) { se += V.oEl[i]; sx += V.oXel[i]; ve += V.vEl[i]; vx += V.vXel[i]; }
      o.push({ el: se / L * (1 + 0.01 * rng.gauss()), xel: sx / L * (1 + 0.01 * rng.gauss()), smEl: Math.sqrt(ve / L), smXel: Math.sqrt(vx / L) });   // eğik kenar tekrarlanabilirliği ±%1
    }
    return o;
  };
  const st = mtfSeg(ctx.T31.Rb), stEl = aMean(st.map(s => s.el)), stXel = aMean(st.map(s => s.xel));
  const sd = (a) => a.length > 1 ? aStd(a) * Math.sqrt(a.length / (a.length - 1)) : 0;
  const per = ctx.T31.runs.map(r => {
    const m = mtfSeg(r.R), qe = m.map(s => s.el / stEl), qx = m.map(s => s.xel / stXel);
    return { axis: r.axis, rEl: aMean(qe), rXel: aMean(qx), sEl: sd(qe), sXel: sd(qx), smEl: aMean(m.map(s => s.smEl)), smXel: aMean(m.map(s => s.smXel)) };
  });
  const H5 = (r) => Math.SQRT2 * d.IFOV * Math.sqrt(Math.max(0, -Math.log(Math.min(r, 0.999999)))) / Math.PI;
  const lim = Math.exp(-sq(Math.PI) * sq(d.req.smear) / (2 * sq(d.IFOV)));
  const worst = Math.min(...per.map(p => Math.min(p.rEl, p.rXel)));
  const ok = worst >= lim;
  return mkResult('T3.2', {
    status: stat(ok), measured: `MTF_titreşim/MTF_statik @ Nyquist en kötü ${fmt(worst, 4)} (sınır ${fmt(lim, 4)}); eksen başına ${nM} ölçüm`,
    kv: per.map(p => [`Shaker ${'xyz'[p.axis]}`, `oran el ${fmt(p.rEl, 4)} ± ${fmt(p.sEl, 4)} / xel ${fmt(p.rXel, 4)} ± ${fmt(p.sXel, 4)} → MTF'ten smear ${urad(H5(p.rEl))} / ${urad(H5(p.rXel))} µrad; doğrudan smear ${urad(p.smEl)} / ${urad(p.smXel)} µrad`])
      .concat([['Statik (shaker kapalı) kare içi jitter MTF\'i', `el ${fmt(stEl, 4)} / xel ${fmt(stXel, 4)} (${nM} ölçüm; optik MTF oranda sadeleşir)`]]),
    notes: ['MTF, kare içi gerçek LOS dağılımından (her kare için |OTF| Nyquist\'te) hesaplanıp eğik kenar tekrarlanabilirliği (±%1) eklendi; oran titreşimli / statik ölçümün oranıdır.', 'H5: σ = √2·IFOV·√(−ln r)/π, Gauss varsayımı.'],
    fill: { 'MTF': worst },
  });
};
// T3.3 — yüksek hızlı LOS ölçümü (PSD ağırlıklandırma girdisi)
TESTS['T3.3'] = function (P, ctx, prog) {
  const d = derive(P);
  if (!ctx.T31) TESTS['T3.1'](P, ctx, prog);
  const r = ctx.T31.runs[1].R;
  const ac = detrend(Float64Array.from(r.rec.ac_el.subarray(3000)), 'linear'), op = detrend(Float64Array.from(r.rec.opt_el.subarray(3000)), 'linear');
  const pa = welch(ac, 1000, 8192), po = welch(op, 1000, 8192);
  const wa = psdWeighting(pa.f, pa.P, d.Tint), wo = psdWeighting(po.f, po.P, d.Tint);
  const ti = turInfo(P);
  const ok = ti.turS >= P.wb.TUR_target;
  const tab = logDecimPSD(pa.f, scaleArr(pa.P, 1e12), 120, 0.5);
  ctx.psdTable = tab;
  // v13.6: TUR bütçeden (analitik) gelir; T0.2 koşulduysa ölçülen otokolimatör tabanına U-03, U-04, U-05 eklenerek çapraz denetim
  const U = Object.fromEntries(ti.U.map(u => [u.id, u.vh != null ? u.vh : u.v])), fl = ctx.floor && ctx.floor.ac;
  const uhM = fl ? Math.sqrt(sq(Math.max(fl.el, fl.xel) * 1e6) + sq(U['U-03']) + sq(U['U-04']) + sq(U['U-05'])) : null;
  const res = mkResult('T3.3', {
    status: stat(ok), measured: `Yüksek hızlı kanal TUR (bütçeden) = ${fmt(ti.turS, 2)} (hedef ${P.wb.TUR_target}); ayna PSD'si: wander ${urad(wa.wander)} / smear ${urad(wa.smear)} µrad, gerçek optik: ${urad(wo.wander)} / ${urad(wo.smear)} µrad`,
    kv: [['Bant toplamları, ayna (B1/B2/B3)', ['B1', 'B2', 'B3'].map(b => urad(wa.bands[b].total)).join(' / ') + ' µrad'], ['Bant toplamları, optik (B1/B2/B3)', ['B1', 'B2', 'B3'].map(b => urad(wo.bands[b].total)).join(' / ') + ' µrad'],
         ['u_yüksek hızlı (U-02…U-07)', fmt(ti.uh) + ' µrad'], ['TUR_smear (k=1 / Z540.3)', fmt(ti.turS_k1, 2) + ' / ' + fmt(ti.turS_z, 2)],
         ['Ölçüme dayalı denetim: T0.2 otokolimatör tabanı ⊕ U-03 ⊕ U-04 ⊕ U-05', fl ? `${fmt(uhM)} µrad → TUR ${fmt(d.req.smear * 1e6 / (uhM * ti.mult), 2)} (bütçe ${fmt(ti.uh)} → ${fmt(ti.turS, 2)})` : 'T0.2 koşulmadı'],
         ['Dışa aktarılan PSD satırı', String(tab.f.length) + ' (f artan; PSD ağırlıklandırma girdisi)']],
    notes: ['Ayna (otokolimatör) kanalı optik içi hareketi göremez: soğutucu (B3-02) ve optik alt montaj (B3-03) eksik kalır. ROI (pencere) yüksek kare hızı modu optik LOS\'u doğrudan görürdü; kullanıcı kararıyla (v13.7) T3.3\'e eklenmedi.',
            'Durum, bütçedeki u_h ile hesaplanan TUR\'dan gelir (analitik). T0.2\'nin stab OFF otokolimatör kaydı zincirin hava ⊕ gürültü kısmını ölçer; masa mikro-titreşimi (U-03), IMU (U-04) ve ölçek (U-05) bütçeden eklenerek aynı TUR ölçüme dayalı olarak denetlenir.'],
    num: { turS: ti.turS, uh: ti.uh, uhMeas: uhM },
  });
  res.plots.push({ title: 'Kümülatif RMS (el): ayna vs optik', xLabel: 'Hz', yLabel: 'µrad', xLog: true,
    series: [{ name: 'Ayna (otokolimatör)', x: Float32Array.from(pa.f.subarray(1)), y: Float32Array.from(cumRms(pa.f, pa.P).subarray(1), v => v * 1e6) },
             { name: 'Optik LOS (gerçek)', x: Float32Array.from(po.f.subarray(1)), y: Float32Array.from(cumRms(po.f, po.P).subarray(1), v => v * 1e6) }] });
  return res;
};
// T3.4 — kriyo-soğutucu mikrofoniği
TESTS['T3.4'] = function (P, ctx, prog) {
  const d = derive(P), fc = P.dut.cooler.f, fps = d.fps, Tint = d.Tint;
  const out = []; let k = 0;
  for (const stab of [true, false]) {
    const R = runSim(P, labScenario(P, { label: 'T3.4', T: 125, fs: 4000, stab, hexActive: false, seed: 3401 + k,
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel'] } }), (p) => prog && prog((k + p) / 2)); k++;
    const tr = recT(R), [i0, i1] = idxRange(tr, 5, 125);
    const acA = sineFit(tr, R.rec.ac_el, fc, { i0, i1 }).A;
    const trA = sineFit(tr, R.rec.opt_el, fc, { i0, i1 }).A;
    // v13.11 (§11): gerçek soğutucu LOS'u optik kanalda 1.–3. harmoniğin sinüs uydurmasından (önce kaydın toplam RMS'i yazılıyordu;
    // o değer soğutucuyla ilgisiz gyro yürüyüşünü ve hava türbülansını da taşıyordu)
    const fRecN = R.meta.fRec / 2, hA = [1, 2, 3].map(h => (h * fc < 0.9 * fRecN ? sineFit(tr, R.rec.opt_el, h * fc, { i0, i1 }).A : NaN));
    const trTot = Math.sqrt(hA.filter(isFinite).reduce((a, b) => a + b * b, 0) / 2);
    const v = videoAngles(R, ctx); const [j0, j1] = idxRange(v.t, 5, 125);
    const fa = Math.abs(fc - Math.round(fc / fps) * fps);
    // v13.11 (§11): katlanan frekans 0'a ya da Nyquist'e (fps/2) çok yakınsa ton videoda ayrıştırılamaz (stroboskopik sabit ya da
    // genliği fazına bağlı Nyquist tonu): uydurma yapılmaz, test GEÇERSİZ olur. Sınır: kayıt penceresinin iki frekans çözünürlüğü
    const fGuard = 2 / (v.t[Math.max(j0, j1 - 1)] - v.t[j0]), aliasOk = fa >= fGuard && fa <= fps / 2 - fGuard;
    const al = aliasOk ? sineFit(v.t, v.el, fa, { i0: j0, i1: j1, valid: v.ok }) : { A: NaN };
    const corr = al.A / Math.abs(sinc(Math.PI * fc * Tint));
    out.push({ stab, acA, trA, hA, trTot, fa, alA: al.A, corr, aliasOk, fGuard });
  }
  const o = out[0], est = o.corr / Math.SQRT2, pg = pixPhaseInfo(P, ctx);
  const ok = est <= budgetAlloc(P)['B3-02'] * 1e-6;
  const nF = Math.round(fc / fps), aliasTxt = `${fc} Hz → |${fc} − ${nF}·${fps}| = ${fmt(o.fa, 1)} Hz`;
  return mkResult('T3.4', {
    status: o.aliasOk ? stat(ok) : 'GEÇERSİZ',
    measured: o.aliasOk ? `Videoda ${fmt(o.fa, 1)} Hz'e katlanan ton → sinc düzeltmeli temel bileşen ${urad(est)} µrad RMS (tahsis ${fA(budgetAlloc(P)['B3-02'])}); ayna kanalı ${urad(o.acA / Math.SQRT2, 3)} µrad (görmez)`
      : `Soğutucu tonu videoda ayrıştırılamıyor: ${aliasTxt} (${o.fa < o.fGuard ? 'stroboskopik: kare hızının katına çok yakın, ton sabit bir sapmaya dönüşür' : 'kare hızının yarısına çok yakın: genlik fazına bağlı'}); ROI modu, farklı kare hızı ya da optik yüksek hızlı kanal gerekir`,
    kv: out.map(q => [`Stab ${q.stab ? 'ON' : 'OFF'}`, `ayna ${urad(q.acA / Math.SQRT2, 3)} µrad · ${q.aliasOk ? `video alias ${urad(q.alA / Math.SQRT2)} µrad → düzeltilmiş ${urad(q.corr / Math.SQRT2)} µrad` : 'video: ayrıştırılamaz'} · gerçek ${fc} Hz bileşeni ${urad(q.trA / Math.SQRT2)} µrad`])
      .concat([['Katlanma', `${aliasTxt}; pencere W = sinc(π·${fc}·${Tint * 1e3} ms) = ${fmt(Math.abs(sinc(Math.PI * fc * Tint)), 3)}; ayrıştırma sınırı ${fmt(o.fGuard, 3)} Hz ile ${fmt(fps / 2 - o.fGuard, 2)} Hz arası`],
               ['Harmonikler', `${2 * fc} ve ${3 * fc} Hz videoda ${fmt(Math.abs(2 * fc - Math.round(2 * fc / fps) * fps), 1)} ve ${fmt(Math.abs(3 * fc - Math.round(3 * fc / fps) * fps), 1)} Hz'e katlanır; kabul yalnız temel bileşene uygulanır. Harmonikler için ROI modu veya optik yüksek hızlı kanal gerekir`],
               ['Gerçek soğutucu LOS (optik kanal, stab ON)', `temel / 2. / 3. harmonik ${o.hA.map(a => (isFinite(a) ? urad(a / Math.SQRT2) : '—')).join(' / ')} µrad → toplam ${urad(o.trTot)} µrad RMS`],
               ['Videonun küçük hareket kazancı (el, piksel fazı)', `${fmt(pg.gY, 3)} (${pg.src}); video genliği bu kazancı içerir`]]),
    notes: ['Soğutucu FPA/optik grubunu titreştirir: referans aynası (mekanik açı) bunu görmez. Video, katlanmış tonu verir; genlik, entegrasyon penceresinin sinc ağırlığıyla düzeltilir. Ölçülen genlik hedefin sub-piksel konumundaki küçük hareket kazancını da taşır (piksel fazı; kullanıcı kararıyla yalnız raporlanır).'],
    fill: o.aliasOk ? { 'B3-02': est } : {},
  });
};
// T3.5 — optik alt montaj modları (dwell, ayna vs optik ayrımı)
TESTS['T3.5'] = function (P, ctx, prog) {
  const d = derive(P), out = []; let k = 0;
  const modes = [{ f: P.dut.modes.opt.f, kind: 'shaker', a: 1.0 }, { f: P.dut.modes.gim.f, kind: 'açısal uyarıcı', alpha: 5 }];
  for (const m of modes) {
    const o = { label: 'T3.5', T: 62, fs: 4000, hexActive: false, seed: 3501 + k, rec: { fs: 2000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel'] } };   // her rezonansta 60 s
    if (m.kind === 'shaker') o.trans = [{ type: 'sine', axis: 1, A: m.a / sq(TAU * m.f), f: m.f, t0: 0.5, ramp: 0.5 }, { type: 'sine', axis: 2, A: m.a / sq(TAU * m.f), f: m.f, ph: 1, t0: 0.5, ramp: 0.5 }];
    else o.vib = [{ type: 'sine', axis: 0, A: m.alpha / sq(TAU * m.f), f: m.f, t0: 0.5, ramp: 0.5 }];
    o.cooler = false;
    const R = runSim(P, labScenario(P, o), (p) => prog && prog((k + p) / 2)); k++;
    const n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / R.meta.fRec;
    const [i0, i1] = idxRange(t, 2, 61.5);
    const op = sineFit(t, R.rec.opt_el, m.f, { i0, i1 }).A, me = sineFit(t, R.rec.mech_el, m.f, { i0, i1 }).A;
    out.push({ m, op, me, ratio: me / Math.max(op, 1e-15), cls: me / Math.max(op, 1e-15) < 0.3 ? 'Optik iç hareket (zoom grubu / FPA / ayna montajı) — aynada görünmez' : 'Gimbal / taşıyıcı yapı — aynada görünür' });
  }
  // işletme kestirimi B3-03: işletme geniş bant ivmesiyle izole koşu
  const row = OP_ROWS.find(r => r.id === 'B3-03');
  const Rop = runSim(P, rowScenario(P, row, { T: 30 }));
  const b303 = losMetrics(Rop, P, { skip: 5 }).rms.el;
  const ok = b303 <= budgetAlloc(P)['B3-03'] * 1e-6;
  return mkResult('T3.5', {
    status: stat(ok), measured: out.map(o => `${fmt(o.m.f, 0)} Hz: optik ${urad(o.op / Math.SQRT2, 2)} / ayna ${urad(o.me / Math.SQRT2, 2)} µrad RMS → ${o.cls}`).join('; ') + `; işletmede B3-03 ≈ ${urad(b303)} µrad`,
    kv: out.map(o => [`${fmt(o.m.f, 0)} Hz (${o.m.kind})`, `ayna/optik oranı ${fmt(o.ratio, 3)} — ${o.cls}`]).concat([['İşletme geniş bant titreşimiyle B3-03', urad(b303) + ' µrad RMS (tahsis ' + fA(budgetAlloc(P)['B3-03']) + ')']]),
    notes: ['Gerçek düzenekte stroboskobik ışık veya lazer vibrometre ile hangi alt montajın hareket ettiği görülür; burada ayna (mekanik) ile optik LOS genlik oranı aynı ayrımı verir. Düz ayna eğimi LOS\'a 2× yansır.'],
    fill: { 'B3-03': b303 },
  });
};
// T4.1 — boresight korunumu (basit istatistiksel model)
TESTS['T4.1'] = function (P, ctx) {
  if (!ctx.bore) TESTS['T0.5'](P, ctx);
  const rng = new RNG(seedOf(P, 4101)), acc = 15, req = P.ana.req.boresight_urad;
  const shift = ctx.bore.map((b, i) => ({ c: b.c, daz: i ? 3 * rng.gauss() + 8 * rng.gauss() : 0, del: i ? 3 * rng.gauss() + 8 * rng.gauss() : 0 }));
  const meas = shift.map(s => ({ c: s.c, daz: s.daz + acc * rng.gauss(), del: s.del + acc * rng.gauss() }));
  const worst = Math.max(...meas.map(m => Math.hypot(m.daz, m.del)));
  return mkResult('T4.1', { status: req == null ? 'BİLGİ' : stat(worst <= req), measured: `En büyük kanal kayması ${fmt(worst, 1)} µrad (ölçüm doğruluğu ≈ 15 µrad; gereksinim ${req == null ? 'girilmedi' : req + ' µrad'})`,
    kv: meas.map(m => [m.c, `Δaz ${fmt(m.daz, 1)}, Δel ${fmt(m.del, 1)} µrad (gerçek ${fmt(shift.find(s => s.c === m.c).daz, 1)}, ${fmt(shift.find(s => s.c === m.c).del, 1)})`]),
    notes: ['Basit istatistiksel model: titreşim (σ = 3 µrad) ve şok (σ = 8 µrad) sonrası kalıcı kayma; fizik tabanlı değildir. Boresight gereksinimi proje gereksinimidir (Model → Proje gereksinimleri; girilmezse BİLGİ).'] });
};
// T4.2 — sıcaklık × dinamik (mühendislik beklentisi)
TESTS['T4.2'] = function (P, ctx, prog) {
  const temps = [{ T: -20, fr: 2.0, b: 1.6 }, { T: 20, fr: 1.0, b: 1.0 }, { T: 55, fr: 0.85, b: 0.8 }];
  const cases = [];
  for (const tc of temps) { cases.push({ tc, sched: false }); if (tc.fr !== 1) cases.push({ tc, sched: true }); }
  const out = []; let k = 0;
  const fS = 0.05, nper = 6;
  const VS = vivSpec(P), ship = VS.kind === 'wind', toneOn = !ship || VS.present;      // gemide VIV yoksa ton segmenti koşulmaz
  const fT = ship ? VS.f : P.wb.viv.fn, fTl = fmt(fT, 2) + ' Hz', useTone = toneOn && (ship || VS.lin);   // v13.3: denizaltında öteleme açıksa açısal + öteleme tonu
  for (const cs of cases) {
    const tc = cs.tc, P2 = cloneParams(P);
    for (const a of [P2.dut.el, P2.dut.az]) { a.Fc *= tc.fr; a.Fs *= tc.fr; a.b *= tc.b; }
    P2.dut.gyro.Top = tc.T;          // FOG sıcaklık katsayıları (v11): ΔT = T − Tcal; katsayılar 0 ise etkisiz
    // sabit FF: ileri besleme modeli 20 °C'deki F_c ile kalır → etkin η = η/fr. Programlı FF: model sıcaklıkla güncellenir.
    if (!cs.sched) P2.dut.ctl.ff.eta = P.dut.ctl.ff.eta / tc.fr;
    const sg = segSines(ship ? (toneOn ? [{ axis: 0, f: fS, A: 5 * D2R, nper }, { axis: 0, f: fT, A: VS.A, nper: Math.round(30 * fT) }] : [{ axis: 0, f: fS, A: 5 * D2R, nper }])
      : [{ axis: 0, f: fS, A: 5 * D2R, nper }, { axis: 0, f: P.wb.viv.fn, A: P.wb.viv.amp_deg * D2R, nper: Math.round(30 * P.wb.viv.fn) }]);
    let cmd = sg.cmd, trans = [];
    if (useTone) {     // gemi ve (v13.3) denizaltı: ton segmenti VIV biçiminde (açısal + aynı fazda öteleme), aynı zamanlamayla
      const c1 = sg.cmd[1], tn = windTone(P2, VS, fT, c1.t0, c1.t1, c1.ramp);
      cmd = [sg.cmd[0]].concat(tn.cmd); trans = tn.trans;
      if (Math.abs(VS.roll) < Math.abs(VS.pitch)) sg.segs[1].axis = 1;
    }
    const R = runSim(P2, labScenario(P2, { label: 'T4.2', T: sg.T, fs: 4000, cmd, trans, resF: fT, seed: 4201 + k }), (p) => prog && prog((k + p) / cases.length)); k++;   // dar bant kontrol tona ayarlı
    const tr = recT(R), s0 = sg.segs[0];
    let i0 = 0; while (i0 < tr.length && tr[i0] < s0.c0) i0++;
    const K = Math.floor((s0.c1 - s0.c0) * fS + 1e-9);
    const A = tsaAnalysis(tr, R.rec.ac_el, fS, i0, K, R.meta.fRec);
    if (!toneOn) { out.push({ T: tc.T, sched: cs.sched, pk: A.pk, det: A.det, viv: NaN, drr: NaN }); continue; }
    const f2 = fitSegments(P2, R, [sg.segs[1]], ctx)[0];
    const vv = useTone ? Math.max(f2.fe.A, f2.fx.A) / Math.SQRT2 : f2.fe.A / Math.SQRT2;
    out.push({ T: tc.T, sched: cs.sched, pk: A.pk, det: A.det, viv: vv, drr: useTone ? db(vv / (VS.A / Math.SQRT2)) : drrOf(f2.fe, f2.fin) });
  }
  const AL = budgetAlloc(P), limP = P.wb.k_conf * AL['B1-07'] * 1e-6, limV = AL['B2-01'] * 1e-6;
  const cfgSched = !!P.dut.ctl.ff.tempSched;
  const cfg = out.filter(o => o.sched === cfgSched || o.T === 20);
  const vivOn = VS.present;          // VIV yoksa ton ölçütü (B2-01) uygulanmaz; denizaltında ton bilgi olarak koşulur (v13.3: hız zarfı kuralı dahil)
  const ok = cfg.every(o => o.pk <= limP && (!vivOn || o.viv <= limV));
  const lbl = (o) => `${o.T} °C${o.T === 20 ? '' : (o.sched ? ' (programlı FF)' : ' (sabit FF)')}`;
  const Gy = P.dut.gyro, tcOn = (Gy.tcBias || 0) !== 0 || (Gy.tcSF || 0) !== 0;
  const tcKv = tcOn ? temps.map(t => { const dT = t.T - (Gy.Tcal != null ? Gy.Tcal : 20), db0 = (Gy.tcBias || 0) * dT, dsf = (Gy.tcSF || 0) * dT;
    return [`Gyro sıcaklık etkisi ${t.T} °C (ΔT = ${fmt(dT, 0)} °C)`, `bias ${fmt(Gy.bias0, 3)} → ${fmt(Gy.bias0 + db0, 3)} °/h (τ = ${P.wb.tau} s'de ${fmt((Gy.bias0 + db0) * DEGPH * P.wb.tau * 1e6, 2)} µrad kayma; drift tahsisi ${fmt(derive(P).req.drift * 1e6, 0)} µrad); ölçek ${fmt(Gy.sf_ppm + dsf, 0)} ppm`]; }) : [];
  return mkResult('T4.2', { status: stat(ok),
    measured: `Yapılandırılmış DUT (${cfgSched ? 'sıcaklık programlı' : 'sabit'} FF): ` + cfg.map(o => `${o.T} °C sürtünme tepesi ${urad(o.pk, 1)} µrad` + (toneOn ? `, ${fTl} artık ${urad(o.viv)} µrad` : '')).join('; ') +
      (vivOn ? '' : (ship ? ' (rüzgâr VIV\'i yok: ton segmenti koşulmadı)' : ` (${VS.on ? 'işletme hız zarfında VIV yok' : 'VIV kapalı'}: ${fTl} artığı bilgi amaçlı)`)),
    kv: out.map(o => [lbl(o), `sürtünme tepesi (TSA) ${urad(o.pk, 1)} µrad (sınır ${urad(limP, 1)}), tekrarlanan RMS ${urad(o.det, 2)} µrad` + (toneOn ? ` · ${ship ? 'rüzgâr VIV tonu artığı (el/xel büyüğü)' : (useTone ? 'VIV tonu artığı (açısal + öteleme; el/xel büyüğü)' : 'VIV tonu artığı')} ${urad(o.viv)} µrad, DRR ${fmt(o.drr, 1)} dB (tahsis ${urad(limV, 0)})` : '')]).concat(tcKv),
    notes: ['Soğukta yağ dolu keçenin sürtünmesi ve viskoz direnci artar (mühendislik beklentisi, kaynak değil): −20 °C\'de sürtünme ×2, viskoz kuplaj ×1,6; +55 °C\'de ×0,85 / ×0,8.',
            'Sabit FF: sürtünme kompanzasyonu 20 °C modelinde kalır; soğukta eksik (η_etkin ≈ 0,48), sıcakta aşırı (η_etkin ≈ 1,12) kompanze eder. Aşırı kompanzasyon negatif sürtünme gibi davranır ve yön değişimlerinde sıçrama üretir.',
            'Programlı FF: sürtünme modeli sıcaklıkla güncellenir (örn. keçe sıcaklık sensörü + çizelge ya da çevrimiçi sürtünme kestirimi). Model sekmesinden yapılandırmaya eklenebilir.',
            ship ? `Tepe değerler senkron ortalamayla (T1.6 yöntemi) bulundu; ${toneOn ? `${fTl} rüzgâr VIV tonu (açısal${VS.lin ? ' + öteleme' : ''}) yapılandırılmış dar bant kontrolle koşuldu.` : 'rüzgâr VIV\'i bu ayarlarla oluşmadığı için ton segmenti koşulmadı.'}`
              : `Tepe değerler senkron ortalamayla (T1.6 yöntemi) bulundu; ${fTl} VIV tonu (açısal${useTone ? ' + mast başı ötelemesi' : ''}) yapılandırılmış dar bant kontrolle koşuldu.`] });
};
const TEST_ORDER = ['T0.1', 'T0.2', 'T0.3', 'T0.4', 'T0.5', 'T0.6', 'T0.7', 'T1.1', 'T1.2', 'T1.3', 'T1.4', 'T1.5', 'T1.6', 'T1.7', 'T1.8', 'T1.9',
  'T2.1', 'T2.2', 'T2.3', 'T2.4', 'T2.5', 'T3.1', 'T3.2', 'T3.3', 'T3.4', 'T3.5', 'T4.1', 'T4.2'];
const FOV_LOSS_EXPECTED = new Set(['T1.8']);       // dönüş testi: hedef dönüş sırasında alandan bilerek çıkar
function runTest(id, P, ctx, prog) {
  const t0 = Date.now();
  RUNLOG = [];
  let r;
  try { r = TESTS[id](P, ctx, prog); }
  catch (e) {
    r = mkResult(id, { status: 'GEÇERSİZ', measured: 'Test değerlendirilemedi: ' + (e && e.message ? e.message : String(e)),
      notes: ['Analiz bir ara sonuç üretemedi (ör. geçerli kare kalmadı). Aşağıdaki geçerlilik notuna ve parametrelere bakın.'] });
    r.error = String(e && e.stack || e);
  }
  // v13.10 (§9 kararları): varsayılandan farklı dar bant kestirim hatası ya da gözlemci modeli sonucu etkileyen testlere not düşülür
  { const RS = P.dut.ctl.res || {}, FO = (P.dut.ctl.ff && P.dut.ctl.ff.obs) || {}, nonUnit = ['Fc', 'Fs', 'vs', 's0'].filter(k => FO[k] != null && FO[k] !== 1);
    if (r && Array.isArray(r.notes)) {
      if (RS.on && RS.adaptive && RS.estErr && ['T2.1', 'T2.2', 'T2.3', 'T4.2'].includes(id)) r.notes.push(`Uyarlanır dar bant tonun frekansını %${fmt(100 * RS.estErr, 1)} ${RS.estErr > 0 ? 'yüksek' : 'düşük'} kestiriyor (Model → Örnek DUT — stabilizasyon döngüsü; varsayılan 0 = ideal).`);
      if (P.dut.ctl.ff && P.dut.ctl.ff.on && nonUnit.length && ['T1.6', 'T2.4', 'T4.2', 'T2.2', 'T2.3'].includes(id)) r.notes.push(`Sürtünme gözlemcisinin modeli tesisten farklı: ${nonUnit.map(k => ({ Fc: 'F_c', Fs: 'F_s', vs: 'v_s', s0: 'σ0' })[k] + ' × ' + fmt(FO[k], 3)).join(', ')} (Model → Örnek DUT — stabilizasyon döngüsü; varsayılan 1 = tam bilgi).`);
    } }
  const log = RUNLOG || []; RUNLOG = null;
  // v13.7 (§7): en uzun stab AÇIK video kaydı (izleyicisiz, dönüşsüz laboratuvar koşuları) — kompanzasyon kapalıyken hangi testlerin
  // hedefi alandan kaçıracağı Model → Dünya dönüşü panelinde bu süreden belirlenir (önceden sabit liste: T2.1 eksikti)
  const stabRuns = log.filter(q => q.isLab && q.stab && q.frames > 0 && !q.slew && !q.tracker);
  r.recT = { stabMax: stabRuns.length ? Math.max(...stabRuns.map(q => q.T)) : 0, n: stabRuns.length };
  const lost = log.filter(q => q.isLab && q.stab && q.frames > 0 && q.invalid > 0 && !q.slew);
  if (lost.length && !FOV_LOSS_EXPECTED.has(id)) {
    const q = lost.reduce((a, b) => (b.invalid / b.frames > a.invalid / a.frames ? b : a));
    const d = derive(P), es = earthSheet(P), compOff = lost.some(z => !z.comp);
    const frac = 100 * (1 - q.invalid / q.frames);
    const short = `hedef t = ${fmt(q.firstInvalidT, 0)} s'de görüş alanından çıktı (geçerli kare %${fmt(frac, 1)})`;
    const msg = `Hedef t = ${fmt(q.firstInvalidT, 0)} s'de görüş alanından çıktı (${q.label}: geçerli kare %${fmt(frac, 1)}).` +
      (compOff ? ` Dünya dönüşü kompanzasyonu kapalı (Model → Dünya dönüşü): eylemsiz LOS laboratuvara göre yatay ${fmt(es.h, 1)} / düşey ${fmt(es.v, 1)} µrad/s kayar ve hedef ≈ ${fmt(es.off.exit, 0)} s'de alanı terk eder. Uzun kayıtlarda kompanzasyon açık olmalı; T0.7 bu testin ön şartıdır.` : ' Bu noktadan sonraki kareler değerlendirmeye alınmadı.');
    r.notes = [msg].concat(r.notes || []);
    r.validity = { lostFrom: q.firstInvalidT, validPct: frac, compOff };
    if (compOff && id !== 'T0.7') { r.status = 'GEÇERSİZ'; r.measured = `Kayıt geçersiz: ${short}; dünya dönüşü kompanzasyonu kapalı. Geçerli kalan segmentler: ` + r.measured; r.fill = {}; }
  }
  r.elapsed = (Date.now() - t0) / 1000;
  return r;
}

// ============================================================================
// 06_tests_d.js — proje LOS kalıntı gereksinimleri (v12): limitler, metrik tanımları, dış kamera takip döngüsü, T1.9
// ============================================================================
// Kalıntı e(t) = gerçek görüş hattı − olması gereken yön (laboratuvarda kolimatör), görüntü çerçevesinde: El ve Az ≡
// çapraz yükseliş (Δaz·cos El). Zaman alanı metrikleri 0,1 Hz sıfır fazlı yüksek geçirenden (iki geçişli 2. derece
// Butterworth, f_HP'de −6 dB) ve Tw pencerelerinde doğrusal trend çıkarıldıktan sonra hesaplanır; PSD tüm kayıttan.

// tek taraflı %95 Student t çarpanı (serbestlik derecesi 1…30; üstü için yaklaşık)
const T95 = [6.314, 2.920, 2.353, 2.132, 2.015, 1.943, 1.895, 1.860, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761, 1.753, 1.746, 1.740, 1.734, 1.729, 1.725,
  1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697];
function t95(df) { return df < 1 ? NaN : (df <= 30 ? T95[df - 1] : 1.6449 + 1.6 / df); }
const DEC_TXT = { ust95: 'pencere RMS\'lerinin %95 üst güven sınırı', enkotu: 'en kötü 60 s pencere', ortalama: 'havuzlanmış RMS' };

// proje limitleri (rad) — IFOV oranlarından; PSD bant tahsisleri eksen sınırının payları
function losLimits(P) {
  const d = derive(P), L = P.ana.los, IF = d.IFOV, el = L.kEl * IF, az = L.kAz * IF, b = L.bands;
  const alloc = (s) => L.share.map(q => q * s), mask = (a) => a.map((v, i) => v / Math.sqrt(b[i + 1] - b[i]));
  const aEl = alloc(el), aAz = alloc(az), tf = Math.sqrt(L.toneFrac);
  return { IF, vec: L.kVec * IF, el, az, ppvEl: L.kPPV * el, ppvAz: L.kPPV * az, rev: L.kRev * IF, p9973: L.k9973 * IF, exp: L.kExp * IF,
    Texp: L.Texp_ms * 1e-3, bands: b.slice(), allocEl: aEl, allocAz: aAz, maskEl: mask(aEl), maskAz: mask(aAz),
    toneEl: aEl.map(v => v * tf), toneAz: aAz.map(v => v * tf), rssEl: Math.hypot(...aEl), rssAz: Math.hypot(...aAz),
    mtfExp: Math.exp(-sq(Math.PI) * sq(L.kExp) / 2), vecAxes: Math.hypot(el, az) };
}
// sıfır fazlı yüksek geçiren: 2. derece Butterworth ileri + geri (toplam 4. derece, f_c'de |H| = 0,5). Her geçiş ucundaki
// değerin DC kararlı durumundan başlar; uçta kalan geçici rejim e^(−ω_c t/√2) ile söner (0,1 Hz'de 21 s'de 10⁻⁴). Yansımalı
// dolgu salınımlı sinyalde yerel ortalamayı kaydırdığından (tek yansıma) ya da eğimi kırdığından (çift yansıma) bunu
// gidermez; bu yüzden metrikler kaydın başından skip, sonundan hpTail(f_c) kadarını atar (V&V G1).
function filtfiltHP(x, fs, fc) {
  const n = x.length, y = new Float64Array(n);
  if (!(fc > 0) || n < 4) { for (let i = 0; i < n; i++) y[i] = x[i]; return y; }
  const a = bqHP(fc, fs); a.reset(x[0]); for (let i = 0; i < n; i++) y[i] = a.step(x[i]);
  const b = bqHP(fc, fs); b.reset(y[n - 1]); for (let i = n - 1; i >= 0; i--) y[i] = b.step(y[i]);
  return y;
}
const hpTail = (fc) => (fc > 0 ? Math.max(5, 2.1 / fc) : 0);      // s: uç geçici rejiminin 10⁻⁴'e sönmesi (ω_c/√2 sönüm hızı)
// pencere RMS'lerinin özeti: havuzlanmış RMS, ortalama, std, en kötü, tek taraflı %95 üst güven sınırı
function winStats(vals) {
  const n = vals.length, pooled = Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / n), m = vals.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((s, v) => s + sq(v - m), 0) / (n - 1)) : 0;
  return { n, pooled, mean: m, sd, worst: Math.max(...vals), u95: n > 1 ? pooled + t95(n - 1) * sd / Math.sqrt(n) : pooled };
}
const decideStat = (w, mode) => (mode === 'enkotu' ? w.worst : (mode === 'ortalama' ? w.pooled : w.u95));
const nsegFor = (fs) => { let n = 8; while (n < 30 * fs) n *= 2; return n; };      // ≥ 30 s segment → Δf ≤ 0,033 Hz
// zaman alanı metrikleri (yüksek hızlı gerçek LOS ya da 50 fps video): σ, PPV, P99,73
function losTimeMetrics(el, xel, fs, L, skip) {
  const i0 = Math.min(el.length - 1, Math.round(skip * fs)), i1 = Math.max(i0 + 1, el.length - Math.round(hpTail(L.fHP) * fs));
  const hE = filtfiltHP(el, fs, L.fHP).subarray(i0, i1), hX = filtfiltHP(xel, fs, L.fHP).subarray(i0, i1);
  const W = Math.round(L.Tw * fs), nW = Math.floor(hE.length / W);
  if (nW < 1) throw new Error(`kayıt (${(hE.length / fs).toFixed(0)} s, uçlar atıldıktan sonra) ${L.Tw} s penceresinden kısa`);
  const dE = new Float64Array(nW * W), dX = new Float64Array(nW * W), win = [];
  for (let k = 0; k < nW; k++) {
    const e = detrend(hE.subarray(k * W, (k + 1) * W), 'linear'), x = detrend(hX.subarray(k * W, (k + 1) * W), 'linear');
    dE.set(e, k * W); dX.set(x, k * W);
    let a = Infinity, b = -Infinity, c = Infinity, dd = -Infinity;
    for (let i = 0; i < W; i++) { if (e[i] < a) a = e[i]; if (e[i] > b) b = e[i]; if (x[i] < c) c = x[i]; if (x[i] > dd) dd = x[i]; }
    const rE = aRms(e), rX = aRms(x);
    win.push({ el: rE, xel: rX, vec: Math.hypot(rE, rX), ppEl: b - a, ppXel: dd - c });
  }
  const rad = new Float64Array(dE.length); for (let i = 0; i < rad.length; i++) rad[i] = Math.hypot(dE[i], dX[i]);
  const sEl = winStats(win.map(w => w.el)), sXel = winStats(win.map(w => w.xel)), sVec = winStats(win.map(w => w.vec));
  const ppEl = Math.max(...win.map(w => w.ppEl)), ppXel = Math.max(...win.map(w => w.ppXel));
  return { nW, Tw: L.Tw, win, sEl, sXel, sVec, ppEl, ppXel, rEl: ppEl / sEl.pooled, rXel: ppXel / sXel.pooled,
    p9973: { el: aPctAbs(dE, 99.73), xel: aPctAbs(dX, 99.73), rad: aPctAbs(rad, 99.73) }, dE, dX };
}
// pozlama içi: her kare (1/fps aralık) için T_e penceresinde pencere ortalamasına göre RMS
function exposureMetrics(dE, dX, fs, fps, Te) {
  const nE = Math.max(2, Math.round(Te * fs)), step = fs / fps, aE = [], aX = [];
  for (let s0 = 0; Math.round(s0) + nE <= dE.length; s0 += step) {
    const i = Math.round(s0);
    for (const [d, A] of [[dE, aE], [dX, aX]]) { let m = 0; for (let q = 0; q < nE; q++) m += d[i + q]; m /= nE; let v = 0; for (let q = 0; q < nE; q++) v += sq(d[i + q] - m); A.push(Math.sqrt(v / nE)); }
  }
  const qm = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  return { el: qm(aE), xel: qm(aX), p99El: aPctAbs(aE, 99), p99Xel: aPctAbs(aX, 99), maxEl: Math.max(...aE), maxXel: Math.max(...aX), n: aE.length, Te };
}
// beklenen pozlama içi varyans = ∫ S(f)·[1 − sinc²(πfT_e)] df (durağan süreç; karelerin karesel ortalamasına eşit)
function expFromPSD(f, S, df, Te) {
  let s = 0; for (let j = 1; j < f.length; j++) { const x = Math.PI * f[j] * Te, sc = x === 0 ? 1 : Math.sin(x) / x; s += S[j] * (1 - sc * sc) * df; }
  return Math.sqrt(s);
}
// tek eksen PSD analizi: bant RMS (f_HP altı ayrıca), ayrık tonlar (±1 Hz yerel ortancanın ≥ 10 katı, f ≥ toneMin),
// ton çıkarılmış geniş bant spektrumun maske oranı, f_HP'den kümülatif RMS (log ızgara) ve seyreltilmiş ASD (görüntüleme)
function psdAxis(Pp, lim, ax, L) {
  const f = Pp.f, S = Pp.P, df = Pp.df, n = f.length, b = lim.bands, fTop = b[b.length - 1];
  const mask = ax === 'el' ? lim.maskEl : lim.maskAz, tl = ax === 'el' ? lim.toneEl : lim.toneAz;
  const half = Math.max(8, Math.round(1.0 / df)), ex = 4, jLo = Math.max(2, Math.ceil(L.toneMin / df)), jHi = Math.min(n - 3, Math.floor(fTop / df));
  const bg = new Float64Array(n), buf = [];
  for (let j = jLo; j <= jHi; j++) {
    buf.length = 0;
    for (let q = j - half; q <= j + half; q++) { if (q < 1 || q >= n || Math.abs(q - j) <= ex) continue; buf.push(S[q]); }
    buf.sort((a, c) => a - c); bg[j] = buf.length ? buf[buf.length >> 1] : S[j];
  }
  const raw = [];
  for (let j = jLo; j <= jHi; j++) {
    if (!(S[j] > 10 * bg[j] && S[j] >= S[j - 1] && S[j] >= S[j + 1])) continue;
    const prev = raw[raw.length - 1];
    if (prev && j - prev.j <= 2 * ex) { if (S[j] > S[prev.j]) raw.pop(); else continue; }
    let e = 0; for (let q = j - 3; q <= j + 3; q++) e += Math.max(0, S[q] - bg[j]) * df;
    raw.push({ j, f: f[j], rms: Math.sqrt(e) });
  }
  const isTone = new Uint8Array(n); for (const t of raw) for (let q = t.j - 3; q <= t.j + 3; q++) isTone[q] = 1;
  const bandOf = (fq) => { for (let i = 0; i < b.length - 1; i++) if (fq >= b[i] && fq < b[i + 1]) return i; return -1; };
  const tones = raw.map(t => { const i = bandOf(t.f); return { f: t.f, rms: t.rms, band: i, lim: i >= 0 ? tl[i] : NaN }; })
    .filter(t => t.rms >= 0.02e-6).sort((a, c) => c.rms - a.rms).slice(0, 10);
  const bandR = (fa, fb) => { let s = 0; for (let j = 1; j < n; j++) if (f[j] >= fa && f[j] < fb) s += S[j] * df; return Math.sqrt(s); };
  const bands = []; for (let i = 0; i < b.length - 1; i++) bands.push(bandR(b[i], b[i + 1]));
  const mr = [];
  for (let i = 0; i < b.length - 1; i++) {
    let r = 0, fr = NaN;
    for (let j = 1; j < n; j++) { if (f[j] < b[i] || f[j] >= b[i + 1]) continue; const v = isTone[j] ? bg[j] : S[j], a = Math.sqrt(v) / mask[i]; if (a > r) { r = a; fr = f[j]; } }
    mr.push({ r, f: fr });
  }
  // kümülatif RMS (f_HP'den), log ızgara
  const cum = new Float64Array(n); { let s = 0; for (let j = 1; j < n; j++) { if (f[j] >= b[0]) s += S[j] * df; cum[j] = s; } }
  const NG = 300, g0 = Math.log(b[0]), g1 = Math.log(Math.min(f[n - 1], fTop)), cf = [], cv = [];
  let k = 1; for (let i = 0; i <= NG; i++) { const fq = Math.exp(g0 + (g1 - g0) * i / NG); while (k < n - 1 && f[k + 1] <= fq) k++; cf.push(fq); cv.push(Math.sqrt(cum[k])); }
  const dp = logDecimPSD(f, S, 220, Math.max(f[1], b[0] / 2));
  return { bands, below: bandR(0, b[0]), above: bandR(fTop, Infinity), total: bandR(0, Infinity), tones, mask: mr,
    cum: { f: cf, v: cv }, asd: { f: Array.from(dp.f), a: Array.from(dp.P, v => Math.sqrt(v)) } };
}
// yüksek hızlı gerçek LOS (opt_el, opt_xel) kaydından tüm proje metrikleri
function losReqMetrics(P, el, xel, fs, opt) {
  opt = opt || {};
  const L = P.ana.los, lim = losLimits(P), d = derive(P), skip = opt.skip == null ? L.skip : opt.skip, fps = opt.fps || d.fps;
  const tm = losTimeMetrics(el, xel, fs, L, skip);
  const exp = exposureMetrics(tm.dE, tm.dX, fs, fps, lim.Texp);
  const i0 = Math.min(el.length - 1, Math.round(skip * fs)), nseg = nsegFor(fs);
  const PE = welch(detrend(el.subarray(i0), 'linear'), fs, nseg), PX = welch(detrend(xel.subarray(i0), 'linear'), fs, nseg);
  const pe = psdAxis(PE, lim, 'el', L), px = psdAxis(PX, lim, 'xel', L);
  delete tm.dE; delete tm.dX;
  // karar değeri: karelerin karesel ortalamasının beklenen değeri ∫S·(1 − sinc²) (faz ortalaması). Zaman alanı kestirimi
  // (kare başına RMS dağılımı: P99, en büyük) bir gerçekleşmedir: kare hızına kilitli tonlarda (50 Hz yardımcı makine,
  // 50 fps) her kare aynı fazı görür ve sonuç faza göre faz ortalamasının 0,57–1,30 katıdır (V&V G4)
  const expPsd = { el: expFromPSD(PE.f, PE.P, PE.df, lim.Texp), xel: expFromPSD(PX.f, PX.P, PX.df, lim.Texp) };
  const expOut = Object.assign({}, exp, { el: expPsd.el, xel: expPsd.xel, tdEl: exp.el, tdXel: exp.xel });
  // v13.12 (§12): aynı tayfta Gauss bir sürecin beklenen PPV/σ oranı (Rice): sıfır geçiş hızı ν0 = √(m2/m0) (f ≥ f_HP), pencerelerin
  // toplam süresinde en büyük tepe-tepe ≈ 2σ·√(2 ln(ν0·n_W·T_w)). Bağımsız Monte Carlo ile %3 içinde (k14/limits_ref.py)
  const rice = (Pp) => { let m0 = 0, m2 = 0; for (let j = 1; j < Pp.f.length; j++) if (Pp.f[j] >= L.fHP) { m0 += Pp.P[j] * Pp.df; m2 += sq(Pp.f[j]) * Pp.P[j] * Pp.df; }
    const nu = m0 > 0 ? Math.sqrt(m2 / m0) : NaN, N = nu * tm.nW * L.Tw; return { nu, r: N > 1 ? 2 * Math.sqrt(2 * Math.log(N)) : NaN }; };
  const gE = rice(PE), gX = rice(PX);
  return Object.assign(tm, { fs, T: el.length / fs - skip, exp: expOut, expPsd, pe, px, df: PE.df, gauss: { el: gE.r, xel: gX.r, nuEl: gE.nu, nuXel: gX.nu } });
}
// video (50 fps, ölçülen: centroid gürültüsü, piksel fazı, hava dahil) ile aynı zaman alanı tanımı
function losVideoMetrics(P, R, ctx, skip) {
  const v = videoAngles(R, ctx), fps = R.video.fps, n = v.t.length, el = new Float64Array(n), xel = new Float64Array(n);
  let le = 0, lx = 0; for (let i = 0; i < n; i++) { if (v.ok[i]) { le = v.el[i]; lx = v.xel[i]; } el[i] = le; xel[i] = lx; }   // geçersiz kare: son geçerli değer
  const tm = losTimeMetrics(el, xel, fps, P.ana.los, skip); delete tm.dE; delete tm.dX;
  return tm;
}
// kabul denetimleri (seçili karar kuralı)
function losChecks(m, lim, L) {
  const ds = (w) => decideStat(w, L.decide), c = [];
  const add = (key, name, v, l) => c.push({ key, name, v, lim: l, ok: v <= l * (1 + 1e-12) });
  add('sEl', 'σ_El', ds(m.sEl), lim.el); add('sAz', 'σ_Az', ds(m.sXel), lim.az); add('sVec', 'σ_vek', ds(m.sVec), lim.vec);
  add('ppEl', 'PPV El', m.ppEl, lim.ppvEl); add('ppAz', 'PPV Az', m.ppXel, lim.ppvAz); add('p9973', 'P99,73 radyal', m.p9973.rad, lim.p9973);
  add('expEl', 'Pozlama içi El', m.exp.el, lim.exp); add('expAz', 'Pozlama içi Az', m.exp.xel, lim.exp);
  const bn = lim.bands;
  for (let i = 0; i < bn.length - 1; i++) { add('bEl' + i, `Bant ${bn[i]}–${bn[i + 1]} Hz El`, m.pe.bands[i], lim.allocEl[i]); add('bAz' + i, `Bant ${bn[i]}–${bn[i + 1]} Hz Az`, m.px.bands[i], lim.allocAz[i]); }
  const worstTone = (T) => T.filter(t => t.band >= 0).reduce((a, t) => (!a || t.rms / t.lim > a.rms / a.lim ? t : a), null);
  const te = worstTone(m.pe.tones), tx = worstTone(m.px.tones);
  if (te) add('tEl', `Ton El ${te.f.toFixed(2)} Hz`, te.rms, te.lim);
  if (tx) add('tAz', `Ton Az ${tx.f.toFixed(2)} Hz`, tx.rms, tx.lim);
  return c;
}
// sonuçların taşınabilir özeti (sayılar ve kısa diziler; ön hesap ve Web Worker için)
function losSummary(m, extra) {
  const ax = (q) => ({ bands: q.bands, below: q.below, above: q.above, total: q.total, tones: q.tones, mask: q.mask });
  return Object.assign({ fs: m.fs, T: m.T, nW: m.nW, sEl: m.sEl, sXel: m.sXel, sVec: m.sVec, ppEl: m.ppEl, ppXel: m.ppXel, rEl: m.rEl, rXel: m.rXel, p9973: m.p9973,
    exp: m.exp, expPsd: m.expPsd, gauss: m.gauss || null, el: ax(m.pe), xel: ax(m.px), cum: { f: m.pe.cum.f, el: m.pe.cum.v, xel: m.px.cum.v }, asd: { f: m.pe.asd.f, el: m.pe.asd.a, xel: m.px.asd.a } }, extra || {});
}
// işletme ayrıştırması satırı: PSD'den bant RMS'leri ve pozlama içi RMS (kaynak katkı tablosu)
function losRowFields(P, psd) {
  const L = P.ana.los, lim = losLimits(P), f = psd.f, df = psd.df, b = lim.bands, o = {};
  for (const [ax, S] of [['El', psd.el], ['Xel', psd.xel]]) {
    const bandR = (fa, fb) => { let s = 0; for (let j = 1; j < f.length; j++) if (f[j] >= fa && f[j] < fb) s += S[j] * df; return Math.sqrt(s); };
    o['qLo' + ax] = bandR(0, b[0]); o['qHp' + ax] = bandR(b[0], Infinity);
    for (let i = 0; i < b.length - 1; i++) o['qB' + i + ax] = bandR(b[i], b[i + 1]);
    o['qExp' + ax] = expFromPSD(f, S, df, lim.Texp);
  }
  return o;
}
// dış kamera takip döngüsü (analitik): hız komutu PI, L(s) = K(1 + W_i/s)/s · e^(−sτ); τ = T_int/2 + n_gecikme·T_kare + T_kare/2
function trkModel(P) {
  const L = P.ana.los, T = L.trk, d = derive(P), Tf = 1 / d.fps, K = TAU * T.bw, Wi = K / 4;
  const tau = d.Tint / 2 + T.lat_frames * Tf + Tf / 2;
  const Lf = (fq) => { const w = TAU * fq, s = C(0, w); return cmul(cmul(cdiv(C(K), s), cadd(C(1), cdiv(C(Wi), s))), cexpj(-w * tau)); };
  const S = (fq) => cdiv(C(1), cadd(C(1), Lf(fq))), Tc = (fq) => cdiv(Lf(fq), cadd(C(1), Lf(fq)));
  let lo = 0.01 * T.bw, hi = 100 * T.bw; for (let it = 0; it < 80; it++) { const m = Math.sqrt(lo * hi); if (cabs(Lf(m)) > 1) lo = m; else hi = m; }
  const fc = Math.sqrt(lo * hi), wc = TAU * fc, pm = 90 - Math.atan(Wi / wc) * R2D - wc * tau * R2D;
  let sPk = 0, fPk = NaN, f0 = NaN;
  for (let fq = 0.02; fq <= d.fps / 2; fq *= 1.005) { const a = cabs(S(fq)); if (a > sPk) { sPk = a; fPk = fq; } if (isNaN(f0) && a >= 1) f0 = fq; }
  // |L| tek kesimli ve azalan: faz payı > 0 ⇔ kapalı döngü kararlı (Nyquist). PM(bw) bant arttıkça azalır → verilen τ için
  // 30° faz payını veren en büyük bant (ikiye bölme; K = 2π·bw, W_i = K/4 yapısı korunur)
  const pmOf = (bw) => { const k = TAU * bw, wi = k / 4, mag = (w) => k / w * Math.hypot(1, wi / w); let a = 1e-3, b = 1e4; for (let it = 0; it < 90; it++) { const m = Math.sqrt(a * b); if (mag(m) > 1) a = m; else b = m; } const wc = Math.sqrt(a * b); return 90 - Math.atan(wi / wc) * R2D - wc * tau * R2D; };
  let lo2 = 0.01, hi2 = 50; for (let it = 0; it < 60; it++) { const m = Math.sqrt(lo2 * hi2); if (pmOf(m) > 30) lo2 = m; else hi2 = m; }
  return { bw: T.bw, lat: T.lat_frames, K, Wi, tau, fc, pm, stable: pm > 0, bw30: Math.sqrt(lo2 * hi2), sPk, fPk, f0, S, Tc, L: Lf };
}

// T1.9 — proje LOS kalıntı gereksinimleri (laboratuvar kabulü): deniz profili, takip öncesi / sonrası aynı tohumla
TESTS['T1.9'] = function (P, ctx, prog) {
  const L = P.ana.los;
  if (!L || L.on === false) return mkResult('T1.9', { status: 'BİLGİ', measured: 'Proje LOS kalıntı değerlendirmesi kapalı (Model → Proje LOS kalıntı gereksinimleri).', notes: ['Değerlendirme kapalıyken (ör. v10 uyum kipinde) bu test koşulmaz.'] });
  const lim = losLimits(P), T = L.T || 645, fsR = 2000, tk = trkModel(P), runs = {};
  // takip döngüsü analitik olarak kararsızsa (faz payı ≤ 0) takip sonrası koşu anlamsızdır (LOS sürüklenir): yalnız takip öncesi
  const keys = tk.stable ? ['once', 'sonra'] : ['once'];
  let clip = 0;          // hexapod θ/ω/α sınırı aşımı (iki koşu aynı tohum ve profil)
  keys.forEach((k, i) => {
    const extra = { rec: { fs: fsR, ch: ['opt_el', 'opt_xel'] } };
    if (k === 'sonra') extra.tracker = { bw: L.trk.bw, lat_frames: L.trk.lat_frames, gate_px: L.trk.gate_px };
    const S = seaLabScenario(P, { T, seed: 1901, extra }), R = runSim(P, S, (p) => prog && prog((i + p) / keys.length));
    if (i === 0) clip = hexLimitCheck(P, S).clipFrac;
    const m = losReqMetrics(P, R.rec.opt_el, R.rec.opt_xel, R.meta.fRec, { skip: L.skip });
    runs[k] = { m, v: losVideoMetrics(P, R, ctx, L.skip), lost: (R.stats && R.stats.trackLost) || 0, q: S.seaQ };
  });
  const bk0 = L.basis === 'once' ? 'once' : 'sonra', bk = runs[bk0] ? bk0 : 'once', B = runs[bk].m, checks = losChecks(B, lim, L), bad = checks.filter(q => !q.ok);
  const lostPost = runs.sonra ? runs.sonra.lost : 0, ds = (w) => decideStat(w, L.decide);
  const u = (x, n) => fmt(x * 1e6, n == null ? 2 : n), ti = turInfo(P), tgt = P.wb.TUR_target, fpsT = derive(P).fps;
  // v13.7 (K2): karar belirsizliği — havuzlanmış RMS ± U (pencereler arası sd/√n ⊕ kalibre ölçek); karar büyüklüğü gerçek optik LOS'tur,
  // videoyla ölçülseydi düzeltilmemiş toplanır taban (eksen u_v,top, vektör √2·u_v,top) yanlılık olarak eklenirdi
  const srG = scaleRelOf(P, ctx), fG = ti.uvAdd * URAD;
  const gW = (w, R, nm, fl) => decisionGuard(P, { x: w.pooled, R, uStat: w.n > 1 ? w.sd / Math.sqrt(w.n) : 0, rel: [srG], floor: fl, floorMode: 'add', label: nm });
  const G19 = [gW(B.sEl, lim.el, 'σ_El', fG), gW(B.sXel, lim.az, 'σ_Az', fG), gW(B.sVec, lim.vec, 'σ_vek', Math.SQRT2 * fG)];
  const unstTxt = `dış kamera takip döngüsü kararsız (faz payı ${fmt(tk.pm, 1)}°: ${fpsT} fps, ${L.trk.lat_frames} kare gecikme, bant ${L.trk.bw} Hz; 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz) — takip sonrası koşulmadı`;
  const st = clip > 0 ? 'GEÇERSİZ' : (!tk.stable && bk0 === 'sonra' ? 'GEÇERSİZ' : (lostPost > 0 && bk === 'sonra' ? 'GEÇERSİZ' : (bad.length ? 'AŞIM' : 'OK')));
  const runKv = (k, nm) => { const m = runs[k].m, v = runs[k].v;
    return [[`${nm}: σ_El / σ_Az / σ_vek (havuz · %95 üst · en kötü pencere)`, `${u(m.sEl.pooled)} · ${u(m.sEl.u95)} · ${u(m.sEl.worst)} / ${u(m.sXel.pooled)} · ${u(m.sXel.u95)} · ${u(m.sXel.worst)} / ${u(m.sVec.pooled)} · ${u(m.sVec.u95)} · ${u(m.sVec.worst)} µrad`],
      [`${nm}: PPV El / Az (en kötü pencere) · PPV/σ`, `${u(m.ppEl, 1)} / ${u(m.ppXel, 1)} µrad · ${fmt(m.rEl, 2)} / ${fmt(m.rXel, 2)} (aynı tayfta Gauss süreç beklentisi ${m.gauss ? fmt(m.gauss.el, 1) + ' / ' + fmt(m.gauss.xel, 1) : '—'}; sınır ${L.kPPV}·σ)`],
      [`${nm}: P99,73 El / Az / radyal`, `${u(m.p9973.el)} / ${u(m.p9973.xel)} / ${u(m.p9973.rad)} µrad (3σ: ${u(3 * m.sEl.pooled)} / ${u(3 * m.sXel.pooled)})`],
      [`${nm}: pozlama içi (${L.Texp_ms} ms) El / Az`, `karesel ortalama ${u(m.exp.el)} / ${u(m.exp.xel)} µrad (∫S·(1 − sinc²); zaman alanı ${u(m.exp.tdEl)} / ${u(m.exp.tdXel)}) · kare başına P99 ${u(m.exp.p99El)} / ${u(m.exp.p99Xel)} · en büyük ${u(m.exp.maxEl)} / ${u(m.exp.maxXel)} µrad`],
      [`${nm}: bant RMS El (Az) µrad`, lim.bands.slice(0, -1).map((b0, i) => `${b0}–${lim.bands[i + 1]} Hz ${u(m.pe.bands[i])} (${u(m.px.bands[i])})`).join(' · ') + ` · ${L.fHP} Hz altı ${u(m.pe.below)} (${u(m.px.below)})`],
      [`${nm}: ayrık tonlar (El)`, m.pe.tones.length ? m.pe.tones.slice(0, 5).map(t => `${fmt(t.f, 2)} Hz ${u(t.rms)}${t.band >= 0 ? (t.rms > t.lim ? ' > ' : ' ≤ ') + u(t.lim) : ''}`).join(' · ') : 'yok'],
      [`${nm}: video ile ölçülen (50 fps, gürültü dahil) σ_El / σ_Az / σ_vek · PPV`, `${u(v.sEl.pooled)} / ${u(v.sXel.pooled)} / ${u(v.sVec.pooled)} µrad · ${u(v.ppEl, 1)} / ${u(v.ppXel, 1)} µrad`]]; };
  const res = mkResult('T1.9', {
    status: st,
    measured: (clip > 0 ? `Komut edilen deniz profili hexapodun θ/ω/α sınırlarını aşıyor (aşım süresi oranı %${fmt(clip * 100, 1)}): sonuç GEÇERSİZ. ` : '') + (!tk.stable ? `${unstTxt[0].toUpperCase()}${unstTxt.slice(1)}. ` : '') + `${bk === 'sonra' ? 'Takip sonrası' : 'Takip öncesi'} (${DEC_TXT[L.decide]}): σ_vek ${u(ds(B.sVec))} µrad (sınır ${u(lim.vec)}), σ_El ${u(ds(B.sEl))} / σ_Az ${u(ds(B.sXel))}, PPV ${u(B.ppEl, 1)} / ${u(B.ppXel, 1)}, P99,73 ${u(B.p9973.rad, 1)}, pozlama içi ${u(B.exp.el)} / ${u(B.exp.xel)} µrad; ` +
      (lostPost > 0 ? `takip kilidi ${lostPost} kez kayboldu — takip sonrası değerlendirme geçersiz` : (bad.length ? 'aşan: ' + bad.map(q => q.name).join(', ') : 'tüm ölçütler sağlandı')),
    kv: [[`Gereksinim seti (IFOV = ${u(lim.IF)} µrad)`, `σ_vek ≤ ${u(lim.vec)}, σ_El ≤ ${u(lim.el)}, σ_Az ≤ ${u(lim.az)} (√(El² + Az²) = ${u(lim.vecAxes)}), PPV ≤ ${u(lim.ppvEl, 1)} / ${u(lim.ppvAz, 1)} (${L.kPPV}·σ), geçiş PPV ≤ ${u(lim.rev, 1)} (T1.6), P99,73 radyal ≤ ${u(lim.p9973, 1)}, pozlama içi ≤ ${u(lim.exp)} µrad (MTF_jitter ≥ ${fmt(lim.mtfExp, 3)})`],
         ['Ön işlem ve karar', `${L.fHP} Hz sıfır fazlı yüksek geçiren + ${L.Tw} s pencerede doğrusal trend; ${B.nW} pencere (${T} s; süzgeç uç geçici rejimi için baştan ${L.skip} s, sondan ${fmt(hpTail(L.fHP), 0)} s atıldı), gerçek optik LOS ${fsR} Hz; karar: σ için ${DEC_TXT[L.decide]}, PPV en kötü pencere, P99,73 havuzlanmış, pozlama karelerin karesel ortalaması; temel: ${bk === 'sonra' ? 'dış kamera takip döngüsü sonrası' : 'takip öncesi (stabilizasyon çıkışı)'}`],
         ['Dış kamera takip döngüsü', (!tk.stable ? 'KARARSIZ — ' : '') + `PI hız komutu, bant ${L.trk.bw} Hz, ${L.trk.lat_frames} kare gecikme (pozlama ortasından komuta ≈ ${fmt(tk.tau * 1e3, 1)} ms; ${fpsT} fps); 30° faz payı için bant ≤ ${fmt(tk.bw30, 2)} Hz; kesim ${fmt(tk.fc, 2)} Hz, faz payı ${fmt(tk.pm, 1)}°, |S| tepe ${fmt(20 * Math.log10(tk.sPk), 1)} dB @ ${fmt(tk.fPk, 2)} Hz (${fmt(tk.f0, 2)} Hz üstünde büyütür); kilit kaybı ${lostPost}`]]
      .concat(runKv('once', 'Takip öncesi'), runs.sonra ? runKv('sonra', 'Takip sonrası') : [])
      .concat([['Doğrulanabilirlik (TUR, k = 1)', `video tabanı u_v = ${fmt(ti.uv, 2)} µrad/eksen → TUR σ_El ${fmt(lim.el * 1e6 / ti.uv, 2)}, σ_Az ${fmt(lim.az * 1e6 / ti.uv, 2)}, σ_vek ${fmt(lim.vec * 1e6 / (Math.SQRT2 * ti.uv), 2)}; yüksek hızlı u_h = ${fmt(ti.uh, 2)} → pozlama içi ${fmt(lim.exp * 1e6 / ti.uh, 2)}. TUR ≥ ${tgt} için taban: video ≤ ${fmt(Math.min(lim.el, lim.vec / Math.SQRT2) * 1e6 / tgt, 2)}, yüksek hızlı ≤ ${fmt(lim.exp * 1e6 / tgt, 2)} µrad/eksen`]])
      .concat(runs.sonra && P.wb.chain.pixlock_px > 0 ? (() => { const pp = pixPhaseInfo(P, ctx);       // v13.6: piksel fazı, takip noktayı sabit tutar
        return [['Piksel fazı: takip hedef noktasını sabit tutar', `sub-piksel faz xel ${fmt(pp.phX, 2)} / el ${fmt(pp.phY, 2)} → video küçük hareketleri ×${fmt(pp.gX, 3)} / ×${fmt(pp.gY, 3)} ölçer (S-eğrisi ${pp.src === 'T0.1' ? 'T0.1 kestirimi' : 'modelden'}, genlik ${fmt(pp.amp, 4)} px; noktaya göre ×${fmt(2 - pp.gMax, 3)}–×${fmt(pp.gMax, 3)}); takip döngüsünün kazancı da bu oranda değişir`]]; })() : [])
      .concat([[`Karar belirsizliği ve koruma bandı (takip ${bk === 'sonra' ? 'sonrası' : 'öncesi'}, havuz ± U, k = ${G19[0].k}; pencereler sd/√n ⊕ kalibre ölçek)`,
        G19.map(guardTxt).join(' · ') + `; durum ${DEC_TXT[L.decide] || L.decide} ile verilir. Videoyla ölçülseydi düzeltilmemiş taban +${u(G19[0].bias)} / +${u(G19[1].bias)} / +${u(G19[2].bias)} µrad eklerdi`]])
      .concat(runs[bk].q ? [['Laboratuvar öteleme ölçeği q', fmt(runs[bk].q, 4)]] : []),
    notes: ['Kalıntı = gerçek görüş hattı − kolimatör yönü, görüntü çerçevesinde (Az ≡ çapraz yükseliş). Benzetimin gerçek optik LOS\'u 2 kHz\'te; video satırı aynı tanımı 50 fps ölçümüne uygular ve ölçüm tabanını içerir.',
      `Takip öncesi ve sonrası aynı tohumla (aynı deniz gerçekleşmesi, aynı gürültüler) koşuldu; fark yalnız dış kamera takip döngüsüdür. Takip döngüsü ${L.fHP}–${L.trk.bw} Hz bölgesini bastırır, kesim civarını büyütür (Bode duyarlılık integrali) ve video ölçüm gürültüsünü LOS'a taşır.`,
      `PPV sınırı ${L.kPPV}·σ_eksen. Gauss kalıntıda ${L.Tw} s'lik tepe-tepe/σ'nın beklentisi kaydın tayfına, örnekleme hızına ve pencere sayısına bağlıdır: 2·√(2 ln(ν0·n_W·T_w)), ν0 sıfır geçiş sıklığı (Rice / Cartwright–Longuet-Higgins); bu koşunun değeri "PPV El / Az" satırındadır. PPV/σ bundan çok büyükse kalıntı Gauss değildir (darbe, stick-slip). Geçiş (stick-slip) PPV'si ayrı ölçütle T1.6'da değerlendirilir.`,
      'P99,73 ampirik yüzdeliktir; iki boyutlu dairesel Gauss dağılımda %99,73 yarıçapı 3,44·σ_eksen = 2,43·σ_vek\'tir (3·σ_vek değil). Bant RMS\'leri PSD integralidir (tonlar dahil); maske oranı ton çıkarılmış geniş bant spektruma uygulanır; tonlar ayrı sınırla.',
      'Gereksinim bütçenin wander/smear tanımlarından farklıdır ve 6–8 kat sıkıdır; bütçe tahsisleri bu sete göre yeniden dağıtılmalıdır (Gereksinimler sekmesi).',
      'Takip sonrası koşuda hedef noktası aynı piksel konumunda tutulur; piksel fazı (S-eğrisi) yanlılığı ortalanmaz, çarpımsal olur. Noktanın sub-piksel konumu hem video ölçümünü hem takip döngüsünün kazancını değiştirir. Kullanıcı kararı (v13.7): yalnız raporlanır; sınıra yakın sonuçlarda hedef noktasının fazı ve bu kazanç kararla birlikte verilir.'],
    num: { lim, basis: bk0, decide: L.decide, checks, trk: { bw: tk.bw, lat: tk.lat, tau: tk.tau, fc: tk.fc, pm: tk.pm, stable: tk.stable, bw30: tk.bw30, sPk: tk.sPk, fPk: tk.fPk, f0: tk.f0 },
      once: losSummary(runs.once.m, { video: losVideoSummary(runs.once.v), lost: runs.once.lost }), sonra: runs.sonra ? losSummary(runs.sonra.m, { video: losVideoSummary(runs.sonra.v), lost: lostPost, q: runs.sonra.q }) : null,
      tur: { uv: ti.uv, uh: ti.uh, target: tgt }, guard: G19 },
  });
  // grafikler: kümülatif RMS + bant tahsisi merdiveni (öncesi / sonrası), ASD + düz eşdeğer maske (sonrası)
  const n1 = res.num, stairX = [], stairE = [], stairA = [], mX = [], mE = [], mA = [];
  { let cE = 0, cA = 0; for (let i = 0; i < lim.bands.length - 1; i++) { cE += sq(lim.allocEl[i]); cA += sq(lim.allocAz[i]); stairX.push(lim.bands[i], lim.bands[i + 1]); stairE.push(Math.sqrt(cE) * 1e6, Math.sqrt(cE) * 1e6); stairA.push(Math.sqrt(cA) * 1e6, Math.sqrt(cA) * 1e6);
    mX.push(lim.bands[i], lim.bands[i + 1]); mE.push(lim.maskEl[i] * 1e6, lim.maskEl[i] * 1e6); mA.push(lim.maskAz[i] * 1e6, lim.maskAz[i] * 1e6); } }
  const ur = (a) => Float32Array.from(a, v => v * 1e6), Bs = n1.sonra || n1.once;
  res.plots.push({ title: `Kümülatif RMS (${L.fHP} Hz'den) ve bant tahsisi merdiveni — takip öncesi${n1.sonra ? ' / sonrası' : ''}`, xLabel: 'Hz', yLabel: 'µrad RMS', yUnit: 'µrad', xLog: true, yLog: true,
    series: [{ name: 'El, takip öncesi', x: Float32Array.from(n1.once.cum.f), y: ur(n1.once.cum.el), slot: 0, dash: [5, 3], width: 1.4 }, { name: 'Az, takip öncesi', x: Float32Array.from(n1.once.cum.f), y: ur(n1.once.cum.xel), slot: 1, dash: [5, 3], width: 1.4 }]
      .concat(n1.sonra ? [{ name: 'El, takip sonrası', x: Float32Array.from(n1.sonra.cum.f), y: ur(n1.sonra.cum.el), slot: 0 }, { name: 'Az, takip sonrası', x: Float32Array.from(n1.sonra.cum.f), y: ur(n1.sonra.cum.xel), slot: 1 }] : [])
      .concat([{ name: 'Tahsis El (kümülatif)', x: Float32Array.from(stairX), y: Float32Array.from(stairE), color: '--crit', dash: [3, 3], width: 1.3 }, { name: 'Tahsis Az', x: Float32Array.from(stairX), y: Float32Array.from(stairA), color: '--warn', dash: [3, 3], width: 1.3 }]) });
  res.plots.push({ title: `ASD, takip ${n1.sonra ? 'sonrası' : 'öncesi'} (seyreltilmiş) ve tahsisten türetilmiş düz eşdeğer maske`, xLabel: 'Hz', yLabel: 'µrad/√Hz', yUnit: 'µrad/√Hz', xLog: true, yLog: true,
    series: [{ name: 'El', x: Float32Array.from(Bs.asd.f), y: ur(Bs.asd.el), slot: 0 }, { name: 'Az', x: Float32Array.from(Bs.asd.f), y: ur(Bs.asd.xel), slot: 1 },
      { name: 'Maske El', x: Float32Array.from(mX), y: Float32Array.from(mE), color: '--crit', dash: [3, 3], width: 1.3 }, { name: 'Maske Az', x: Float32Array.from(mX), y: Float32Array.from(mA), color: '--warn', dash: [3, 3], width: 1.3 }] });
  return res;
};
function losVideoSummary(v) { return { nW: v.nW, sEl: v.sEl, sXel: v.sXel, sVec: v.sVec, ppEl: v.ppEl, ppXel: v.ppXel, p9973: v.p9973 }; }

// ============================================================================
// 07_budget.js — analitik jitter bütçesi (kapalı biçim), ölçüm belirsizliği ve TUR, dünya dönüşü, hexapod erişimi.
// Formüller Yöntem sekmesinde; V&V W grubu bağımsız ikinci bir uygulamayla doğrular.
// ============================================================================
// v13.8 (§8): gyro eksen kaçıklığı yalnız LOS ekseni etrafındaki baz dönmesini el/xel gyrolarına sızdırır (el/xel'deki hız
// döngüyle sıfırlanır): B1-04 = ε·σ_rot. Yatay LOS'ta σ_rot² = (cos a0·σ_roll)² + (sin a0·σ_pitch)² (serbestlik dereceleri bağımsız;
// axisMap ağırlıkları); yanal bakışta pitch, pruvaya bakışta roll. 'roll' tabanı v13.7'ye kadarki tanımdır (uyum kipi).
function epsRotInfo(P) {
  const sa = seaDOF(P).ang, basis = (P.wb.H && P.wb.H.epsBasis) || 'los';
  if (basis === 'roll') return { basis, sigma: sa[0].Aeq * D2R / Math.SQRT2, f: sa[0].fdom, dom: 'roll', wR: 1, wP: 0 };
  const wR = axisMap(P, 0).rotW, wP = axisMap(P, 1).rotW, cr = wR * sa[0].sigma, cp = wP * sa[1].sigma;
  const domR = Math.abs(cr) >= Math.abs(cp);
  return { basis, sigma: Math.hypot(cr, cp), f: domR ? sa[0].fdom : sa[1].fdom, dom: domR ? 'roll' : 'pitch', wR, wP };
}
// v13.9 (§8 K2): rastgele yürüyüş satırlarının wander metriği ('window' varsayılan; 'tau' = v13.8'e kadar ve uyum kipi)
function rwWindow(P) { return ((P.wb.H && P.wb.H.rwMetric) || 'window') !== 'tau'; }
function budgetRows(P) {
  const wb = P.wb, d = derive(P), H = wb.H, tau = wb.tau, AL = budgetAlloc(P), hS = seaDrrAssume(P);
  // deniz: eşdeğer sinüs genliği (Aeq = √2·σ) ve baskın frekans; 'dar' kipinde girilen eşdeğer sinüs genliği
  const SD = seaDOF(P), sa = SD.ang, ER = epsRotInfo(P), losB = ER.basis !== 'roll';
  const E96 = H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(tau);               // ARW·√τ (µrad)
  // v13.9 (§8 K2): wander penceresi metriği — T_w penceresinde en küçük kareler doğrusu çıkarılmış Wiener sürecinin beklenen RMS'i
  // σ·√(T_w/15) (ortalama çıkarılmış: σ·√(T_w/6)); sabit hız (bias, b0, kompanzasyon artığı) doğrusal trendle tamamen çıkar
  const rwWin = rwWindow(P), Tw = P.ana.Tw, E96w = H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(Tw / 15);
  const E99 = H.bias * Math.PI / 180 / 3600 * 1e6 * tau;                       // B·τ (µrad)
  const E103 = losB ? H.eps_mrad * 1e-3 * Math.SQRT2 * ER.sigma * 1e6          // ε·θ_rot (µrad genlik; RMS ε·σ_rot)
                    : H.eps_mrad * 1e-3 * sa[0].Aeq * Math.PI / 180 * 1e6;     // v13.7'ye kadar: ε·θ_roll
  const E107 = H.roll_res_mrad * 1e-3 * d.rot.ang * 1e6;                       // ölçüt noktasının (köşe ya da kenar) yer değiştirmesi (µrad RMS); kenar = FOVh/2 (v10)
  const s = wb.sea, v = wb.viv, VS = vivSpec(P), ship = VS.kind === 'wind';
  // B2-01: denizaltında hidrodinamik VIV; gemide rüzgâr kaynaklı girdap kopmasının direk modu
  // (EN 1991-1-4 yaklaşım 1, açısal genlik; H = bütçe varsayımı DRR). Gemide B2-02 (dalga çarpması) yoktur.
  const b201 = ship
    ? { id: 'B2-01', band: 'B2', name: 'Direk modu / rüzgâr girdap kopması (VIV) artığı' + (VS.present ? '' : (VS.on ? ' — işletme zarfında kilitlenme yok' : ' — rüzgâr VIV kapalı')), E: VS.present ? VS.A * R2D : 0, F: '° genlik', G: VS.f, H: VS.H, L: 'E', M: '', Q: AL['B2-01'], S: 'T2.1, T2.2, T2.3' }
    : { id: 'B2-01', band: 'B2', name: 'Mast eğilme modu / VIV artığı' + (v.on === false ? ' — VIV kapalı' : (VS.present ? '' : ' — işletme hız zarfında kilitlenme yok')), E: VS.present ? v.amp_deg : 0, F: '° genlik', G: v.fn, H: VS.H, L: 'E', M: '', Q: AL['B2-01'], S: 'T2.1, T2.2, T2.3' };
  const b202 = ship
    ? { id: 'B2-02', band: 'B2', name: 'Dalga çarpması (geçici) — gemi direğinde yok', E: 0, F: 'µrad RMS', G: 5, H: 0, L: 'E', M: '', Q: AL['B2-02'], S: 'T2.4' }
    : { id: 'B2-02', band: 'B2', name: 'Dalga çarpması (geçici)', E: 2, F: 'µrad RMS', G: 5, H: 0, L: 'E', M: '', Q: AL['B2-02'], S: 'T2.4' };
  // ek satırlar (v11, Q = 0: tahsis proje kararıdır): deniz ötelemesi ivmesi (6-DOF + kaldıraç kolu);
  // FOG: kalibrasyon sonrası sabit bias artığı + sıcaklık kayması (B1-06 gibi τ penceresinde), g-duyarlılığı × ivme
  const ext = [];
  if (wb.extRows !== false) {
    // B1-08 frekansı: ivme terimlerinin varyansla ağırlıklı RMS frekansı (v13.1; önceden 6-DOF'ta heave, dar kipte pitch merkezi);
    // B1-10: her ivme terimi kendi baskın frekansında integre edilir, terimler karesel toplanır (accInt)
    const acc = seaAccDirector(P), DPH = Math.PI / 180 / 3600, fa = acc.fa > 0 ? acc.fa : (SD.six ? SD.lin[2].fdom : sa[1].fdom);
    ext.push({ id: 'B1-08', band: 'B1', name: 'Deniz ötelemesi ivmesi (heave/surge/sway + kaldıraç kolu)' + (acc.eff > 0 ? '' : ' — profilde öteleme yok'), E: H.accSens * acc.eff, F: 'µrad RMS', G: fa, H: 0, L: 'E', M: '', Q: 0, S: 'T2.5', ext: true });
    ext.push({ id: 'B1-09', band: 'B1', name: 'Gyro sabit bias artığı + sıcaklık kayması (τ penceresinde' + (rwWin ? '; yalnız drift)' : ')'), E: (H.b0_res + Math.abs(H.tc_bias * H.dT)) * DPH * 1e6 * tau, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: rwWin ? 'D' : 'E', M: '', Q: 0, S: 'T0.7, T4.2', ext: true });
    ext.push({ id: 'B1-10', band: 'B1', name: 'Gyro g-duyarlılığı × deniz ivmesi', E: H.kg * DPH * acc.accInt / G0 * 1e6, F: 'µrad RMS', G: fa, H: 0, L: 'E', M: '', Q: 0, S: 'T2.5', ext: true });
  }
  const out = [
    { id: 'B1-01', band: 'B1', name: 'Baz roll artığı (deniz durumu)', E: sa[0].Aeq, F: '° genlik', G: sa[0].fdom, H: hS, L: 'E', M: 'G1', Q: AL['B1-01'], S: 'T1.1, T1.3' },
    { id: 'B1-02', band: 'B1', name: 'Baz pitch artığı (deniz durumu)', E: sa[1].Aeq, F: '° genlik', G: sa[1].fdom, H: hS, L: 'E', M: '', Q: AL['B1-02'], S: 'T1.1, T1.3' },
    { id: 'B1-03', band: 'B1', name: 'Baz yaw artığı (rota / yalpalama)', E: sa[2].Aeq, F: '° genlik', G: sa[2].fdom, H: hS, L: 'E', M: '', Q: AL['B1-03'], S: 'T1.1, T1.4' },
    { id: 'B1-04', band: 'B1', name: losB ? `Gyro eksen kaçıklığı × LOS ekseni etrafındaki baz dönmesi (${ER.dom})` : 'Gyro eksen kaçıklığı × baz hareketi', E: E103, F: 'µrad genlik', G: ER.f, H: 0, L: 'E', M: 'G1', Q: AL['B1-04'], S: 'T1.1' },
    rwWin ? { id: 'B1-05', band: 'B1', name: `Gyro ARW (${Tw} s wander penceresinde, doğrusal trend çıkarılmış)`, E: E96w, F: 'µrad RMS', G: 1 / Tw, H: 0, L: 'E', M: '', Q: AL['B1-05'], S: 'T0.6, T0.2' }
          : { id: 'B1-05', band: 'B1', name: 'Gyro ARW (τ penceresinde)', E: E96, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: 'E', M: '', Q: AL['B1-05'], S: 'T0.6, T0.2' },
    { id: 'B1-06', band: 'B1', name: 'Gyro bias kararsızlığı (τ penceresinde' + (rwWin ? '; yalnız drift)' : ')'), E: E99, F: 'µrad RMS', G: 1 / (2 * tau), H: 0, L: rwWin ? 'D' : 'E', M: '', Q: AL['B1-06'], S: 'T0.6' },
    { id: 'B1-07', band: 'B1', name: 'Sürtünme / hız işaret değişimi', E: 3, F: 'µrad RMS', G: 0.25, H: 0, L: 'E', M: '', Q: AL['B1-07'], S: 'T1.6' },
    b201,
    b202,
    { id: 'B2-03', band: 'B2', name: 'Doğrusal ivme × gimbal kütle dengesizliği', E: 2, F: 'µrad RMS', G: 8, H: 0, L: 'E', M: '', Q: AL['B2-03'], S: 'T2.5' },
    { id: 'B2-04', band: 'B2', name: 'Kablo / keçe torku dalgalanması', E: 1.5, F: 'µrad RMS', G: 2, H: 0, L: 'E', M: '', Q: AL['B2-04'], S: 'T1.6, T2.1' },
    { id: 'B2-05', band: 'B2', name: 'Gyro gürültüsü (kapalı döngü bandında)', E: 0.5, F: 'µrad RMS', G: 10, H: 0, L: 'E', M: '', Q: AL['B2-05'], S: 'T0.2, T0.6' },
    { id: 'B2-06', band: 'B2', name: 'Platform çevresel titreşimi — yapı yolu', E: 2, F: 'µrad RMS', G: 15, H: 0, L: 'E', M: '', Q: AL['B2-06'], S: 'T3.1' },
    { id: 'B3-01', band: 'B3', name: 'Yardımcı makine titreşimi — yapı yolu', E: 3, F: 'µrad RMS', G: 50, H: 0, L: 'E', M: '', Q: AL['B3-01'], S: 'T3.1, T3.3' },
    { id: 'B3-02', band: 'B3', name: 'Kriyo-soğutucu mikrofoniği', E: 1.5, F: 'µrad RMS', G: 60, H: 0, L: 'E', M: '', Q: AL['B3-02'], S: 'T3.4' },
    { id: 'B3-03', band: 'B3', name: 'Optik alt montaj modları', E: 2, F: 'µrad RMS', G: 120, H: 0, L: 'E', M: '', Q: AL['B3-03'], S: 'T3.5' },
    { id: 'B3-04', band: 'B3', name: 'Gimbal yapısal rezonansı artığı', E: 1.5, F: 'µrad RMS', G: 180, H: 0, L: 'E', M: '', Q: AL['B3-04'], S: 'T2.1, T3.3' },
    { id: 'R-01', band: 'B1', name: 'Görüntü rotasyonu — ' + (d.rot.ref === 'corner' ? 'alan köşesi' : 'alan kenarı'), E: E107, F: 'µrad RMS', G: ER.f, H: 0, L: 'H', M: '', Q: wb.k_roll * d.IFOV * 1e6, S: 'T1.5' },
  ];
  // ek satırlar B1 bandının sonuna (B1-07'nin ardına) yerleşir
  if (ext.length) out.splice(out.findIndex(r => r.id === 'B1-07') + 1, 0, ...ext);
  return out;
}
// deniz frekansında DRR varsayımı (dB): B1-01…B1-03'ün analitik tahmini σ·10^(H/20); örnek DUT'un döngüsünden bağımsız bir
// bütçe varsayımıdır (varsayılan −80 dB)
function seaDrrAssume(P) { const v = P.wb.H.drrSea_dB; return v != null && isFinite(v) ? v : -80; }
// Deniz hareketinin bastırılması (B1-01…B1-03): gerekli DRR = 20·log10(tahsis/σ), bütçe varsayımı ve örnek DUT'un analitik
// döngü modeli. LOS eksenine izdüşüm axisMap ile (yanal bakışta roll → el, yaw → xel, pitch → LOS ekseni etrafında, yani
// görüntü rotasyonu). Spektrum ağırlıklı artık: σ·√(∫S|DRR|²df / ∫S df), deniz biçimi S (dar: log-Gauss, 6-DOF: bant).
function seaDrrInfo(P) {
  const d = derive(P), SD = seaDOF(P), AL = budgetAlloc(P), hS = seaDrrAssume(P), ids = ['B1-01', 'B1-02', 'B1-03'];
  return SD.ang.map((q, ax) => {
    const m = axisMap(P, ax), loop = m.los === 'el' ? d.loopEl : (m.los === 'xel' ? d.loopAz : null), al = AL[ids[ax]] * 1e-6;
    let dom = NaN, wres = NaN;
    if (loop && q.active) {
      dom = db(cabs(loop.drr(TAU * q.fdom)));
      let s0 = 0, s1 = 0;
      for (let f = q.fdom / 20; f <= q.fdom * 20; f *= 1.01) { const w = q.shape(f) * f; s0 += w; s1 += w * sq(cabs(loop.drr(TAU * f))); }
      wres = s0 > 0 ? q.sigma * Math.sqrt(s1 / s0) : NaN;
    }
    return { key: q.key, row: ids[ax], los: m.los, f: q.fdom, sigma: q.sigma, active: q.active, alloc: al,
      req: q.active ? 20 * Math.log10(al / q.sigma) : NaN, assume: hS, est: q.sigma * Math.pow(10, hS / 20), dom, wres };
  });
}
// measured: {id: µrad RMS} — doldurulursa "Kullanılan" (K) ölçülen değere geçer
function computeBudget(P, measured, opt) {
  opt = opt || {};
  const wb = P.wb, d = derive(P), T = d.Tint, ff = d.fps, IF = d.IFOV * 1e6;
  const rows = budgetRows(P).map(r => Object.assign({}, r));
  const eis = wb.eis, srcOff = { 'B2-01': !sourceActive(P, 'viv'), 'B2-02': !sourceActive(P, 'slap') };
  for (const r of rows) {
    const base = r.F === '° genlik' ? r.E * Math.PI / 180 * 1e6 / Math.SQRT2 : r.F === 'µrad genlik' ? r.E / Math.SQRT2 : r.F === '° RMS' ? r.E * Math.PI / 180 * 1e6 : r.E;
    r.I = base * Math.pow(10, r.H / 20);
    // kaynağı bu platformda olmayan satıra (VIV kapalı; gemide dalga çarpması) ölçüm aktarılmaz
    r.J = measured && measured[r.id] != null && isFinite(measured[r.id]) && !srcOff[r.id] ? measured[r.id] : null;
    r.K = r.J != null ? r.J : r.I;
    r.N = r.G <= 0 ? 1 : sq(Math.sin(Math.PI * r.G * T) / (Math.PI * r.G * T));
    r.O = r.K * Math.sqrt(r.N); r.Pp = r.K * Math.sqrt(Math.max(0, 1 - r.N));
    r.status = (r.J != null ? 'Ölçüm: ' : 'Tahmin: ') + (r.Q <= 0 ? 'tahsis yok' : (r.K <= r.Q ? 'OK' : 'AŞIM'));
    r.AA = r.Q * Math.sqrt(r.N); r.AB = r.Q * Math.sqrt(Math.max(0, 1 - r.N));
    r.AC = r.G <= 0 ? 0 : Math.abs(r.G - Math.round(r.G / ff) * ff);
    r.AD = r.AC <= 0 ? 1 : (eis.fc <= 0 ? 1 - eis.eta : Math.sqrt(1 + sq((1 - eis.eta) * r.AC / eis.fc)) / Math.sqrt(1 + sq(r.AC / eis.fc)));
    r.AE = r.O * r.AD; r.AG = r.AC <= 0 ? 1 : 1 - eis.eta; r.AH = r.O * r.AG;
  }
  // gruplu "etkin kare" sütunları (U, V, W, X, Y, Z, AF, AI)
  const grp = (key) => {
    const out = new Map();
    for (const r of rows) {
      if (r.L !== 'E') { r['_' + key] = 0; continue; }
      if (!r.M) { r['_' + key] = sq(r[key]); continue; }
      if (!out.has(r.M)) { const sum = rows.filter(q => q.M === r.M && q.L === 'E').reduce((s, q) => s + q[key], 0); out.set(r.M, true); r['_' + key] = sq(sum); }
      else r['_' + key] = 0;
    }
  };
  for (const k of ['O', 'Pp', 'K', 'Q', 'AA', 'AB', 'AE', 'AH']) grp(k);
  const sumB = (k, b) => Math.sqrt(rows.filter(r => !b || r.band === b).reduce((s, r) => s + r['_' + k], 0));
  const bands = {};
  for (const b of ['B1', 'B2', 'B3']) bands[b] = { wander: sumB('O', b), smear: sumB('Pp', b), los: sumB('K', b), alloc: sumB('Q', b) };
  const tot = { wander: sumB('O'), smear: sumB('Pp'), los: sumB('K'), alloc: sumB('Q') };
  const reqW = d.req.wander * 1e6, reqS = d.req.smear * 1e6;
  const E96 = wb.H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(wb.tau), E99 = wb.H.bias * Math.PI / 180 / 3600 * 1e6 * wb.tau;
  const E119 = wb.earth.Omega * 1e6 * wb.earth.delta_deg * D2R, E120 = E119 * wb.tau;
  // v11: FOG sabit bias artığı + sıcaklık kayması da τ penceresinde doğrusal kayma üretir (ek satır; uyum kipinde 0)
  const Eb0 = wb.extRows !== false ? (wb.H.b0_res + Math.abs(wb.H.tc_bias * wb.H.dT)) * Math.PI / 180 / 3600 * 1e6 * wb.tau : 0;
  const reg = eis.reg_px * IF;
  const out = {
    rows, bands, tot,
    wander: tot.wander, smear: tot.smear, los: tot.los, reqW, reqS,
    wanderUse: tot.wander / reqW, smearUse: tot.smear / reqS,
    wanderPx: tot.wander / IF, smearPx: tot.smear / IF, radial: Math.SQRT2 * tot.wander, radialPx: Math.SQRT2 * tot.wander / IF,
    mtfNyq: Math.exp(-sq(Math.PI) * sq(tot.smear) / (2 * sq(IF))), mtfHalf: Math.exp(-sq(Math.PI) * sq(tot.smear) / (8 * sq(IF))),
    mtfReq: Math.exp(-sq(Math.PI) * sq(reqS) / (2 * sq(IF))),
    peak: wb.k_conf * tot.wander,
    drift: Math.sqrt(sq(E96) + sq(E99 + Eb0 + E120)), driftReq: d.req.drift * 1e6, E96, E99, E119, E120, Eb0,
    rwWin: rwWindow(P), E96w: wb.H.arw * Math.PI / 180 / 60 * 1e6 * Math.sqrt(P.ana.Tw / 15),
    eisWander: Math.sqrt(rows.reduce((s, r) => s + r._AE, 0) + sq(reg)),
    eisBand: Object.fromEntries(['B1', 'B2', 'B3'].map(b => [b, Math.sqrt(rows.filter(r => r.band === b).reduce((s, r) => s + r._AE, 0))])),
    eisLock: Math.sqrt(rows.reduce((s, r) => s + r._AH, 0) + sq(reg)),
    allocW: sumB('AA'), allocS: sumB('AB'),
    reqDRR: 20 * Math.log10(rows[0].Q / (seaDOF(P).ang[0].Aeq * Math.PI / 180 * 1e6 / Math.SQRT2)),
  };
  const top = rows.filter(r => r.L === 'E').reduce((a, r) => (r._AE > a._AE ? r : a), rows[0]);
  out.eisTop = top.id + (top.M ? ' (' + top.M + ')' : ''); out.eisTopShare = top._AE / sq(out.eisWander);
  return out;
}
// FOG parametrelerinin kapalı biçim etkileri (Model sekmesi paneli). Doğrudan stabilizasyonda gyro iç gimbaldedir: gemi
// hızını değil artık LOS hızını ölçer; ölçek hatası kazancı ölçekler (jitter'a etkisi ihmal edilebilir), dönüş ve izlemede
// pointing hatası üretir. Gecikme döngü faz payını, bias ve sıcaklık kayması drift'i, g-duyarlılığı ve kuantizasyon jitter'ı etkiler.
// Kübik ölçek doğrusalsızlığı modelinde (IEEE 952 tanımı: en küçük kareler doğrusundan en büyük sapma = S_nl·FS) ω hızında
// etkin ölçek hatası (ppm): S_f − 1,5·S_nl + 2,5·S_nl·(ω/FS)². Küçük hızlarda doğrusalsızlık −1,5·S_nl'lik bir ölçek hatası
// gibi davranır (en küçük kareler doğrusunun eğimi büyük hızlardaki kübik terimle belirlenir). ⟨ω²⟩ verilirse profil ortalaması.
function fogScaleEff(G, w2) {
  const FS = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R, nl = G.sfnl_ppm || 0;
  return (G.sf_ppm || 0) - 1.5 * nl + 2.5 * nl * (w2 || 0) / (FS * FS);
}
// yamuk hız profilinde (en büyük hız w, ivme a, açı θ; rad) ⟨ω²⟩ = ∫ω³dt / ∫ω dt
function slewW2(ang, rate, acc) {
  let tc = ang / rate - rate / acc, w = rate; if (tc < 0) { tc = 0; w = Math.sqrt(ang * acc); }
  return (w ** 4 / (2 * acc) + w ** 3 * tc) / ang;
}
function fogInfo(P) {
  const G = P.dut.gyro, d = derive(P), tau = P.wb.tau, ctl = P.dut.ctl;
  const P0 = cloneParams(P); P0.dut.gyro.lat_ms = 0; const d0 = derive(P0);
  const acc = seaAccDirector(P), sd = seaDOF(P), fa = acc.fa > 0 ? acc.fa : (sd.six ? sd.lin[2].fdom : sd.ang[1].fdom);
  const Tcal = G.Tcal != null ? G.Tcal : 20, slewRate = 30 * D2R, range = (G.range_dps > 0 ? G.range_dps : 1e9) * D2R;
  // dönüş (T1.8 profili: 10° @ 30°/s, 200°/s²) etkin ölçek hatası; sıcaklıkla ölçek kayması (T_op − T_cal) eklenir
  const tcS = (G.tcSF || 0) * ((G.Top != null ? G.Top : Tcal) - Tcal), w2 = slewW2(10 * D2R, slewRate, 200 * D2R);
  const sfEff = (fogScaleEff(G, w2) + tcS) * 1e-6, sfWorst = (Math.abs(G.sf_ppm || 0) + Math.abs(tcS) + 1.5 * Math.abs(G.sfnl_ppm || 0)) * 1e-6;
  const dtc = 1 / ctl.fctl, lsbR = (G.lsb_dph || 0) * DEGPH;
  return {
    pm: { el: d.loopEl.pm, az: d.loopAz.pm, el0: d0.loopEl.pm, az0: d0.loopAz.pm, gmEl: d.loopEl.gm, gmEl0: d0.loopEl.gm, fcEl: d.loopEl.fcx, fcAz: d.loopAz.fcx },
    latPhase: { el: 360 * d.loopEl.fcx * (G.lat_ms || 0) * 1e-3, az: 360 * d.loopAz.fcx * (G.lat_ms || 0) * 1e-3 },
    slew: { s10: sfEff * 10 * D2R, s90: sfEff * 90 * D2R, w10: sfWorst * 10 * D2R, w90: sfWorst * 90 * D2R, eff: sfEff * 1e6, worst: sfWorst * 1e6, sf: G.sf_ppm || 0, nl: G.sfnl_ppm || 0, tcS },
    range: { range, slewRate, ok: slewRate < range },
    bias: { b0: G.bias0 * DEGPH * tau, tcCold: Math.abs((G.tcBias || 0) * (-20 - Tcal)) * DEGPH * tau, tcHot: Math.abs((G.tcBias || 0) * (55 - Tcal)) * DEGPH * tau },
    gsens: { rate: (G.kg || 0) * DEGPH * acc.eff / G0, angle: (G.kg || 0) * DEGPH * acc.accInt / G0, acc: acc.eff, f: fa },
    lsb: { lsbR, angleTau: lsbR / Math.sqrt(12) * Math.sqrt(dtc * tau) },
    bw: { fbw: G.fbw, phaseEl: Math.atan(d.loopEl.fcx / G.fbw) * R2D },
  };
}
function uncertaintySheet(P, raw) {
  const wb = P.wb, ti = turInfo(P), u = wb.unc;
  const fmax = wb.hex.fbw, dt = wb.chain.dt_sync_ms;
  const Tmin = u.Nper / u.fmin, Tseg = u.perSeg / u.fmin, nd = Math.max(1, Math.floor(2 * u.Trec / Tseg - 1));
  const r = raw == null ? u.rawExample : raw;
  return Object.assign(ti, {
    inflW: Math.sqrt(1 + sq(ti.uv / (derive(P).req.wander * 1e6))) - 1, inflS: Math.sqrt(1 + sq(ti.uh / (derive(P).req.smear * 1e6))) - 1,
    raw: r, corrected: Math.sqrt(Math.max(0, r * r - ti.uvAdd * ti.uvAdd)),     // v13.6: yalnız toplanır taban düşülür (U-05 çarpımsal)
    phase: 360 * fmax * dt / 1000, diffErr: 2 * Math.sin(Math.PI * fmax * dt / 1000),
    // v13.6: kompanzasyonsuz toplam gecikme = senkron kayması + IMU süzgecinin grup gecikmesi √2/(2π·f_IMU) (ikinci derece Butterworth)
    gd: Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw), phaseTot: 360 * fmax * (dt / 1000 + Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw)),
    diffErrTot: 2 * Math.sin(Math.PI * fmax * (dt / 1000 + Math.SQRT2 / (2 * Math.PI * wb.chain.imu_bw))),
    // v13.6: Welch (Hann, %50 örtüşme) ardışık segmentler ilişkili: ρ = 1/6 → varyans çarpanı 1 + 2ρ²(1 − 1/n_d) (Welch 1967; Harris 1978)
    Tmin, Tseg, df: 1 / Tseg, Trec: u.Trec, recOk: u.Trec >= Tmin, nd, epsR0: 1 / Math.sqrt(nd), epsR: Math.sqrt((1 + 2 / 36 * (1 - 1 / nd)) / nd), frames: u.Trec * derive(P).fps, coh: u.coh,
  });
}
function earthSheet(P) {
  const wb = P.wb, d = derive(P), E = wb.earth, phi = E.lat * D2R, ep = E.el * D2R, Om = E.Omega * 1e6;
  const comp = Om * E.delta_deg * D2R;
  // v13.7: hedefin alandan çıkışı benzetimin geçerlilik kuralıyla (|x_d| < N/2 − kenar payı)
  const eg = (P.ana && P.ana.edgeMargin_px) || 0;
  const exitT = (h, v) => Math.min(h > 0 ? (d.Nh / 2 - eg) * d.IFOV * 1e6 / h : 1e9, v > 0 ? (d.Nv / 2 - eg) * d.IFOV * 1e6 / v : 1e9);
  const tab = [];
  for (let a = 0; a < 360; a += 30) {
    const al = a * D2R;
    const h = Om * Math.abs(Math.sin(phi) * Math.cos(ep) - Math.cos(phi) * Math.cos(al) * Math.sin(ep)), v = Om * Math.abs(Math.cos(phi) * Math.sin(al)),
      r = Om * Math.abs(Math.cos(phi) * Math.cos(al) * Math.cos(ep) + Math.sin(phi) * Math.sin(ep));
    tab.push({ az: a, h, v, r, max: Math.max(h, v), px2: Math.max(h, v) * 120 / (d.IFOV * 1e6), pxRec: Math.max(h, v) * wb.unc.Trec / (d.IFOV * 1e6) });
  }
  const h = d.earthImg.h * 1e6, v = d.earthImg.v * 1e6;
  return { Om, vert: Om * Math.sin(phi), horiz: Om * Math.cos(phi), h, v, r: d.earthImg.r * 1e6, comp,
    off: { drift: Math.max(h, v) * wb.tau, exit: exitT(h, v), pxH: h * wb.unc.Trec / (d.IFOV * 1e6), pxV: v * wb.unc.Trec / (d.IFOV * 1e6), px2: Math.max(h, v) * 120 / (d.IFOV * 1e6) },
    on: { drift: comp * wb.tau, exit: exitT(comp, comp), pxH: comp * wb.unc.Trec / (d.IFOV * 1e6), px2: comp * 120 / (d.IFOV * 1e6) }, tab };
}
function hexReachTable(P) {
  const d = derive(P), freqs = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 50, 100];
  return freqs.map(f => ({ f, deg: d.reach(f), urad: d.reach(f) * D2R * 1e6, lim: d.reachLim(f), Ww: Ww(f, d.Tint),
    band: f > P.wb.hex.fbw ? 'f_bw ÜSTÜ' : (f > P.wb.hex.rel_ratio * P.wb.hex.fbw ? 'güvenilir bant üstü' : 'OK'), nyq: f > d.fps / 2 ? 'Nyquist üstü' : 'OK' }));
}
// İşletme ayrıştırması: her bütçe satırı için izole kaynak koşusu + tüm kaynaklar birlikte
function opDecomposition(P, o, prog) {
  o = o || {};
  const d = derive(P), T = o.T || 600, seed = o.seed == null ? 11 : o.seed;
  const losOn = !!(P.ana && P.ana.los && P.ana.los.on !== false);
  const rows = {}; let k = 0; const N = OP_ROWS.length + 1 + (losOn ? 1 : 0);
  let gyro = null;
  for (const row of OP_ROWS) {
    if (row.ext && P.wb.extRows === false) { k++; continue; }          // ek satırlar kapalı (v10 uyumu)
    if (row.same && rows[row.same]) { rows[row.id] = Object.assign({}, rows[row.same]); k++; continue; }
    // satırın kaynağı bu platformda yoksa (VIV kapalı / kilitlenme yok; gemide dalga çarpması) koşu gereksiz, katkı sıfır
    if (row.src.length && row.src.every(s => !sourceActive(P, s))) {
      rows[row.id] = { id: row.id, el: 0, xel: 0, wEl: 0, sEl: 0, wXel: 0, sXel: 0, pdeEl: 0, pdeXel: 0, hp1El: 0, hp1Xel: 0, rotRes: null, edge: NaN, p99El: 0, off: true }; k++; continue;
    }
    const R = runSim(P, rowScenario(P, row, { T, seed }), (p) => prog && prog((k + p) / N)); k++;
    const M = losMetrics(R, P, { skip: 20 });
    const rec = { id: row.id, el: M.rms.el, xel: M.rms.xel, wEl: M.video ? M.video.wander.el : NaN, sEl: M.video ? M.video.smear.el : NaN,
      wXel: M.video ? M.video.wander.xel : NaN, sXel: M.video ? M.video.smear.xel : NaN,
      pdeEl: M.video ? M.video.pde.el.rms : NaN, pdeXel: M.video ? M.video.pde.xel.rms : NaN, hp1El: M.band ? M.band.el.hp1 : NaN, hp1Xel: M.band ? M.band.xel.hp1 : NaN,
      rotRes: M.rotRes, edge: M.rotRes != null ? d.rot.of(M.rotRes) : NaN, p99El: M.p99 ? M.p99.el : NaN };
    if (losOn && M.psd) Object.assign(rec, losRowFields(P, M.psd));       // v12: proje bantları ve pozlama içi katkı (kaynak tablosu)
    rows[row.id] = rec;
    if (row.id === 'B1-01' || row.id === 'B1-04') rows[row.id]._series = Float64Array.from(R.rec.opt_el.subarray(20000));
  }
  // "bütçe karşılığı" (el ekseni): satır tanımına uygun metrik
  for (const id of Object.keys(rows)) {
    const r = rows[id];
    // v13.9: B1-05 wander penceresi metriğinde videonun wander'ıyla (T_w, doğrusal trend), B1-06 τ penceresinde (PDE) karşılaştırılır
    const w5 = id === 'B1-05' && rwWindow(P);
    r.cmp = w5 ? r.wEl : (id === 'B1-05' || id === 'B1-06' ? r.pdeEl : (id === 'B2-05' ? r.hp1El : (id === 'R-01' ? r.edge : (id === 'H7' ? r.pdeEl : r.el))));
    r.cmpXel = w5 ? r.wXel : (id === 'B1-05' || id === 'B1-06' || id === 'H7' ? r.pdeXel : (id === 'B2-05' ? r.hp1Xel : (id === 'R-01' ? NaN : r.xel)));
  }
  // G1 korelasyon katsayısı (aynı tohum, el ekseni)
  const a = rows['B1-01']._series, b = rows['B1-04']._series;
  let rho = NaN; if (a && b) { const n = Math.min(a.length, b.length); const da = detrend(a.subarray(0, n), 'linear'), dbb = detrend(b.subarray(0, n), 'linear'); let s = 0; for (let i = 0; i < n; i++) s += da[i] * dbb[i]; rho = s / (n * aRms(da) * aRms(dbb)); }
  delete rows['B1-01']._series; delete rows['B1-04']._series;
  // tüm kaynaklar birlikte
  const Rall = runSim(P, opScenario(P, { T, seed, fs: 4000, derot: true }), (p) => prog && prog((k + p) / N));
  const Mall = losMetrics(Rall, P, { skip: 20 });
  const pw = psdWeighting(Mall.psd.f, Mall.psd.el, d.Tint), pwx = psdWeighting(Mall.psd.f, Mall.psd.xel, d.Tint);
  // EIS (gerçek kare dizisine)
  const V = sliceVideo(Rall.video, 20), fsr = frameSeries(V, 'true'), perWin = Math.round(P.ana.Tw * V.fps), rng = new RNG(seedOf(P, 77));
  const eE = applyEIS(fsr.el, null, V.fps, P.wb.eis.fc, P.wb.eis.eta, P.wb.eis.reg_px * d.IFOV, rng);
  const eL = applyEIS(fsr.el, null, V.fps, 0, P.wb.eis.eta, P.wb.eis.reg_px * d.IFOV, rng);
  const all = { M: Mall, pw, pwx, eis: windowedWander(eE, null, perWin, P.ana.detrend).rms, eisLock: windowedWander(eL, null, perWin, P.ana.detrend).rms,
    rss: Math.sqrt(['B1-01', 'B1-02', 'B1-03', 'B1-04', 'B1-07', 'B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-06', 'B3-01', 'B3-02', 'B3-03', 'B3-04'].reduce((s, id) => s + sq(rows[id].el), 0) + sq(rows['B1-05'].el) + sq(rows['B1-06'].el)
      + (rows['B1-08'] ? sq(rows['B1-08'].el) : 0)) };   // v11: deniz ötelemesi satırı (uyum kipinde yok)
  // çizim verisi: PSD ve kümülatif
  const lp = logDecimPSD(Mall.psd.f, scaleArr(Mall.psd.el, 1e12), 160, 0.03), lpx = logDecimPSD(Mall.psd.f, scaleArr(Mall.psd.xel, 1e12), 160, 0.03);
  all.psdPlot = { el: lp, xel: lpx };
  const tr = Rall.rec.opt_el, n0 = 20000, nn = Rall.meta.nRec;
  const tt = [], yy = []; for (let i = n0; i < nn; i += 5) { tt.push(i / 1000); yy.push(tr[i] * 1e6); }
  all.tsPlot = decim(tt, detrend(yy, 'linear'), 3000);
  all.R = Rall;
  // v12: proje LOS kalıntı gereksinimleri — tüm kaynaklar birlikte, takip öncesi (yukarıdaki koşu) ve dış kamera takip
  // döngüsüyle (aynı tohum, ek koşu)
  let req = null;
  if (losOn) {
    const L = P.ana.los, lim = losLimits(P);
    const mPre = losReqMetrics(P, Rall.rec.opt_el, Rall.rec.opt_xel, Rall.meta.fRec, { skip: 20 });
    const tk = trkModel(P);
    req = { pre: losSummary(mPre), post: null, checksPre: losChecks(mPre, lim, L), checksPost: null, trkStable: tk.stable };
    if (tk.stable) {      // kararsız takip döngüsünde (faz payı ≤ 0) takip sonrası koşu anlamsızdır
      const St = opScenario(P, { T, seed, fs: 4000, derot: true }); St.tracker = { bw: L.trk.bw, lat_frames: L.trk.lat_frames, gate_px: L.trk.gate_px };
      const Rt = runSim(P, St, (p) => prog && prog((k + 1 + p) / N));
      const mPost = losReqMetrics(P, Rt.rec.opt_el, Rt.rec.opt_xel, Rt.meta.fRec, { skip: 20 });
      req.post = losSummary(mPost, { lost: (Rt.stats && Rt.stats.trackLost) || 0 }); req.checksPost = losChecks(mPost, lim, L);
    }
    // v13.17 (§14 K2 c): dalga çarpması seyrek geçişler üretir ve PPV / P99,73'ü belirler. Aynı tohumla, yalnız çarpma kapalı iki ek koşu
    // (takip öncesi / sonrası) bilgi olarak raporlanır; diğer kaynakların rastgele akışları aynıdır (kaynak başına ayrı üreteç). Pencere
    // dışlama uygulanamaz: λ·T_w = 0,1 · 60 = 6 olayda olaysız pencere olasılığı e^−6 ≈ %0,25.
    if (sourceActive(P, 'slap') && P.env.slap.A > 0 && o.noSlap !== false) {
      const brief = (m) => { const q = losSummary(m); return { sEl: q.sEl, sXel: q.sXel, sVec: q.sVec, ppEl: q.ppEl, ppXel: q.ppXel, rEl: q.rEl, rXel: q.rXel, p9973: q.p9973, gauss: q.gauss }; };
      const Sn = opScenario(P, { T, seed, fs: 4000, derot: true, src: { slap: false } });
      const Rn = runSim(P, Sn, null);
      req.noSlap = { pre: brief(losReqMetrics(P, Rn.rec.opt_el, Rn.rec.opt_xel, Rn.meta.fRec, { skip: 20 })), post: null };
      if (tk.stable) {
        const Sn2 = opScenario(P, { T, seed, fs: 4000, derot: true, src: { slap: false } }); Sn2.tracker = { bw: L.trk.bw, lat_frames: L.trk.lat_frames, gate_px: L.trk.gate_px };
        const Rn2 = runSim(P, Sn2, null);
        req.noSlap.post = brief(losReqMetrics(P, Rn2.rec.opt_el, Rn2.rec.opt_xel, Rn2.meta.fRec, { skip: 20 }));
      }
    }
  }
  return { rows, rho, all, T, seed, req };
}

// ============================================================================
// 08_play.js — Düzenek sekmesi: kısa oynatma koşuları (hexapod + DUT + kolimatör)
// Çıktı: 50 Hz'e indirgenmiş poz/gimbal/LOS dizileri + video kareleri + özet metrikler
// ============================================================================
const PLAY_KINDS = {
  sea: 'Deniz profili (T1.3 türü, çok eksenli)',
  seaviv: 'Deniz profili + VIV tonu (T2.3 türü)',
  viv: 'Yalnız VIV tonu (T2.2 türü dwell)',
  sine: 'Tek eksen sinüs (T1.1 türü)',
  slap: 'Dalga çarpması darbeleri (T2.4 türü)',
  still: 'Durağan (T0.3 türü, hexapod servo açık)',
};
function playScenario(P, o, prog) {
  o = o || {};
  const kind = o.kind || 'sea', T = Math.max(10, Math.min(300, o.T || 60)), stab = o.stab !== false;
  const seed = o.seed || 1301, rngf = makeRngFactory(seed), scale = o.scale == null ? 1 : o.scale;
  const cmd = [];
  let trans = [];
  // VIV: denizaltında su içinde ilerleyen mastta girdap kopmasının mast başında doğurduğu açısal hareket (f_v = f_n,
  // 0,05°); gemide rüzgârın direk modunda doğurduğu açısal hareket + aynı fazda direk tepesi ötelemesi (EN 1991-1-4)
  const VS = vivSpec(P), ship = VS.kind === 'wind';
  const vivOn = VS.present, fv = o.f || (ship ? VS.f : P.wb.viv.fn), hasViv = vivOn && (kind === 'seaviv' || kind === 'viv');
  let tone = null;
  // gemi ve (v13.3) mast başı ötelemesi açık denizaltı: açısal + aynı fazda öteleme tonu (erişim ve strok sınırlı)
  if (hasViv && (ship || VS.lin)) { tone = windTone(P, VS, fv, kind === 'viv' ? 1 : 5, null, 3, scale); trans = tone.trans; }
  const Aviv = hasViv ? (tone ? tone.A : Math.min(P.wb.viv.amp_deg * scale, derive(P).reach(fv)) * D2R) : 0;     // taban VIV genliği (rad)
  const subLim = hasViv && !tone && P.wb.viv.amp_deg * scale > derive(P).reach(fv);      // v13.2: yalnız açısal ton erişimle küçültüldü mü
  let seaQ = null, SMtr = null;
  if (kind === 'sea' || kind === 'seaviv') {
    // açısal profil; 6-DOF kipinde ve kaldıraç kolunda hexapod ötelemesi (strokla sınırlı ortak oran q)
    const SM = seaMotion(P, T, rngf, { scale, ramp: 5, world: 'lab' });
    cmd.push(...SM.cmd);
    if (SM.trans.length) {
      if (kind === 'seaviv' && tone && tone.y > 0) SM.q = reserveStroke(P, SM, tone.y);      // v13.3: tona strok ayrılır
      trans = SM.trans.concat(trans); seaQ = { q: SM.q, demand: SM.demand }; SMtr = SM.trans;
    }
    if (kind === 'seaviv' && vivOn) { if (tone) cmd.push(...tone.cmd); else cmd.push({ type: 'sine', axis: 0, A: Aviv, f: fv, t0: 5, ramp: 3 }); }
  } else if (kind === 'viv') {
    if (vivOn) { if (tone) cmd.push(...tone.cmd); else cmd.push({ type: 'sine', axis: 0, A: Aviv, f: fv, t0: 1, ramp: 3 }); }
  } else if (kind === 'sine') {
    const f = o.f || 0.125, A = Math.min((o.A || 2) * scale, derive(P).reach(f)) * D2R;
    cmd.push({ type: 'sine', axis: o.axis || 0, A, f, t0: 1, t1: T - 1, ramp: Math.max(1, 0.5 / f) });
  } else if (kind === 'slap') {
    const hx = P.wb.hex, ev = []; let t = 3, i = 0;
    while (t < T - 2) {
      const Tp = [0.05, 0.1, 0.2][i % 3];
      const A = pulseAmpDeg(P, Tp) * 0.9 * D2R * Math.min(1, scale);      // v13.14: genlik kuralı pulseAmpDeg (wb.hex.pulseRule)
      ev.push({ t0: t, Tp, A: A * (i % 2 ? -1 : 1) }); t += 3; i++;
    }
    cmd.push({ type: 'halfsine', axis: 0, events: ev });
  }
  const recCh = ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'base_r', 'base_p', 'base_y', 'cmd_r', 'cmd_p', 'cmd_y', 'enc_a', 'enc_e', 'rot', 'rot_res',
    'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel'];
  if (trans.length) recCh.push('tr_x', 'tr_y', 'tr_z');          // gemi rüzgâr VIV'i: hexapod ötelemesi (3B görünüm)
  const S = labScenario(P, { label: 'Düzenek: ' + (PLAY_KINDS[kind] || kind), T, fs: 2000, stab, cmd, trans, seed,
    resF: (kind === 'seaviv' || kind === 'viv') ? fv : undefined,
    rec: { fs: 1000, ch: recCh } });
  // v13.5 (kullanıcı kararı): deniz ötelemesi kolimatör sınırına sığdırılır (testlerle aynı kural; seaLabScenario)
  if (SMtr && SMtr.length && seaQ) { const F = fitTransToColl(P, Object.assign({}, S, { stab: true }), SMtr); seaQ.qc = F.qc; seaQ.e1 = F.e1; }   // stab ON geometrisi: ON ve OFF oynatmaları aynı hareket
  const R = runSim(P, S, prog);
  const fr = R.meta.fRec, dec = Math.round(fr / 50), n = Math.floor(R.meta.nRec / dec);
  const out = { kind, label: PLAY_KINDS[kind] || kind, T, stab, fs: 50, n, scale, scaleEff: kind === 'slap' ? Math.min(1, scale) : (kind === 'still' ? null : scale), platform: ship ? 'ship' : 'sub' };
  if (seaQ) out.seaQ = seaQ;
  const blk = (a) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < dec; j++) s += a[i * dec + j]; y[i] = s / dec; } return y; };
  for (const c of ['base_r', 'base_p', 'base_y', 'enc_a', 'enc_e', 'opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'rot', 'rot_res']) out[c] = blk(R.rec[c]);
  if (trans.length) for (const c of ['tr_x', 'tr_y', 'tr_z']) out[c] = blk(R.rec[c]);
  // kayma bileşenleri: dünya dönüşü artığı (dr_e) ve gyro bias'ı (dr_b), LOS açısı olarak birikmiş (rad)
  if (stab) for (const c of ['dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel']) out[c] = blk(R.rec[c]);
  // video kareleri (merkez referanslı, px)
  const V = R.video;
  out.video = { n: V.n, fps: V.fps, t: Float32Array.from(V.t.subarray(0, V.n)), x: Float32Array.from(V.x.subarray(0, V.n), v => v - V.x0), y: Float32Array.from(V.y.subarray(0, V.n), v => v - V.y0), ok: Uint8Array.from(V.valid.subarray(0, V.n)) };
  // EIS (videonun son işlemi; T1.3 ile aynı yöntem): ölçülen centroid dizisine Model'deki f_c, η ve registrasyon artığı
  // (px RMS) uygulanır. EIS görüntüyü kaydırır, fiziksel LOS'u değiştirmez.
  const EI = P.wb.eis, rEis = rngf('eis');
  const vx = Float64Array.from(V.x.subarray(0, V.n), v => v - V.x0), vy = Float64Array.from(V.y.subarray(0, V.n), v => v - V.y0), vok = out.video.ok;
  const ex = applyEIS(vx, vok, V.fps, EI.fc, EI.eta, EI.reg_px, rEis), ey = applyEIS(vy, vok, V.fps, EI.fc, EI.eta, EI.reg_px, rEis);
  out.videoEis = { x: Float32Array.from(ex), y: Float32Array.from(ey), fc: EI.fc, eta: EI.eta, reg: EI.reg_px, off: EI.eta === 0 && !(EI.reg_px > 0) };
  const d = derive(P);
  out.geom = { a0: d.a0, e0: d.e0, IFOV: d.IFOV, IFOVt: R.meta.IFOVt, Nh: d.Nh, Nv: d.Nv, FOVh: d.FOVh, FOVv: d.FOVv, Lpg: P.dut.L_pg };
  // v13.4: göz bebeği ↔ kolimatör demeti — gerçekleşen taban duruşu ve ötelemesinden (50 Hz) yanal kayma ve örtüşme dizileri
  {
    const G = collGeom(P), ph = new Float32Array(n), pv = new Float32Array(n), po = new Float32Array(n), t3 = [0, 0, 0];
    let eMax = 0, hMax = 0, vMax = 0, ovMin = 1, nVig = 0, nC = 0; const j0 = Math.round(Math.min(10, T / 4) * 50);
    for (let i = 0; i < n; i++) {
      if (out.tr_x) { t3[0] = out.tr_x[i]; t3[1] = out.tr_y[i]; t3[2] = out.tr_z[i]; }
      const [hz, vt] = pupilShift(G, out.base_r[i], out.base_p[i], out.base_y[i], t3, stab, 0);
      const a = [out.base_r[i], out.base_p[i], out.base_y[i]], l = G.losB, dot = a[0] * l[0] + a[1] * l[1] + a[2] * l[2];
      const e = Math.hypot(hz, vt) + G.Loff * Math.sin(Math.min(Math.hypot(a[0] - dot * l[0], a[1] - dot * l[1], a[2] - dot * l[2]), Math.PI / 2)), ov = pupilOverlap(G.Dp, G.Dc, e);
      ph[i] = hz; pv[i] = vt; po[i] = ov;
      if (i >= j0) { nC++; if (e > eMax) eMax = e; if (Math.abs(hz) > hMax) hMax = Math.abs(hz); if (Math.abs(vt) > vMax) vMax = Math.abs(vt); if (ov < ovMin) ovMin = ov; if (ov < 1 - 1e-9) nVig++; }
    }
    out.pupil = { h: ph, v: pv, ov: po, Dp: G.Dp, Dc: G.Dc, k: G.k, eFree: G.eFree, Lpg: G.Lpg };
    // v13.5: kolimatör paralaksı (δ ≠ 0): görünür hedef açısı −e·δ/f_c² — tepe ve RMS (yatay / düşey)
    let sH = 0, sV = 0, mH = 0, mV = 0; for (let i = j0; i < n; i++) { mH += ph[i]; mV += pv[i]; } mH /= Math.max(1, n - j0); mV /= Math.max(1, n - j0);
    for (let i = j0; i < n; i++) { sH += sq(ph[i] - mH); sV += sq(pv[i] - mV); }
    const par = G.parK ? { delta_um: G.delta_um, pk: G.parK * eMax, rmsH: G.parK * Math.sqrt(sH / Math.max(1, n - j0)), rmsV: G.parK * Math.sqrt(sV / Math.max(1, n - j0)) } : null;
    out.metricsPupil = { eMax, hMax, vMax, ovMin, fVig: nVig / Math.max(1, nC), req: G.k * (G.Dp + 2 * eMax), ok: eMax <= G.eFree + 1e-12, eFree: G.eFree, Dc: G.Dc, Dp: G.Dp, k: G.k, stab,
      qc: seaQ && seaQ.qc != null ? seaQ.qc : null, par, deltaMax: G.deltaMax(eMax) };
  }
  // özet metrikler
  const skip = Math.min(10, T / 4), i0 = Math.round(skip * fr);
  const det = (c) => detrend(Float64Array.from(R.rec[c].subarray(i0)), 'linear');
  const pe = det('opt_el'), px = det('opt_xel');
  // v13.14: tepe θ / ω / α hexapod'un gerçekleştirdiği nominal hareketten — komut, hexapod dinamiğinden (Osc2, f_bw, ζ 0,7071;
  // mikrotitreşimsiz) geçirilir. Komutun sayısal türevi hız sıçramalı profillerde (yarım sinüs açı darbesi: başta ve sonda ω sıçrar,
  // α → ∞) örnekleme hızına bağlı bir değer verir (1 kHz'de 22 917 °/s²). cmd: komutun kendisi (karşılaştırma için).
  const baseStats = [0, 1, 2].map(ax => {
    const th = R.rec[['cmd_r', 'cmd_p', 'cmd_y'][ax]];          // komut profili (hexapod'un üretmesi gereken)
    let mt = 0, mw = 0, ma = 0, ct = 0, cw = 0, ca = 0;
    for (let i = 1; i + 1 < R.meta.nRec; i++) { ct = Math.max(ct, Math.abs(th[i])); const w = (th[i + 1] - th[i - 1]) * fr / 2, a = (th[i + 1] - 2 * th[i] + th[i - 1]) * fr * fr; cw = Math.max(cw, Math.abs(w)); ca = Math.max(ca, Math.abs(a)); }
    const hxo = new Osc2(P.wb.hex.fbw, 0.7071, 1 / fr); hxo.reset(th[0]);
    for (let i = 1; i < R.meta.nRec; i++) { hxo.step(th[i]); mt = Math.max(mt, Math.abs(hxo.x)); mw = Math.max(mw, Math.abs(hxo.v)); ma = Math.max(ma, Math.abs(hxo.a)); }
    return { th: mt * R2D, om: mw * R2D, al: ma * R2D, cmd: { th: ct * R2D, om: cw * R2D, al: ca * R2D }, fbw: P.wb.hex.fbw };
  });
  let mtfE = NaN, mtfX = NaN, wE = NaN, wX = NaN;
  try { const vm = videoMetrics(sliceVideo(V, skip), { which: 'true', Tw: Math.min(P.ana.Tw, (T - skip) / 2), detrend: 'linear', tau: P.wb.tau, pdeWin: P.ana.pdeWin }); mtfE = vm.mtf.el; mtfX = vm.mtf.xel; wE = vm.wander.el; wX = vm.wander.xel; } catch (e) { /* kısa kayıt */ }
  let nOk = 0; for (let i = 0; i < V.n; i++) nOk += V.valid[i];
  // doğrusal kayma eğimi (dünya dönüşü / bias): trend çıkarılmadan önceki diziden
  const slope = (c) => { const x = R.rec[c], n = R.meta.nRec - i0; let st = 0, sy = 0, stt = 0, sty = 0; for (let i = i0; i < R.meta.nRec; i++) { const t = i / fr; st += t; sy += x[i]; stt += t * t; sty += t * x[i]; } return (n * sty - st * sy) / Math.max(1e-30, n * stt - st * st); };
  const es = earthSheet(P), comp = !!P.wb.earth.comp;
  out.earth = { comp, expH: (comp ? es.comp : es.h) * 1e-6, expV: (comp ? es.comp : es.v) * 1e-6, exit: comp ? es.on.exit : es.off.exit, lat: P.wb.earth.lat, az: P.wb.earth.az };
  const pr = new Float64Array(pe.length); for (let i = 0; i < pe.length; i++) pr[i] = Math.hypot(pe[i], px[i]);      // v13.14: radyal P99 (dedektör çemberi)
  out.metrics = { slopeEl: slope('opt_el'), slopeXel: slope('opt_xel'), rmsEl: aRms(pe), rmsXel: aRms(px), p99El: aPctAbs(pe, 99), p99Xel: aPctAbs(px, 99), p99R: aPctAbs(pr, 99), wanderEl: wE, wanderXel: wX, Tw: Math.min(P.ana.Tw, (T - skip) / 2), mtfEl: mtfE, mtfXel: mtfX,
    validFrac: nOk / Math.max(1, V.n), base: baseStats, sat: R.stats.satCount, maxRelE: R.stats.maxRelE, maxRelA: R.stats.maxRelA, pupil: out.metricsPupil };
  delete out.metricsPupil;
  // wander, ölçülen video: ham ve EIS sonrası (aynı kareler, pencere ve trend işlemi; px → µrad nominal IFOV ile)
  {
    const j0 = Math.min(V.n, Math.round(skip * V.fps)), Tw = Math.min(P.ana.Tw, (T - skip) / 2), per = Math.max(5, Math.round(Tw * V.fps));
    const okc = vok.subarray(j0), w = (a) => windowedWander(Float64Array.from(a.subarray(j0), v => v * V.IFOV), okc, per, 'linear').rms;
    // ayrıştırma: yalnız süzme (registrasyon artığı 0) — EIS'in giderdiği titreşim ile eklediği gürültüyü ayırır
    const ex0 = applyEIS(vx, vok, V.fps, EI.fc, EI.eta, 0, null), ey0 = applyEIS(vy, vok, V.fps, EI.fc, EI.eta, 0, null);
    out.metrics.eis = { Tw, rawEl: w(vy), rawXel: w(vx), eisEl: w(ey), eisXel: w(ex), filtEl: w(ey0), filtXel: w(ex0), regUrad: EI.reg_px * V.IFOV };
  }
  // VIV frekansındaki LOS bileşeni (f_v, el): en küçük kareler sinüs + trend uydurması (rampa sonrası). Taban genliği
  // uyarımın tanımıdır (komut; hexapod 3 Hz'de birim kazançlı) — taban kaydına uydurma büyük deniz hareketinden sızıntı alır
  {
    const j0 = Math.round(Math.max(skip, kind === 'viv' ? 5 : 9) * fr), n = R.meta.nRec, m = n - j0;
    const tt = new Float64Array(m), le = new Float64Array(m), lx = new Float64Array(m);
    for (let i = j0; i < n; i++) { tt[i - j0] = i / fr; le[i - j0] = R.rec.opt_el[i]; lx[i - j0] = R.rec.opt_xel[i]; }
    const fl = sineFit(tt, le, fv), fx = sineFit(tt, lx, fv);
    out.metrics.viv = { f: fv, on: VS.on, present: hasViv, los: fl ? fl.A / Math.SQRT2 : NaN, base: Aviv / Math.SQRT2,
      kind: VS.kind, losXel: fx ? fx.A / Math.SQRT2 : NaN, active: VS.present,
      y: tone ? tone.y : 0, acc: tone ? tone.acc : 0, lin: !!(tone && VS.lin), limited: tone ? tone.limited : subLim };
  }
  // LOS hatası spektrumu (trend çıkarılmış, Welch/Hann, 16 384 nokta), log ızgarada genlik spektral yoğunluğu (µrad/√Hz)
  {
    const se = detrend(Float64Array.from(R.rec.opt_el.subarray(i0)), 'linear'), sx = detrend(Float64Array.from(R.rec.opt_xel.subarray(i0)), 'linear');
    const we = welch(se, fr, 16384), wx = welch(sx, fr, 16384);
    const de = logDecimPSD(we.f, we.P, 170, 0.05), dx = logDecimPSD(wx.f, wx.P, 170, 0.05);
    out.psd = { f: Float32Array.from(de.f), el: Float32Array.from(de.P, v => Math.sqrt(v) * 1e6), xel: Float32Array.from(dx.P, v => Math.sqrt(v) * 1e6) };
  }
  // kayma ayrıştırması (aynı pencerede doğrusal eğim): dünya dönüşü artığı + gyro bias'ı + kalan (ARW, uyarım artığı, diğer)
  if (stab) {
    const m = out.metrics, eEl = slope('dr_e_el'), eXel = slope('dr_e_xel'), bEl = slope('dr_b_el'), bXel = slope('dr_b_xel');
    m.drift = { earthEl: eEl, earthXel: eXel, biasEl: bEl, biasXel: bXel, restEl: m.slopeEl - eEl - bEl, restXel: m.slopeXel - eXel - bXel };
  }
  if (o.keepRec) out._R = R;      // v13.14: yalnız doğrulama koşuları için ham kayıt (arayüz kullanmaz)
  return out;
}

return {D2R, R2D, TAU, URAD, DEGPH, DEGPSQH, RNG, makeRngFactory, fft, synthSeries, shapeLogGauss, shapeGauss, Biquad, bqLP, bqHP, bqBP, Osc2, Ww, db, sq, logspace, linspace, sinc, baseDefaults, dutDefaults, envDefaults, labDefaults, anaDefaults, defaultParams, cloneParams, derive, loopModel, cabs, carg, MECH_DEFAULT, MEAS_DEFAULT, hexLimitCheck, simIter, runSim, aMean, aRms, aStd, aPctAbs, aMaxAbs, detrend, sineFit, welch, welchCSD, tfH1, bandRms, cumRms, psdWeighting, allanDev, frameSeries, videoMetrics, applyEIS, delayEstimate, besselJ0, pdeStats, windowedWander, SRC_IDS, SRC_LABEL, seaSeries, narrowSeries, slapEvents, opScenario, sliceVideo, losMetrics, OP_ROWS, rowScenario, AXN, axisMap, labScenario, segSines, videoAngles, sampleAt, decim, logDecimPSD, turInfo, TESTS, TEST_ORDER, runTest, vivTable, BUDGET_ALLOC, seaLabScenario, profileMetrics, shakerScenario, bandDispSeries, budgetRows, computeBudget, uncertaintySheet, earthSheet, hexReachTable, opDecomposition, fitSegments, mastAngScenario, tsaAnalysis, playScenario, PLAY_KINDS, seedOf, Lag1, ShapedNoise, BiasProcess, GaussMarkov, makeComponent, makeChannel, hash32, solveLin, bqPeak, bqNotch, slowNoise, vivSpec, windVivCalc, windVivTable, vivBand, clat0Circ, applyPlatform, platformSea, isShip, sourceActive, windTone, windVivComps, synthSeriesD2, compatV10, tableShare, tableCorr, MV_MODE_TXT, seaDOF, seaAccDirector, seaMotion, SEA6, SEA_ANG, SEA_LIN, synthSeriesDer, shapeBand, accRatio, velRatio, seaSigma, seaAmpDeg, seaPeriod, fogInfo, fogScaleEff, slewW2, losReqDefaults, losLimits, losReqMetrics, losTimeMetrics, losVideoMetrics, losChecks, losSummary, losRowFields, trkModel, filtfiltHP, psdAxis, expFromPSD, exposureMetrics, winStats, decideStat, t95, DEC_TXT, nsegFor, budgetAlloc, ALLOC_IFOV_REF, ifovOf, seaDrrInfo, seaDrrAssume, seaArm, seaLabDemand, vivMass, vivRisk, transPeak, reserveStroke, vivSpeeds, vivNoRiskTxt, collGeom, pupilOverlap, pupilShift, pupilExcursion, pupilTxt, collExcursions, fitTransToColl, pupilRule, pctFine, pixGain, pixPhaseInfo, chainNoise, normCdf, decisionGuard, scaleRelOf, earthLimits, epsRotInfo, rwWindow, pulseAmpDeg};
}
