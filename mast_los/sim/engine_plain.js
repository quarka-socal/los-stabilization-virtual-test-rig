/* Optronik Mast LOS Jitter — sanal test düzeneği motoru (otomatik birleştirildi) */
var LOSSIM = (function () {
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
// log-frekansta Gauss tepe (dar bantlı süreç şekli)
function shapeLogGauss(fp, sigLn) { return (f) => f <= 0 ? 0 : Math.exp(-0.5 * sq(Math.log(f / fp) / sigLn)) / f; }
function shapeGauss(fp, sf) { return (f) => Math.exp(-0.5 * sq((f - fp) / sf)); }

// ---------------------------------------------------------------- filtreler --
class Biquad {  // DF2T
  constructor(b0, b1, b2, a1, a2) { this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2; this.z1 = 0; this.z2 = 0; }
  step(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
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
    this.g1 = 1 - this.p11; this.g2 = -this.p21;      // Γ = [−2ζωΦ12 − (Φ22−1), ω²Φ12] ≡ [1−Φ11, −Φ21]
    this.w2 = w * w; this.c2 = 2 * z * w;
    this.x = 0; this.v = 0; this.a = 0;
  }
  step(u) {
    const x = this.x, v = this.v;
    this.x = this.p11 * x + this.p12 * v + this.g1 * u;
    this.v = this.p21 * x + this.p22 * v + this.g2 * u;
    this.a = this.w2 * (u - this.x) - this.c2 * this.v;
    return this.x;
  }
  reset(x0) { this.x = x0; this.v = 0; this.a = 0; }
}
// Gauss–Markov (birinci derece) süreci
class GaussMarkov {
  constructor(sigma, Tc, dt, rng) { this.phi = Math.exp(-dt / Tc); this.q = sigma * Math.sqrt(1 - this.phi * this.phi); this.rng = rng; this.x = sigma * rng.gauss(); }
  step() { this.x = this.phi * this.x + this.q * this.rng.gauss(); return this.x; }
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
// 02_model.js — parametreler: çalışma kitabı v1.2 (hücre referanslı), örnek DUT,
// işletme ortamı, laboratuvar; türetilmiş büyüklükler ve analitik döngü modeli
// ============================================================================

// Çalışma kitabı v1.2 örnek değerleri. Yorumlar: sayfa!hücre
function workbookDefaults() {
  return {
    channels: [
      { name: 'MWIR-NFOV', p_um: 12, f_mm: 300, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 100 },   // Girdiler!A5:H5
      { name: 'MWIR-WFOV', p_um: 12, f_mm: 50, Nh: 1280, Nv: 1024, fps: 50, Tint_ms: 5, Dp_mm: 25 },     // A6:H6
      { name: 'HDTV-NFOV', p_um: 3.45, f_mm: 300, Nh: 1920, Nv: 1080, fps: 50, Tint_ms: 1, Dp_mm: 75 },  // A7:H7
      { name: 'SWIR-NFOV', p_um: 15, f_mm: 250, Nh: 640, Nv: 512, fps: 50, Tint_ms: 2, Dp_mm: 70 },      // A8:H8
    ],
    refChannel: 'MWIR-NFOV',                 // Girdiler!B12
    k_wander: 0.5, k_smear: 0.25,            // B25, B26  (IFOV RMS, eksen başına)
    tau: 1, drift_ifov: 1,                   // B29, B30
    k_conf: 2.576, TUR_target: 4,            // B32, B33
    TUR_def: 'k1', k_exp: 2,                 // B34, B35
    k_roll: 0.5,                             // B37  (R-01 tahsisi, IFOV RMS)
    hex: { theta_max: 15, omega_max: 40, alpha_max: 400, fbw: 20, rel_ratio: 0.5,   // B40..B44
           L_off: 0.15, theta_test: 5, microvib: 2, stabOff_ratio: 0.4 },           // B45..B48
    coll: { fc_mm: 1500, Dc_mm: 150, pinhole_um: 50, dT: 10, ratio_min: 3, ap_margin: 1.1 },  // B52..B62
    chain: { imu_bw: 500, imu_noise: 0.5, ac_rate: 1000, ac_noise: 0.5, dt_sync_ms: 0.5,      // B67..B71
             centroid_px: 0.03, scale_eps: 0.005, air: 1.0, pixlock_px: 0.02, roi_fps: 0 },   // B72..B76
    sea: { roll_A: 3, roll_T: 8, pitch_A: 1.5, pitch_T: 10, yaw_A: 1, yaw_T: 12 },            // B79..B84
    viv: { section: 'Dairesel', D: 0.25, St: 0.2, nu: 1.1892e-6, Re_crit: 2e5, fn: 3,         // B85..B90
           K0_lo: 0.6, K0_hi: 2.0, margin: 0.2, amp_deg: 0.05 },                              // B91..B94
    earth: { Omega: 7.292115e-5, lat: 40, az: 90, el: 0, comp: true, delta_deg: 1 },          // B97..B102
    H: { arw: 0.005, bias: 0.05, eps_mrad: 0.1, roll_res_mrad: 0.5, mtf_r: 0.85 },           // Jitter_Butcesi E94,E98,E101,E105,E110
    eis: { fc: 0.5, eta: 0.8, reg_px: 0.1 },                                                 // E63..E65
    unc: { fmin: 0.05, Nper: 30, perSeg: 4, Trec: 900, coh: 0.8, rawExample: 8 },            // Olcum_Belirsizligi E41..E52, E31
  };
}

// Örnek DUT (gerçek ürün değil). Fiziksel yapı Hilkert/Masten ISP modelidir; sayılar,
// varsayılan halde bütçenin örnek tahminlerini yeniden üretecek biçimde ayarlanmıştır.
function dutDefaults() {
  return {
    geom: { a0: 90, e0: 0 },                 // LOS azimutu (pruvaya göre, iskele +) ve elevasyonu (°)
    el: { J: 0.25, fc: 40, fi: 1.35, b: 0.62, k: 0.20,
          Fc: 0.12, Fs: 0.16, ws: 0.003, sigma0: 3e4,
          cogN: 300, cogA: 0.010, Tmax: 20 },
    az: { Ja: 0.35, Jex: 0.20, Jez: 0.25, fc: 30, fi: 1.35, b: 2.2, k: 0.40,
          Fc: 0.45, Fs: 0.60, ws: 0.003, sigma0: 5e4,
          cogN: 360, cogA: 0.020, Tmax: 40 },
    ctl: { fctl: 2000, flp: 400, zlp: 0.7, secant: true,
           res: { on: false, f: 3.0, adaptive: true, gain_dB: 20, zeta: 0.08 } },
    cur: { fbw: 1500 },
    gyro: { fbw: 1000, arw: 0.0042, bi: 0.042, Tc: 100, bias0: 0.04, epsEl: 0.10, epsXel: 0.10, sf_ppm: 100 },
    imb: { me: 20, rcg_e: [0.30, 0.05, 0.40], ma: 30, rcg_a: [0.20, 0.20, 0] },   // kg, mm (E / A çerçevesi)
    L_pg: 0.12,                              // giriş göz bebeği → gimbal merkezi (m, LOS'un tersine)
    modes: { gim: { f: 180, zeta: 0.02, gA: 2.0e-7 }, opt: { f: 120, zeta: 0.02, gAcc: 2.0e-7 } },
    cooler: { f: 60, A: 1.4, h2: 0.35, h3: 0.15 },          // µrad (60 Hz temel genlik), harmonik oranları
    derot: { on: true, lat_ms: 20, sf: 0.01, noise_mrad: 0.05 },
    optics: { k1: -0.002, scaleErr: 0.004 },                 // radyal distorsiyon; gerçek IFOV/nominal − 1
    video: { lat_ms: 0, x0: 0.37, y0: -0.21 },
  };
}

// İşletme ortamı (mast başı, periskop derinliği). Deniz ve VIV çalışma kitabından;
// diğer düzeyler bütçe satırlarının örnek tahminlerine kalibre edilmiştir.
function envDefaults() {
  return {
    seaWidth: 0.12,                          // log-frekans Gauss tepe genişliği (σ_ln)
    viv: { bw: 0.03 },                       // Hz, kilitlenme → neredeyse tek ton
    slap: { rate: 0.10, Tmin: 0.05, Tmax: 0.20, A: 600 },    // olay/s, s, s, µrad (tepe RMS ölçeği)
    lat: { f: 8, bw: 0.8, a_rms: 1.0 },      // m/s² (gövde y, yanal)
    plat: { f1: 4, f2: 33, a_rms: 0.6, mount: { f: 25, zeta: 0.05, kappa: 1.0e-4, yaw: 0.5 } },
    aux: { f: 50, A: 380 },                  // µrad (açısal tepe, yapı yolu)
    hf: { f1: 60, f2: 400, ang_rms: 40, acc_rms: 1.0 },      // µrad RMS açısal, m/s² RMS doğrusal
  };
}
function labDefaults() {
  return {
    microvib: { f1: 5, f2: 150, fres: 70, Qres: 4, gres: 12 },   // RMS çalışma kitabından (2 µrad)
    air: { fc: 2 },                                               // RMS çalışma kitabından (1 µrad)
    floorCoupling: 0,                                             // µrad / (rad/s²) — kolimatör zemin kuplajı
    hexStroke: 0.10,                                              // m (öteleme stroku, örnek)
    rocking: { free: 50, controlled: 2 },                         // µrad/mm (shaker sallanması)
    pivotHull: 1.0,                                               // m (T2.5 ölçekli gövde dönme merkezi)
  };
}
function anaDefaults() {
  return { Tw: 120, detrend: 'linear', pdeWin: 0.1, edgeMargin_px: 2, seeds: 3 };
}
function defaultParams() {
  return { wb: workbookDefaults(), dut: dutDefaults(), env: envDefaults(), lab: labDefaults(), ana: anaDefaults() };
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
function loopModel(ax, ctl, gyro, cur, J, resF) {
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
  const L1 = cmul(cmul(Cs(wct), Gs(wct)), Ps(wct));
  const K = 1 / cabs(L1);
  const L = (w) => cmul(C(K), cmul(cmul(Cs(w), Gs(w)), Ps(w)));
  const den = (w) => { const s = C(0, w); return cadd(cadd(cadd(cmul(C(J), cmul(s, s)), C(0, ax.b * w)), C(ax.k)), cmul(s, cmul(C(K), cmul(Cs(w), Gs(w))))); };
  const drr = (w) => cdiv(C(ax.k, ax.b * w), den(w));                         // θ/θ_taban
  const torque = (w) => cdiv(C(1), den(w));                                    // θ/T_d  (rad/N·m)
  const gyroN = (w) => cdiv(cmul(C(-K), cmul(Cs(w), cmul(cdiv(C(1), C(1, w / wc)), cexpj(-w * tau)))), den(w)); // θ/n (rad per rad/s)
  const pm = 180 + carg(L(wct)) * R2D;
  // kazanç payı: açılmış fazın −180°'yi kestiği frekansta −|L| (dB)
  let gm = Infinity, gmF = null;
  {
    let prev = null, unw = 0;
    for (let f = ax.fc; f < 0.49 * ctl.fctl; f *= 1.01) {
      const ph = carg(L(TAU * f)) * R2D;
      if (prev != null) { while (ph + unw - prev > 180) unw -= 360; while (ph + unw - prev < -180) unw += 360; }
      const pu = ph + unw;
      if (prev != null && prev > -180 && pu <= -180) { gm = -db(cabs(L(TAU * f))); gmF = f; break; }
      prev = pu;
    }
  }
  return { K, wi, pm, gm, gmF, L, drr, torque, gyroN, J };
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
  const hx = wb.hex;
  const reach = (f) => Math.min(hx.theta_max, hx.omega_max / (TAU * f), hx.alpha_max / sq(TAU * f));  // ° (Hexapod_Erisim)
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
  // Dunya_Donusu sayfasındaki izdüşüm formülleri (K-34)
  const earthImg = {
    h: E.Omega * Math.abs(Math.sin(phi) * Math.cos(ep) - Math.cos(phi) * Math.cos(al) * Math.sin(ep)),
    v: E.Omega * Math.abs(Math.cos(phi) * Math.sin(al)),
    r: E.Omega * Math.abs(Math.cos(phi) * Math.cos(al) * Math.cos(ep) + Math.sin(phi) * Math.sin(ep)),
  };
  return { ch, IFOV, FOVh, FOVv, Tint, fps, Nh: ch.Nh, Nv: ch.Nv, req, reach, reachLim, stabOffMax,
           OmL, los0, Delta, dmag, a0, e0, beta, azJ, loopEl, loopAz, earthImg };
}

// ============================================================================
// 03_sim.js — zaman alanı simülatörü
//   taban (hexapod/işletme) → 3B kinematik → 2 eksen gimbal + LuGre + gyro +
//   stabilizasyon döngüsü → esnek/optik modlar → ölçüm zinciri (video, oto-
//   kolimatör, IMU, enkoder) → kayıt
// ============================================================================
const MECH_DEFAULT = { coupling: true, friction: true, cogging: true, misalign: true, gyroNoise: true, gyroBias: true,
  imbalance: true, gimMode: true, optMode: true, cooler: true, earth: true, compErr: true };
const MEAS_DEFAULT = { video: true, ac: true, imu: true, air: true, microvib: true, noise: true };
const AX = { roll: 0, pitch: 1, yaw: 2, x: 0, y: 1, z: 2 };

// hexapod komut profilinin θ/ω/α sınırlarına göre kontrolü (1 kHz örnekleme)
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
  const IFOV = d.IFOV, IFOVt = IFOV * (1 + dut.optics.scaleErr);
  const Tint = S.Tint != null ? S.Tint : d.Tint, fps = d.fps;
  const Nh = d.Nh, Nv = d.Nv;

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
  const hexO = [0, 1, 2].map(() => new Osc2(hexF, 0.7071, dt));
  const vibO = [0, 1, 2].map(() => new Osc2(1500, 0.7071, dt));
  const trO = [0, 1, 2].map(() => new Osc2(1500, 0.7071, dt));
  const mnt = dut.mount || P.env.plat.mount;
  const useMount = S.mount !== false && mnt && mnt.kappa > 0;
  const mO = [0, 1, 2].map(() => new Osc2(mnt.f, mnt.zeta, dt));
  const kRock = (S.rocking || 0) * 1e-3;          // µrad/mm → rad/m
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
  const sf = 1 + G.sf_ppm * 1e-6;
  const epsE = mech.misalign ? G.epsEl * 1e-3 : 0, epsX = mech.misalign ? G.epsXel * 1e-3 : 0;
  const arwN = mech.gyroNoise ? G.arw * DEGPSQH : 0, nStd = arwN / Math.sqrt(dtc);
  const rG = rngf('gyro');
  const gmY = new GaussMarkov(mech.gyroBias ? G.bi * DEGPH * 1.08 : 0, G.Tc, dtc, rngf('gmY'));
  const gmZ = new GaussMarkov(mech.gyroBias ? G.bi * DEGPH * 1.08 : 0, G.Tc, dtc, rngf('gmZ'));
  const b0r = rngf('bias0');
  const b0Y = mech.gyroBias ? G.bias0 * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  const b0Z = mech.gyroBias ? G.bias0 * DEGPH * (b0r.uniform() < 0.5 ? -1 : 1) : 0;
  // kontrolcü süzgeçleri (kontrol hızında)
  const lpE = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp)), lpA = bqLP(CT.flp, fctl, 1 / (2 * CT.zlp));
  const res = CT.res, resF = (res.adaptive && S.resF) ? S.resF : res.f;
  const resOn = !!res.on && stab;
  const gr = Math.pow(10, res.gain_dB / 20) - 1;
  const rbE = bqBP(resF, fctl, 1 / (2 * res.zeta)), rbA = bqBP(resF, fctl, 1 / (2 * res.zeta));
  // sürtünme
  const fricE = mech.friction ? { Fc: EL.Fc, Fs: EL.Fs, ws: EL.ws, s0: EL.sigma0 } : null;
  const fricA = mech.friction ? { Fc: AZ.Fc, Fs: AZ.Fs, ws: AZ.ws, s0: AZ.sigma0 } : null;
  const cogAe = mech.cogging ? EL.cogA : 0, cogAa = mech.cogging ? AZ.cogA : 0;
  // dengesizlik (kg·m)
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
  // türetme (dönüş ekseni etrafında)
  const DR = dut.derot, derotOn = S.derot != null ? !!S.derot : !!DR.on;
  const rotBufN = Math.max(1, Math.round(DR.lat_ms * 1e-3 * fs) + 1), rotBuf = new Float64Array(rotBufN);
  const rD = rngf('derot');
  // ölçüm zinciri
  const CH = wb.chain;
  const airOn = isLab && meas.air && CH.air > 0;
  const airE = airOn ? new ShapedNoise([bqLP(lab.air.fc, fs, 0.5), bqLP(lab.air.fc * 4, fs, 0.7071)], CH.air * URAD, rngf('airE'), fs) : null;
  const airX = airOn ? new ShapedNoise([bqLP(lab.air.fc, fs, 0.5), bqLP(lab.air.fc * 4, fs, 0.7071)], CH.air * URAD, rngf('airX'), fs) : null;
  const airAE = airOn ? new ShapedNoise([bqLP(lab.air.fc, fs, 0.5), bqLP(lab.air.fc * 4, fs, 0.7071)], CH.air * URAD, rngf('airAE'), fs) : null;
  const airAX = airOn ? new ShapedNoise([bqLP(lab.air.fc, fs, 0.5), bqLP(lab.air.fc * 4, fs, 0.7071)], CH.air * URAD, rngf('airAX'), fs) : null;
  const floorK = isLab ? (S.floorCoupling != null ? S.floorCoupling : lab.floorCoupling) * URAD : 0;
  const imuLP = [0, 1, 2].map(() => bqLP(CH.imu_bw, fs, 0.7071));
  const imuDel = Math.max(0, (S.syncDt != null ? S.syncDt : CH.dt_sync_ms) * 1e-3 * fs);
  const imuBufN = Math.ceil(imuDel) + 3, imuBuf = [new Float64Array(imuBufN), new Float64Array(imuBufN), new Float64Array(imuBufN)];
  const rM = rngf('meas');
  const noiseOn = meas.noise !== false;
  const cNoise = noiseOn && isLab ? CH.centroid_px : 0;
  const plA = noiseOn && isLab ? CH.pixlock_px * Math.SQRT2 : 0;
  const imuN = noiseOn ? CH.imu_noise * URAD : 0, acN = noiseOn ? CH.ac_noise * URAD : 0;
  const k1 = dut.optics.k1, rRef2 = (Nh * Nh + Nv * Nv) / 4;
  const x0 = dut.video.x0, y0 = dut.video.y0, edge = P.ana.edgeMargin_px;
  const vidLat = (dut.video.lat_ms || 0) * 1e-3;
  const xiPi = Math.PI / IFOVt;    // 2π ξ_N θ, ξ_N = 1/(2·IFOV)

  // ----------------------------------------------------------- kayıt ---------
  const fRec = (S.rec && S.rec.fs) || 1000, recEvery = Math.max(1, Math.round(fs / fRec));
  const chans = (S.rec && S.rec.ch) || ['opt_el', 'opt_xel', 'base_r', 'base_p', 'base_y', 'imu_r', 'imu_p', 'imu_y'];
  const nRec = Math.floor(N / recEvery) + 1;
  const rec = {}; for (const c of chans) rec[c] = new Float32Array(nRec);
  const want = (c) => rec[c] !== undefined;
  // video
  const doVideo = meas.video !== false;
  const Tf = 1 / fps, tOff = S.frameOffset != null ? S.frameOffset : 0.37e-3;
  const nF = doVideo ? Math.floor((S.T - tOff - Tint) / Tf) + 1 : 0;
  const V = { n: 0, t: new Float64Array(Math.max(nF, 0)), x: new Float64Array(Math.max(nF, 0)), y: new Float64Array(Math.max(nF, 0)),
    valid: new Uint8Array(Math.max(nF, 0)), mEl: new Float64Array(Math.max(nF, 0)), mXel: new Float64Array(Math.max(nF, 0)),
    vEl: new Float64Array(Math.max(nF, 0)), vXel: new Float64Array(Math.max(nF, 0)), oEl: new Float64Array(Math.max(nF, 0)), oXel: new Float64Array(Math.max(nF, 0)),
    fps, Tint, IFOV, x0, y0 };
  let fi = 0, fStart = tOff, fEnd = tOff + Tint, s1e = 0, s2e = 0, s1x = 0, s2x = 0, oce = 0, ose = 0, ocx = 0, osx = 0, fn = 0;
  // ROI yüksek hızlı optik kanal
  const roiF = S.roiFps != null ? S.roiFps : CH.roi_fps;
  const doRoi = isLab && roiF > 0;
  const TroiInt = doRoi ? 0.5 / roiF : 0, nRoi = doRoi ? Math.floor((S.T - TroiInt) * roiF) : 0;
  const RO = { n: 0, t: new Float64Array(nRoi), el: new Float64Array(nRoi), xel: new Float64Array(nRoi), fps: roiF };
  const roiNoise = noiseOn ? CH.centroid_px * Math.sqrt(Tint / Math.max(TroiInt, 1e-9)) * IFOV : 0;
  let ri = 0, rStart = 0, rEnd = TroiInt, rsE = 0, rsX = 0, rn = 0;
  // izleyici (T1.7) ve dönüş (T1.8)
  const TR = S.tracker || null;
  const trQ = []; let trIy = 0, trIz = 0, trWy = 0, trWz = 0, trLost = 0, trLostState = false, trErrE = 0, trErrX = 0;
  const trK = TR ? TAU * TR.bw : 0, trWi = TR ? trK / 4 : 0;
  const SL = S.slew || null;
  const slewRate = (t) => {
    if (!SL) return 0;
    const ang = SL.ang * D2R, wmx = SL.rate * D2R, amx = SL.acc * D2R;
    // trapez profil: ivmelen → sabit → yavaşla; gidiş t0'da, dönüş t0+Tm+hold'da
    const ta = wmx / amx; let tc = ang / wmx - ta; let wpk = wmx;
    if (tc < 0) { tc = 0; wpk = Math.sqrt(ang * amx); }
    const tA = wpk / amx, Tm = 2 * tA + tc;
    const prof = (tt) => tt < 0 || tt > Tm ? 0 : (tt < tA ? amx * tt : (tt < tA + tc ? wpk : wpk - amx * (tt - tA - tc)));
    return prof(t - SL.t0) - prof(t - SL.t0 - Tm - SL.hold);
  };

  // ------------------------------------------------------------ durum --------
  let lx = los0[0], ly = los0[1], lz = los0[2];
  let Oey = 0, Oaz = 0;                  // gimbal eylemsiz hızları (rad/s)
  let zE = 0, zA = 0;                    // LuGre kıl durumları
  let TmE = 0, TmA = 0, TappE = 0, TappA = 0, TnextE = 0, TnextA = 0;
  let I1e = 0, I2e = 0, I1a = 0, I2a = 0;
  let gFy = 0, gFz = 0, gMy = 0, gMz = 0;  // gyro süzgeç durumu, ölçülen
  let a = a0, e = e0;
  let satCount = 0, invalid = 0, maxRelE = 0, maxRelA = 0;

  // başlangıç: statik dengesizlik torkunu integratöre yükle, gimbal hızlarını eylemsiz kompanzasyona eşitle
  {
    const ca = Math.cos(a0), sa = Math.sin(a0), ce = Math.cos(e0), se = Math.sin(e0);
    // taban seviyede: R_LB = Rz(β); fL = (0,0,g)
    const fB = [0, 0, G0];                       // R_LB^T (0,0,g) = (0,0,g)
    const xEB = [ca * ce, sa * ce, se], yEB = [-sa, ca, 0], zEB = [-ca * se, -sa * se, ce];
    const fE = [xEB[2] * G0, 0, zEB[2] * G0];
    const TiE = -(Ue[2] * fE[0] - Ue[0] * fE[2]);
    const fA = [ca * fB[0] + sa * fB[1], -sa * fB[0] + ca * fB[1], fB[2]];
    const TiA = -(Ua[0] * fA[1] - Ua[1] * fA[0]);
    // durağanda e=0 → I1=0, u2 = ωi·I2, T = K·u2 (az: /cos e) = −Ti
    I2e = -TiE / (Ke * wie); I2a = -TiA * (CT.secant ? Math.max(ce, 0.1) : 1) / (Ka * wia);
    TmE = TappE = TnextE = -TiE; TmA = TappA = TnextA = -TiA;
    lpE.reset(wie * I2e); lpA.reset(wia * I2a);
    if (comp) {
      // başlangıçta döngü (g − c) = 0 tutuyor
      const yEL0 = yr, zEL0 = zr;
      Oey = yEL0[0] * OmH[0] + yEL0[1] * OmH[1] + yEL0[2] * OmH[2];
      Oaz = zEL0[0] * OmH[0] + zEL0[1] * OmH[1] + zEL0[2] * OmH[2];
    }
  }

  const prog = Math.max(1, Math.floor(N / 60));
  let ir = 0;
  let wCmdY = 0, wCmdZ = 0;
  let L00, L01, L02, L10, L11, L12, L20, L21, L22;

  for (let k = 0; k < N; k++) {
    const t = k * dt;
    // ----------------------------------------------- 1) taban hareketi ------
    cmdCh.eval(t, cmdv); vibCh.eval(t, vibv);
    trCh.eval(t, trv); accCh.eval(t, accv); accmCh.eval(t, accmv);
    for (let i = 0; i < 3; i++) {
      let u = cmdv[i]; if (u > thMax) u = thMax; else if (u < -thMax) u = -thMax;
      hexO[i].step(u); vibO[i].step(vibv[i]); trO[i].step(trv[i]);
    }
    const amx = accmv[0] + trO[0].a, amy = accmv[1] + trO[1].a;
    if (useMount) { mO[0].step(mnt.kappa * amy); mO[1].step(mnt.kappa * amx); mO[2].step(mnt.kappa * mnt.yaw * amy); }
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
    if (stab) {
      const bx = L00 * lx + L10 * ly + L20 * lz, by = L01 * lx + L11 * ly + L21 * lz, bz = L02 * lx + L12 * ly + L22 * lz;
      e = Math.asin(clamp(bz, -1, 1)); a = Math.atan2(by, bx);
    } else { a = a0; e = e0; }
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
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
    const aBx = trO[0].a + accv[0] + accmv[0] + (qd * rpg[2] - rd * rpg[1]) + (q * wxr2 - r * wxr1);
    const aBy = trO[1].a + accv[1] + accmv[1] + (rd * rpg[0] - pd * rpg[2]) + (r * wxr0 - p * wxr2);
    const aBz = trO[2].a + accv[2] + accmv[2] + (pd * rpg[1] - qd * rpg[0]) + (p * wxr1 - q * wxr0);
    const aLx = L00 * aBx + L01 * aBy + L02 * aBz, aLy = L10 * aBx + L11 * aBy + L12 * aBz, aLz = L20 * aBx + L21 * aBy + L22 * aBz;
    const fLz = aLz + G0;
    const fEx = xLx * aLx + xLy * aLy + xLz * fLz, fEy = yLx * aLx + yLy * aLy + yLz * fLz, fEz = zLx * aLx + zLy * aLy + zLz * fLz;
    const aEy = yLx * aLx + yLy * aLy + yLz * aLz, aEz = zLx * aLx + zLy * aLy + zLz * aLz;
    // ----------------------------------------------- 5) gyro + kontrol ------
    if (stab) {
      const gyT = Oey + epsE * Oex, gzT = Oez + epsX * Oex;
      gFy += kgy * (gyT - gFy); gFz += kgy * (gzT - gFz);
      if (k % m === 0) {
        gMy = sf * gFy + b0Y + gmY.step() + nStd * rG.gauss();
        gMz = sf * gFz + b0Z + gmZ.step() + nStd * rG.gauss();
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
        // yükseklik: PII + (rezonans) + AGF ; çıkış bir kontrol periyodu gecikmeli
        {
          const err = wCmdY - (gMy - cy);
          I1e += err * dtc; const u1 = err + wie * I1e; I2e += u1 * dtc; let u2 = u1 + wie * I2e;
          if (resOn) u2 += gr * rbE.step(u2);
          const u3 = lpE.step(u2);
          let T = Ke * u3;
          if (T > EL.Tmax) { T = EL.Tmax; I2e -= u1 * dtc; satCount++; } else if (T < -EL.Tmax) { T = -EL.Tmax; I2e -= u1 * dtc; satCount++; }
          TappE = TnextE; TnextE = T;
        }
        {
          const err = wCmdZ - (gMz - cz);
          I1a += err * dtc; const u1 = err + wia * I1a; I2a += u1 * dtc; let u2 = u1 + wia * I2a;
          if (resOn) u2 += gr * rbA.step(u2);
          const u3 = lpA.step(u2);
          let T = Ka * u3 / (CT.secant ? Math.max(ce, 0.1) : 1);
          if (T > AZ.Tmax) { T = AZ.Tmax; I2a -= u1 * dtc; satCount++; } else if (T < -AZ.Tmax) { T = -AZ.Tmax; I2a -= u1 * dtc; satCount++; }
          TappA = TnextA; TnextA = T;
        }
      }
      TmE += kcur * (TappE - TmE); TmA += kcur * (TappA - TmA);
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
      const TiA = -(Ua[0] * fAy - Ua[1] * fAx);
      const TtE = TmE - FfE - be * wE - ke * etaE - cogAe * Math.sin(EL.cogN * etaE) + TiE;
      const TtA = TmA - FfA - ba * wA - ka * etaA - cogAa * Math.sin(AZ.cogN * etaA) + TiA;
      const Jaz = AZ.Ja + AZ.Jex * se * se + AZ.Jez * ce * ce;
      Oey += TtE / Je * dt; Oaz += TtA / Jaz * dt;
      // LOS yönünü laboratuvara göre döndür (yalnız y_E, z_E bileşenleri)
      const OezN = -oAx * se + Oaz * ce;
      const wy = Oey - (yLx * OmL[0] + yLy * OmL[1] + yLz * OmL[2]);
      const wz = OezN - (zLx * OmL[0] + zLy * OmL[1] + zLz * OmL[2]);
      lx += dt * (wz * yLx - wy * zLx); ly += dt * (wz * yLy - wy * zLy); lz += dt * (wz * yLz - wy * zLz);
      const nl = 1 / Math.sqrt(lx * lx + ly * ly + lz * lz); lx *= nl; ly *= nl; lz *= nl;
      const ae = Math.abs(wE), aa = Math.abs(wA); if (ae > maxRelE) maxRelE = ae; if (aa > maxRelA) maxRelA = aa;
    }
    // ----------------------------------------------- 6) esnek/optik modlar --
    const aEyB = -sa * pd + ca * qd, aEzB = -ca * se * pd - sa * se * qd + ce * rd;   // taban açısal ivmesi E'de
    gimY.step(gGim * aEyB); gimZ.step(gGim * aEzB);
    optY.step(gOpt * aEy); optZ.step(gOpt * aEz);
    let cEl = 0, cXel = 0;
    if (cAmp > 0) {
      cEl = cAmp * (Math.sin(cw * t + cph[0]) + CL.h2 * Math.sin(2 * cw * t + cph[1]) + CL.h3 * Math.sin(3 * cw * t + cph[2]));
      cXel = 0.7 * cAmp * (Math.sin(cw * t + cph[3]) + CL.h2 * Math.sin(2 * cw * t + cph[4]) + CL.h3 * Math.sin(3 * cw * t + cph[5]));
    }
    const mechEl = elR - gimY.x, mechXel = xelR + gimZ.x;
    const optEl = mechEl + optZ.x + cEl, optXel = mechXel + optY.x + cXel;
    // türetme artığı
    rotBuf[k % rotBufN] = rot;
    const rotDel = rotBuf[(k + 1) % rotBufN];
    const rotRes = derotOn ? rot - (1 + DR.sf) * rotDel : rot;
    // ----------------------------------------------- 7) ölçüm zinciri -------
    const tgE = (airE ? airE.step() : 0) + floorK * phdd, tgX = (airX ? airX.step() : 0) + floorK * psdd;
    const relEl = optEl - tgE, relXel = optXel - tgX;
    if (doVideo && fi < nF) {
      if (t >= fStart && t < fEnd) {
        s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel;
        oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++;
      } else if (t >= fEnd) {
        if (fn > 0) {
          const me = s1e / fn, mx = s1x / fn;
          V.t[fi] = fStart + Tint / 2 + vidLat; V.mEl[fi] = me; V.mXel[fi] = mx;
          V.vEl[fi] = Math.max(0, s2e / fn - me * me); V.vXel[fi] = Math.max(0, s2x / fn - mx * mx);
          V.oEl[fi] = Math.hypot(oce, ose) / fn; V.oXel[fi] = Math.hypot(ocx, osx) / fn;
          // odak düzlemi: piksel, distorsiyon, piksel kilitlenmesi, centroid gürültüsü
          const xp = mx / IFOVt + x0, yp = me / IFOVt + y0;
          const rr2 = (xp * xp + yp * yp) / rRef2, dd = 1 + k1 * rr2;
          const xd = xp * dd, yd = yp * dd;
          const ok = Math.abs(xd) < Nh / 2 - edge && Math.abs(yd) < Nv / 2 - edge;
          V.valid[fi] = ok ? 1 : 0; if (!ok) invalid++;
          V.x[fi] = xd + plA * Math.sin(TAU * xd) + cNoise * rM.gauss();
          V.y[fi] = yd + plA * Math.sin(TAU * yd) + cNoise * rM.gauss();
          if (TR) trQ.push({ t: fEnd + TR.lat_frames * Tf, valid: ok, el: (V.y[fi] - y0) * IFOV, xel: (V.x[fi] - x0) * IFOV });
          fi++; V.n = fi;
        }
        fStart = tOff + fi * Tf; fEnd = fStart + Tint;
        s1e = s2e = s1x = s2x = oce = ose = ocx = osx = 0; fn = 0;
        if (t >= fStart && t < fEnd) { s1e += relEl; s2e += relEl * relEl; s1x += relXel; s2x += relXel * relXel;
          oce += Math.cos(xiPi * relEl); ose += Math.sin(xiPi * relEl); ocx += Math.cos(xiPi * relXel); osx += Math.sin(xiPi * relXel); fn++; }
      }
    }
    if (doRoi && ri < nRoi) {
      if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rn++; }
      else if (t >= rEnd) {
        if (rn > 0) { RO.t[ri] = rStart + TroiInt / 2; RO.el[ri] = rsE / rn + roiNoise * rM.gauss(); RO.xel[ri] = rsX / rn + roiNoise * rM.gauss(); ri++; RO.n = ri; }
        rStart = ri / roiF; rEnd = rStart + TroiInt; rsE = rsX = 0; rn = 0;
        if (t >= rStart && t < rEnd) { rsE += relEl; rsX += relXel; rn++; }
      }
    }
    // IMU: 500 Hz AGF + senkron gecikmesi
    const bfR = imuLP[0].step(ph), bfP = imuLP[1].step(th), bfY = imuLP[2].step(ps);
    imuBuf[0][k % imuBufN] = bfR; imuBuf[1][k % imuBufN] = bfP; imuBuf[2][k % imuBufN] = bfY;
    // ----------------------------------------------- 8) kayıt ---------------
    if (k % recEvery === 0 && ir < nRec) {
      if (want('opt_el')) rec.opt_el[ir] = optEl;
      if (want('opt_xel')) rec.opt_xel[ir] = optXel;
      if (want('mech_el')) rec.mech_el[ir] = mechEl;
      if (want('mech_xel')) rec.mech_xel[ir] = mechXel;
      if (want('rel_el')) rec.rel_el[ir] = relEl;
      if (want('rel_xel')) rec.rel_xel[ir] = relXel;
      if (want('ac_el')) rec.ac_el[ir] = mechEl + (airAE ? airAE.step() : 0) + acN * rM.gauss();
      if (want('ac_xel')) rec.ac_xel[ir] = mechXel + (airAX ? airAX.step() : 0) + acN * rM.gauss();
      if (want('base_r')) rec.base_r[ir] = ph;
      if (want('base_p')) rec.base_p[ir] = th;
      if (want('base_y')) rec.base_y[ir] = ps;
      if (want('imu_r') || want('imu_p') || want('imu_y')) {
        const kd = k - imuDel, k0 = Math.floor(kd), fr = kd - k0;
        for (let i = 0; i < 3; i++) {
          const b = imuBuf[i], v0 = b[((k0 % imuBufN) + imuBufN) % imuBufN], v1 = b[(((k0 + 1) % imuBufN) + imuBufN) % imuBufN];
          const v = (k0 < 0 ? 0 : v0 + (v1 - v0) * fr) + imuN * rM.gauss();
          if (i === 0 && want('imu_r')) rec.imu_r[ir] = v; if (i === 1 && want('imu_p')) rec.imu_p[ir] = v; if (i === 2 && want('imu_y')) rec.imu_y[ir] = v;
        }
      }
      if (want('cmd_r')) rec.cmd_r[ir] = cmdv[0];
      if (want('cmd_p')) rec.cmd_p[ir] = cmdv[1];
      if (want('cmd_y')) rec.cmd_y[ir] = cmdv[2];
      if (want('enc_a')) rec.enc_a[ir] = etaA;
      if (want('enc_e')) rec.enc_e[ir] = e - e0;
      if (want('gyr_y')) rec.gyr_y[ir] = gMy;
      if (want('gyr_z')) rec.gyr_z[ir] = gMz;
      if (want('rot')) rec.rot[ir] = rot;
      if (want('rot_res')) rec.rot_res[ir] = rotRes;
      if (want('tq_e')) rec.tq_e[ir] = TmE;
      if (want('tq_a')) rec.tq_a[ir] = TmA;
      if (want('w_e')) rec.w_e[ir] = wE;
      if (want('w_a')) rec.w_a[ir] = wA;
      if (want('acc_e')) rec.acc_e[ir] = fEx;      // LOS boyunca özgül kuvvet (bilgi)
      if (want('acc_y')) rec.acc_y[ir] = aBy;
      if (want('trk_el')) rec.trk_el[ir] = trErrE;
      ir++;
    }
    if (onProg && k % prog === 0) onProg(k / N);
  }
  return {
    S, meta: { fs, T: S.T, N, fRec, nRec: ir, dt, IFOV, IFOVt, Tint, fps, a0, e0, beta, comp, stab, isLab,
      K: { el: Ke, az: Ka }, earthImg: d.earthImg, OmH, los0 },
    rec, video: V, roi: RO,
    stats: { satCount, invalidFrames: invalid, maxRelE, maxRelA, trackLost: trLost },
  };
}
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
// PSD_Agirlik sayfasının hesabı (yamuk kuralı, sinc² ağırlık)
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
    const en = Math.min(n, st + perWin); if (en - st < Math.min(perWin, 10)) { if (st > 0) break; }
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
// EIS: birinci derece yol yumuşatma, registrasyon verimi η, registrasyon artığı (px RMS)
function applyEIS(x, ok, fps, fc, eta, regRad, rng) {
  const n = x.length, y = new Float64Array(n);
  const al = fc > 0 ? 1 - Math.exp(-TAU * fc / fps) : 0;
  let s = null;
  for (let i = 0; i < n; i++) {
    if (ok && !ok[i]) { y[i] = x[i]; continue; }
    if (s === null) s = x[i]; else if (fc > 0) s += al * (x[i] - s);
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
  const ma = aMean(a), mb = aMean(b); for (let i = 0; i < n; i++) { a[i] -= ma; b[i] -= mb; }
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

return {D2R, R2D, TAU, URAD, DEGPH, DEGPSQH, RNG, makeRngFactory, fft, synthSeries, shapeLogGauss, shapeGauss, Biquad, bqLP, bqHP, bqBP, Osc2, Ww, db, sq, logspace, linspace, sinc, workbookDefaults, dutDefaults, envDefaults, labDefaults, anaDefaults, defaultParams, cloneParams, derive, loopModel, cabs, carg, MECH_DEFAULT, MEAS_DEFAULT, hexLimitCheck, simIter, runSim, aMean, aRms, aStd, aPctAbs, aMaxAbs, detrend, sineFit, welch, welchCSD, tfH1, bandRms, cumRms, psdWeighting, allanDev, frameSeries, videoMetrics, applyEIS, delayEstimate, besselJ0, pdeStats, windowedWander};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LOSSIM;
