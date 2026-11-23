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
