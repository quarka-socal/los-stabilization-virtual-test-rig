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
