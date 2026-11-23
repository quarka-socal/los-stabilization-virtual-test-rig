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
