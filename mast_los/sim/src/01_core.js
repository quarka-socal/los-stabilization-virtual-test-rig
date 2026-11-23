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
