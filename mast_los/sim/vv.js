// ============================================================================
// vv.js — doğrulama ve geçerleme (V&V) paketi
//   W: analitik hesaplar — bütçe, türetilmiş girdiler, dünya dönüşü, hexapod erişimi, VIV (v13.2: T2.1 bandı, B2-01 DRR parametresi; v13.3: kütle oranı, hız zarfı, mast başı ötelemesi; v13.4: W11 kolimatör ve göz bebeği kayması), belirsizlik, PSD ağırlıkları, kaldıraç kolu bütçesi (bağımsız ikinci uygulama)
//   N: sayısal yapı taşları (kapalı biçim çözümler, scipy çapraz kontrolü)
//   K: kinematik ve geometri (bağımsız dönüşüm matrisleriyle; v13.5: K7 kolimatör paralaksı)
//   D: dinamik ve kontrol (zaman alanı ↔ analitik döngü modeli; v13.4: D5 hexapod iletimi ve T2.5 normalizasyonu)
//   C: ayrıklaştırma yakınsaması (örnekleme hızı)
//   M: ölçüm zinciri ve kalibrasyon testleri (bilinen model değerlerinin geri kazanımı)
//   V: rüzgâr kaynaklı girdap kopması (gemi direği); v13.2: V6 T2.2 yol ayrımı (ayna ↔ video − ayna); v13.3: V7 denizaltı mast başı ötelemesi
//   S: 6-DOF deniz hareketi, kaldıraç kolu (v13.1: r = (rx, ry, rz) vektörü), laboratuvar öteleme ölçeği, T2.5 kestirimi (v11)
//   F: FOG parametreleri — gecikme, ölçek hatası, eksen kaçıklığı, sıcaklık katsayısı, doyma, g-duyarlılığı (v11)
//   G: proje LOS kalıntı metrikleri — Gauss/ton sentetik sınama, sıfır fazlı yüksek geçiren, dış takip döngüsü, pozlama içi (v12)
// Çıktı: vv.json (sayfaya gömülür)
// ============================================================================
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const OUT = [];
const T0 = Date.now();
const D2R = Math.PI / 180, TAU = 2 * Math.PI;
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : ((Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0)) ? x.toExponential(Math.max(1, d - 1)) : x.toFixed(d));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
function add(grp, id, name, method, exp, got, crit, pass, extra) {
  const o = Object.assign({ grp, id, name, method, exp, got, crit, pass: !!pass }, extra || {});
  OUT.push(o);
  console.log(`${pass ? 'OK ' : 'XX '} ${id} ${name}\n     beklenen: ${exp}\n     elde:     ${got}\n     ölçüt:    ${crit}`);
}
const run = (id) => !only || only.has(id) || only.has(id.charAt(0));
// v10 ile özdeş doğrulama tabanı (uyum kipi: görüntü rotasyonu kenarda, ek bütçe satırları ve v11 ekleri
// nötr). v11 eklerinin kendi kontrolleri (K6, M7, S, F) v11 varsayılanlarıyla koşar: full().
const base = () => L.compatV10(L.defaultParams());
const full = (kind) => L.defaultParams(kind);
// tüm bozucu mekanizmalar kapalı (yalnız istenenler açılır)
const MECH_OFF = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false]));
const MEAS_OFF = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
function rec(R) { const n = R.meta.nRec, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = i / R.meta.fRec; return t; }
function idx(t, a, b) { let i0 = 0; while (i0 < t.length && t[i0] < a) i0++; let i1 = i0; while (i1 < t.length && t[i1] <= b) i1++; return [i0, i1]; }
function slope(t, x, i0, i1) { let st = 0, sx = 0, stt = 0, stx = 0, n = 0; for (let i = i0; i < i1; i++) { st += t[i]; sx += x[i]; stt += t[i] * t[i]; stx += t[i] * x[i]; n++; } return (n * stx - st * sx) / (n * stt - st * st); }
// bağımsız dönüşüm matrisleri
const mm = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv = (A, v) => [0, 1, 2].map(i => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return a.map(v => v / n); };

// ============================================================ W — analitik hesaplar: bağımsız ikinci uygulama
// Aşağıdaki fonksiyonlar motor kodunu kullanmaz; formüller Yöntem sekmesindeki ve teknik kullanım kılavuzundaki tanımlardan yeniden yazılmıştır.
// Girdi olarak yalnız parametre nesnesi P kullanılır. Motorla fark ≤ 1·10⁻¹² (göreli) beklenir.
const W_IFOV = (P) => { const c = P.wb.channels.find(q => q.name === P.wb.refChannel) || P.wb.channels[0]; return { c, IF: (c.p_um * 1e-6) / (c.f_mm * 1e-3) }; };
const W_sinc2 = (x) => (x === 0 ? 1 : (Math.sin(x) / x) ** 2);
const W_ALLOC40 = { 'B1-01': 5, 'B1-02': 3, 'B1-03': 3, 'B1-04': 4, 'B1-05': 2, 'B1-06': 1, 'B1-07': 4, 'B2-01': 6, 'B2-02': 3, 'B2-03': 3, 'B2-04': 2,
  'B2-05': 1, 'B2-06': 3, 'B3-01': 4, 'B3-02': 2, 'B3-03': 3, 'B3-04': 2 };      // µrad @ IFOV = 40 µrad (q = Q/40 µrad)
function W_ref(P) {
  const { c, IF } = W_IFOV(P), IFu = IF * 1e6, wb = P.wb, Tint = c.Tint_ms / 1000, fps = c.fps;
  const FOVh = 2 * Math.atan(c.Nh * c.p_um * 1e-6 / (2 * c.f_mm * 1e-3)), FOVv = 2 * Math.atan(c.Nv * c.p_um * 1e-6 / (2 * c.f_mm * 1e-3));   // rad
  const req = { W: wb.k_wander * IFu, S: wb.k_smear * IFu, D: wb.drift_ifov * IFu, P99: wb.k_conf * wb.k_wander * IFu };
  const thRef = wb.rotRef === 'edge' ? FOVh / 2 : Math.atan(0.5 * Math.hypot(c.Nh, c.Nv) * c.p_um * 1e-6 / (c.f_mm * 1e-3));
  return { c, IF, IFu, Tint, fps, FOVh, FOVv, req, thRef };
}
// bütçe: satır tanımları (E, F, G, H, L, M) motorun budgetRows'undan alınır, ama formül türetilen satırların E değerleri ve
// bütün türetilmiş sütunlar burada yeniden hesaplanır
function W_budget(P, rows) {
  const R = W_ref(P), wb = P.wb, H = wb.H, tau = wb.tau, e = wb.eis, sea = wb.sea, d2r = Math.PI / 180;
  const qa = (A) => A;                                          // dar kip: eşdeğer sinüs genliği girilen değerdir
  const expE = { 'B1-01': sea.mode === '6dof' ? null : qa(sea.roll_A), 'B1-02': sea.mode === '6dof' ? null : qa(sea.pitch_A), 'B1-03': sea.mode === '6dof' ? null : qa(sea.yaw_A),
    'B1-05': H.arw * d2r / 60 * 1e6 * Math.sqrt(tau), 'B1-06': H.bias * d2r / 3600 * 1e6 * tau, 'R-01': H.roll_res_mrad * 1e-3 * R.thRef * 1e6,
    'B1-09': (H.b0_res + Math.abs(H.tc_bias * H.dT)) * d2r / 3600 * 1e6 * tau };
  // B1-04 (v13.8): 'los' tabanında ε·√2·σ_rot, σ_rot² = (cos a0·σ_roll)² + (sin a0·σ_pitch)² (yatay LOS, bağımsız serbestlik dereceleri);
  // 'roll' tabanında (uyum kipi) ε·A_roll. Dar kipte σ = A/√2 doğrudan girilen genliklerden.
  if (sea.mode !== '6dof') {
    const a0 = P.dut.geom.a0 * d2r, sr = sea.roll_A * d2r / Math.SQRT2, sp = sea.pitch_A * d2r / Math.SQRT2;
    expE['B1-04'] = (H.epsBasis || 'los') === 'roll' ? H.eps_mrad * 1e-3 * sea.roll_A * d2r * 1e6 : H.eps_mrad * 1e-3 * Math.SQRT2 * Math.hypot(Math.cos(a0) * sr, Math.sin(a0) * sp) * 1e6;
  }
  // v13.9 (§8 K2): 'window' (varsayılan) — B1-05 wander penceresinde ARW·√(T_w/15) (doğrusal trend çıkarılmış Wiener süreci), frekansı
  // 1/T_w; B1-06 ve B1-09 yalnız drift ('D', toplamlara girmez). 'tau' (uyum kipi): üçü de τ metriğiyle wander toplamında.
  const win = (H.rwMetric || 'window') !== 'tau', E96tau = expE['B1-05'], expL = {}, expG = {};
  if (win) { expE['B1-05'] = H.arw * d2r / 60 * 1e6 * Math.sqrt(P.ana.Tw / 15); expG['B1-05'] = 1 / P.ana.Tw; expL['B1-06'] = 'D'; expL['B1-09'] = 'D'; }
  const out = rows.map(r0 => {
    const r = { id: r0.id, band: r0.band, L: expL[r0.id] || (r0.id === 'R-01' ? 'H' : 'E'), M: r0.M, Lmis: (expL[r0.id] || (r0.id === 'R-01' ? 'H' : 'E')) !== r0.L };
    r.E = expE[r0.id] != null ? expE[r0.id] : r0.E;
    const G0 = expG[r0.id] != null ? expG[r0.id] : r0.G; r.G = G0;
    r.Q = r0.id === 'R-01' ? wb.k_roll * R.IFu : (W_ALLOC40[r0.id] != null ? W_ALLOC40[r0.id] * R.IFu / 40 : 0);
    const base = r0.F === '° genlik' ? r.E * d2r * 1e6 / Math.SQRT2 : (r0.F === 'µrad genlik' ? r.E / Math.SQRT2 : (r0.F === '° RMS' ? r.E * d2r * 1e6 : r.E));
    r.I = base * 10 ** (r0.H / 20); r.K = r.I;
    r.N = G0 > 0 ? W_sinc2(Math.PI * G0 * R.Tint) : 1;
    r.O = r.K * Math.sqrt(r.N); r.Pp = r.K * Math.sqrt(Math.max(0, 1 - r.N)); r.AA = r.Q * Math.sqrt(r.N); r.AB = r.Q * Math.sqrt(Math.max(0, 1 - r.N));
    r.AC = G0 > 0 ? Math.abs(G0 - R.fps * Math.round(G0 / R.fps)) : 0;              // videoda katlanmış frekans
    const x = r.AC / e.fc;
    r.AD = r.AC > 0 ? (e.fc > 0 ? Math.sqrt((1 + ((1 - e.eta) * x) ** 2) / (1 + x * x)) : 1 - e.eta) : 1;
    r.AE = r.O * r.AD; r.AH = r.O * (r.AC > 0 ? 1 - e.eta : 1);
    return r;
  });
  // toplama kuralı: yalnız 'E' sınıfı satırlar; aynı grup (M) satırları önce doğrusal toplanır (tam korelasyon), sonra karesel
  const rss = (key, band) => { const sel = out.filter(r => r.L === 'E' && (!band || r.band === band)); const g = {}; let s = 0;
    for (const r of sel) { if (r.M) g[r.M] = (g[r.M] || 0) + r[key]; else s += r[key] ** 2; } for (const v of Object.values(g)) s += v * v; return Math.sqrt(s); };
  const T = { rows: out, bands: {}, tot: { wander: rss('O'), smear: rss('Pp'), los: rss('K'), alloc: rss('Q') } };
  for (const b of ['B1', 'B2', 'B3']) T.bands[b] = { wander: rss('O', b), smear: rss('Pp', b), los: rss('K', b), alloc: rss('Q', b) };
  const reg = e.reg_px * R.IFu, Om = wb.earth.Omega * 1e6, comp = Om * wb.earth.delta_deg * d2r;
  const r05 = out.find(r => r.id === 'B1-05'), r06 = out.find(r => r.id === 'B1-06'), Eb0 = wb.extRows !== false ? expE['B1-09'] : 0;
  Object.assign(T, { wander: T.tot.wander, smear: T.tot.smear, los: T.tot.los, wanderUse: T.tot.wander / R.req.W, smearUse: T.tot.smear / R.req.S,
    wanderPx: T.tot.wander / R.IFu, smearPx: T.tot.smear / R.IFu, radial: Math.SQRT2 * T.tot.wander, radialPx: Math.SQRT2 * T.tot.wander / R.IFu,
    mtfNyq: Math.exp(-(Math.PI ** 2) * (T.tot.smear / R.IFu) ** 2 / 2), mtfHalf: Math.exp(-(Math.PI ** 2) * (T.tot.smear / R.IFu) ** 2 / 8), mtfReq: Math.exp(-(Math.PI ** 2) * (R.req.S / R.IFu) ** 2 / 2),
    peak: wb.k_conf * T.tot.wander, E96: E96tau, E99: r06.E, E119: comp, E120: comp * tau, drift: Math.hypot(E96tau, r06.E + Eb0 + comp * tau),
    Lmis: out.filter(r => r.Lmis).map(r => r.id),
    eisWander: Math.sqrt(rss('AE') ** 2 + reg * reg), eisLock: Math.sqrt(rss('AH') ** 2 + reg * reg), allocW: rss('AA'), allocS: rss('AB'),
    reqDRR: 20 * Math.log10(out.find(r => r.id === 'B1-01').Q / (sea.roll_A * d2r * 1e6 / Math.SQRT2)) });
  return T;
}
const W_cmp = (pairs) => { let worst = 0, where = ''; for (const [k, a, b] of pairs) { const e = Math.abs(a - b) / Math.max(Math.abs(b), 1e-9); if (e > worst) { worst = e; where = k; } } return { worst, where, n: pairs.length }; };
const W_cases = () => [['v10 uyum kipi', base()], ['denizaltı varsayılanı', full('sub')], ['gemi varsayılanı', full('ship')],
  ['HDTV-NFOV, Z540.3, τ = 10 s', (() => { const P = full('sub'); P.wb.refChannel = 'HDTV-NFOV'; P.wb.TUR_def = 'Z540.3'; P.wb.tau = 10; P.wb.eis.fc = 0; return P; })()]];
if (run('W1')) {
  const cols = ['E', 'G', 'I', 'K', 'N', 'O', 'Pp', 'Q', 'AA', 'AB', 'AC', 'AD', 'AE', 'AH'], parts = []; let worst = 0, n = 0, where = '', lmis = [];
  for (const [nm, P] of W_cases()) {
    const B = L.computeBudget(P), Rf = W_budget(P, L.budgetRows(P));
    if (Rf.Lmis.length) lmis.push(`${nm}: ${Rf.Lmis.join(', ')}`);
    const pr = []; B.rows.forEach((r, i) => { const q = Rf.rows[i]; if (r.id !== q.id) pr.push(['sıra ' + r.id, 1, 0]); for (const c of cols) pr.push([`${r.id} ${c}`, r[c], q[c]]); });
    const z = W_cmp(pr); n += z.n; parts.push(`${nm}: ${f(z.worst, 2)}`); if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W1', 'Bütçe satırları: girdi düzeyi, tahmin, wander/smear ayrımı, tahsis, EIS sütunları', `4 durum (v10 uyum kipi, denizaltı, gemi, HDTV-NFOV + Z540.3 + τ = 10 s + EIS kilit) × her satır × ${cols.length} sütun; v13.9: B1-05 wander penceresinde ARW·√(T_w/15) ve G = 1/T_w, B1-06 ve B1-09 yalnız drift (uyum kipinde τ metriği); ikinci uygulama: base → 10^(H/20), W_w = sinc²(πG·T_int), Q = q·IFOV, katlanma |G − fps·round(G/fps)|, EIS artık çarpanı`,
    'özdeş', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı · ${parts.join(' · ')}; toplama sınıfı (wander / yalnız drift / rotasyon) uyuşmazlığı ${lmis.length ? lmis.join('; ') : 'yok'}`, '≤ 1·10⁻¹², sınıf uyuşmazlığı yok', worst <= 1e-12 && !lmis.length);
}
if (run('W2')) {
  const keys = ['wander', 'smear', 'los', 'wanderUse', 'smearUse', 'wanderPx', 'smearPx', 'radial', 'radialPx', 'mtfNyq', 'mtfHalf', 'mtfReq', 'peak', 'drift', 'E96', 'E99', 'E119', 'E120', 'eisWander', 'eisLock', 'allocW', 'allocS', 'reqDRR'];
  let worst = 0, n = 0, where = '';
  for (const [nm, P] of W_cases()) {
    const B = L.computeBudget(P), Rf = W_budget(P, L.budgetRows(P)), pr = keys.map(k => [k, B[k], Rf[k]]);
    for (const b of ['B1', 'B2', 'B3']) for (const k of ['wander', 'smear', 'los', 'alloc']) pr.push([b + ' ' + k, B.bands[b][k], Rf.bands[b][k]]);
    for (const k of ['wander', 'smear', 'los', 'alloc']) pr.push(['toplam ' + k, B.tot[k], Rf.tot[k]]);
    const z = W_cmp(pr); n += z.n; if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W2', 'Bütçe toplamları: bant RSS, G1 doğrusal toplamı, kullanım, MTF, tepe, drift, EIS, tahsis payları, gerekli DRR', '4 durum; toplama kuralı yalnız E sınıfı satırlar, G1 grubu önce doğrusal; drift = √(ARW√τ² + (Bτ + b0 artığı + Ω·δ·τ)²); MTF = exp(−π²(σ/IFOV)²/2)',
    'özdeş', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı`, '≤ 1·10⁻¹²', worst <= 1e-12);
}
if (run('W3')) {
  let worst = 0, n = 0, where = '';
  for (const [nm, P] of W_cases()) {
    const d = L.derive(P), R = W_ref(P), r2d = 180 / Math.PI;
    const pr = [['IFOV', d.IFOV, R.IF], ['FOVh', d.FOVh, R.FOVh * r2d], ['FOVv', d.FOVv, R.FOVv * r2d], ['T_int', d.Tint, R.Tint], ['fps', d.fps, R.fps],
      ['wander', d.req.wander * 1e6, R.req.W], ['smear', d.req.smear * 1e6, R.req.S], ['drift', d.req.drift * 1e6, R.req.D], ['P99', d.req.p99 * 1e6, R.req.P99],
      ['roll sınırı', d.rot.lim, P.wb.k_roll * R.IF / R.thRef], ['stab-OFF', d.stabOffMax, P.wb.hex.stabOff_ratio * Math.min(R.FOVh, R.FOVv) * r2d],
      ['Ω·δ', d.dmag, P.wb.earth.Omega * P.wb.earth.delta_deg * Math.PI / 180]];
    const z = W_cmp(pr); n += z.n; if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W3', 'Türetilmiş girdiler', 'IFOV = p/f, FOV = 2·atan(N·p/2f), gereksinimler k·IFOV, roll sınırı k_roll·IFOV/θ_ref (köşe ya da kenar), stab-OFF sınırı, kompanzasyon artığı Ω·δ; 4 durum',
    'özdeş', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı`, '≤ 1·10⁻¹²', worst <= 1e-12);
}
if (run('W4')) {
  // dünya dönüşü: vektör izdüşümüyle (ENU; görüntü yatay ekseni = LOS'a dik yatay birim vektör, düşey ekseni = LOS × yatay)
  let worst = 0, n = 0, where = '';
  for (const [nm, P] of W_cases().concat([['enlem 65°, el 30°', (() => { const P = full('sub'); P.wb.earth.lat = 65; P.wb.earth.el = 30; P.wb.earth.az = 40; return P; })()]])) {
    const es = L.earthSheet(P), R = W_ref(P), E = P.wb.earth, d2r = Math.PI / 180, Om = E.Omega * 1e6, phi = E.lat * d2r, ep = E.el * d2r;
    const W_om = [0, Om * Math.cos(phi), Om * Math.sin(phi)];
    const proj = (azDeg) => { const a = azDeg * d2r, u = [Math.sin(a) * Math.cos(ep), Math.cos(a) * Math.cos(ep), Math.sin(ep)], hx = [Math.cos(a), -Math.sin(a), 0];
      const vx = [hx[1] * u[2] - hx[2] * u[1], hx[2] * u[0] - hx[0] * u[2], hx[0] * u[1] - hx[1] * u[0]], dt = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      return { h: Math.abs(dt(W_om, vx)), v: Math.abs(dt(W_om, hx)), r: Math.abs(dt(W_om, u)) }; };
    const p0 = proj(E.az), comp = Om * E.delta_deg * d2r, eg = P.ana.edgeMargin_px, exitT = (h, v) => Math.min(h > 0 ? (R.c.Nh / 2 - eg) * R.IFu / h : 1e9, v > 0 ? (R.c.Nv / 2 - eg) * R.IFu / v : 1e9);   // v13.7: geçerlilik kuralının kenar payıyla
    const pr = [['Ω', es.Om, Om], ['düşey', es.vert, Om * Math.sin(phi)], ['yatay', es.horiz, Om * Math.cos(phi)], ['h', es.h, p0.h], ['v', es.v, p0.v], ['r', es.r, p0.r], ['Ω·δ', es.comp, comp],
      ['çıkış KAPALI', es.off.exit, exitT(p0.h, p0.v)], ['çıkış AÇIK', es.on.exit, exitT(comp, comp)], ['drift KAPALI', es.off.drift, Math.max(p0.h, p0.v) * P.wb.tau], ['drift AÇIK', es.on.drift, comp * P.wb.tau],
      ['px kayıt', es.off.pxH, p0.h * P.wb.unc.Trec / R.IFu], ['px 120 s', es.off.px2, Math.max(p0.h, p0.v) * 120 / R.IFu]];
    es.tab.forEach(t => { const q = proj(t.az); pr.push([`α=${t.az} h`, t.h, q.h], [`α=${t.az} v`, t.v, q.v], [`α=${t.az} r`, t.r, q.r]); });
    const z = W_cmp(pr.map(([k, a, b]) => [k, a, b])); n += z.n; if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W4', 'Dünya dönüşünün görüntü eksenlerine izdüşümü', 'Ω_ENU = Ω(0, cos φ, sin φ); LOS u, yatay eksen h ⊥ u, düşey eksen u × h; hızlar |Ω·(u×h)|, |Ω·h|, |Ω·u|; alan dışına çıkma süresi (v13.7: kenar payıyla), piksel kayması, azimut tablosu (12 satır); 5 durum',
    'özdeş', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı (sıfır değerlerde mutlak)`, '≤ 1·10⁻¹² (göreli; sıfırda mutlak 1·10⁻⁹)', worst <= 1e-12);
}
if (run('W5')) {
  let worst = 0, n = 0, txt = 0;
  for (const [nm, P] of W_cases()) {
    const H = L.hexReachTable(P), hx = P.wb.hex, R = W_ref(P);
    H.forEach(h => { const w = 2 * Math.PI * h.f, c3 = [hx.theta_max, hx.omega_max / w, hx.alpha_max / (w * w)], m = Math.min(...c3);
      const lim = m === c3[0] ? 'Aralık' : (m === c3[1] ? 'Hız' : 'İvme'), band = h.f > hx.fbw ? 'f_bw ÜSTÜ' : (h.f > hx.rel_ratio * hx.fbw ? 'güvenilir bant üstü' : 'OK'), nyq = h.f > R.fps / 2 ? 'Nyquist üstü' : 'OK';
      for (const [a, b] of [[h.deg, m], [h.urad, m * Math.PI / 180 * 1e6], [h.Ww, W_sinc2(Math.PI * h.f * R.Tint)]]) { worst = Math.max(worst, Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)); n++; }
      if (h.lim !== lim) txt++; if (h.band !== band) txt++; if (h.nyq !== nyq) txt++; });
  }
  add('W', 'W5', 'Hexapod erişimi', 'θ(f) = min(θ_max, ω_max/2πf, α_max/(2πf)²), sınırlayan etken, bant ve Nyquist sınıfı, W_w; 4 durum × 17 frekans',
    'özdeş', `en büyük göreli fark ${f(worst, 2)}; ${n} sayı, ${txt} metin uyuşmazlığı`, '≤ 1·10⁻¹², metin uyuşmazlığı 0', worst <= 1e-12 && txt === 0);
}
if (run('W6')) {
  let worst = 0, n = 0, txt = 0;
  const mkS = (fn) => { const P = full('sub'); fn(P); return P; };
  // v13.3 ikinci uygulama: hız ızgarası (zarf), kütle oranı (f*_alt = √((m* + 1)/(m* − 0,54)), K0 üst·f*, m* ≤ 0,54 → sınırsız),
  // zarfta risk (sürekli K0 aralığı ∩ paylı bant), aday kümesi (f_v ∪ f_n ∪ f*·f_n; alt dal yalnız zarfta erişilirse:
  // f_v,maks·(1 + pay) ≥ f_n,vak), T2.1 bandı, B2-01 tahmini, mast başı ötelemesi
  for (const [nm, P] of [['denizaltı', full('sub')], ['D = 0,4 m, f_n = 2 Hz', mkS(P => { P.wb.viv.D = 0.4; P.wb.viv.fn = 2; })],
    ['f_n = 8 Hz (f_n aday f_v\'lerin dışında)', mkS(P => { P.wb.viv.fn = 8; })], ['f_n = 12 Hz (zarfta riskli hız yok)', mkS(P => { P.wb.viv.fn = 12; })],
    ['DRR varsayımı −46 dB, genlik 0,08°', mkS(P => { P.wb.viv.drr_dB = -46; P.wb.viv.amp_deg = 0.08; })],
    ['m* = 0,5 (kritik altı)', mkS(P => { P.wb.viv.mstar = 0.5; })], ['m* = 10, L = 6 m, κ = 1,38', mkS(P => { P.wb.viv.mstar = 10; P.wb.viv.L = 6; P.wb.viv.kth = 1.38; })],
    ['hız zarfı 3–7 kn, m* yok', mkS(P => { P.wb.viv.Umin_kn = 3; P.wb.viv.Umax_kn = 7; P.wb.viv.mstar = null; })]]) {
    const V = L.vivTable(P), v = P.wb.viv, hx = P.wb.hex, fvC = [];
    const a = Math.min(v.Umin_kn, v.Umax_kn), b = Math.max(v.Umin_kn, v.Umax_kn);
    const grid = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 25, 30].filter(k => k >= a && k <= b);
    const spd = Array.from(new Set(grid.concat([a, b]))).sort((x, y) => x - y);
    if (spd.length !== V.length || spd.some((k, i) => Math.abs(k - V[i].kn) > 1e-9)) txt++;
    const mOn = v.mstar != null && isFinite(v.mstar), inf = mOn && v.mstar <= 0.54;
    const fst = mOn && !inf ? Math.sqrt((v.mstar + 1) / (v.mstar - 0.54)) : 1, hiR = inf ? Infinity : v.K0_hi * fst, flock = mOn && !inf ? fst * v.fn : null;
    V.forEach(r => { const U = r.kn * 0.514444, fv = v.St * U / v.D, K0 = fv / v.fn, w = 2 * Math.PI * fv;
      const cls = K0 >= v.K0_lo && K0 <= hiR ? 'TARAMA: RİSK' : (K0 >= v.K0_lo * (1 - v.margin) && K0 <= hiR * (1 + v.margin) ? 'Sınırda' : 'Düşük');
      if (cls !== 'Düşük') fvC.push(fv);
      for (const [x, y] of [[r.V, U], [r.Re, U * v.D / v.nu], [r.fv, fv], [r.K0, K0], [r.Ur, U / (v.fn * v.D)], [r.reach, Math.min(hx.theta_max, hx.omega_max / w, hx.alpha_max / (w * w))]]) { worst = Math.max(worst, Math.abs(x - y) / Math.abs(y)); n++; }
      if (r.scr !== cls) txt++; if (r.dwell !== (cls !== 'Düşük')) txt++; });
    // zarfta risk: K0 doğrusal (U'ya göre) → [K0(U_a), K0(U_b)] ∩ [K0_alt(1 − m), K0_üst,etkin(1 + m)]
    const K0a = v.St * a * 0.514444 / (v.D * v.fn), K0b = v.St * b * 0.514444 / (v.D * v.fn), risk = K0b >= v.K0_lo * (1 - v.margin) && K0a <= hiR * (1 + v.margin);
    const VS = L.vivSpec(P), present = (v.on !== false) && risk;
    if (VS.present !== present) txt++;
    // alt dala erişim: en yüksek hızdaki f_v (paylı) ≥ f_n,vak = f_n·√((m* + 1)/m*) (üst → alt dal geçişinde f ≈ f_n,vak)
    const fvMax = v.St * b * 0.514444 / v.D, fvac = mOn && !inf ? v.fn * Math.sqrt((v.mstar + 1) / v.mstar) : null;
    const lockE = risk && flock != null && fvMax * (1 + v.margin) >= fvac, flockE = lockE ? flock : null;
    const all = fvC.concat([v.fn]).concat(flockE ? [flockE] : []); let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 0.25) { const c = (lo + hi) / 2; lo = c - 0.125; hi = c + 0.125; }
    const VB = L.vivBand(P), row = L.computeBudget(P, null).rows.find(q => q.id === 'B2-01');
    const est = present ? v.amp_deg * Math.PI / 180 * 1e6 / Math.SQRT2 * Math.pow(10, v.drr_dB / 20) : 0;
    const yExp = (v.lin !== false && v.L > 0) ? v.amp_deg * Math.PI / 180 * v.L / v.kth : 0;
    const pr = [[VB.fLo, lo], [VB.fHi, hi], [row.H, v.drr_dB], [VS.risk.K0a, K0a], [VS.risk.K0b, K0b]];
    if (est > 0) pr.push([row.I, est]); else if (row.I !== 0) txt++;
    if (yExp > 0) pr.push([VS.y, yExp]); else if (VS.y !== 0) txt++;
    if (flock) pr.push([L.vivMass(P).flock, flock], [L.vivMass(P).k0hi, hiR], [VS.risk.fvac, fvac], [VS.risk.fvMax, fvMax]);
    if (VS.risk.lock !== lockE || (VB.flock == null) !== (flockE == null)) txt++;
    for (const [x, y] of pr) { worst = Math.max(worst, Math.abs(x - y) / Math.abs(y)); n++; }
    if (VB.cand.length !== new Set(all.map(x => x.toFixed(12))).size || VB.nRisk !== fvC.length) txt++;
    if (yExp > 0 && !(VS.roll === -1 && VS.ty === 1 && VS.lin)) txt++;
  }
  add('W', 'W6', 'Hidrodinamik VIV taraması', 'V (kn → m/s; zarf ızgarası), Re = VD/ν, f_v = St·V/D, K0 = f_v/f_n, U_r = V/(f_n D), tarama sınıfı (marjlı; v13.3: K0 üst sınırı ×f*_alt(m*), m* ≤ 0,54 → sınırsız), hexapod erişimi, dwell adayı; zarfta VIV varlığı (sürekli K0 aralığı ∩ paylı bant), T2.1 VIV bandı (aday f_v ∪ f_n ∪ f*·f_n; alt dal yalnız f_v,maks·(1 + pay) ≥ f_n,vak = f_n·√((m* + 1)/m*) ise), B2-01 analitik tahmini (A/√2·10^(DRR/20); VIV yoksa 0), mast başı ötelemesi y = θ·L/κ (roll −1, y +1); 8 durum',
    'özdeş', `en büyük göreli fark ${f(worst, 2)}; ${n} sayı, ${txt} metin uyuşmazlığı`, '≤ 1·10⁻¹², metin uyuşmazlığı 0', worst <= 1e-12 && txt === 0);
}
if (run('W7')) {
  let worst = 0, n = 0, where = '';
  for (const [nm, P] of W_cases()) {
    const U = L.uncertaintySheet(P), R = W_ref(P), wb = P.wb, ch = wb.chain, u = wb.unc, m = String(wb.TUR_def).startsWith('Z540') ? wb.k_exp : 1;
    // v13.6: U-05 çarpımsal; gereksinim düzeyinde video ε·W, yüksek hızlı ε·S (önceden ikisi de ε·min(W, S))
    // v13.7 (K4): yoğunluk kipinde U-04 = imu_asd·√B, n. derece Butterworth için B = f_c·(π/2n)/sin(π/2n) (n = 2); U-07 = ac_asd·√(1000/2)
    const nB = 2, Bimu = ch.imu_bw * (Math.PI / (2 * nB)) / Math.sin(Math.PI / (2 * nB)), smp = ch.noiseModel === 'sample';
    const comp = { 'U-01': ch.centroid_px * R.IFu, 'U-02': ch.air, 'U-03': wb.hex.microvib, 'U-04': smp ? ch.imu_noise : ch.imu_asd * Math.sqrt(Bimu), 'U-05': ch.scale_eps * R.req.W, 'U-06': ch.pixlock_px * R.IFu, 'U-07': smp ? ch.ac_noise : ch.ac_asd * Math.sqrt(500) };
    const U05h = ch.scale_eps * R.req.S;
    const uv = Math.hypot(comp['U-01'], comp['U-02'], comp['U-03'], comp['U-05'], comp['U-06']), uh = Math.hypot(comp['U-02'], comp['U-03'], comp['U-04'], U05h, comp['U-07']);
    const uvA = Math.hypot(comp['U-01'], comp['U-02'], comp['U-03'], comp['U-06']), uhA = Math.hypot(comp['U-02'], comp['U-03'], comp['U-04'], comp['U-07']);
    const Tseg = u.perSeg / u.fmin, nd = Math.max(1, Math.floor(2 * u.Trec / Tseg - 1)), fmax = wb.hex.fbw, dt = wb.chain.dt_sync_ms / 1000;
    // IMU süzgeci (2. derece Butterworth, ω_c = 2π·f_IMU): grup gecikmesi τ_g = −dφ/dω|₀ = √2/ω_c; Hann %50 örtüşme: ρ = Σw(n)w(n + N/2)/Σw² sayısal
    const gd = Math.SQRT2 / (TAU * ch.imu_bw), tot = dt + gd;
    const NW = 4096, hw = Float64Array.from({ length: NW }, (_, i) => 0.5 - 0.5 * Math.cos(TAU * i / NW)); let sOv = 0, sW2 = 0;
    for (let i = 0; i < NW; i++) { sW2 += hw[i] * hw[i]; if (i >= NW / 2) sOv += hw[i] * hw[i - NW / 2]; }
    const rho = sOv / sW2;
    const pr = Object.entries(comp).map(([k, v]) => [k, U.U.find(q => q.id === k).v, v]).concat([['U-05 yüksek hızlı', U.U.find(q => q.id === 'U-05').vh, U05h], ['u_v', U.uv, uv], ['u_h', U.uh, uh], ['u_v toplanır', U.uvAdd, uvA], ['u_h toplanır', U.uhAdd, uhA], ['TUR_w', U.turW, R.req.W / (m * uv)], ['TUR_s', U.turS, R.req.S / (m * uh)],
      ['TUR_w k1', U.turW_k1, R.req.W / uv], ['TUR_w Z', U.turW_z, R.req.W / (wb.k_exp * uv)], ['TUR_s k1', U.turS_k1, R.req.S / uh], ['TUR_s Z', U.turS_z, R.req.S / (wb.k_exp * uh)],
      ['taban sınırı', U.maxFloor, R.req.W / (wb.TUR_target * m)], ['şişme w', U.inflW, Math.sqrt(1 + (uv / R.req.W) ** 2) - 1], ['şişme s', U.inflS, Math.sqrt(1 + (uh / R.req.S) ** 2) - 1],
      ['düzeltilmiş', U.corrected, Math.sqrt(Math.max(0, u.rawExample ** 2 - uvA * uvA))], ['faz', U.phase, 360 * fmax * dt], ['fark hatası', U.diffErr, 2 * Math.sin(Math.PI * fmax * dt)],
      ['τ_g', U.gd, gd], ['toplam faz', U.phaseTot, 360 * fmax * tot], ['toplam fark hatası', U.diffErrTot, 2 * Math.sin(Math.PI * fmax * tot)],
      ['T_min', U.Tmin, u.Nper / u.fmin], ['T_seg', U.Tseg, Tseg], ['Δf', U.df, 1 / Tseg], ['n_d', U.nd, nd], ['ε_r (1/√n_d)', U.epsR0, 1 / Math.sqrt(nd)],
      ['ε_r örtüşmeli', U.epsR, Math.sqrt((1 + 2 * rho * rho * (1 - 1 / nd)) / nd)], ['kare', U.frames, u.Trec * R.fps]]);
    const z = W_cmp(pr); n += z.n; if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W7', 'Ölçüm belirsizliği ve TUR', 'U-01…U-07 (v13.6: U-05 çarpımsal, video ε·W / yüksek hızlı ε·S; v13.7: U-04 = yoğunluk × √ENBW Butterworth, U-07 = yoğunluk × √(f_kayıt/2)), u_video = RSS(U-01, 02, 03, 05, 06), u_yüksek hızlı = RSS(U-02, 03, 04, 05, 07), toplanır kısımlar (U-05 hariç), TUR (k = 1 ve Z540.3), taban sınırı, taban düzeltmesi (toplanır kısımla), senkron faz hatası ve IMU süzgecinin grup gecikmesi √2/(2π·f_IMU), kayıt istatistiği (ε_r: 1/√n_d ve Hann %50 örtüşme düzeltmeli, ρ sayısal pencereden); 4 durum',
    'özdeş', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı`, '≤ 1·10⁻¹²', worst <= 1e-12);
}
if (run('W12')) {
  // v13.7 (kullanıcı kararı K2): karar belirsizliği ve koruma bandı. Φ bağımsız olarak erf'in Taylor serisinden (|z| ≤ 2) ve erfc'nin
  // sürekli kesirinden (|z| > 2); u_c, U, karar ve yanlılık doğrudan tanımdan; motorun decisionGuard'ıyla karşılaştırma.
  const erfS = (x) => { let s = 0, t = x, n = 0; while (Math.abs(t) > 1e-18 * Math.max(1, Math.abs(s)) && n < 400) { s += t / (2 * n + 1); n++; t *= -x * x / n; } return 2 / Math.sqrt(Math.PI) * s; };
  // |z| > 2: erfc sürekli kesiri (Laplace), 300 terim geriye doğru: erfc(x) = e^(−x²)/(√π·K), K = x + (1/2)/(x + 1/(x + (3/2)/(x + …)))
  const erfcCF = (x) => { let K = x; for (let m = 300; m >= 1; m--) K = x + (m / 2) / K; return Math.exp(-x * x) / (Math.sqrt(Math.PI) * K); };
  const Phi = (z) => (Math.abs(z) <= 2 ? 0.5 * (1 + erfS(z / Math.SQRT2)) : (z > 0 ? 1 - 0.5 * erfcCF(z / Math.SQRT2) : 0.5 * erfcCF(-z / Math.SQRT2)));
  let worstP = 0, worstN = 0, txt = 0, n = 0;
  for (const z of [-8, -5, -3.2, -2, -1.2, -0.5, 0, 0.3, 0.94, 1.645, 1.96, 2.5, 3.5, 5.5, 7.5]) { const a = L.normCdf(z), b = Phi(z); worstP = Math.max(worstP, Math.abs(a - b)); n++; }
  const P = full(), k = P.wb.k_exp;
  const cases = [{ x: 3.95e-6, R: 4e-6, uStat: 0.03e-6, rel: [1.4e-5], floor: 3.76e-6, floorMode: 'add' }, { x: 6.96e-6, R: 20e-6, uStat: 0.127e-6, rel: [0.005], floor: 2.66e-6 },
    { x: 3.05e-6, R: 2.5e-6, uStat: 0.03e-6, rel: [0.005, 0.01] }, { x: 4.9e-6, R: 5e-6, uStat: 0.2e-6, rel: [] }, { x: 5.6e-6, R: 5e-6, uStat: 0.1e-6, rel: [0.02] }, { x: 2e-6, R: 5e-6, uStat: 0, rel: [] }];
  for (const c of cases) {
    const g = L.decisionGuard(P, Object.assign({ label: 'x' }, c));
    const ur = Math.sqrt((c.rel || []).reduce((t, v) => t + v * v, 0)), uc = Math.sqrt(c.uStat ** 2 + (c.x * ur) ** 2), U = k * uc;
    const v = c.x + U <= c.R ? 'KABUL' : (c.x - U > c.R ? 'RED' : 'BELİRSİZ'), p = uc > 0 ? Phi((c.R - c.x) / uc) : (c.x <= c.R ? 1 : 0);
    const b = c.floor ? (c.floorMode === 'add' ? Math.hypot(c.x, c.floor) - c.x : c.x - Math.sqrt(c.x * c.x - c.floor * c.floor)) : null;
    for (const [e, r] of [[g.uc, uc], [g.U, U], [g.pConf, p]].concat(b != null ? [[g.bias, b]] : [])) { worstN = Math.max(worstN, Math.abs(e - r) / Math.max(Math.abs(r), 1e-300)); n++; }
    if (g.verdict !== v) txt++;
  }
  add('W', 'W12', 'Karar belirsizliği ve koruma bandı (v13.7)', 'Φ(z): motorun Hart–West yaklaşımı ↔ erf Taylor serisi (|z| ≤ 2) ve erfc sürekli kesiri (|z| > 2), 15 nokta; decisionGuard: u_c = √(u_ist² + (x·u_rel)²), U = k·u_c, KABUL/BELİRSİZ/RED, uygunluk olasılığı, taban yanlılığı (içeren ve ekleyen kip), 6 durum',
    'özdeş', `Φ en büyük mutlak fark ${f(worstP, 2)}; decisionGuard en büyük göreli fark ${f(worstN, 2)}; ${n} sayı, ${txt} karar uyuşmazlığı`, 'Φ mutlak ≤ 1·10⁻¹², diğerleri göreli ≤ 1·10⁻⁹ (uç olasılıklar dahil), karar uyuşmazlığı 0', worstP <= 1e-12 && worstN <= 1e-9 && txt === 0);
}
if (run('W13')) {
  // v13.8 (§8): B1-04'ün tabanı — kaçıklığın sızdırdığı LOS ekseni etrafındaki baz dönmesi. Bağımsız: dar kipte σ = A/√2 ve
  // f = 1/T doğrudan girilen değerlerden; 6-DOF kipinde σ ve f_dom deniz profili sentezinden (S1 ile doğrulanmış). Ağırlıklar
  // yatay LOS için roll → cos a0, pitch → sin a0 (axisMap'in bağımsız karşılığı). Ayrıca bütçe satırı E = ε·√2·σ_rot, G = f, R-01'in
  // G'si aynı f; 'roll' tabanı v13.7 ifadesine eşit.
  const d2r = Math.PI / 180, pr = []; let cnt = 0, txt = 0;
  const cases = [];
  for (const kind of ['sub', 'ship']) for (const a0 of [0, 30, 60, 90, 135, 180]) cases.push([`${kind} a0 ${a0}°`, (() => { const P = full(kind); P.dut.geom.a0 = a0; return P; })()]);
  for (const kind of ['sub', 'ship']) cases.push([`${kind} 6-DOF a0 90°`, (() => { const P = full(kind); P.wb.sea.mode = '6dof'; return P; })()]);
  cases.push(['sub roll tabanı', (() => { const P = full('sub'); P.wb.H.epsBasis = 'roll'; return P; })()]);
  for (const [nm, P] of cases) {
    const s = P.wb.sea, a0 = P.dut.geom.a0 * d2r, SD = L.seaDOF(P), six = s.mode === '6dof';
    const sr = six ? SD.ang[0].sigma : s.roll_A * d2r / Math.SQRT2, sp = six ? SD.ang[1].sigma : s.pitch_A * d2r / Math.SQRT2;
    const fr = six ? SD.ang[0].fdom : 1 / s.roll_T, fp = six ? SD.ang[1].fdom : 1 / s.pitch_T;
    const roll = (P.wb.H.epsBasis || 'los') === 'roll';
    const cr = Math.cos(a0) * sr, cp = Math.sin(a0) * sp, sig = roll ? sr : Math.hypot(cr, cp), domR = roll || Math.abs(cr) >= Math.abs(cp), fx = domR ? fr : fp;
    const E = L.epsRotInfo(P), rows = L.budgetRows(P), r4 = rows.find(r => r.id === 'B1-04'), r01 = rows.find(r => r.id === 'R-01'), eps = P.wb.H.eps_mrad * 1e-3;
    const E4 = roll ? eps * s.roll_A * d2r * 1e6 : eps * Math.SQRT2 * sig * 1e6;
    pr.push([nm + ' σ_rot', E.sigma, sig], [nm + ' f', E.f, fx], [nm + ' B1-04 E', r4.E, six && roll ? r4.E : E4], [nm + ' B1-04 G', r4.G, fx], [nm + ' R-01 G', r01.G, fx]);
    if (E.dom !== (domR ? 'roll' : 'pitch')) txt++; cnt++;
  }
  const z = W_cmp(pr);
  add('W', 'W13', 'B1-04 tabanı: kaçıklığın sızdırdığı LOS ekseni etrafındaki dönme (v13.8)', `${cnt} durum (denizaltı ve gemi, a0 = 0…180°, 6-DOF, roll tabanı); bağımsız: σ_rot² = (cos a0·σ_roll)² + (sin a0·σ_pitch)², baskın serbestlik derecesinin f_dom'u; bütçe B1-04 = ε·√2·σ_rot (µrad genlik), G ve R-01'in G'si aynı f`,
    'özdeş', `en büyük göreli fark ${f(z.worst, 2)} (${z.where}); ${z.n} sayı, ${txt} baskın eksen uyuşmazlığı`, '≤ 1·10⁻¹², uyuşmazlık 0', z.worst <= 1e-12 && txt === 0);
}
if (run('W14')) {
  // v13.9 (§9 stabilizasyon döngüsü): döngü modelinin bağımsız ikinci uygulaması. Kendi karmaşık aritmetiği ve RBJ biquad formülleriyle:
  // tasarım K = 1/|C G P|(f_c) (sürekli; gecikme 1,5/f_ctl), uygulanan döngü geri Euler PII, AG + BP biquad, z⁻¹ × ZOH, akım ve gyro
  // birinci derece (+ gyro ek gecikmesi); kesim (|L| = 1), faz payı, kazanç payı (açılmış faz −180°), DRR(f) genlik ve faz, tork yolu.
  const cx = (re, im = 0) => ({ re, im }), ad = (a, b) => cx(a.re + b.re, a.im + b.im), sb = (a, b) => cx(a.re - b.re, a.im - b.im);
  const ml = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re), dv = (a, b) => { const q = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
  const ex = (th) => cx(Math.cos(th), Math.sin(th)), mg = (a) => Math.hypot(a.re, a.im), ag = (a) => Math.atan2(a.im, a.re);
  const bq = (kind, f0, fs, Q) => { const w0 = 2 * Math.PI * Math.min(f0, 0.49 * fs) / fs, al = Math.sin(w0) / (2 * Q), c = Math.cos(w0), a0 = 1 + al;
    const b = kind === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [al, 0, -al]; return { b: b.map(v => v / a0), a: [1, -2 * c / a0, (1 - al) / a0] }; };
  const bqH = (q, w, fs) => { const z1 = ex(-w / fs), z2 = ex(-2 * w / fs); return dv(ad(ad(cx(q.b[0]), ml(cx(q.b[1]), z1)), ml(cx(q.b[2]), z2)), ad(ad(cx(1), ml(cx(q.a[1]), z1)), ml(cx(q.a[2]), z2))); };
  const ref = (ax, ctl, gy, cur, J, rf) => {
    const res = ctl.res, fs = ctl.fctl, T = 1 / fs, wi = 2 * Math.PI * ax.fi, wl = 2 * Math.PI * ctl.flp, wg = 2 * Math.PI * gy.fbw, wc = 2 * Math.PI * cur.fbw, tg = (gy.lat_ms || 0) * 1e-3;
    const fr = rf || res.f, wr = 2 * Math.PI * fr, gr = 10 ** (res.gain_dB / 20) - 1, zr = res.zeta;
    const P = (w) => { const s = cx(0, w); return dv(s, ad(ad(cx(J * -w * w), cx(0, ax.b * w)), cx(ax.k))); };
    const Cc = (w) => { const s = cx(0, w), pi = ad(cx(1), dv(cx(wi), s)), lp = dv(cx(wl * wl), cx(wl * wl - w * w, 2 * ctl.zlp * wl * w));
      const r = res.on ? ad(cx(1), dv(cx(0, gr * 2 * zr * wr * w), cx(wr * wr - w * w, 2 * zr * wr * w))) : cx(1); return ml(ml(ml(pi, pi), lp), r); };
    const Gc = (w) => ml(dv(cx(1), cx(1, w / wg)), ml(dv(cx(1), cx(1, w / wc)), ex(-w * 1.5 * T)));
    const wct = 2 * Math.PI * ax.fc, K = 1 / mg(ml(ml(Cc(wct), Gc(wct)), P(wct)));
    const qL = bq('lp', ctl.flp, fs, 1 / (2 * ctl.zlp)), qB = bq('bp', fr, fs, 1 / (2 * zr));
    const Cd = (w) => { const pi = ad(cx(1), dv(cx(wi * T), sb(cx(1), ex(-w * T)))); const r = res.on ? ad(cx(1), ml(cx(gr), bqH(qB, w, fs))) : cx(1); return ml(ml(ml(pi, pi), bqH(qL, w, fs)), r); };
    const Gd = (w) => { const zoh = w === 0 ? cx(1) : dv(sb(cx(1), ex(-w * T)), cx(0, w * T)); return ml(ml(dv(cx(1), cx(1, w / wg)), dv(cx(1), cx(1, w / wc))), ml(ml(ex(-w * T), zoh), ex(-w * tg))); };
    const Lf = (w) => ml(cx(K), ml(ml(Cd(w), Gd(w)), P(w)));
    const den = (w) => ad(cx(J * -w * w + ax.k, ax.b * w), ml(cx(0, w), ml(cx(K), ml(Cd(w), Gd(w)))));
    let lo = 0.3 * ax.fc, hi = 3 * ax.fc; { const g = []; for (let x = lo; x <= hi; x *= 1.002) g.push(x); const i = g.findIndex(x => mg(Lf(2 * Math.PI * x)) < 1); lo = g[i - 1]; hi = g[i]; }
    for (let k = 0; k < 80; k++) { const m = Math.sqrt(lo * hi); if (mg(Lf(2 * Math.PI * m)) > 1) lo = m; else hi = m; }
    const fcx = Math.sqrt(lo * hi), pm = 180 + ag(Lf(2 * Math.PI * fcx)) * 180 / Math.PI;
    let gm = Infinity, gmF = null, pv = ag(Lf(2 * Math.PI * fcx)) * 180 / Math.PI, fp = fcx;
    for (let x = fcx * 1.002; x < 0.49 * fs; x *= 1.002) {
      let q = ag(Lf(2 * Math.PI * x)) * 180 / Math.PI; while (q - pv > 180) q -= 360; while (q - pv < -180) q += 360;
      if (q <= -180) { let a = fp, c = x; const pref = pv; for (let k = 0; k < 80; k++) { const m = Math.sqrt(a * c); let qm = ag(Lf(2 * Math.PI * m)) * 180 / Math.PI; while (qm - pref > 180) qm -= 360; while (qm - pref < -180) qm += 360; if (qm > -180) a = m; else c = m; }
        gmF = Math.sqrt(a * c); gm = -20 * Math.log10(mg(Lf(2 * Math.PI * gmF))); break; }
      pv = q; fp = x;
    }
    return { K, fcx, pm, gm, gmF, drr: (w) => dv(cx(ax.k, ax.b * w), den(w)), torque: (w) => dv(cx(1), den(w)) };
  };
  const FQ = [0.0833, 0.125, 0.5, 1, 3, 5, 10, 30, 40, 100], pr = []; let n = 0;
  const cases = [['el varsayılan', 'el', full('sub')], ['az varsayılan', 'az', full('sub')], ['el dar bant kapalı', 'el', (() => { const P = full('sub'); P.dut.ctl.res.on = false; return P; })()],
    ['el f_c 60 Hz', 'el', (() => { const P = full('sub'); P.dut.el.fc = 60; return P; })()], ['el f_i 8 Hz', 'el', (() => { const P = full('sub'); P.dut.el.fi = 8; return P; })()],
    ['el dar bant @ 6 Hz', 'el', full('sub'), 6], ['el f_ctl 1 kHz', 'el', (() => { const P = full('sub'); P.dut.ctl.fctl = 1000; return P; })()],
    ['el gyro gecikmesi 1 ms', 'el', (() => { const P = full('sub'); P.dut.gyro.lat_ms = 1; return P; })()], ['az elevasyon 60°', 'az', (() => { const P = full('sub'); P.wb.earth.el = 60; return P; })()]];
  let dbW = 0, dbWh = '';
  for (const [nm, ax, P, rf] of cases) {
    const d = L.derive(P), J = ax === 'el' ? P.dut.el.J : d.azJ, m = rf ? L.loopModel(P.dut[ax], P.dut.ctl, P.dut.gyro, P.dut.cur, J, rf) : (ax === 'el' ? d.loopEl : d.loopAz), r = ref(P.dut[ax], P.dut.ctl, P.dut.gyro, P.dut.cur, J, rf);
    pr.push([nm + ' K', m.K, r.K], [nm + ' f_kesim', m.fcx, r.fcx], [nm + ' PM', m.pm, r.pm], [nm + ' GM', m.gm, r.gm], [nm + ' GM frekansı', m.gmF, r.gmF]); n++;
    for (const fq of FQ) { const w = 2 * Math.PI * fq, a = m.drr(w), b = r.drr(w), t1 = m.torque(w), t2 = r.torque(w);
      const e = Math.max(Math.abs(20 * Math.log10(L.cabs(a) / mg(b))), Math.abs(((Math.atan2(a.im, a.re) - ag(b)) * 180 / Math.PI + 540) % 360 - 180), Math.abs(20 * Math.log10(L.cabs(t1) / mg(t2))));
      if (e > dbW) { dbW = e; dbWh = `${nm} @ ${fq} Hz`; } }
  }
  const z = W_cmp(pr), d0 = L.derive(full('sub'));
  add('W', 'W14', 'Stabilizasyon döngüsü: kesim, faz/kazanç payı ve DRR (v13.9, ikinci uygulama)', `${cases.length} durum (el/az, dar bant kapalı / 6 Hz, f_c 60, f_i 8, f_ctl 1 kHz, gyro gecikmesi 1 ms, elevasyon 60°); bağımsız: kendi karmaşık aritmetiği, RBJ biquad, geri Euler PII, z⁻¹·ZOH, K = 1/|C G P|(f_c) sürekli tasarımdan; ${FQ.length} frekansta DRR genlik/faz ve tork yolu`,
    'özdeş', `K, kesim, PM, GM, GM frekansı: en büyük göreli fark ${f(z.worst, 2)} (${z.where}); DRR ve tork: ${f(dbW, 2)} dB/° (${dbWh}); varsayılan el PM ${f(d0.loopEl.pm, 2)}°, GM ${f(d0.loopEl.gm, 2)} dB @ ${f(d0.loopEl.gmF, 1)} Hz`, '≤ 1·10⁻⁹; DRR ≤ 1·10⁻⁸ dB', z.worst <= 1e-9 && dbW <= 1e-8);
}
if (run('W8')) {
  // PSD ağırlıklandırma: (a) düz PSD'nin analitik integrali, (b) tepe + düz sentetik PSD'de ikinci uygulama (orta nokta Δf)
  const Tint = 0.005, fl = []; for (let f0 = 0; f0 <= 200 + 1e-9; f0 += 0.05) fl.push(f0);
  const Pf = fl.map(() => 2e-12), rA = L.psdWeighting(Float64Array.from(fl), Float64Array.from(Pf), Tint);
  const exactTot = Math.sqrt(2e-12 * 200);
  let sw = 0; { const N = 400000, h = 200 / N; for (let i = 0; i <= N; i++) { const x = i * h, w = (i === 0 || i === N) ? 0.5 : 1; sw += w * W_sinc2(Math.PI * x * Tint); } sw *= h * 2e-12; }
  const fs = [], Ps = []; for (let k = 0; k < 3000; k++) { const f0 = 0.02 * Math.exp(k * Math.log(500 / 0.02) / 2999); fs.push(f0); Ps.push(1e-12 * (1 / (1 + (f0 / 3) ** 2) + 30 * Math.exp(-0.5 * ((f0 - 8) / 0.2) ** 2) + 0.01)); }
  const rB = L.psdWeighting(Float64Array.from(fs), Float64Array.from(Ps), Tint);
  const acc = { t: 0, w: 0, s: 0, B1: [0, 0, 0], B2: [0, 0, 0], B3: [0, 0, 0] };
  fs.forEach((f0, k) => { const df = k === 0 ? (fs[1] - fs[0]) / 2 : (k === fs.length - 1 ? (fs[k] - fs[k - 1]) / 2 : (fs[k + 1] - fs[k - 1]) / 2), c = Ps[k] * df, w = W_sinc2(Math.PI * f0 * Tint);
    acc.t += c; acc.w += c * w; acc.s += c * (1 - w); const b = f0 < 1 ? 'B1' : (f0 <= 20 ? 'B2' : 'B3'); acc[b][0] += c; acc[b][1] += c * w; acc[b][2] += c * (1 - w); });
  const prB = [['toplam', rB.total, Math.sqrt(acc.t)], ['wander', rB.wander, Math.sqrt(acc.w)], ['smear', rB.smear, Math.sqrt(acc.s)]];
  for (const b of ['B1', 'B2', 'B3']) prB.push([b + ' toplam', rB.bands[b].total, Math.sqrt(acc[b][0])], [b + ' wander', rB.bands[b].wander, Math.sqrt(acc[b][1])], [b + ' smear', rB.bands[b].smear, Math.sqrt(acc[b][2])]);
  const zB = W_cmp(prB), eA = Math.abs(rA.total / exactTot - 1), eW = Math.abs(rA.wander / Math.sqrt(sw) - 1);
  add('W', 'W8', 'PSD ağırlıklandırma (wander/smear ayrımı)', `(a) 0–200 Hz düz PSD: toplam √(S·200), wander √∫S·sinc²(πfT)df (400 000 noktalı yamuk); (b) ${fs.length} noktalı logaritmik ızgarada alçak geçiren + 8 Hz tepe + taban PSD'si, ikinci uygulama (orta nokta Δf, bantlar < 1, 1–20, > 20 Hz)`,
    '(a) analitik, (b) özdeş', `(a) toplam ${f(eA, 2)}, wander ${f(eW, 2)}; (b) en büyük göreli fark ${f(zB.worst, 2)} (${zB.where})`, '(a) ≤ 1·10⁻⁶ (ızgara), (b) ≤ 1·10⁻¹²', eA <= 1e-6 && eW <= 1e-6 && zB.worst <= 1e-12);
}
if (run('W9')) {
  const P0 = full('sub'), P1 = (() => { const P = full('sub'); P.wb.refChannel = 'HDTV-NFOV'; return P; })(), P2 = (() => { const P = full('sub'); P.wb.channels[0].f_mm = 600; return P; })();
  const bad = [], ratio = []; let worstR = 0;
  for (const [nm, P] of [['varsayılan', P0], ['HDTV-NFOV', P1], ['f = 600 mm', P2]]) {
    const rows = L.budgetRows(P), A = L.budgetAlloc(P), IFu = W_IFOV(P).IF * 1e6;
    for (const [k, v] of Object.entries(A)) { const r = rows.find(q => q.id === k); if (!r || Math.abs(r.Q - v) > 1e-12 * Math.max(1, v)) bad.push(nm + ' ' + k); worstR = Math.max(worstR, Math.abs(v / (W_ALLOC40[k] * IFu / 40) - 1)); }
    const r01 = rows.find(q => q.id === 'R-01'); worstR = Math.max(worstR, Math.abs(r01.Q / (P.wb.k_roll * IFu) - 1));
    ratio.push(`${nm}: B1-01 ${f(A['B1-01'], 4)} µrad = ${f(A['B1-01'] / IFu, 4)} IFOV`);
  }
  const exact = Object.entries(L.budgetAlloc(P0)).every(([k, v]) => v === W_ALLOC40[k]);
  add('W', 'W9', 'Tahsislerin tek kaynağı ve IFOV ölçeklemesi', 'testlerin kullandığı tahsisler (budgetAlloc) ↔ bütçe satırlarının Q sütunu; Q = q·IFOV (q = tablo/40 µrad), R-01 = k_roll·IFOV; varsayılan kanalda tablo değerleri tam (bit düzeyinde) korunur',
    'özdeş; varsayılanda tam', (bad.length ? 'farklı: ' + bad.join(', ') + '; ' : '') + `IFOV ölçeklemesinden en büyük göreli sapma ${f(worstR, 2)}; varsayılanda tam: ${exact ? 'evet' : 'hayır'} · ${ratio.join(' · ')}`, 'fark yok, sapma ≤ 1·10⁻¹⁵', bad.length === 0 && worstR <= 1e-15 && exact);
}

if (run('W10')) {
  // Kaldıraç kolu bütçesi (v13.1): α × r ivme terimleri (bağımsız serbestlik dereceleri, karesel toplam), |a|, tam ilişkili üst
  // sınır, B1-08 = k_a·|a| ve frekansı (varyansla ağırlıklı RMS), B1-10 = k_g·√Σ(σ_a/(2πf))²/g, laboratuvar öteleme talebi
  // (birinci + ikinci derece) ve q. İkinci uygulama: σ ve spektral biçimler parametrelerden yeniden kurulur; spektral momentler
  // log-frekansta Simpson kuralıyla ±300 kat (motor: dikdörtgen kuralı, ±200 kat, farklı ızgara).
  const d2r = Math.PI / 180, g0 = 9.80665, dph = d2r / 3600;
  const lgS = (fp, sl) => (x) => Math.exp(-0.5 * (Math.log(x / fp) / sl) ** 2) / x;
  const bwS = (f1, f2) => (x) => 1 / ((1 + (f1 / x) ** 8) * (1 + (x / f2) ** 8));
  const accR = (S, fp) => {
    const n = 12000, u0 = Math.log(fp / 300), u1 = Math.log(fp * 300), hh = (u1 - u0) / n; let m0 = 0, m4 = 0;
    for (let i = 0; i <= n; i++) { const x = Math.exp(u0 + i * hh), w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2), v = S(x) * x; m0 += w * v; m4 += w * v * x ** 4; }
    return TAU * TAU * Math.sqrt(m4 / m0);
  };
  const W_lever = (P) => {
    const s = P.wb.sea, six = s.mode === '6dof', kp = s.kp || 3, sw = P.env.seaWidth, num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const r = [num(s.rx), num(s.ry), num(s.h)], ra = r.map(Math.abs);
    const ang = [0, 1, 2].map(i => { if (!six) { const A = [s.roll_A, s.pitch_A, s.yaw_A][i], T = [s.roll_T, s.pitch_T, s.yaw_T][i]; return { sig: A * d2r / Math.SQRT2, f: 1 / T, S: lgS(1 / T, sw) }; }
      const q = s.dof[['roll', 'pitch', 'yaw'][i]]; return { sig: q.A * d2r / kp, f: Math.sqrt(q.f1 * q.f2), S: bwS(q.f1, q.f2) }; });
    const lin = [0, 1, 2].map(i => { if (!six) return { sig: 0, f: NaN }; const q = s.dof[['surge', 'sway', 'heave'][i]]; return { sig: q.A / kp, f: Math.sqrt(q.f1 * q.f2), S: bwS(q.f1, q.f2) }; });
    const aa = ang.map(q => (q.sig > 0 ? q.sig * accR(q.S, q.f) : 0)), la = lin.map(q => (q.sig > 0 ? q.sig * accR(q.S, q.f) : 0));
    // a_x = θ̈·r_z − ψ̈·r_y, a_y = ψ̈·r_x − φ̈·r_z, a_z = φ̈·r_y − θ̈·r_x (bağımsız terimlerde işaret RMS'i değiştirmez)
    const tm = [[[aa[1] * ra[2], ang[1].f], [aa[2] * ra[1], ang[2].f]], [[aa[0] * ra[2], ang[0].f], [aa[2] * ra[0], ang[2].f]], [[aa[0] * ra[1], ang[0].f], [aa[1] * ra[0], ang[1].f]]];
    const ax = [0, 1, 2].map(k => Math.sqrt(la[k] ** 2 + tm[k][0][0] ** 2 + tm[k][1][0] ** 2)), eff = Math.sqrt(ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2);
    const all = []; for (let k = 0; k < 3; k++) { if (la[k] > 0) all.push([la[k], lin[k].f]); for (const t of tm[k]) if (t[0] > 0) all.push(t); }
    const s2 = all.reduce((a, t) => a + t[0] ** 2, 0), fa = s2 > 0 ? Math.sqrt(all.reduce((a, t) => a + (t[0] * t[1]) ** 2, 0) / s2) : NaN;
    const acI = Math.sqrt(all.reduce((a, t) => a + (t[0] / (TAU * t[1])) ** 2, 0)), up = [0, 1, 2].map(k => la[k] + tm[k][0][0] + tm[k][1][0]);
    const sg = ang.map(q => q.sig), Lg = lin.map(q => q.sig), pp = [[1, 2], [0, 2], [0, 1]];
    const fo = [[r[2] * sg[1], r[1] * sg[2]], [r[2] * sg[0], r[0] * sg[2]], [r[1] * sg[0], r[0] * sg[1]]];
    const lab = [0, 1, 2].map(k => { const a = sg[pp[k][0]], b = sg[pp[k][1]], sd = Math.sqrt(Lg[k] ** 2 + fo[k][0] ** 2 + fo[k][1] ** 2 + ra[k] ** 2 * (a ** 4 + b ** 4) / 2);
      return { sd, pk: kp * sd + ra[k] * (a * a + b * b) / 2 }; });
    const pk = Math.max(lab[0].pk, lab[1].pk, lab[2].pk), st = P.lab.hexStroke;
    return { ax, eff, fa, acI, up, lab, q: pk > st ? st / pk : 1, B108: P.wb.H.accSens * eff, B110: P.wb.H.kg * dph * acI / g0 * 1e6 };
  };
  const mk = (kind, fn) => { const P = full(kind); fn(P); return P; };
  const cases = [
    ['denizaltı varsayılanı (h = 1 m)', full('sub')],
    ['gemi varsayılanı (h = 15 m)', full('ship')],
    ['gemi dar, r = (20, −4, 15) m, k_g = 0,5', mk('ship', P => { P.wb.sea.rx = 20; P.wb.sea.ry = -4; P.wb.H.kg = 0.5; })],
    ['gemi SS4, r = (20, −4, 15) m, k_g = 0,5', mk('ship', P => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.rx = 20; P.wb.sea.ry = -4; P.wb.H.kg = 0.5; })],
    ['denizaltı SS5, r = (−8, 3, −2) m, k_g = 1', mk('sub', P => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); P.wb.sea.rx = -8; P.wb.sea.ry = 3; P.wb.sea.h = -2; P.wb.H.kg = 1; })],
  ];
  let worst = 0, where = '', n = 0; const parts = [];
  for (const [nm, P] of cases) {
    const A = L.seaAccDirector(P), rows = L.budgetRows(P), LD = L.seaLabDemand(P), W = W_lever(P), r8 = rows.find(q => q.id === 'B1-08'), r10 = rows.find(q => q.id === 'B1-10');
    const pr = [['a_x', A.x, W.ax[0]], ['a_y', A.y, W.ax[1]], ['a_z', A.z, W.ax[2]], ['|a|', A.eff, W.eff], ['f_a', A.fa, W.fa], ['∫a', A.accInt, W.acI],
      ['tam ilişkili |a|', A.corrUp.eff, Math.hypot(W.up[0], W.up[1], W.up[2])], ['B1-08', r8.E, W.B108], ['B1-08 G', r8.G, W.fa], ['B1-10', r10.E, W.B110],
      ...[0, 1, 2].map(k => ['σ_lab ' + 'xyz'[k], LD.axes[k].sigma, W.lab[k].sd]), ...[0, 1, 2].map(k => ['tepe ' + 'xyz'[k], LD.axes[k].peak, W.lab[k].pk]), ['q', LD.q, W.q]];
    const z = W_cmp(pr); n += z.n; parts.push(`${nm}: |a| ${f(A.eff, 4)} m/s², tam ilişkili ${f(A.corrUp.eff, 4)}, B1-08 ${f(r8.E, 3)} µrad, B1-10 ${f(r10.E, 4)} µrad, q ${f(LD.q, 4)}`);
    if (z.worst > worst) { worst = z.worst; where = `${nm} · ${z.where}`; }
  }
  add('W', 'W10', 'Kaldıraç kolu bütçesi: ivme terimleri, B1-08/B1-10, tam ilişkili sınır, laboratuvar talebi', '5 durum (denizaltı ve gemi varsayılanı; gemi r = (20, −4, 15) m dar ve SS4; denizaltı SS5, r = (−8, 3, −2) m; k_g > 0): ikinci uygulama σ ve biçimleri parametrelerden kurar, spektral momentleri log-frekansta Simpson kuralıyla hesaplar; a_x = θ̈·r_z − ψ̈·r_y, a_y = ψ̈·r_x − φ̈·r_z, a_z = φ̈·r_y − θ̈·r_x, terimler karesel; f_a = √(Σσ²f²/Σσ²); B1-10 = k_g·√Σ(σ_a/2πf)²/g; tam ilişkili sınır = eksen başına terimlerin toplamı; laboratuvar σ_k ve tepe ≈ k_p·σ + ½|r_k|(σ_a² + σ_b²)',
    'özdeş (sayısal integrasyon)', `en büyük göreli fark ${f(worst, 2)} (${where}); ${n} sayı · ${parts.join(' · ')}`, '≤ 1·10⁻⁶', worst <= 1e-6);
}

// v13.4: W11 — kolimatör geometrisi, iki daire örtüşmesi ve göz bebeği yanal kayması (bağımsız ikinci uygulama)
// Geometri: temel dönüş matrislerinin çarpımı (Rz·Ry·Rx), pivot göz bebeğinde: stab ON E − E0 = (R − I)(−L_pg·l) + t, stab OFF E − E0 = t;
// LOS'a dik izdüşümün büyüklüğü (yön tabanından bağımsız) + L_off·sin θ⊥. Örtüşme: kutupsal Simpson integrali. Kapalı biçimler:
// T0.3 uç pozu, T2.5 öteleme genliği min(a/(2πf)², 0,9·strok). Profiller (T0.1, T1.3) senaryo kanalından 1 kHz'de değerlendirilir.
if (run('W11')) {
  const losOf = (P) => { const d = L.derive(P); return [Math.cos(d.e0) * Math.cos(d.a0), Math.cos(d.e0) * Math.sin(d.a0), Math.sin(d.e0)]; };
  const lat = (P, l, ph, th, ps, t, stab) => {
    const R = mm(Rz(ps), mm(Ry(th), Rx(ph))), Lp = P.dut.L_pg;
    let dE = stab ? mv(R, l.map(x => -Lp * x)).map((x, i) => x + Lp * l[i]) : [0, 0, 0];
    if (t) dE = dE.map((x, i) => x + t[i]);
    const a = dot(dE, l), v = dE.map((x, i) => x - a * l[i]); return Math.hypot(v[0], v[1], v[2]);
  };
  const tperp = (l, a) => { const q = dot(a, l); return Math.hypot(a[0] - q * l[0], a[1] - q * l[1], a[2] - q * l[2]); };
  const ovI = (Dp, Dc, s) => { const r = Dp / 2, R = Dc / 2, N = 4000, hh = r / N; let S = 0;
    const fr = (rho) => { if (rho === 0) return s <= R ? 1 : 0; if (s === 0) return rho <= R ? 1 : 0; const c = (rho * rho + s * s - R * R) / (2 * rho * s); return c <= -1 ? 1 : (c >= 1 ? 0 : Math.acos(c) / Math.PI); };
    for (let i = 0; i <= N; i++) { const rho = i * hh, w = i === 0 || i === N ? 1 : (i % 2 ? 4 : 2); S += w * 2 * Math.PI * rho * fr(rho); } return S * hh / 3 / (Math.PI * r * r); };
  const exI = (P, S, fsI) => { const l = losOf(P), c = W_IFOV(P).c, Dp = c.Dp_mm * 1e-3, Dc = P.wb.coll.Dc_mm * 1e-3, eV = (Dc - Dp) / 2, Lo = P.wb.hex.L_off || 0;
    const n = Math.max(3, Math.round(S.T * fsI)), rg = L.makeRngFactory(S.seed == null ? 1 : S.seed), cm = L.makeChannel(S.cmd || [], fsI, rg), tr = L.makeChannel(S.trans || [], fsI, rg), a = [0, 0, 0], t = [0, 0, 0];
    let eMax = 0, nV = 0; for (let i = 0; i < n; i++) { cm.eval(i / fsI, a); if (tr.comps.length) tr.eval(i / fsI, t);
      const e = lat(P, l, a[0], a[1], a[2], tr.comps.length ? t : null, S.stab !== false) + Lo * Math.sin(Math.min(tperp(l, a), Math.PI / 2)); if (e > eMax) eMax = e; if (e > eV + 1e-12) nV++; }
    return { eMax, fVig: nV / n }; };
  const mk = (kind, fn) => { const P = full(kind); if (fn) fn(P); return P; };
  const cases = [
    ['denizaltı varsayılanı', full('sub')], ['gemi varsayılanı', full('ship')],
    ['HDTV-NFOV (D_p 75 mm)', mk('sub', P => { P.wb.refChannel = 'HDTV-NFOV'; })],
    ['f_c 900 mm, iğne 100 µm', mk('sub', P => { P.wb.coll.fc_mm = 900; P.wb.coll.pinhole_um = 100; })],
    ['D_c 250 mm', mk('sub', P => { P.wb.coll.Dc_mm = 250; })],
    ['L_off 0,15 m, θ_test 10°', mk('sub', P => { P.wb.hex.L_off = 0.15; P.wb.hex.theta_test = 10; })],
  ];
  let wG = 0, wO = 0, wS = 0, wE = 0, wF = 0, flag = 0, verd = 0, n = 0, where = '', fitBad = 0, wD = 0; const parts = [], fitTxt = [];
  for (const [nm, P] of cases) {
    const G = L.collGeom(P), { c, IF } = W_IFOV(P), C = P.wb.coll, Dp = c.Dp_mm * 1e-3, Dc = C.Dc_mm * 1e-3, k = C.ap_margin;
    const gi = [['f_c/f', G.ratio, C.fc_mm / c.f_mm], ['iğne açısı', G.phRad, C.pinhole_um / C.fc_mm * 1e-3], ['iğne/IFOV', G.phIFOV, C.pinhole_um / C.fc_mm * 1e-3 / IF],
      ['iğne görüntüsü', G.phImg_um, C.pinhole_um * c.f_mm / C.fc_mm], ['e_free', G.eFree, (Dc / k - Dp) / 2], ['D_p', G.Dp, Dp]];
    for (const [w, a, b] of gi) { const r = rel(a, b); n++; if (r > wG) { wG = r; where = `${nm} · ${w}`; } }
    if (G.phOk !== (C.pinhole_um * c.f_mm / C.fc_mm <= c.p_um) || G.ratioOk !== (C.fc_mm / c.f_mm >= C.ratio_min) || G.apOk !== (Dc >= k * Dp)) flag++;
    for (const s of [0, (Dc - Dp) / 2, 0.03, 0.045, 0.0577, (Dc + Dp) / 2 - 0.005, (Dc + Dp) / 2 + 0.001]) { wO = Math.max(wO, Math.abs(L.pupilOverlap(Dp, Dc, s) - ovI(Dp, Dc, s))); n++; }
    const l = losOf(P); let sd = 7; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff * 2 - 1; };
    for (let q = 0; q < 300; q++) { const a = [rnd() * 0.25, rnd() * 0.25, rnd() * 0.25], t = [rnd() * 0.1, rnd() * 0.1, rnd() * 0.1], st = q % 2 === 0, [hz, vt] = L.pupilShift(G, a[0], a[1], a[2], t, st, 0);
      wS = Math.max(wS, Math.abs(Math.hypot(hz, vt) - lat(P, l, a[0], a[1], a[2], t, st))); n++; }
    // test hareketleri: kapalı biçimler ve profiller ↔ collExcursions (motor, 200 Hz)
    // v13.5: T2.5 öteleme segmentleri 2 ve 3 Hz → en büyük genlik 2 Hz'de: min(2/(2π·2)², 0,9·strok)
    const X = L.collExcursions(P), th = P.wb.hex.theta_test * D2R, Lo = P.wb.hex.L_off || 0, A25 = Math.min(2 / Math.pow(TAU * 2, 2), 0.9 * P.lab.hexStroke);
    const eT03 = (sg) => lat(P, l, sg * th, sg * th, sg * th, null, true) + Lo * Math.sin(Math.min(tperp(l, [sg * th, sg * th, sg * th]), Math.PI / 2));
    const exp = { 'T0.3+': eT03(1), 'T0.3−': eT03(-1), 'T2.5x': A25 * Math.hypot(1 - l[0] * l[0], l[0] * l[1], l[0] * l[2]), 'T2.5y': A25 * Math.hypot(l[1] * l[0], 1 - l[1] * l[1], l[1] * l[2]), 'T2.5z': A25 * Math.hypot(l[2] * l[0], l[2] * l[1], 1 - l[2] * l[2]) };
    const s13 = L.seaLabScenario(P, { T: 620, seed: 1301 }), I13 = exI(P, s13, 1000);
    // v13.5: öteleme sığdırma — q_c < 1 ise kayma e_free'nin altında ve oran en büyük (×1,01 ile sınır aşılır); δ_max = f_c²·pay/e
    if (s13.seaQc != null && s13.seaQc < 1) {
      const eF = (Dc / k - Dp) / 2, seaC = (s13.trans || []).filter(c => c.type === 'series');
      seaC.forEach(c => { c.scale *= 1.01; }); const Iup = exI(P, s13, 1000); seaC.forEach(c => { c.scale /= 1.01; });
      // q_c = 0: açısal hareket (+ L_off) tek başına sınırı aşar, sığdırma olanaksız — kalan aşım test kuralına kalır
      if (s13.seaQc === 0 ? !(I13.eMax > eF * (1 - 1e-3)) : !(I13.eMax <= eF * (1 + 1e-6) && Iup.eMax > eF * (1 - 1e-3))) fitBad++;
      fitTxt.push(`${nm}: q_c ${f(s13.seaQc, 4)} → ${f(I13.eMax * 1e3, 3)} mm (×1,01: ${f(Iup.eMax * 1e3, 3)} mm; sınır ${f(eF * 1e3, 3)})`);
    }
    { const eT = Math.max(I13.eMax, 1e-6), dI = Math.pow(C.fc_mm * 1e-3, 2) * (C.par_allow_urad || 1) * 1e-6 / eT; wD = Math.max(wD, rel(G.deltaMax(eT), dI)); }
    const d = L.derive(P), mR = L.axisMap(P, 0), mY = L.axisMap(P, 2), kR = [{ t: 0, v: 0 }], kY = [{ t: 0, v: 0 }]; let tt = 2;
    for (const gy of [-0.4, 0.4]) for (const gx of [-0.4, 0.4]) { kR.push({ t: tt, v: gy * d.FOVv * D2R / mR.w }); kY.push({ t: tt, v: gx * d.FOVh * D2R / mY.w }); tt += 6; }
    const I01 = exI(P, L.labScenario(P, { T: tt + 1, stab: false, cmd: [{ type: 'steps', axis: 0, knots: kR, trans: 1 }, { type: 'steps', axis: 2, knots: kY, trans: 1 }] }), 1000);
    const pick = (id, re) => X.find(x => x.id === id && (!re || re.test(x.label)));
    const pairs = [[pick('T0.3', /\+θ/), exp['T0.3+']], [pick('T0.3', /−θ/), exp['T0.3−']], [pick('T2.5', /öteleme x/), exp['T2.5x']], [pick('T2.5', /öteleme y/), exp['T2.5y']], [pick('T2.5', /öteleme z/), exp['T2.5z']], [pick('T1.3'), I13.eMax, I13.fVig], [pick('T0.1'), I01.eMax, I01.fVig]];
    for (const [x, e, fv] of pairs) { if (!x) continue; n++;
      const r = e < 1e-9 && x.eMax < 1e-9 ? 0 : rel(x.eMax, e); if (r > wE) { wE = r; } if (fv != null) wF = Math.max(wF, Math.abs(x.fVig - fv));
      const eFree = (Dc / k - Dp) / 2; if (x.ok !== (e <= eFree + 1e-12)) verd++; }
    parts.push(`${nm}: e_free ${f(G.eFree * 1e3, 2)} mm, T0.3 ${f(exp['T0.3+'] * 1e3, 2)}/${f(exp['T0.3−'] * 1e3, 2)}, T2.5 x ${f(exp['T2.5x'] * 1e3, 2)}, T1.3 ${f(I13.eMax * 1e3, 2)} mm (vinyetleme %${f(100 * I13.fVig, 1)}), T0.1 ${f(I01.eMax * 1e3, 2)} mm`);
  }
  const pass = wG <= 1e-12 && flag === 0 && wO <= 1e-6 && wS <= 1e-12 && wE <= 1e-3 && wF <= 0.005 && verd === 0 && fitBad === 0 && wD <= 1e-12;
  add('W', 'W11', 'Kolimatör geometrisi, demet–göz bebeği örtüşmesi ve test hareketlerinden yanal kayma',
    '6 durum (denizaltı ve gemi varsayılanı, HDTV-NFOV, f_c 900 mm + iğne 100 µm, D_c 250 mm, L_off 0,15 m + θ_test 10°): f_c/f, iğne açısı ve görüntüsü, e_free, bayraklar; örtüşme kutupsal Simpson integraliyle (7 kayma); pupilShift 300 rastgele duruş/öteleme (±14°, ±100 mm, stab ON/OFF) temel dönüş matrisleriyle; T0.3 ve T2.5 kapalı biçim, T0.1 ve T1.3 profili 1 kHz bağımsız değerlendirme',
    'özdeş geometri; örtüşme ve kayma integral/örnekleme duyarlığında',
    `geometri en büyük göreli fark ${f(wG, 2)}${where ? ' (' + where + ')' : ''}, bayrak uyuşmazlığı ${flag}; örtüşme mutlak fark ${f(wO, 2)}; pupilShift ${f(wS, 2)} m; test kayması göreli fark ${f(wE, 2)}, vinyetleme süresi farkı ${f(100 * wF, 2)} puan, karar uyuşmazlığı ${verd}; öteleme sığdırma uyuşmazlığı ${fitBad} (${fitTxt.join('; ') || 'sığdırma yok'}); δ_max göreli fark ${f(wD, 2)}; ${n} sayı · ${parts.join(' · ')}`,
    'geometri ≤ 1·10⁻¹², bayrak 0; örtüşme ≤ 1·10⁻⁶; pupilShift ≤ 1·10⁻¹² m; kayma ≤ 1·10⁻³ (göreli), vinyetleme süresi ≤ 0,5 puan, karar uyuşmazlığı 0; sığdırılan oran sınırı tutar ve en büyüktür; δ_max ≤ 1·10⁻¹²', pass);
}

// ============================================================ N — sayısal yapı taşları
if (run('N1')) {
  // Welch PSD/CSD/H1/koherans: scipy.signal ile birebir
  const n = 32768 + 123, fsr = 1000, rng = new L.RNG(91), x = new Float64Array(n), y = new Float64Array(n);
  const lp = L.bqLP(80, fsr, 0.9), bp = L.bqBP(120, fsr, 4);
  for (let i = 0; i < n; i++) { x[i] = lp.step(rng.gauss()) + 0.3 * Math.sin(TAU * 37.3 * i / fsr); y[i] = 0.7 * bp.step(x[i]) + 0.2 * rng.gauss(); }
  const r = L.welchCSD(x, y, fsr, 1024), h = L.tfH1(x, y, fsr, 1024);
  const tmp = path.join(__dirname, 'vv_xy.json');
  fs.writeFileSync(tmp, JSON.stringify({ x: Array.from(x), y: Array.from(y) }));
  let py = null;
  try {
    py = JSON.parse(execSync(`python3 -c "
import json,numpy as np
from scipy import signal
d=json.load(open('${tmp}'));x=np.array(d['x']);y=np.array(d['y'])
f,P=signal.welch(x,1000,window='hann',nperseg=1024,noverlap=512,detrend='constant',scaling='density')
f,C=signal.csd(x,y,1000,window='hann',nperseg=1024,noverlap=512,detrend='constant',scaling='density')
f,g=signal.coherence(x,y,1000,window='hann',nperseg=1024,noverlap=512)
print(json.dumps({'P':P.tolist(),'Cr':C.real.tolist(),'Ci':C.imag.tolist(),'g':g.tolist()}))
"`, { maxBuffer: 1 << 26 }).toString());
  } catch (e) { py = null; }
  fs.unlinkSync(tmp);
  if (py) {
    let eP = 0, eC = 0, eG = 0;
    for (let k = 1; k < r.f.length - 1; k++) {
      eP = Math.max(eP, rel(r.Pxx[k], py.P[k]));
      eC = Math.max(eC, Math.hypot(r.Cr[k] - py.Cr[k], r.Ci[k] - py.Ci[k]) / Math.hypot(py.Cr[k], py.Ci[k]));
      eG = Math.max(eG, Math.abs(h.coh[k] - py.g[k]));
    }
    add('N', 'N1', 'Welch PSD, CSD ve koherans (scipy.signal)', 'aynı dizi (n = 32 891, Hann, %50 örtüşme, segment ortalaması çıkarılır) JS ve scipy.signal.welch/csd/coherence ile', 'özdeş (yuvarlama)',
      `PSD ${f(eP, 2)}, CSD ${f(eC, 2)} (göreli), koherans ${f(eG, 2)} (mutlak)`, '≤ 1·10⁻⁹', eP <= 1e-9 && eC <= 1e-9 && eG <= 1e-9);
  } else add('N', 'N1', 'Welch PSD, CSD ve koherans (scipy.signal)', 'scipy çalıştırılamadı', '—', '—', '—', false);
}
if (run('N2')) {
  const fs0 = 2000, f0 = 120, mag = (b, fq) => { const z = b.resp(fq, fs0); return Math.hypot(z.re, z.im); };
  const cases = [['AG (Q = 0,8): |H(f0)| = Q', mag(L.bqLP(f0, fs0, 0.8), f0), 0.8], ['YG (Q = 0,8): |H(f0)| = Q', mag(L.bqHP(f0, fs0, 0.8), f0), 0.8],
    ['BG (Q = 5): |H(f0)| = 1', mag(L.bqBP(f0, fs0, 5), f0), 1], ['Tepe +12 dB: |H(f0)| = 10^(12/20)', mag(L.bqPeak(f0, fs0, 2, 12), f0), Math.pow(10, 12 / 20)]];
  const worst = Math.max(...cases.map(c => rel(c[1], c[2])));
  const nz = mag(L.bqNotch(f0, fs0, 3), f0);
  add('N', 'N2', 'Biquad süzgeçler (RBJ, bilineer + ön-bükme)', cases.map(c => c[0]).join('; ') + '; çentik: |H(f0)| = 0', 'kapalı biçim değer', `en büyük göreli fark ${f(worst, 2)}; çentik ${f(nz, 2)}`, '≤ 1·10⁻¹²', worst <= 1e-12 && nz <= 1e-12);
}
if (run('N3')) {
  // Osc2: FOH tam ayrıklaştırma — rampa yanıtının kapalı biçimi
  const fn = 10, z = 0.1, dt = 1e-3, w = TAU * fn, s = z * w, wd = w * Math.sqrt(1 - z * z);
  const r = (t) => t - 2 * z / w + Math.exp(-s * t) * ((2 * z / w) * Math.cos(wd * t) + ((2 * z * z - 1) / wd) * Math.sin(wd * t));
  const o = new L.Osc2(fn, z, dt); let worst = 0;
  for (let k = 0; k < 2000; k++) { const x = o.step(1); const t = k * dt; const ex = (r(t + dt) - r(t)) / dt; worst = Math.max(worst, Math.abs(x - ex)); }
  // rezonansta sinüs kararlı hali: kazanç 1/(2ζ), faz −90°
  const o2 = new L.Osc2(120, 0.02, 1 / 4000), n = 4000 * 4, tt = new Float64Array(n), yy = new Float64Array(n);
  for (let k = 0; k < n; k++) { tt[k] = k / 4000; yy[k] = o2.step(Math.sin(TAU * 120 * tt[k])); }
  const fit = L.sineFit(tt, yy, 120, { i0: 8000, i1: n, trend: false }), g = fit.A, ph = Math.atan2(fit.a, fit.b) * 180 / Math.PI;   // y = g·sin(ωt + φ)
  add('N', 'N3', 'İkinci derece mod modeli (Osc2, birinci derece tutma)', 'adım girişi (FOH: rampa) yanıtı kapalı biçimle; 120 Hz, ζ = 0,02 modunda rezonans kazancı ve fazı',
    'rampa yanıtı tam; kazanç 1/(2ζ) = 25, faz −90°', `en büyük mutlak fark ${f(worst, 2)}; kazanç ${f(g, 3)}, faz ${f(ph, 2)}°`, 'fark ≤ 1·10⁻¹⁰; kazanç ±%0,5; faz ±0,5°',
    worst <= 1e-10 && Math.abs(g / 25 - 1) <= 0.005 && Math.abs(ph + 90) <= 0.5);
}
if (run('N4')) {
  const fc = 7, dt = 1 / 3000, l = new L.Lag1(fc, dt); let worst = 0;
  for (let k = 1; k <= 3000; k++) { const y = l.step(1); worst = Math.max(worst, Math.abs(y - (1 - Math.exp(-TAU * fc * k * dt)))); }
  // GaussMarkov durağan varyansı
  const gm = new L.GaussMarkov(2.0, 0.5, 0.01, new L.RNG(5)); let s2 = 0; const N = 400000; for (let i = 0; i < N; i++) { const v = gm.step(); s2 += v * v; }
  const sd = Math.sqrt(s2 / N);
  add('N', 'N4', 'Birinci derece gecikme ve Gauss–Markov süreci', 'adım yanıtı 1 − e^(−2πf_c t); durağan σ (400 000 örnek, T_c = 0,5 s)', 'tam; σ = 2,000', `en büyük fark ${f(worst, 2)}; σ = ${f(sd, 4)}`, 'fark ≤ 1·10⁻¹²; σ ±%3', worst <= 1e-12 && Math.abs(sd / 2 - 1) <= 0.03);
}
if (run('N5')) {
  // spektral sentez: hedef RMS ve log-Gauss deniz spektrumu biçimi
  const fsg = 20, n = 1 << 19, sh = L.shapeLogGauss(0.125, 0.12), x = L.synthSeries(sh, fsg, n, new L.RNG(17), 1.0);
  let s2 = 0; for (let i = 0; i < n; i++) s2 += x[i] * x[i]; const r0 = Math.sqrt(s2 / n);
  const w = L.welch(x, fsg, 4096); let num = 0, den = 0; for (let k = 1; k < w.f.length; k++) { num += w.P[k]; den += sh(w.f[k]); }
  const sc = num / den; let e = 0, c = 0;
  for (let k = 1; k < w.f.length; k++) { const fq = w.f[k]; if (Math.abs(Math.log(fq / 0.125)) > 0.12) continue; e += Math.abs(w.P[k] / (sc * sh(fq)) - 1); c++; }
  e /= Math.max(1, c);
  add('N', 'N5', 'Deniz profili sentezi (spektral, log-Gauss)', 'RMS hedefe normalize; Welch PSD / hedef biçim oranı tepe bandında (±1σ_ln)', 'RMS 1,000; oran 1', `RMS ${f(r0, 6)}; ortalama |oran − 1| = ${f(e, 3)} (${c} kutu)`, 'RMS ±1·10⁻⁹; |oran − 1| ≤ 0,10 (Welch istatistiği, n_d ≈ 255)', Math.abs(r0 - 1) < 1e-9 && e <= 0.10);
}
if (run('N6')) {
  const fs0 = 4000, secs = [L.bqHP(4, fs0), L.bqHP(4, fs0), L.bqLP(33, fs0), L.bqLP(33, fs0)];
  const sn = new L.ShapedNoise(secs, 0.9066, new L.RNG(23), fs0); const N = fs0 * 400; let s2 = 0;
  for (let i = 0; i < N; i++) { const v = sn.step(); if (i > fs0 * 5) s2 += v * v; }
  const r0 = Math.sqrt(s2 / (N - fs0 * 5 - 1));
  add('N', 'N6', 'Şekillendirilmiş gürültü (platform titreşimi biçimi)', '4–33 Hz, 4. derece YG/AG kesitler; hedef RMS dürtü yanıtı enerjisinden; 395 s örnek', 'RMS 0,9066 m/s²', `RMS ${f(r0, 4)}`, '±%2', Math.abs(r0 / 0.9066 - 1) <= 0.02);
}
if (run('N7')) {
  // ARW: beyaz hız gürültüsünde σ(τ)·√τ = N (tahmin güven aralığı içinde)
  const P = base(), G = P.dut.gyro, fs0 = 100, N = 3600 * fs0, Nn = G.arw * L.DEGPSQH, rng = new L.RNG(29), x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = Nn * Math.sqrt(fs0) * rng.gauss();
  const ad = L.allanDev(x, fs0, [0.1, 1, 10]);
  const okA = ad.every(a => Math.abs(a.adev * Math.sqrt(a.tau) / Nn - 1) <= 3 / Math.sqrt(2 * (a.K - 1)));
  const tA = ad.map(a => `τ ${a.tau} s: ${f(a.adev * Math.sqrt(a.tau) / Nn, 4)} (±${f(3 / Math.sqrt(2 * (a.K - 1)) * 100, 1)} %)`).join(', ');
  // bias kararsızlığı modeli: 10 Gauss–Markov (c = 0,6·B, T_c = 1 s…30 000 s) + RRW (K = 0,0081·B/√s); kapalı biçim Allan varyansı
  // GM: σ² = (2c²T_c/τ)[1 − (T_c/2τ)(3 − 4e^(−τ/T_c) + e^(−2τ/T_c))]  (IEEE 952 Ek C), RRW: K²τ/3
  const B = G.bi * L.DEGPH, Tcs = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000], c = 0.6 * B, Kr = 0.0081 * B;
  const avA = (tau) => { let s2 = 0; for (const Tc of Tcs) { const q = tau / Tc; s2 += (2 * c * c * Tc / tau) * (1 - (Tc / (2 * tau)) * (3 - 4 * Math.exp(-q) + Math.exp(-2 * q))); } return Math.sqrt(s2 + Kr * Kr * tau / 3); };
  let mn = 1e9, mx = 0; for (const t of L.logspace(20, 1000, 100)) { const v = avA(t) / B; mn = Math.min(mn, v); mx = Math.max(mx, v); }
  const fs1 = 20, N1 = 12 * 3600 * fs1, bp = new L.BiasProcess(B, new L.RNG(31), 1 / fs1), y = new Float64Array(N1);
  for (let i = 0; i < N1; i++) y[i] = bp.step();
  const a2 = L.allanDev(y, fs1, [5, 50, 500]);
  const okS = a2.every(a => Math.abs(a.adev / avA(a.tau) - 1) <= 3 / Math.sqrt(2 * (a.K - 1)));
  const tS = a2.map(a => `τ ${a.tau} s: ${f(a.adev / B, 3)}/${f(avA(a.tau) / B, 3)} B`).join(', ');
  add('N', 'N7', 'Gyro gürültü modeli: ARW ve bias kararsızlığı (Allan)', 'beyaz hız gürültüsü (1 sa, 100 Hz) σ(τ)√τ/N; bias modeli: kapalı biçim Allan eğrisi ve 12 sa benzetimi',
    'σ(τ)√τ = N; düz bölge (20–1000 s) 0,664·B ±%3; benzetim = kapalı biçim', `${tA}; kapalı biçim 20–1000 s: ${f(mn, 3)}–${f(mx, 3)} B (2 s: ${f(avA(2) / B, 3)}, 3000 s: ${f(avA(3000) / B, 3)}); benzetim ${tS}`,
    'ARW ve benzetim: tahminin 3σ güven aralığı (1/√(2(K−1))); düz bölge 0,644–0,684 B', okA && okS && mn >= 0.644 && mx <= 0.684);
}
if (run('N8')) {
  // sinüs uydurma: Monte Carlo yanlılık ve standart hata tutarlılığı
  const n = 600, M = 400, rng = new L.RNG(37), As = [], ses = [], phs = [];
  const t = Float64Array.from({ length: n }, (_, i) => i * 0.02);
  for (let m = 0; m < M; m++) {
    const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = 1.0 * Math.cos(TAU * 0.7 * t[i] + 0.4) + 0.05 + 0.002 * t[i] + 0.5 * rng.gauss();
    const r = L.sineFit(t, x, 0.7); As.push(r.A); ses.push(r.seA); phs.push(r.ph);
  }
  const mA = L.aMean(As), sA = L.aStd(As), mSe = L.aMean(ses), mPh = L.aMean(phs);
  add('N', 'N8', 'Sinüs + doğrusal trend uydurması (DRR ve dwell analizleri)', `${M} Monte Carlo denemesi: A = 1, φ = 0,4 rad, σ = 0,5, n = ${n}`, 'yansız A ve φ; standart hata ≈ örnek saçılımı',
    `A ${f(mA, 4)}, φ ${f(mPh, 4)}; σ_A örnek ${f(sA, 4)} / formül ${f(mSe, 4)}`, '|A−1| ≤ %1; |φ−0,4| ≤ 0,01; σ oranı 0,85–1,15', Math.abs(mA - 1) <= 0.01 && Math.abs(mPh - 0.4) <= 0.01 && sA / mSe >= 0.85 && sA / mSe <= 1.15);
}
if (run('N9')) {
  // senkron ortalama (TSA): periyodik geçiş dalga biçiminin rastgele yürüyüş + beyaz gürültü altında geri kazanımı
  const fr = 1000, fq = 0.05, K = 10, np = fr / fq, n = K * np + 5000, t = new Float64Array(n), p = new Float64Array(n), x = new Float64Array(n), rng = new L.RNG(41);
  let rw = 0;
  for (let i = 0; i < n; i++) {
    t[i] = i / fr; const ph = (t[i] * fq) % 1, u = (ph * 2) % 1;
    p[i] = (ph < 0.5 ? 1 : -1) * 5e-6 * Math.exp(-u * (0.5 / fq) / 0.5) + 1e-3 * Math.sin(TAU * fq * t[i]);   // her yön değişiminde 5 µrad, 0,5 s sönüm
    rw += 1.2e-6 * Math.sqrt(1 / fr) * rng.gauss(); x[i] = p[i] + rw + 0.5e-6 * rng.gauss();
  }
  const A = L.tsaAnalysis(t, x, fq, 2000, K, fr), A0 = L.tsaAnalysis(t, p, fq, 2000, K, fr);
  add('N', 'N9', 'Senkron ortalama (TSA, T1.6/T4.2 sürtünme analizi)', '0,05 Hz uyarımda her yön değişiminde 5 µrad, 0,5 s sönümlü geçiş; üstüne 1,2 µrad/√s rastgele yürüyüş (ARW) ve 0,5 µrad beyaz gürültü; 10 periyot',
    `gürültüsüz referans: tekrarlanan RMS ${f(A0.det * 1e6, 3)} µrad, tepe ${f(A0.pk * 1e6, 2)} µrad`, `gürültülü: RMS ${f(A.det * 1e6, 3)} µrad, tepe ${f(A.pk * 1e6, 2)} µrad`, 'RMS ±%15; tepe ±%25',
    Math.abs(A.det / A0.det - 1) <= 0.15 && Math.abs(A.pk / A0.pk - 1) <= 0.25);
}
if (run('N10')) {
  // Campbell teoremi: Poisson yarım-sinüs darbe dizisi varyansı = λ·E[A²]·E[T_p]/2
  const P = base(), sl = P.env.slap, T = 40000, fr = 500, ev = L.slapEvents(P, T, new L.RNG(43), 10), c = L.makeComponent({ type: 'halfsine', axis: 0, events: ev }, fr, null);
  let s2 = 0, n = 0; for (let i = Math.round(10 * fr); i < Math.round((T - 1) * fr); i++) { const v = c.value(i / fr); s2 += v * v; n++; }
  const ex = sl.rate * Math.pow(sl.A * 1e-6, 2) * ((sl.Tmin + sl.Tmax) / 2) / 2;
  add('N', 'N10', 'Dalga çarpması modeli ve Campbell teoremi (T2.4 işletme kestirimi)', `${ev.length} olay, ${T} s: Poisson (λ = ${sl.rate}/s), Rayleigh genlik, T_p ~ U[${sl.Tmin}, ${sl.Tmax}] s`,
    `σ = √(λ·E[A²]·E[T_p]/2) = ${f(Math.sqrt(ex) * 1e6, 2)} µrad`, `σ = ${f(Math.sqrt(s2 / n) * 1e6, 2)} µrad`, '±%8 (≈ 4000 olayın istatistiği)', Math.abs(Math.sqrt(s2 / n / ex) - 1) <= 0.08);
}
if (run('N11')) {
  // gecikme kestirimi: bilinen gecikmenin geri kazanımı
  const fsg = 4000, n = 8000, rng = new L.RNG(47), lp = L.bqLP(40, fsg), raw = new Float64Array(n + 200);
  for (let i = 0; i < raw.length; i++) raw[i] = lp.step(rng.gauss());
  const dly = 0.93e-3, tx = new Float64Array(n), x = new Float64Array(n), ty = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { tx[i] = i / fsg; x[i] = raw[i + 100]; ty[i] = i / fsg; const u = i + 100 - dly * fsg, k = Math.floor(u), fr2 = u - k; y[i] = raw[k] + (raw[k + 1] - raw[k]) * fr2; }
  const est = L.delayEstimate(tx, x, ty, y, 20000, 0.01);
  add('N', 'N11', 'Gecikme kestirimi (T0.4)', 'bant sınırlı gürültüye 0,93 ms gecikme; çapraz ilinti + parabolik tepe', '0,930 ms', `${f(est * 1e3, 4)} ms`, '±0,01 ms', Math.abs(est - dly) <= 1e-5);
}
if (run('N12')) {
  // EIS: ayrık uygulama ↔ bütçenin sürekli zaman artık çarpanı (R = √(1+((1−η)f_a/f_c)²)/√(1+(f_a/f_c)²))
  const fc = 0.5, eta = 0.8, fps = 50; let worst = 0; const rows = [];
  for (const fa of [0.125, 0.5, 2, 5, 10]) {
    const n = Math.round(fps * Math.max(200, 40 / fa)), x = new Float64Array(n), t = new Float64Array(n);
    for (let i = 0; i < n; i++) { t[i] = i / fps; x[i] = Math.sin(TAU * fa * t[i]); }
    const y = L.applyEIS(x, null, fps, fc, eta, 0, null);
    const fit = L.sineFit(t, y, fa, { i0: Math.round(n / 2), i1: n }), R = Math.sqrt(1 + Math.pow((1 - eta) * fa / fc, 2)) / Math.sqrt(1 + Math.pow(fa / fc, 2));
    worst = Math.max(worst, rel(fit.A, R)); rows.push(`${fa} Hz: ${f(fit.A, 4)}/${f(R, 4)}`);
  }
  add('N', 'N12', 'EIS yol yumuşatma (bütçenin sürekli zaman artık çarpanı ↔ kare dizisine uygulama)', 'f_c = 0,5 Hz, η = 0,8; 50 fps ayrık birinci derece yumuşatıcı', 'sürekli zaman artık çarpanı R(f_a)', rows.join(' · '), '±%2 (ayrık / sürekli fark)', worst <= 0.02);
}

// ============================================================ K — kinematik
if (run('K1')) {
  // stab OFF büyük açılı statik poz: LOS ve görüntü rotasyonu bağımsız dönüşüm matrisleriyle
  const cases = [{ a0: 90, e0: 0, ang: [5, -3, 8] }, { a0: 30, e0: 20, ang: [-7, 4, -6] }, { a0: -60, e0: 45, ang: [10, 8, 12] }];
  let worst = 0;
  for (const cs of cases) {
    const P = base(); P.dut.geom.a0 = cs.a0; P.wb.earth.el = cs.e0;
    const S = { T: 3, fs: 2000, world: 'lab', stab: false, seed: 1, mech: MECH_OFF, meas: MEAS_OFF, hexActive: false, cooler: false,
      cmd: cs.ang.map((v, i) => ({ type: 'const', axis: i, v: v * D2R })), rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'rot', 'base_r', 'base_p', 'base_y'] } };
    const R = L.runSim(P, S), k = R.meta.nRec - 1;
    const [ph, th, ps] = cs.ang.map(v => v * D2R);          // hexapod 20 Hz modeli 3 s'de komuta tam oturur
    const al = P.wb.earth.az * D2R, e0 = cs.e0 * D2R, a0 = cs.a0 * D2R;
    const los0 = [Math.sin(al) * Math.cos(e0), Math.cos(al) * Math.cos(e0), Math.sin(e0)];
    const beta = Math.atan2(los0[1], los0[0]) - a0;
    const RL = mm(Rz(beta), mm(Rz(ps), mm(Ry(th), Rx(ph))));
    const l = mv(RL, [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)]), yB = mv(RL, [-Math.sin(a0), Math.cos(a0), 0]);
    const yr = nrm(cross([0, 0, 1], los0)), zr = cross(los0, yr);
    const el = Math.asin(dot(l, zr)), xel = Math.atan2(dot(l, yr), dot(l, los0)), rot = Math.atan2(dot(yB, zr), dot(yB, yr));
    worst = Math.max(worst, Math.abs(el - R.rec.opt_el[k]), Math.abs(xel - R.rec.opt_xel[k]), Math.abs(rot - R.rec.rot[k]));
  }
  add('K', 'K1', 'Büyük açılı kinematik (stab OFF)', '3 geometri (LOS az/el ve taban roll/pitch/yaw 3–12°): motorun LOS el/xel ve görüntü rotasyonu, R = Rz(β)Rz(ψ)Ry(θ)Rx(φ) ile bağımsız hesap', 'özdeş', `en büyük fark ${f(worst * 1e6, 3)} µrad`, '≤ 0,05 µrad (kayıt float32)', worst <= 5e-8);
}
if (run('K2')) {
  // ideal gimbal (sürtünme/gürültü/bias yok), kompanzasyon KAPALI: LOS laboratuvara göre dünya dönüşü izdüşümleriyle kayar
  const cases = [{ lat: 40, az: 90, el: 0 }, { lat: 40, az: 45, el: 30 }, { lat: -25, az: 200, el: 60 }];
  let worst = 0, rotW = 0; const txt = [];
  for (const cs of cases) {
    const P = base(); Object.assign(P.wb.earth, { lat: cs.lat, az: cs.az, el: cs.el });
    const d = L.derive(P), mech = Object.assign({}, MECH_OFF, { earth: true });
    // kısa pencere (1–10 s): LOS kaydıkça görüntü eksenleri LOS etrafında döner ve el/xel hızlarını karıştırır (ikinci derece);
    // formül başlangıç anının hızını verir
    const R = L.runSim(P, { T: 10, fs: 2000, world: 'lab', stab: true, seed: 1, mech, meas: MEAS_OFF, hexActive: false, cooler: false, earthComp: false, rec: { fs: 200, ch: ['opt_el', 'opt_xel', 'rot'] } });
    const t = rec(R), [i0, i1] = idx(t, 1, 9.95);
    const sv = Math.abs(slope(t, R.rec.opt_el, i0, i1)), sh = Math.abs(slope(t, R.rec.opt_xel, i0, i1)), sr = Math.abs(slope(t, R.rec.rot, i0, i1));
    worst = Math.max(worst, Math.abs(sv - d.earthImg.v) / d.earthImg.v, Math.abs(sh - d.earthImg.h) / Math.max(d.earthImg.h, 1e-9));
    // 2 eksenli gimbal: az ekseni düşey; yatay kayma h = ȧ·cos ε → LOS etrafında (laboratuvar eksenlerine göre) dönme ȧ·sin ε = h·tan ε
    const expR = d.earthImg.h * Math.tan(cs.el * D2R);
    rotW = Math.max(rotW, Math.abs(sr - expR) / 7.292115e-5);
    txt.push(`φ ${cs.lat}°, α ${cs.az}°, ε ${cs.el}°: el ${f(sv * 1e6, 2)}/${f(d.earthImg.v * 1e6, 2)}, xel ${f(sh * 1e6, 2)}/${f(d.earthImg.h * 1e6, 2)}, rot ${f(sr * 1e6, 2)}/${f(expR * 1e6, 2)} µrad/s`);
  }
  add('K', 'K2', 'Dünya dönüşü: eylemsiz LOS\'un laboratuvara göre kayması', 'ideal gimbal, kompanzasyon KAPALI, 3 geometri; ölçülen kayma hızı (sim / formül): el ↔ Ω·|cos φ·sin α|, xel ↔ Ω·|sin φ·cos ε − cos φ·cos α·sin ε|, rot ↔ h·tan ε (az gimbal hareketinin LOS bileşeni)', 'dünya dönüşü izdüşüm formülleri',
    `el/xel en büyük göreli fark ${f(worst * 100, 3)} %; rot farkı ${f(rotW * 100, 3)} % Ω`, 'el/xel ≤ %0,1; rot ≤ %1 Ω', worst <= 1e-3 && rotW <= 0.01, { detail: txt.join(' · ') });
}
if (run('K3')) {
  const P = base(), mech = Object.assign({}, MECH_OFF, { earth: true, compErr: true });
  const R = L.runSim(P, { T: 30, fs: 2000, world: 'lab', stab: true, seed: 1, mech, meas: MEAS_OFF, hexActive: false, cooler: false, earthComp: true, rec: { fs: 100, ch: ['opt_el', 'opt_xel'] } });
  const t = rec(R), [i0, i1] = idx(t, 2, 29.9), s = Math.hypot(slope(t, R.rec.opt_el, i0, i1), slope(t, R.rec.opt_xel, i0, i1));
  const ex = P.wb.earth.Omega * P.wb.earth.delta_deg * D2R;
  add('K', 'K3', 'Dünya dönüşü kompanzasyon artığı', 'kompanzasyon AÇIK, yönelim hatası δ = 1° (LOS\'a ve Ω\'ya dik): kayma hızının büyüklüğü', `Ω·δ = ${f(ex * 1e6, 3)} µrad/s`, `${f(s * 1e6, 3)} µrad/s`, '±%0,5', Math.abs(s / ex - 1) <= 0.005);
}
if (run('K4')) {
  // stabilizasyon geometrisi: statik taban açısında gimbal açıları tabanın tersini alır, LOS kalır
  const P = base(), mech = Object.assign({}, MECH_OFF, { earth: true, coupling: true });
  const R = L.runSim(P, { T: 8, fs: 2000, world: 'lab', stab: true, seed: 1, mech, meas: MEAS_OFF, hexActive: false, cooler: false,
    cmd: [{ type: 'steps', axis: 0, knots: [{ t: 0, v: 0 }, { t: 1, v: 4 * D2R }], trans: 3 }, { type: 'steps', axis: 2, knots: [{ t: 0, v: 0 }, { t: 1, v: 6 * D2R }], trans: 3 }],
    rec: { fs: 100, ch: ['enc_a', 'enc_e', 'opt_el', 'opt_xel', 'base_r', 'base_y'] } });
  const k = R.meta.nRec - 1;
  // beklenen gimbal açıları (bağımsız): b = R_LBᵀ·l0
  const a0 = P.dut.geom.a0 * D2R, al = P.wb.earth.az * D2R, los0 = [Math.sin(al), Math.cos(al), 0], beta = Math.atan2(los0[1], los0[0]) - a0;
  const RL = mm(Rz(beta), mm(Rz(R.rec.base_y[k]), Rx(R.rec.base_r[k]))), RT = [[RL[0][0], RL[1][0], RL[2][0]], [RL[0][1], RL[1][1], RL[2][1]], [RL[0][2], RL[1][2], RL[2][2]]];
  const b = mv(RT, los0), aEx = Math.atan2(b[1], b[0]) - a0, eEx = Math.asin(b[2]);
  const ea = Math.abs(R.rec.enc_a[k] - aEx), ee = Math.abs(R.rec.enc_e[k] - eEx), lo = Math.max(Math.abs(R.rec.opt_el[k]), Math.abs(R.rec.opt_xel[k]));
  add('K', 'K4', 'Stabilizasyon geometrisi (gimbal açıları)', 'taban roll 4°, yaw 6° (rampa) stab ON, ideal gimbal: enkoder açıları ↔ R_LBᵀ·l₀\'dan bağımsız hesap; LOS sapması', `az ${f(aEx / D2R, 4)}°, el ${f(eEx / D2R, 4)}°`,
    `az ${f(R.rec.enc_a[k] / D2R, 4)}°, el ${f(R.rec.enc_e[k] / D2R, 4)}°; LOS ${f(lo * 1e6, 3)} µrad`, 'açı farkı ≤ 1 µrad; LOS ≤ 1 µrad', ea <= 1e-6 && ee <= 1e-6 && lo <= 1e-6);
}
if (run('K5')) {
  // kayma ayrışımı (düzenek okları): kaydedilen katkılar ↔ analitik izdüşüm ve aynı tohumla ablasyon farkları
  const play = (mod) => { const P = base(); if (mod) mod(P); return L.playScenario(P, { kind: 'sine', T: 60, stab: true }, null); };
  const noBias = (P) => { P.dut.gyro.bi = 0; P.dut.gyro.bias0 = 0; };
  const A = play(), C = play(noBias), Z = play((P) => { noBias(P); P.wb.earth.delta_deg = 0; });
  const dd = A.metrics.drift, Pd = L.derive(base()), l0 = Pd.los0, Dv = Pd.Delta;
  let yr = [-l0[1], l0[0], 0]; { const n = Math.hypot(yr[0], yr[1]) || 1; yr = yr.map(v => v / n); }
  const zr = [l0[1] * yr[2] - l0[2] * yr[1], l0[2] * yr[0] - l0[0] * yr[2], l0[0] * yr[1] - l0[1] * yr[0]];
  const cr = [Dv[1] * l0[2] - Dv[2] * l0[1], Dv[2] * l0[0] - Dv[0] * l0[2], Dv[0] * l0[1] - Dv[1] * l0[0]];      // l̇ = Δ × l₀
  const eV = cr[0] * zr[0] + cr[1] * zr[1] + cr[2] * zr[2], eH = cr[0] * yr[0] + cr[1] * yr[1] + cr[2] * yr[2];
  const bA = [A.metrics.slopeEl - C.metrics.slopeEl, A.metrics.slopeXel - C.metrics.slopeXel], rA = [Z.metrics.slopeEl, Z.metrics.slopeXel];
  const eErr = Math.max(rel(dd.earthEl, eV), rel(dd.earthXel, eH));
  const bErr = Math.max(Math.abs(dd.biasEl - bA[0]), Math.abs(dd.biasXel - bA[1])), rErr = Math.max(Math.abs(dd.restEl - rA[0]), Math.abs(dd.restXel - rA[1]));
  const u4 = (x) => f(x * 1e6, 4);
  add('K', 'K5', 'Kayma ayrışımı (düzenek okları)', 'tüm mekanizmalar açık, sinüs senaryosu 60 s; kaydedilen katkıların eğimi (10–60 s) ↔ (a) dünya dönüşü artığının analitik izdüşümü (Δ × l₀)·{z_r, y_r}, (b) gyro bias\'ı açık − kapalı koşu farkı, (c) δ = 0 ve bias = 0 koşusunun eğimi (aynı tohum)',
    `(a) ${u4(eV)} / ${u4(eH)}; (b) ${u4(bA[0])} / ${u4(bA[1])}; (c) ${u4(rA[0])} / ${u4(rA[1])} µrad/s (el / xel)`,
    `(a) ${u4(dd.earthEl)} / ${u4(dd.earthXel)}; (b) ${u4(dd.biasEl)} / ${u4(dd.biasXel)}; (c) ${u4(dd.restEl)} / ${u4(dd.restXel)} µrad/s`,
    '(a) ≤ %0,1; (b) ve (c) ≤ 0,005 µrad/s', eErr <= 1e-3 && bErr <= 5e-9 && rErr <= 5e-9);
}

// ============================================================ D — dinamik ve kontrol
if (run('K6')) {
  // görüntü rotasyonu ölçütü: köşe pikseli. Bağımsız hesap: görüntü düzleminde 2B dönme (kesin) ve iğne deliği modelinde
  // nesne uzayı yönünün optik eksen etrafında dönmesi (Rz). Motor: ψ_lim = k_roll·IFOV / atan(r·p/f), r = ½√(Nh² + Nv²)
  const parts = []; let wPix = 0, wObj = 0, wRat = 0, wUser = 0, wE107 = 0;
  const user = { '640x512': 1220.0, '1024x768': 781.25, '1280x1024': 610.0 };       // k_roll / r_px (0,5 IFOV, µrad)
  for (const [Nh, Nv] of [[640, 512], [1024, 768], [1280, 1024]]) {
    const P = full(); const ci = P.wb.channels.findIndex(c => c.name === P.wb.refChannel), ch = P.wb.channels[ci];
    ch.Nh = Nh; ch.Nv = Nv;
    const d = L.derive(P), k = P.wb.k_roll, p = ch.p_um * 1e-6, fo = ch.f_mm * 1e-3, IF = p / fo;
    const v = [Nh / 2 * p, Nv / 2 * p], r = Math.hypot(v[0], v[1]) / p;
    // (a) görüntü düzlemi: ψ_lim(motor) kadar dönmede köşenin yer değiştirmesi (px)
    const psi = d.rot.limC, c2 = Math.cos(psi), s2 = Math.sin(psi), vr = [c2 * v[0] - s2 * v[1], s2 * v[0] + c2 * v[1]];
    const dpx = Math.hypot(vr[0] - v[0], vr[1] - v[1]) / p;
    // (b) nesne uzayı: köşe yönü d = (x, y, f)/|·|, Rz(ψ) ile döner; açısal yer değiştirme / IFOV
    const dn = nrm([v[0], v[1], fo]), dr = mv(Rz(psi), dn), dang = 2 * Math.asin(Math.hypot(dr[0] - dn[0], dr[1] - dn[1], dr[2] - dn[2]) / 2);
    wPix = Math.max(wPix, Math.abs(dpx / k - 1)); wObj = Math.max(wObj, Math.abs(dang / (k * IF) - 1));
    wRat = Math.max(wRat, Math.abs((d.rot.limE / d.rot.limC) / Math.hypot(1, Nv / Nh) - 1));
    wUser = Math.max(wUser, Math.abs(d.rot.limC * 1e6 / user[`${Nh}x${Nv}`] - 1));
    const E107 = L.budgetRows(P).find(q => q.id === 'R-01').E, E107x = P.wb.H.roll_res_mrad * 1e-3 * Math.atan(r * p / fo) * 1e6;
    wE107 = Math.max(wE107, Math.abs(E107 / E107x - 1));
    parts.push(`${Nh}×${Nv}: r = ${f(r, 1)} px, ψ_lim ${f(d.rot.limC * 1e6, 2)} µrad (k/r ${f(k / r * 1e6, 2)}), köşe ${f(dpx, 5)} px, açı ${f(dang / IF, 5)} IFOV, kenar/köşe ${f(d.rot.limE / d.rot.limC, 5)}`);
  }
  add('K', 'K6', 'Görüntü rotasyonu: köşe pikseli ölçütü (v11)', 'MWIR-NFOV optiği (p = 12 µm, f = 300 mm), 640×512 / 1024×768 / 1280×1024: motorun ψ_lim\'i kadar dönmede köşe pikselinin yer değiştirmesi — (a) görüntü düzleminde 2B dönme matrisiyle, (b) nesne uzayında köşe yönünün Rz(ψ) ile dönmesiyle; (c) kenar/köşe oranı √(1 + (Nv/Nh)²); (d) 0,5/r_px kesin değerleri 1220 / 781,25 / 610 µrad; (e) bütçe R-01 = roll artığı × atan(r·p/f)',
    '(a) 0,5 px; (b) 0,5 IFOV; (c) √(1 + (Nv/Nh)²); (d) 1220 / 781,25 / 610 µrad; (e) özdeş', `(a) ${f(wPix * 100, 3)} %, (b) ${f(wObj * 100, 3)} %, (c) ${f(wRat * 100, 3)} %, (d) ${f(wUser * 100, 3)} %, (e) ${f(wE107 * 100, 6)} % en büyük göreli fark`,
    '(a), (b), (d) ≤ %0,1 (dar alanda tan θ ≈ sin θ ≈ θ); (c) ≤ %0,1; (e) ≤ 1·10⁻¹⁰', wPix <= 1e-3 && wObj <= 1e-3 && wRat <= 1e-3 && wUser <= 1e-3 && wE107 <= 1e-10, { detail: parts.join(' · ') });
}
// v13.5: K7 — kolimatör paralaksı (kullanıcı kararı: δ hedef yoluna). Zaman alanında kaydedilen hedef açısı (par_el, par_xel) ↔
// kaydedilen taban duruşu ve hexapod ötelemesinden bağımsız hesap: d = Rz(β)·[t + (R − I)v], v = −L_pg·l_B (stab ON, pivot göz
// bebeğinde), görünür hedef açısı −d·δ/f_c² (el: zr, xel: yr). Ayrıca video wander'ının δ ile değişimi ↔ paralaksın kendi RMS'i.
if (run('K7')) {
  const parts = []; let worst = 0, n = 0;
  for (const [nm, kind, dl] of [['denizaltı deniz profili, δ = 200 µm', 'sub', 200], ['gemi deniz profili, δ = −150 µm', 'ship', -150]]) {
    const P = full(kind); P.wb.coll.delta_um = dl;
    const S = L.seaLabScenario(P, { T: 60, seed: 1701, extra: { rec: { fs: 200, ch: ['par_el', 'par_xel', 'base_r', 'base_p', 'base_y', 'tr_x', 'tr_y', 'tr_z'] } } });
    const R = L.runSim(P, S), rc = R.rec, nR = R.meta.nRec;
    const a0 = P.dut.geom.a0 * D2R, e0 = (P.dut.geom.e0 != null ? P.dut.geom.e0 : P.wb.earth.el) * D2R, al = P.wb.earth.az * D2R;
    const los = [Math.sin(al) * Math.cos(e0), Math.cos(al) * Math.cos(e0), Math.sin(e0)], be = Math.atan2(los[1], los[0]) - a0;
    const yr = nrm([-los[1], los[0], 0]), zr = cross(los, yr), lb = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)];
    const v = lb.map(x => -P.dut.L_pg * x), K = dl * 1e-6 / Math.pow(P.wb.coll.fc_mm * 1e-3, 2), Rb = Rz(be);
    let pk = 0, err = 0;
    for (let i = 0; i < nR; i++) {
      const Rm = mm(Rz(rc.base_y[i]), mm(Ry(rc.base_p[i]), Rx(rc.base_r[i]))), Rv = mv(Rm, v);
      const dB = [rc.tr_x[i] + Rv[0] - v[0], rc.tr_y[i] + Rv[1] - v[1], rc.tr_z[i] + Rv[2] - v[2]], d = mv(Rb, dB);
      const eE = -K * dot(d, zr), eX = -K * dot(d, yr);
      pk = Math.max(pk, Math.hypot(eE, eX)); err = Math.max(err, Math.abs(rc.par_el[i] - eE), Math.abs(rc.par_xel[i] - eX)); n++;
    }
    worst = Math.max(worst, err / Math.max(pk, 1e-15));
    parts.push(`${nm}: tepe ${f(pk * 1e6, 3)} µrad, en büyük fark ${f(err * 1e9, 3)} nrad`);
  }
  add('K', 'K7', 'Kolimatör paralaksı: hedef yolu ↔ bağımsız kinematik (v13.5)', 'iki platform, deniz profili 60 s (tohum 1701), δ = +200 / −150 µm: kaydedilen paralaks açısı ↔ kaydedilen duruş (temel dönüş matrisleri) ve ötelemeden −Rz(β)[t + (R − I)v]·δ/f_c² (yr, zr)',
    'özdeş (float32 kayıt duyarlığında)', `en büyük göreli fark ${f(worst, 2)}; ${n} örnek · ${parts.join(' · ')}`, '≤ 1·10⁻⁵ (kayıt float32)', worst <= 1e-5);
}
function drrRun(P, ax, fq, mech, A) {
  const nper = Math.max(6, Math.round(4 * fq)), ramp = Math.max(1, 1 / fq), core = nper / fq, T = 1 + 2 * ramp + core + 1;
  const S = { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false, hexF: 1500,
    cmd: [{ type: 'sine', axis: ax, A, f: fq, t0: 1, t1: T - 1, ramp }], rec: { fs: 4000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'base_r', 'base_y'] } };
  const R = L.runSim(P, S), t = rec(R), [i0, i1] = idx(t, 1 + ramp + 0.25 / fq, T - 1 - ramp - 0.25 / fq);
  const fin = L.sineFit(t, R.rec[ax === 0 ? 'base_r' : 'base_y'], fq, { i0, i1 }), fo = L.sineFit(t, R.rec[ax === 0 ? 'mech_el' : 'mech_xel'], fq, { i0, i1 });
  return { g: fo.A / fin.A, ph: Math.atan2(-fo.b, fo.a) - Math.atan2(-fin.b, fin.a), R };
}
if (run('D1')) {
  // kapalı döngü DRR: zaman alanı ↔ analitik döngü modeli (doğrusal yapılandırma)
  const P = base(), d = L.derive(P), mech = Object.assign({}, MECH_OFF, { coupling: true, earth: true });
  const freqs = [0.125, 0.5, 1, 2, 3, 5, 8, 12, 20, 40, 60, 100];
  const PnoRes = L.cloneParams(P); PnoRes.dut.ctl.res.on = false;
  const mdl = (Pp, ax, fq) => { const dd = L.derive(Pp); return L.cabs((ax === 0 ? dd.loopEl : dd.loopAz).drr(TAU * fq)); };
  let worst = 0, worstLo = 0; const rows = [];
  for (const [ax, PP, tag] of [[0, P, 'el, rezonans AÇIK'], [0, PnoRes, 'el, rezonans KAPALI'], [2, PnoRes, 'az, rezonans KAPALI']]) {
    const parts = [];
    for (const fq of freqs) {
      const r = drrRun(PP, ax, fq, mech, 0.05 * D2R), m = mdl(PP, ax, fq), dB = 20 * Math.log10(r.g / m);
      if (fq <= 12) worstLo = Math.max(worstLo, Math.abs(dB)); worst = Math.max(worst, Math.abs(dB));
      parts.push(`${fq}: ${f(20 * Math.log10(r.g), 1)}/${f(20 * Math.log10(m), 1)}`);
    }
    rows.push(tag + ' [f Hz: sim/model dB] ' + parts.join(', '));
  }
  add('D', 'D1', 'Kapalı döngü bozucu bastırma (DRR): zaman alanı ↔ analitik model', 'sürtünme, vuruntu, gürültü, dengesizlik kapalı; b,k kuplajı açık; 0,05° sinüs, 4 kHz, 0,125–100 Hz (kesim ≈ 40 Hz); model: ayrık PII + bilineer AG/rezonans + hesap gecikmesi × ZOH + akım ve gyro bantları + mekanik', 'öykünme döngü modeli |DRR(f)|',
    `en büyük fark ≤ 12 Hz: ${f(worstLo, 2)} dB; 20–100 Hz dahil: ${f(worst, 2)} dB (3 yapılandırma × ${freqs.length} frekans)`, '≤ 12 Hz: ±0,1 dB; tümü ±0,25 dB', worstLo <= 0.1 && worst <= 0.25, { detail: rows.join(' · ') });
}
if (run('D6')) {
  // v13.10 (§9 K1): uyarlanır dar bandın frekans kestirim hatası — zaman alanı (S.resF = ton, estErr ile kaydırılır) ↔ analitik
  // loopModel(..., f·(1 + estErr), K sabit). Kuplaj yalnız (D1 düzeni), el ekseni, 0,05° sinüs.
  const mech = Object.assign({}, MECH_OFF, { coupling: true, earth: true }), rows = []; let worst = 0;
  for (const [fq, e] of [[3, 0], [3, 0.05], [3, -0.1], [3, 0.2], [4.1, 0.1]]) {
    const P = full('sub'); P.dut.ctl.res.estErr = e; const d = L.derive(P);
    const nper = Math.max(6, Math.round(4 * fq)), ramp = Math.max(1, 1 / fq), T = 1 + 2 * ramp + nper / fq + 1;
    const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false, hexF: 1500, resF: fq,
      cmd: [{ type: 'sine', axis: 0, A: 0.05 * D2R, f: fq, t0: 1, t1: T - 1, ramp }], rec: { fs: 4000, ch: ['mech_el', 'base_r'] } });
    const t = rec(R), [i0, i1] = idx(t, 1 + ramp + 0.25 / fq, T - 1 - ramp - 0.25 / fq);
    const g = L.sineFit(t, R.rec.mech_el, fq, { i0, i1 }).A / L.sineFit(t, R.rec.base_r, fq, { i0, i1 }).A;
    const m = L.cabs(L.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, fq * (1 + e), d.loopEl.K).drr(TAU * fq));
    const dB = 20 * Math.log10(g / m); worst = Math.max(worst, Math.abs(dB)); rows.push(`${fq} Hz, %${f(100 * e, 0)}: ${f(20 * Math.log10(g), 2)}/${f(20 * Math.log10(m), 2)}`);
  }
  add('D', 'D6', 'Uyarlanır dar bandın frekans kestirim hatası: zaman alanı ↔ analitik (v13.10)', 'ton 3 ve 4,1 Hz; kestirim hatası 0, +%5, −%10, +%20, +%10; benzetimde dar bant f·(1 + e)\'ye ayarlı, analitik loopModel(f·(1 + e), K sabit); yalnız kuplaj, 0,05° sinüs, 4 kHz',
    'analitik DRR', `en büyük fark ${f(worst, 3)} dB · ${rows.join(' · ')} [dB: benzetim/analitik]`, '±0,1 dB', worst <= 0.1);
}
if (run('D2')) {
  // tork bozucusu: dengesizlik × doğrusal ivme → mekanik LOS = U·a·|θ/T_d(f)|
  const P = base(), d = L.derive(P), mech = Object.assign({}, MECH_OFF, { coupling: true, imbalance: true, earth: true });
  const Ue0 = P.dut.imb.rcg_e[0] * 1e-3 * P.dut.imb.me; let worst = 0; const parts = [];
  for (const fq of [1, 3, 8, 15]) {
    const T = 3 + 8 / fq + 4;
    const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false,
      acc: [{ type: 'sine', axis: 2, A: 1.0, f: fq, t0: 0.5, ramp: 1 }], rec: { fs: 2000, ch: ['mech_el'] } });
    const t = rec(R), [i0, i1] = idx(t, T - 2 - 8 / fq, T - 0.5), fo = L.sineFit(t, R.rec.mech_el, fq, { i0, i1 });
    const m = Ue0 * 1.0 * L.cabs(d.loopEl.torque(TAU * fq)), dB = 20 * Math.log10(fo.A / m);
    worst = Math.max(worst, Math.abs(dB)); parts.push(`${fq} Hz: ${f(fo.A * 1e6, 4)}/${f(m * 1e6, 4)} µrad`);
  }
  add('D', 'D2', 'Tork bozucusu yolu (kütle dengesizliği × doğrusal ivme)', 'gimbal merkezinde 1 m/s² düşey sinüs ivme; T = −(U × f)_y = U_x·a; mekanik LOS genliği', 'U_x·a·|θ/T_d(f)| (analitik)', parts.join(' · ') + ` · en büyük fark ${f(worst, 2)} dB`, '±0,5 dB', worst <= 0.5);
}
if (run('D3')) {
  // gyro gürültüsünün kapalı döngü LOS PSD'si: tek taraflı 2·N²·|θ/n(f)|²
  const P = base(), d = L.derive(P), mech = Object.assign({}, MECH_OFF, { coupling: true, gyroNoise: true, earth: true });
  const R = L.runSim(P, { T: 300, fs: 4000, world: 'lab', stab: true, seed: 5, mech, meas: MEAS_OFF, hexActive: false, cooler: false, rec: { fs: 1000, ch: ['mech_el'] } });
  const x = L.detrend(Float64Array.from(R.rec.mech_el.subarray(5000)), 'linear'), w = L.welch(x, 1000, 8192);
  const N = P.dut.gyro.arw * L.DEGPSQH; const bands = [[2, 10], [10, 40], [40, 150]]; const parts = []; let worst = 0;
  for (const [a, b] of bands) {
    let s = 0, m = 0; for (let k = 1; k < w.f.length; k++) if (w.f[k] >= a && w.f[k] < b) { s += w.P[k]; m += 2 * N * N * Math.pow(L.cabs(d.loopEl.gyroN(TAU * w.f[k])), 2); }
    const r = s / m; worst = Math.max(worst, Math.abs(r - 1)); parts.push(`${a}–${b} Hz: ${f(r, 3)}`);
  }
  add('D', 'D3', 'Gyro gürültüsünün döngüden geçişi (B2-05 mekanizması)', '300 s, yalnız ARW açık (2 kHz hızında ayrık beyaz dizi); Welch PSD / analitik 2·N²·|θ/n|² bant oranları', 'oran 1', parts.join(' · '), '±%6 (Welch istatistiği ve 1 kHz kayıt örtüşmesi)', worst <= 0.06);
}
if (run('D4')) {
  // LuGre tam adım güncellemesi ↔ ince adımlı RK4
  const Fc = 1.5818, Fs = 1.74, ws = 0.003, s0 = 1581.8, g = (v) => Fc + (Fs - Fc) * Math.exp(-Math.pow(v / ws, 2));
  const v = (t) => 2e-3 * Math.sin(TAU * 0.5 * t) + 4e-4 * Math.sin(TAU * 3.1 * t);
  const dz = (t, z) => v(t) - s0 * Math.abs(v(t)) * z / g(v(t));
  let z1 = 0, z2 = 0; const dt = 1 / 4000, h = 1e-6; let worst = 0;
  for (let k = 0; k < 4 * 4000; k++) {
    const t = k * dt, vv = v(t + dt / 2);
    if (Math.abs(vv) > 1e-15) { const gg = g(vv), zs = Math.sign(vv) * gg / s0; z1 = zs + (z1 - zs) * Math.exp(-s0 * Math.abs(vv) * dt / gg); }
    for (let j = 0; j < dt / h; j++) { const tt = t + j * h, k1 = dz(tt, z2), k2 = dz(tt + h / 2, z2 + h / 2 * k1), k3 = dz(tt + h / 2, z2 + h / 2 * k2), k4 = dz(tt + h, z2 + h * k3); z2 += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4); }
    worst = Math.max(worst, Math.abs(s0 * (z1 - z2)) / Fc);
  }
  add('D', 'D4', 'LuGre sürtünme durumunun ayrıklaştırılması', 'adım içinde sabit hızla tam çözüm (motorun yöntemi, 4 kHz) ↔ RK4 (1 µs), 0,5 + 3,1 Hz bağıl hız, 4 s', 'aynı sürtünme torku', `en büyük fark ${f(worst * 100, 3)} % F_c`, '≤ %1 F_c', worst <= 0.01);
}

// v13.4: D5 — hexapod dinamiği: Osc2 (f_bw, ζ = 0,7071, 4 kHz FOH) sinüs yanıtı ↔ sürekli Butterworth; zaman alanı benzetiminde
// IMU'nun ölçtüğü iletim τ ↔ analitik; T2.5 duyarlılığının (gerçekleşen ivmeye bölünür) f_bw'den bağımsızlığı (20 ↔ 10 Hz)
if (run('D5')) {
  let wM = 0, wP = 0; const z = 0.7071, dt = 1 / 4000, rows = [];
  for (const fb of [20, 10]) for (const fr of [1, 5, 0.37748 * fb, fb / 2, fb]) {
    const o = new L.Osc2(fb, z, dt), N = Math.round(12 / dt), M0 = Math.round(4 / dt); let ss = 0, sc = 0, s2 = 0, c2 = 0, cs = 0;
    for (let i = 0; i < N; i++) { const t = i * dt, y = o.step(Math.sin(TAU * fr * t)); if (i >= M0) { const a = Math.sin(TAU * fr * t), b = Math.cos(TAU * fr * t); ss += y * a; sc += y * b; s2 += a * a; c2 += b * b; cs += a * b; } }
    const det = s2 * c2 - cs * cs, A = (ss * c2 - sc * cs) / det, B = (sc * s2 - ss * cs) / det, r = fr / fb;
    const mA = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2), pA = -Math.atan2(2 * z * r, 1 - r * r);
    wM = Math.max(wM, Math.abs(Math.hypot(A, B) - mA)); wP = Math.max(wP, Math.abs(Math.atan2(B, A) - pA) * 180 / Math.PI);
  }
  const t25 = {}; let wT = 0;
  for (const fb of [20, 10]) { const P = full('sub'); P.wb.hex.fbw = fb; const ctx = {}; L.runTest('T0.1', P, ctx, null); const r = L.runTest('T2.5', P, ctx, null);
    const row = (r.kv || []).find(([k]) => /iletimi/.test(k)), m = row ? String(row[1]).match(/8 Hz ([\d.]+) ↔ ([\d.]+)/) : null;
    const sens = +(String(r.measured).match(/duyarlılık ([\d.]+)/) || [])[1];
    t25[fb] = { sens, tau: m ? +m[1] : NaN, tauA: m ? +m[2] : NaN, diff: r.fill['B2-03'] };
    if (m) wT = Math.max(wT, Math.abs(+m[1] - +m[2])); }
  const dS = rel(t25[10].sens, t25[20].sens);
  const pass = wM <= 2e-4 && wP <= 0.05 && wT <= 0.002 && dS <= 0.005;
  add('D', 'D5', 'Hexapod dinamiği: Osc2 iletimi ve T2.5 duyarlılığının f_bw\'den bağımsızlığı (v13.4)',
    'Osc2 (f_bw 20 ve 10 Hz, ζ 0,7071, 4 kHz FOH) sinüs yanıtı en küçük kareler ↔ 1/√((1 − r²)² + (2ζr)²) ve faz; T2.5 zaman alanı koşusunda IMU ile ölçülen iletim τ (8 Hz) ↔ analitik; T2.5 duyarlılığı f_bw = 20 ↔ 10 Hz',
    'genlik ve faz analitikle aynı; duyarlılık hexapod bandından bağımsız',
    `genlik farkı ${f(wM, 2)}, faz farkı ${f(wP, 3)}°; τ(8 Hz) f_bw 20: ${f(t25[20].tau, 3)} (analitik ${f(t25[20].tauA, 3)}), f_bw 10: ${f(t25[10].tau, 3)} (${f(t25[10].tauA, 3)}); duyarlılık ${f(t25[20].sens, 3)} ↔ ${f(t25[10].sens, 3)} µrad/(m/s²) (göreli fark %${f(100 * dS, 2)}); işletme düzeyi farkı ${f(t25[20].diff * 1e6, 3)} ↔ ${f(t25[10].diff * 1e6, 3)} µrad`,
    'genlik ≤ 2·10⁻⁴, faz ≤ 0,05°; |τ − τ_analitik| ≤ 0,002; duyarlılık farkı ≤ %0,5', pass);
}

// ============================================================ C — yakınsama
if (run('C1')) {
  const P = base(), mech = Object.assign({}, L.MECH_DEFAULT, { gyroNoise: false, gyroBias: false });
  const res = {};
  for (const fsv of [2000, 4000, 8000]) {
    const S = { T: 50, fs: fsv, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false,
      cmd: [{ type: 'sine', axis: 0, A: 3 * D2R, f: 0.125, t0: 1, t1: 49, ramp: 8 }, { type: 'sine', axis: 2, A: 1 * D2R, f: 1 / 12, t0: 1, t1: 49, ramp: 12 }],
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'base_r'] } };
    const R = L.runSim(P, S), t = rec(R), [i0, i1] = idx(t, 13, 37);
    const fe = L.sineFit(t, R.rec.opt_el, 0.125, { i0, i1 }), de = L.detrend(Float64Array.from(R.rec.opt_el.subarray(i0, i1)), 'linear'), dx = L.detrend(Float64Array.from(R.rec.opt_xel.subarray(i0, i1)), 'linear');
    res[fsv] = { A: fe.A, rE: L.aRms(de), rX: L.aRms(dx) };
  }
  const e2 = Math.max(rel(res[2000].rE, res[8000].rE), rel(res[2000].rX, res[8000].rX)), e4 = Math.max(rel(res[4000].rE, res[8000].rE), rel(res[4000].rX, res[8000].rX));
  add('C', 'C1', 'Örnekleme hızı yakınsaması (laboratuvar, sürtünme dahil)', 'roll 3° @ 0,125 Hz + yaw 1° @ 0,083 Hz; tüm mekanizmalar (gürültü/bias hariç); 2, 4, 8 kHz', '8 kHz çözümü',
    `artık RMS el/xel (µrad): 2 kHz ${f(res[2000].rE * 1e6, 3)}/${f(res[2000].rX * 1e6, 3)}, 4 kHz ${f(res[4000].rE * 1e6, 3)}/${f(res[4000].rX * 1e6, 3)}, 8 kHz ${f(res[8000].rE * 1e6, 3)}/${f(res[8000].rX * 1e6, 3)}`,
    '2 kHz ve 4 kHz, 8 kHz\'den ≤ %3', e2 <= 0.03 && e4 <= 0.03);
}
if (run('C2')) {
  const P = base(); const parts = []; let worst = 0;
  for (const id of ['B1-01', 'B1-07', 'B2-03']) {
    const row = L.OP_ROWS.find(r => r.id === id), v = {};
    for (const fsv of [2000, 8000]) { const R = L.runSim(P, L.rowScenario(P, row, { T: 200, fs: fsv })); v[fsv] = L.losMetrics(R, P, { skip: 20, psd: false }).rms.el; }
    const e = rel(v[2000], v[8000]); worst = Math.max(worst, e); parts.push(`${id}: ${f(v[2000] * 1e6, 3)} / ${f(v[8000] * 1e6, 3)} µrad`);
  }
  add('C', 'C2', 'Örnekleme hızı yakınsaması (işletme ayrıştırması)', 'B1-01 (kuplaj), B1-07 (sürtünme), B2-03 (dengesizlik) satırları 200 s; 2 kHz (kullanılan) ↔ 8 kHz', '8 kHz çözümü', parts.join(' · '), '≤ %3', worst <= 0.03);
}

if (run('C3')) {
  // v13.11 (§11): yapısal modların rezonans yanıtı benzetim adımına göre — optik alt montaj (shaker 1 m/s²) ve gimbal modu (açısal uyarıcı
  // 5 rad/s²) kendi frekanslarında; sürekli zaman beklentisi g·a/(2ζ). Yalnız ilgili mod açık, ölçüm gürültüsü kapalı.
  const rows = []; let w16 = 0, w4 = 0;
  for (const kind of ['opt', 'gim']) for (const fsv of [4000, 16000]) {
    const P = full('sub'), M = P.dut.modes[kind], f0 = M.f;
    const S = { T: 6, fs: fsv, world: 'lab', stab: true, seed: 3501, mech: Object.assign({}, MECH_OFF, kind === 'opt' ? { optMode: true } : { gimMode: true }), meas: MEAS_OFF,
      hexActive: false, cooler: false, rec: { fs: fsv, ch: ['opt_el'] } };
    if (kind === 'opt') S.trans = [{ type: 'sine', axis: 2, A: 1.0 / (TAU * f0) ** 2, f: f0, t0: 0.5, ramp: 0.5 }];
    else S.vib = [{ type: 'sine', axis: 0, A: 5 / (TAU * f0) ** 2, f: f0, t0: 0.5, ramp: 0.5 }];
    const R = L.runSim(P, S), t = rec(R), [i0, i1] = idx(t, 2, 5.8), A = L.sineFit(t, R.rec.opt_el, f0, { i0, i1 }).A;
    const ex = (kind === 'opt' ? M.gAcc * 1.0 : M.gA * 5) / (2 * M.zeta), e = A / ex - 1;
    if (fsv === 16000) w16 = Math.max(w16, Math.abs(e)); else w4 = Math.max(w4, Math.abs(e));
    rows.push(`${kind === 'opt' ? 'optik' : 'gimbal'} ${f0} Hz, ${fsv / 1000} kHz: ${f(A * 1e6, 3)} / ${f(ex * 1e6, 3)} µrad (${f(100 * e, 2)} %)`);
  }
  add('C', 'C3', 'Örnekleme hızı yakınsaması (yapısal modlar, v13.11)', 'optik alt montaj modu (1 m/s² shaker) ve gimbal yapısal modu (5 rad/s² açısal uyarıcı) rezonansta; 4 kHz (kullanılan) ve 16 kHz', 'g·a/(2ζ) (sürekli zaman)',
    rows.join(' · '), '16 kHz ±%0,25; 4 kHz ±%2', w16 <= 0.0025 && w4 <= 0.02,
    { detail: 'Ayrıklaştırma kaybı yaklaşık −0,18·(ω·dt)²: 4 kHz\'de 120 Hz %0,6, 180 Hz %1,4, 400 Hz %7. İşletme düzeyleri benzetimde kalibre edildiği için varsayılan bütçe etkilenmez; mod frekansı 250 Hz\'in üstüne alınırsa benzetim hızı artırılmalıdır.' });
}

// ============================================================ M — ölçüm zinciri, kalibrasyon testleri
if (run('M')) {
  const P = base(), ctx = {};
  const r01 = L.runTest('T0.1', P, ctx), r04 = L.runTest('T0.4', P, ctx), r06 = L.runTest('T0.6', P, ctx), r07 = L.runTest('T0.7', P, ctx), r12 = L.runTest('T1.2', P, ctx), r02 = L.runTest('T0.2', P, ctx);
  const d = L.derive(P), IFt = d.IFOV * (1 + P.dut.optics.scaleErr), n1 = r01.num;
  add('M', 'M1', 'Plaka ölçeği kalibrasyonu (T0.1)', '5×5 ızgara × 3 ziyaret, stab OFF; IFOV ve radyal distorsiyonun geri kazanımı', `IFOV ${f(IFt * 1e6, 4)} µrad, k1 ${P.dut.optics.k1}`,
    `IFOV ${f(n1.IFOVeff * 1e6, 4)} ± ${f(n1.relU * n1.IFOVeff * 1e6, 4)} µrad, k1 ${f(n1.k1, 5)}`, 'IFOV farkı ≤ 3u ve ≤ %0,05; k1 ±%10', Math.abs(n1.IFOVeff - IFt) <= Math.max(3 * n1.relU * n1.IFOVeff, 0) + 1e-12 && rel(n1.IFOVeff, IFt) <= 5e-4 && rel(n1.k1, P.dut.optics.k1) <= 0.1);
  {
    // centroid gürültüsü: soğutucu ve hava kapalı, stab OFF, granit → kareden kareye fark yalnız centroid gürültüsü
    const S = L.labScenario(P, { label: 'M2', T: 125, fs: 2000, stab: false, hexActive: false, cooler: false, meas: { video: true, ac: false, imu: false, air: false, microvib: false, noise: true }, rec: { fs: 100, ch: ['opt_el'] } });
    const R = L.runSim(P, S), V = R.video, el = [], xel = [];
    for (let i = 0; i < V.n; i++) if (V.t[i] > 5 && V.valid[i]) { el.push((V.y[i] - V.y0) * n1.IFOVeff); xel.push((V.x[i] - V.x0) * n1.IFOVeff); }
    const white = (x) => { let q = 0; for (let i = 1; i < x.length; i++) q += (x[i] - x[i - 1]) ** 2; return Math.sqrt(q / (2 * (x.length - 1))); };
    const we = white(el), wx = white(xel), cen = P.wb.chain.centroid_px * n1.IFOVeff, tol = 3 / Math.sqrt(2 * (el.length - 1));
    const n2 = r02.num;
    add('M', 'M2', 'Video ölçüm tabanı: centroid gürültüsü', `stab OFF, granit, soğutucu ve hava kapalı, 120 s (${el.length} kare): σ = √(Σ(Δx)²/2(n−1)); T0.2 tam zincirde ${f(n2.wOffEl * 1e6, 2)} / ${f(n2.wOffXel * 1e6, 2)} µrad (soğutucunun 10/20 Hz'e katlanan tonları ve hava dahil)`,
      `U-01 = ${P.wb.chain.centroid_px} px × IFOV = ${f(cen * 1e6, 3)} µrad`, `el ${f(we * 1e6, 3)}, xel ${f(wx * 1e6, 3)} µrad`, `±${f(tol * 100, 1)} % (3σ)`, [we, wx].every(v => Math.abs(v / cen - 1) <= tol));
  }
  const n4 = r04.num;
  add('M', 'M3', 'Senkronizasyon gecikmesi (T0.4)', '10 yarım-sinüs darbe, stab OFF; video − IMU gecikmesi', `senkron kayması − IMU grup gecikmesi = ${f(n4.model * 1e3, 4)} ms`, `${f(n4.m * 1e3, 4)} ± ${f(n4.se * 1e3, 4)} ms`, '≤ 3σ veya ≤ 0,02 ms', Math.abs(n4.m - n4.model) <= Math.max(3 * n4.se, 2e-5));
  const n6 = r06.num, G = P.dut.gyro;
  // v13.11 (§11): tek tohumla BI ±%15 ölçütü şansa bağlıydı (taban/0,664 kestiricisi 4 sa kayıtta tohumlar arasında ±%27 dağılır ve
  // ortalamada %19 düşük kalır). Şimdi 40 tohumun dağılımı bağımsız Monte Carlo referansıyla karşılaştırılır: probe/k13/gyro_ref.py
  // (numpy, kendi RNG'si, aynı model ve kestirici; 200 gerçekleşme): BI ortalama 0,03388, sd 0,00905; ARW ortalama 0,004215, sd 0,000022.
  const REF = { bi: 0.03388, biSd: 0.00905, nRef: 200, arw: 0.004215, arwSd: 0.000022 }, NS = 40, A6 = [], B6 = [];
  for (let s = 0; s < NS; s++) { const Q = base(); Q.ana.seedOffset = s; const r = L.runTest('T0.6', Q, {}); A6.push(r.num.arw); B6.push(r.num.bi); }
  const mA = A6.reduce((x, y) => x + y, 0) / NS, mB = B6.reduce((x, y) => x + y, 0) / NS, sB = Math.sqrt(B6.reduce((x, y) => x + (y - mB) ** 2, 0) / (NS - 1));
  const tolB = 3 * REF.biSd * Math.sqrt(1 / NS + 1 / REF.nRef), tolA = 3 * REF.arwSd * Math.sqrt(1 / NS + 1 / REF.nRef) + 1e-6;
  add('M', 'M4', 'Gyro Allan karakterizasyonu (T0.6): kestiricinin dağılımı (v13.11)', `4 sa, 100 Hz ham gyro; ARW (τ ≈ 1 s) ve bias kararsızlığı (taban/0,664); ${NS} tohum ↔ bağımsız Monte Carlo (k13/gyro_ref.py, ${REF.nRef} gerçekleşme)`,
    `model ARW ${G.arw} °/√h, BI ${G.bi} °/h; kestirici ortalaması (bağımsız MC) ARW ${f(REF.arw, 5)}, BI ${f(REF.bi, 4)} (sd ${f(REF.biSd, 4)})`,
    `${NS} tohum: ARW ${f(mA, 5)}, BI ${f(mB, 4)} (sd ${f(sB, 4)}); tek tohum (varsayılan) ARW ${f(n6.arw, 5)}, BI ${f(n6.bi, 4)}`,
    `ortalamalar 3σ içinde (BI ±${f(tolB, 4)}, ARW ±${f(tolA * 1e6, 1)}·10⁻⁶); tek tohum ARW ±%5`, Math.abs(mB - REF.bi) <= tolB && Math.abs(mA - REF.arw) <= tolA && rel(n6.arw, G.arw) <= 0.05,
    { detail: `BI kestiricisi modelin %${f(100 * (REF.bi / G.bi - 1), 0)}'i kadar düşük ortalamaya ve ±%${f(100 * REF.biSd / REF.bi, 0)} dağılıma sahiptir: kısa kayıtta yavaş Gauss–Markov bileşenleri tabanda görünmez ve en küçük değer seçimi aşağı çeker (IEEE Std 952-1997, Ek C).` });
  const n7 = r07.num;
  add('M', 'M5', 'Dünya dönüşü sağlaması (T0.7)', 'kompanzasyon KAPALI 120 s / AÇIK 900 s, tüm mekanizmalar ve ölçüm zinciri açık', `KAPALI ${f(n7.calcH * 1e6, 2)} / ${f(n7.calcV * 1e6, 2)} µrad/s; AÇIK ≤ ${f(n7.limOn * 1e6, 2)}`,
    `KAPALI ${f(Math.abs(n7.offH) * 1e6, 2)} / ${f(Math.abs(n7.offV) * 1e6, 2)}; AÇIK ${f(Math.abs(n7.onH) * 1e6, 3)} / ${f(Math.abs(n7.onV) * 1e6, 3)} µrad/s`, 'KAPALI ±%1 (gyro bias payı); AÇIK sınır altında',
    rel(Math.abs(n7.offH), n7.calcH) <= 0.01 && rel(Math.abs(n7.offV), n7.calcV) <= 0.01 && Math.abs(n7.onH) <= n7.limOn && Math.abs(n7.onV) <= n7.limOn);
  add('M', 'M6', 'Stab OFF kazancı (T1.2): ölçek, işaret ve eksen eşlemesi', 'roll ve yaw, 0,05–1 Hz, video (kalibre IFOV) / IMU', 'kazanç 1', `en büyük |kazanç − 1| = ${f(r12.num.worst * 100, 3)} %`, '≤ %0,5', r12.num.worst <= 0.005);
}

if (run('M7')) {
  // taban düzeltmesi doğrulaması (v13.5: üç kip, iki masa düzeyi — ayırt edici): aynı tohumla masa mikro-titreşimi AÇIK ve KAPALI
  // deniz profili koşuları. Doğru düzeltme sessiz masa koşusunun wander'ını geri vermelidir: σ_DUT ≈ σ_kapalı. Kipler: kapalı (s = 0),
  // zincir (s = yalıtılmış koşunun video payı, tableShare), tam (s = masa mikro-titreşimi). Varsayılan kip (kullanıcı kararı: kapalı)
  // en küçük hatayı vermeli. Örnek DUT'ta masa titreşimi sürtünmeyi titreştirir (dither): σ_açık < σ_kapalı olabilir.
  const T = 380, base = full(), def = base.wb.hex.mvCorr, run1 = (P, on) => {
    const S = L.seaLabScenario(P, { T, seed: 1313, extra: { meas: { video: true, ac: true, imu: true, air: true, microvib: on, noise: true } } });
    return L.profileMetrics(P, L.runSim(P, S), {}, 20).wander.el; };
  const off = run1(full(), false), lv = [], parts = []; let pass = true;
  for (const mv of [2, 10]) {
    const P = full(); P.wb.hex.microvib = mv;
    const on = run1(P, true), sv = L.tableShare(P).on.vid.el, mv0 = mv * 1e-6;
    const c = { 'kapalı': on, zincir: Math.sqrt(Math.max(0, on * on - sv * sv)), tam: Math.sqrt(Math.max(0, on * on - mv0 * mv0)) };
    const e = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.abs(v - off)])), best = Object.keys(e).reduce((a, b) => (e[b] < e[a] ? b : a));
    const okL = best === def && e[def] <= Math.max(5e-8, 0.01 * off);
    pass = pass && okL; lv.push({ mv, on, sv, c, e, best });
    parts.push(`${mv} µrad masa: σ_açık ${f(on * 1e6, 3)} (s_zincir ${f(sv * 1e6, 3)}) → hata kapalı ${f(e['kapalı'] * 1e6, 3)}, zincir ${f(e.zincir * 1e6, 3)}, tam ${f(e.tam * 1e6, 3)} µrad; en iyi ${best}`);
  }
  add('M', 'M7', 'Taban düzeltmesi: üç kipin masa titreşimini düşmesi (v11; v13.5 ayırt edici)', `deniz profili ${T} s, stab ON, aynı tohum; masa mikro-titreşimi KAPALI ve AÇIK (2 ve 10 µrad); video wander el. Kipler: kapalı (s = 0), zincir (s = yalıtılmış koşunun video payı), tam (s = masa düzeyi)`,
    `σ_DUT ≈ σ_kapalı = ${f(off * 1e6, 3)} µrad; en küçük hata varsayılan kipte (${def})`, parts.join(' · '),
    `her iki düzeyde en küçük hata varsayılan kipte ve ≤ max(0,05 µrad, %1·σ_kapalı)`, pass);
}

if (run('M8')) {
  // v13.6: T0.1 sub-piksel taraması (16 × 1/16 px) S-eğrisini geri kazanır. Beklenen etkin genlik a·exp(−2π²σ²): a = √2·pixlock (model),
  // σ = tarama beklemelerinde kareler arası gerçek LOS titreşimi (benzetim gerçeği). Hedef noktasında kazanç 1 + 2π·a_etkin·cos 2πφ.
  const parts = []; let pass = true;
  for (const [nm, mod] of [['varsayılan', null], ['pixlock 0,05 px', (P) => { P.wb.chain.pixlock_px = 0.05; }], ['pixlock 0', (P) => { P.wb.chain.pixlock_px = 0; }]]) {
    const P = full(); if (mod) mod(P);
    const q = L.runTest('T0.1', P, {}).num.pix, a = Math.SQRT2 * P.wb.chain.pixlock_px, aE = a * Math.exp(-2 * Math.PI * Math.PI * q.sigJ * q.sigJ);
    const fr = (x) => ((x % 1) + 1) % 1, gx = 1 + TAU * aE * Math.cos(TAU * fr(P.dut.video.x0)), gy = 1 + TAU * aE * Math.cos(TAU * fr(P.dut.video.y0));
    const okA = Math.abs(q.amp - aE) <= 3 * q.uAmp, okG = Math.abs(q.gX - gx) <= 3 * q.uG && Math.abs(q.gY - gy) <= 3 * q.uG;
    pass = pass && okA && okG;
    parts.push(`${nm}: genlik ${f(q.amp, 4)} ± ${f(q.uAmp, 4)} (beklenen ${f(aE, 4)}, σ ${f(q.sigJ, 3)} px); kazanç ${f(q.gX, 3)} / ${f(q.gY, 3)} ± ${f(q.uG, 3)} (beklenen ${f(gx, 3)} / ${f(gy, 3)})`);
  }
  add('M', 'M8', 'Piksel fazı S-eğrisi kalibrasyonu (T0.1 sub-piksel taraması)', 'stab OFF, merkezde 16 adım × 1/16 px (iki eksen birlikte), bit-ters sırayla gidiş + dönüş, 5 s bekleme; doğrusal model artığına A·sin 2πφ + B·cos 2πφ + eksen sabiti + eksen zaman trendi uydurması; üç durum (varsayılan, pixlock 0,05 px, pixlock 0)',
    'genlik a·exp(−2π²σ²), a = √2·pixlock; kazanç 1 + 2π·a_etkin·cos 2πφ (hedef noktası x0, y0)', parts.join(' · '), 'genlik ve kazanç ≤ 3u (k = 1 kestirim belirsizliği); pixlock 0 durumunda genlik ≤ 3u', pass,
    { detail: 'Izgara noktaları kullanılmaz: fazları konuma bağlıdır (adım 254,9 px; distorsiyon fazı konumla birlikte kaydırır, 25 noktada eksen başına 13 farklı değer) ve ölçek + k1 modeli S-eğrisinin o noktalardaki değerinin bir kısmını soğurur (ızgarayla uydurulan genlik 0,0246 px, beklenen etkin 0,0268; ızgara + tarama birlikte 0,0241). Kestirim, bekleme sırasındaki titreşimle sönmüş etkin genliktir; hedef sabitken (T1.9) aynı mertebede titreşim olduğundan kazanç bu genlikle hesaplanır.' });
}
if (run('M9')) {
  // v13.6: piksel fazının zaman alanı davranışı. x_m = x + a·sin 2πx, x = x̄ + A·sin ωt: temel bileşenin kazancı 1 + 2πa·cos(2πx̄)·2J1(2πA)/(2πA),
  // ortalama sapma a·J0(2πA)·sin(2πx̄) (Jacobi–Anger). Küçük harekette çarpımsal, A ≥ 0,5 px'te söner (toplanır U-06 yaklaşımı).
  const J = (n, x) => { const N = 4000, hh = Math.PI / N; let sm = 0; for (let i = 0; i <= N; i++) { const t = i * hh, w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2); sm += w * Math.cos(n * t - x * Math.sin(t)); } return sm * hh / 3 / Math.PI; };
  const rows = []; let worstG = 0, worstB = 0;
  for (const ph of [0, 0.25, 0.5]) for (const Apx of [0.1, 0.5, 1.0]) {
    const P = full(); P.wb.chain.centroid_px = 0; P.dut.video.x0 = ph; P.dut.video.y0 = ph;
    const d = L.derive(P), IFt = d.IFOV * (1 + P.dut.optics.scaleErr), fr0 = 0.2, fy = 0.31, T = 64;
    const S = L.labScenario(P, { label: 'M9', T, fs: 2000, stab: false, cooler: false, seed: 19,
      meas: { video: true, ac: false, imu: false, air: false, microvib: false, noise: true },
      cmd: [{ type: 'sine', axis: 0, A: Apx * IFt, f: fr0, t0: 1, t1: T - 1, ramp: 2 }, { type: 'sine', axis: 2, A: Apx * IFt, f: fy, t0: 1, t1: T - 1, ramp: 2 }],
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel'] } });
    const R = L.runSim(P, S), v = L.videoAngles(R, { IFOVcal: IFt });
    const i0 = v.t.findIndex(t => t > 4), i1 = v.t.findIndex(t => t > T - 4), tR = rec(R), [j0, j1] = idx(tR, 4, T - 4);
    const a = Math.SQRT2 * P.wb.chain.pixlock_px, fr = (x) => ((x % 1) + 1) % 1;
    for (const [vy, oy, fq, x0] of [[v.el, R.rec.opt_el, fr0, P.dut.video.y0], [v.xel, R.rec.opt_xel, fy, P.dut.video.x0]]) {
      const sv = L.sineFit(v.t, vy, fq, { i0, i1 }), so = L.sineFit(tR, oy, fq, { i0: j0, i1: j1 });
      const A = so.A / IFt, xb = fr(x0 + so.c0 / IFt), z = TAU * A;
      const gExp = 1 + TAU * a * Math.cos(TAU * xb) * 2 * J(1, z) / z, bExp = a * J(0, z) * Math.sin(TAU * xb);
      const g = sv.A / so.A, b = (sv.c0 - so.c0) / IFt;
      worstG = Math.max(worstG, Math.abs(g - gExp)); worstB = Math.max(worstB, Math.abs(b - bExp));
      rows.push({ ph, Apx: A, g, gExp, b, bExp });
    }
  }
  const sel = rows.filter((r, i) => i % 2 === 0).map(r => `φ ${r.ph}, A ${f(r.Apx, 2)} px: ${f(r.g, 4)} / ${f(r.gExp, 4)}`);
  add('M', 'M9', 'Piksel fazı: küçük hareket kazancı ve sapma, zaman alanı ↔ Bessel', 'stab OFF, centroid gürültüsü ve hava kapalı; hedef fazı φ ∈ {0; 0,25; 0,5}, sinüs genliği A ∈ {0,1; 0,5; 1} px (el 0,2 Hz, xel 0,31 Hz), 64 s; video ↔ gerçek optik LOS sinüs uydurması',
    'kazanç 1 + 2πa·cos 2πφ·2J1(2πA)/(2πA), sapma a·J0(2πA)·sin 2πφ (a = √2·pixlock = 0,0283 px)', `kazanç (ölçülen / beklenen, el): ${sel.join(' · ')}; en büyük fark kazanç ${f(worstG, 5)}, sapma ${f(worstB, 5)} px`,
    'kazanç ±0,002; sapma ±0,0005 px', worstG <= 0.002 && worstB <= 5e-4,
    { detail: 'Küçük harekette (A = 0,1 px) piksel fazı hatası çarpımsaldır: φ = 0\'da kazanç 1,17, φ = 0,5\'te 0,83. A = 0,5 px\'te sapma %18\'e iner (2J1(π)/π = 0,181), 1 px\'te işaret değiştirir ve %7\'de kalır: hedef ≥ 0,5 px gezindiğinde faz ortalanır, hata toplanır U-06 (a/√2) olarak kalır. Hedefi sabit tutan ölçümlerde (T1.9 takip, T0.2 durağan koşu) çarpımsal biçim geçerlidir.' });
}

if (run('M10')) {
  // v13.7 (kullanıcı kararı K4): IMU ve otokolimatör gürültüsü yoğunluk olarak (µrad/√Hz). Hareketsiz masa, yalnız ölçüm gürültüsü:
  // IMU kaydının RMS'i = yoğunluk × √(ayrık süzgecin eşdeğer gürültü bant genişliği, benzetim fs'inde sayısal integral); 1–50 Hz yoğunluğu
  // = imu_asd (süzgeç geçirme bandı); otokolimatör: RMS = ac_asd·√(1000/2), 1–450 Hz yoğunluğu = ac_asd.
  const parts = []; let worst = 0;
  for (const [bw, fs] of [[500, 2000], [500, 4000], [100, 2000]]) {
    const P = full(); P.wb.chain.imu_bw = bw;
    const S = L.labScenario(P, { label: 'M10', T: 125, fs, stab: false, hexActive: false, cooler: false, seed: 5,
      meas: { video: false, ac: true, imu: true, air: false, microvib: false, noise: true }, rec: { fs: 1000, ch: ['imu_r', 'imu_y', 'ac_el', 'mech_el'] } });
    const R = L.runSim(P, S), n0 = 5000;
    const ri = L.detrend(Float64Array.from(R.rec.imu_r.subarray(n0)), 'linear'), ry = L.detrend(Float64Array.from(R.rec.imu_y.subarray(n0)), 'linear');
    const ac = L.detrend(Float64Array.from(R.rec.ac_el.subarray(n0), (x, i) => x - R.rec.mech_el[n0 + i]), 'linear');
    // ayrık biquad'ın (RBJ, Q = 1/√2) gürültü bant genişliği: |H(e^jω)|² sayısal integral (motorun Biquad'ı yerine katsayılar burada yeniden)
    const w0 = TAU * bw / fs, cw = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2), a0 = 1 + al, b = [(1 - cw) / 2 / a0, (1 - cw) / a0, (1 - cw) / 2 / a0], a = [-2 * cw / a0, (1 - al) / a0];
    let enbw = 0; const NI = 200000;
    for (let i = 0; i < NI; i++) { const f = (i + 0.5) / NI * fs / 2, w = TAU * f / fs;
      const nr = b[0] + b[1] * Math.cos(w) + b[2] * Math.cos(2 * w), ni = -(b[1] * Math.sin(w) + b[2] * Math.sin(2 * w));
      const dr = 1 + a[0] * Math.cos(w) + a[1] * Math.cos(2 * w), di = -(a[0] * Math.sin(w) + a[1] * Math.sin(2 * w));
      enbw += (nr * nr + ni * ni) / (dr * dr + di * di) * fs / 2 / NI; }
    const ch = P.wb.chain, eI = ch.imu_asd * 1e-6 * Math.sqrt(enbw), eA = ch.ac_asd * 1e-6 * Math.sqrt(500);
    const pI = L.welch(ri, 1000, 4096), pA = L.welch(ac, 1000, 4096);
    const lvl = (p, f0, f1) => { let q = 0, c = 0; for (let i = 0; i < p.f.length; i++) if (p.f[i] >= f0 && p.f[i] <= f1) { q += p.P[i]; c++; } return Math.sqrt(q / c); };
    const e = [Math.abs(L.aRms(ri) / eI - 1), Math.abs(L.aRms(ry) / eI - 1), Math.abs(lvl(pI, 1, 50) / (ch.imu_asd * 1e-6) - 1), Math.abs(L.aRms(ac) / eA - 1), Math.abs(lvl(pA, 1, 450) / (ch.ac_asd * 1e-6) - 1)];
    worst = Math.max(worst, ...e);
    parts.push(`f_IMU ${bw} Hz, fs ${fs}: IMU RMS ${f(L.aRms(ri) * 1e6, 4)} / ${f(eI * 1e6, 4)} µrad (ENBW ${f(enbw, 1)} Hz), yoğunluk 1–50 Hz ${f(lvl(pI, 1, 50) * 1e6, 5)}; otokolimatör RMS ${f(L.aRms(ac) * 1e6, 4)} / ${f(eA * 1e6, 4)}`);
  }
  add('M', 'M10', 'IMU ve otokolimatör gürültü yoğunluğu (v13.7)', 'hareketsiz masa, yalnız ölçüm gürültüsü, 120 s; f_IMU 500 Hz (fs 2 ve 4 kHz) ve 100 Hz; IMU gürültüsü süzgeçten geçer, otokolimatör kayıt bandında beyaz; Welch 4096',
    'IMU RMS = imu_asd·√ENBW (ayrık süzgeç, sayısal integral), yoğunluk = imu_asd; otokolimatör RMS = ac_asd·√500, yoğunluk = ac_asd (0,0224 µrad/√Hz)', parts.join(' · '), 'RMS ±%3, yoğunluk ±%5 (120 s kayıt istatistiği)', worst <= 0.05 && parts.length === 3,
    { detail: 'Bütçe U-04, analog ikinci derece Butterworth\'ün ENBW\'sini kullanır (1,111·f_IMU = 555 Hz → 0,528 µrad): ayrık benzetimde ENBW fs 2 kHz\'te 500, 4 kHz\'te 529 Hz olduğundan kayıttaki IMU gürültüsü 0,501–0,515 µrad çıkar; bütçe en çok %5 temkinlidir. Kayıt 1 kHz\'e seyreltilirken süzgecin 500 Hz üstündeki kuyruğu banda katlanır (fs 4 kHz\'te 1–50 Hz yoğunluğu %2 yüksek).' });
}

// ============================================================ V — rüzgâr kaynaklı girdap kopması (gemi direği)
if (run('V1')) {
  // EN 1991-1-4 yaklaşım 1: yayımlanmış sayısal örnek (Rakočević & Popović 2018, Građevinar 70(9), Tablo 3)
  const ex = [{ n: 1.095, v: 3.29, Sc: 13.98, K: 0.131, Kw: 0.245, Re: 118477, y: 26.8, cl: 0.700 }, { n: 3.821, v: 11.47, Sc: 18.93, K: 0.184, Kw: 0.463, Re: 413491, y: 28.9, cl: 0.386 },
              { n: 3.821, v: 19.03, Sc: 6.89, K: 0.184, Kw: 0.463, Re: 1136788, y: 68.3, cl: 0.200 }];
  let worst = 0, worstC = 0; const parts = [];
  for (const e of ex) {
    const b = 0.18 * e.v / e.n, c = L.clat0Circ(e.Re), y = b * e.K * e.Kw * c / (0.18 * 0.18 * e.Sc) * 1e3;
    worst = Math.max(worst, rel(y, e.y)); worstC = Math.max(worstC, Math.abs(c - e.cl)); parts.push(`${f(y, 2)}/${e.y} mm (c_lat ${f(c, 3)}/${e.cl})`);
  }
  add('V', 'V1', 'Yaklaşım 1 (E.7) ve c_lat,0(Re): yayımlanmış örnek', '37,9 m aydınlatma direği, üç durum: b = St·v_crit/n, c_lat motorun Şekil E.2 eğrisinden (Re = 1,2·10⁵ / 4,1·10⁵ / 1,1·10⁶), y_F = b·K·K_W·c_lat/(St²·Sc); makalenin Sc, K, K_W değerleriyle',
    'Rakočević ve Popović (2018): 26,8 / 28,9 / 68,3 mm; c_lat 0,700 / 0,386 / 0,200', parts.join(' · '), 'y ±%0,5 (girdilerin yuvarlaması); c_lat ±0,001', worst <= 0.005 && worstC <= 0.001);
}
if (run('V2')) {
  // mod biçimi katsayıları: Φ = (z/l)² için K_W kapalı biçimi ve K
  let worst = 0; const N = 200000;
  for (const x of [0.05, 0.3, 0.75, 1]) {   // x = L_j / l
    let a = 0, b = 0; for (let i = 0; i < N; i++) { const z = (i + 0.5) / N, p = z * z; b += p / N; if (z >= 1 - x) a += p / N; }
    worst = Math.max(worst, Math.abs(a / b - 3 * x * (1 - x + x * x / 3)));
  }
  let s1 = 0, s2 = 0; for (let i = 0; i < N; i++) { const z = (i + 0.5) / N, p = z * z; s1 += p / N; s2 += p * p / N; }
  const K = s1 / (4 * Math.PI * s2);
  add('V', 'V2', 'Mod biçimi katsayıları (konsol, Φ = (z/l)²)', 'K_W = ∫_{L_j}Φ / ∫_l Φ sayısal integral (2·10⁵ nokta) ↔ kapalı biçim 3x(1 − x + x²/3), x = L_j/l ∈ {0,05; 0,3; 0,75; 1}; K = ∫Φ / (4π∫Φ²)', 'K_W kapalı biçimi; K ≈ 0,13 (Tablo E.5 konsol)',
    `K_W en büyük fark ${f(worst, 2)}; K = ${f(K, 4)}`, 'K_W ≤ 1·10⁻⁸; K 0,13 ± 0,005', worst <= 1e-8 && Math.abs(K - 0.13) <= 0.005);
}
if (run('V3')) {
  // direk tepesi eğim oranı κ: düzgün konsol 1. özmodu (Euler–Bernoulli) ve tepe kütlesi baskın sınır (statik uç yükü)
  let lo = 1.8, hi = 1.95; const ch = (x) => Math.cos(x) * Math.cosh(x) + 1;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (ch(lo) * ch(m) <= 0) hi = m; else lo = m; }
  const bL = (lo + hi) / 2, sg = (Math.cosh(bL) + Math.cos(bL)) / (Math.sinh(bL) + Math.sin(bL));
  const phi = Math.cosh(bL) - Math.cos(bL) - sg * (Math.sinh(bL) - Math.sin(bL)), dphi = bL * (Math.sinh(bL) + Math.sin(bL) - sg * (Math.cosh(bL) - Math.cos(bL)));
  const k1 = dphi / phi, kDef = base().wb.wviv.kth;
  add('V', 'V3', 'Direk tepesi eğim oranı κ = θ·l/y', 'düzgün konsol: cos βl·cosh βl = −1 (ikiye bölme), φ\'(l)·l/φ(l); tepe kütlesi baskın sınır: statik uç yükü biçimi (3ξ² − ξ³)/2 → 1,5; varsayılan κ bu iki sınır arasında olmalı',
    'βl = 1,8751; κ = 1,3765 (düzgün) … 1,5 (tepe kütlesi)', `βl = ${f(bL, 5)}; κ = ${f(k1, 4)}; varsayılan κ = ${kDef}`, 'βl ±1·10⁻⁴; 1,37 ≤ κ_varsayılan ≤ 1,5', Math.abs(bL - 1.87510407) <= 1e-4 && Math.abs(k1 - 1.3765) <= 1e-3 && kDef >= 1.37 && kDef <= 1.5);
}
if (run('V4')) {
  // işletme benzetiminde rüzgâr VIV'i: açı ve öteleme ivmesinin aynı moddan, aynı fazda ve rüzgâr yönüne göre dağılımı
  const P = L.compatV10(L.defaultParams('ship')); P.wb.wviv.beta = 30;
  const VS = L.vivSpec(P), src = Object.fromEntries(L.SRC_IDS.map(k => [k, k === 'viv']));
  const S = L.opScenario(P, { T: 80, seed: 5, src, mech: { coupling: true, earth: true }, fs: 2000, ch: ['cmd_r', 'cmd_p', 'acc_y'] });
  const R = L.runSim(P, S), i0 = 20000, n = R.meta.nRec, fr = R.meta.fRec;
  const rms = (c) => { let s = 0; for (let i = i0; i < n; i++) s += R.rec[c][i] ** 2; return Math.sqrt(s / (n - i0)); };
  let sxy = 0; for (let i = i0; i < n; i++) sxy += R.rec.cmd_r[i] * R.rec.acc_y[i];
  const corr = sxy / (n - i0) / (rms('cmd_r') * rms('acc_y'));
  // (a) üretilen ızgara dizileri: ü, u'nun ikinci türevi mi (ızgarada merkezi fark; (ωh)²/12 ≈ %0,2 sapma beklenir);
  // (b) ölçekler: a_y/roll = (t_y·y)/(roll·A) = −l/κ; (c) benzetimde kaydedilen a_y/roll RMS oranı ızgaradaki oranla aynı
  const W = P.wb.wviv, cR = S.cmd.find(c => c.axis === 0), cA = S.acc.find(c => c.axis === 1), u = cR.data, ud = cA.data, hs = cR.fs;
  let se = 0, sa = 0; const g0 = Math.round(20 * hs), g1 = Math.round(80 * hs);
  for (let i = g0; i < g1; i++) { const dd = (u[i + 1] - 2 * u[i] + u[i - 1]) * hs * hs, e = ud[i] - dd; se += e * e; sa += ud[i] * ud[i]; }
  const eGrid = Math.sqrt(se / sa), scl = (cA.scale / cR.scale) / (-W.L / W.kth);
  let su = 0, sd = 0; for (let i = g0; i < g1; i++) { su += u[i] * u[i]; sd += ud[i] * ud[i]; }
  const ratioGrid = Math.abs(cA.scale / cR.scale) * Math.sqrt(sd / su), ratioSim = rms('acc_y') / rms('cmd_r');
  const b = 30 * D2R, rRP = rms('cmd_r') / rms('cmd_p'), exRP = Math.cos(b) / Math.sin(b);
  add('V', 'V4', 'İşletmede rüzgâr VIV eşlemesi (açı ↔ öteleme)', 'gemi varsayılanı, β = 30°, yalnız VIV kaynağı, 80 s: (a) üretilen ivme dizisi açı dizisinin ikinci türevi mi (ızgarada merkezi fark), (b) ölçek oranı −l/κ, (c) benzetimde a_y/roll RMS oranı ızgaradakiyle aynı mı, (d) roll/pitch = cot β, (e) roll–a_y korelasyonu (tepe +y·n\'e giderken direk o yana yatar)',
    `(a) özdeş, (b) 1, (c) aynı, (d) ${f(exRP, 4)}, (e) +1`, `(a) göreli fark ${f(eGrid * 100, 3)} %, (b) ${f(scl, 9)}, (c) ${f(ratioSim, 2)} / ${f(ratioGrid, 2)} m/s²/rad, (d) ${f(rRP, 6)}, (e) ${f(corr, 5)}`,
    '(a) ≤ %0,5; (b) ±1·10⁻⁹; (c) ±%0,3 (ara değer); (d) ±1·10⁻⁶; (e) > 0,999',
    eGrid <= 0.005 && Math.abs(scl - 1) <= 1e-9 && rel(ratioSim, ratioGrid) <= 0.003 && rel(rRP, exRP) <= 1e-6 && corr > 0.999);
}
if (run('V5')) {
  // laboratuvar öteleme kanalı: hexapod yatay ötelemesi → kütle dengesizliği torku → mekanik LOS (LOS iskele yönünde,
  // öteleme LOS boyunca: T = −U_z·a_y)
  const P = L.compatV10(L.defaultParams('ship')), d = L.derive(P), mech = Object.assign({}, MECH_OFF, { coupling: true, imbalance: true, earth: true });
  const Uz = P.dut.imb.rcg_e[2] * 1e-3 * P.dut.imb.me; let worst = 0; const parts = [];
  for (const fq of [2, 4.1, 8]) {
    const T = 3 + 8 / fq + 4, yA = 1.0 / Math.pow(TAU * fq, 2);      // 1 m/s² ivme genliği
    const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false,
      trans: [{ type: 'sine', axis: 1, A: yA, f: fq, t0: 0.5, ramp: 1 }], rec: { fs: 2000, ch: ['mech_el'] } });
    const t = rec(R), [i0, i1] = idx(t, T - 2 - 8 / fq, T - 0.5), fo = L.sineFit(t, R.rec.mech_el, fq, { i0, i1 });
    const m = Uz * 1.0 * L.cabs(d.loopEl.torque(TAU * fq)), dB = 20 * Math.log10(fo.A / m);
    worst = Math.max(worst, Math.abs(dB)); parts.push(`${fq} Hz: ${f(fo.A * 1e6, 4)}/${f(m * 1e6, 4)} µrad`);
  }
  add('V', 'V5', 'Laboratuvar öteleme kanalı → dengesizlik torku → LOS', 'hexapod y ötelemesi (1 m/s² genlik, LOS iskele yönünde → LOS boyunca), yalnız kuplaj + dengesizlik; mekanik LOS genliği (T2.2 gemi dwell\'inin öteleme yolu)', 'U_z·a·|θ/T_d(f)| (analitik)', parts.join(' · ') + ` · en büyük fark ${f(worst, 2)} dB`, '±0,5 dB', worst <= 0.5);
}
if (run('V7')) {
  // v13.3: denizaltı mast başı ötelemesi — işletmede VIV açı ↔ öteleme eşlemesi (V4'ün denizaltı karşılığı): açı roll −θ,
  // öteleme ivmesi y yönünde, aynı moddan ve aynı fazda; ölçek a_y/roll = −L/κ; B2-01 satırında dengesizlik + optik montaj açık
  const P = L.defaultParams('sub'), VS = L.vivSpec(P), src = Object.fromEntries(L.SRC_IDS.map(k => [k, k === 'viv']));
  const S = L.opScenario(P, { T: 80, seed: 5, src, mech: { coupling: true, earth: true }, fs: 2000, ch: ['cmd_r', 'cmd_p', 'acc_y', 'acc_x'] });
  const R = L.runSim(P, S), i0 = 20000, n = R.meta.nRec;
  const rms = (c) => { let q = 0; for (let i = i0; i < n; i++) q += R.rec[c][i] ** 2; return Math.sqrt(q / (n - i0)); };
  let sxy = 0; for (let i = i0; i < n; i++) sxy += R.rec.cmd_r[i] * R.rec.acc_y[i];
  const corr = sxy / (n - i0) / (rms('cmd_r') * rms('acc_y'));
  const v = P.wb.viv, cR = S.cmd.find(c => c.axis === 0), cA = S.acc.find(c => c.axis === 1), u = cR.data, ud = cA.data, hs = cR.fs;
  let se = 0, sa = 0; const g0 = Math.round(20 * hs), g1 = Math.round(70 * hs);      // dizi sonundaki rampadan uzak (rampa x ve ü'ye ayrı uygulanır)
  for (let i = g0; i < g1; i++) { const dd = (u[i + 1] - 2 * u[i] + u[i - 1]) * hs * hs, e = ud[i] - dd; se += e * e; sa += ud[i] * ud[i]; }
  const eGrid = Math.sqrt(se / sa), scl = (cA.scale / cR.scale) / (-v.L / v.kth);
  let su = 0, sd = 0; for (let i = g0; i < g1; i++) { su += u[i] * u[i]; sd += ud[i] * ud[i]; }
  const ratioGrid = Math.abs(cA.scale / cR.scale) * Math.sqrt(sd / su), ratioSim = rms('acc_y') / rms('cmd_r');
  const noPitch = !S.cmd.some(c => c.axis === 1) && !S.acc.some(c => c.axis === 0), mechL = L.rowScenario(P, L.OP_ROWS.find(q => q.id === 'B2-01'), { T: 10, seed: 1 }).mech;
  const mechOk = !!(mechL.imbalance && mechL.optMode && mechL.coupling);
  const sigA = rms('cmd_r'), expA = VS.A / Math.SQRT2;
  add('V', 'V7', 'İşletmede denizaltı VIV eşlemesi (açı ↔ mast başı ötelemesi)', 'denizaltı varsayılanı (L = 4 m, κ = 1,5), yalnız VIV kaynağı, 80 s: (a) ivme dizisi açı dizisinin ikinci türevi mi (ızgarada merkezi fark), (b) ölçek oranı −L/κ, (c) benzetimde a_y/roll RMS oranı ızgaradakiyle aynı mı, (d) pitch ve x bileşeni yok, (e) roll–a_y korelasyonu (mast başı +y\'ye giderken roll −), (f) roll RMS = A/√2, (g) B2-01 satırında dengesizlik ve optik montaj açık',
    '(a) özdeş, (b) 1, (c) aynı, (d) yok, (e) +1, (f) A/√2, (g) açık', `(a) göreli fark ${f(eGrid * 100, 3)} %, (b) ${f(scl, 9)}, (c) ${f(ratioSim, 3)} / ${f(ratioGrid, 3)} m/s²/rad, (d) ${noPitch ? 'yok' : 'VAR'}, (e) ${f(corr, 5)}, (f) ${f(sigA * 1e6, 1)} / ${f(expA * 1e6, 1)} µrad, (g) ${mechOk ? 'açık' : 'KAPALI'}`,
    '(a) ≤ %0,5; (b) ±1·10⁻⁹; (c) ±%0,3; (e) > 0,999; (f) ±%5 (80 s, dar bant süreç)', eGrid <= 0.005 && Math.abs(scl - 1) <= 1e-9 && rel(ratioSim, ratioGrid) <= 0.003 && noPitch && corr > 0.999 && rel(sigA, expA) <= 0.05 && mechOk);
}
if (run('V6')) {
  // v13.2: T2.2 (gemi) yol ayrımı — ayna (otokolimatör) = gimbal yolu, video − ayna fazör farkı = optik alt montaj. Ölçülebilir
  // ayrım ↔ mekanizma ablasyonu (aynı tohum, tam ölçüm zinciri): (a) optik montaj kapalıyken video − ayna ≈ 0, (b) ayna(tüm) ≈
  // video(optik montaj kapalı), (c) |video − ayna|(tüm) ≈ |video(tüm) − video(optik montaj kapalı)|. Yandan rüzgâr (β = 90°),
  // f_n'de dwell, dar bant OFF ve ON (ON'da iki yol ters fazda kısmen birbirini götürmez: artık büyür)
  const P0 = L.defaultParams('ship'); P0.wb.wviv.beta = 90;
  const VS = L.vivSpec(P0), fq = Math.round(VS.f * 100) / 100, ramp = Math.max(1, 0.5 / fq), core = Math.round(60 * fq) / fq, t0 = 1, t1 = t0 + 2 * ramp + core;
  const one = (resOn, mech) => {
    const P = L.cloneParams(P0); P.dut.ctl.res.on = resOn;
    const tn = L.windTone(P, VS, fq, t0, t1, ramp), S = L.labScenario(P, { label: 'V6', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: fq, seed: 2601 });
    if (mech) S.mech = Object.assign({}, L.MECH_DEFAULT, mech);
    const R = L.runSim(P, S), z = L.fitSegments(P, R, [{ axis: 1, f: fq, c0: t0 + ramp + 0.25 / fq, c1: t1 - ramp - 0.25 / fq }], {})[0];
    return { v: z.fx, m: z.ax };
  };
  const ph = (a, b) => Math.hypot(a.a - b.a, a.b - b.b);
  let wa = 0, wb = 0, wc = 0; const parts = [];
  for (const resOn of [false, true]) {
    const A = one(resOn, null), B = one(resOn, { optMode: false });
    // ölçek: ayrıştırılan yolların büyüğü (gimbal yolu küçükken göreli fark ölçüm tabanını büyütmesin)
    const sep = ph(A.v, A.m), abl = ph(A.v, B.v), sc = Math.max(B.v.A, sep);
    const ea = ph(B.v, B.m) / sc, eb = ph(A.m, B.v) / sc, ec = Math.abs(sep / abl - 1);
    wa = Math.max(wa, ea); wb = Math.max(wb, eb); wc = Math.max(wc, ec);
    parts.push(`${resOn ? 'ON' : 'OFF'}: video ${f(A.v.A / Math.SQRT2 * 1e6, 3)}, ayna ${f(A.m.A / Math.SQRT2 * 1e6, 3)}, video − ayna ${f(sep / Math.SQRT2 * 1e6, 3)} / ablasyon ${f(abl / Math.SQRT2 * 1e6, 3)} µrad (a ${f(ea * 100, 2)} %, b ${f(eb * 100, 2)} %, c ${f(ec * 100, 2)} %)`);
  }
  add('V', 'V6', 'T2.2 yol ayrımı (gemi): ayna ↔ video − ayna', 'gemi, β = 90°, f_n dwell (açısal + öteleme), xel, dar bant OFF ve ON; aynı tohumla tüm mekanizmalar ↔ optik montaj kapalı: (a) optik montaj kapalıyken |video − ayna|, (b) |ayna(tüm) − video(optik kapalı)| — ikisi de ayrıştırılan yolların büyüğüne göre; (c) |video − ayna|(tüm) ↔ ablasyon farkı |video(tüm) − video(optik kapalı)|',
    '(a) 0, (b) 0, (c) 0 (doğrusal üst üste binme; ölçüm gürültüsü ve sürtünme kadar sapma)', parts.join(' · '), '(a) ≤ %3; (b) ≤ %5; (c) ≤ %5', wa <= 0.03 && wb <= 0.05 && wc <= 0.05);
}

// ============================================================ S — 6-DOF deniz hareketi (v11)
if (run('S1')) {
  // bant sınırlı sentez: RMS, Gauss tepe aşımı ve basıklık, türev oranı (ivme/konum RMS) ↔ analitik spektral moment
  const q = L.SEA6.SS5.roll, sig = q.A * D2R / 3, shape = L.shapeBand(q.f1, q.f2), fs0 = 20, n = 1 << 19, Tn = n / fs0;
  const z = L.synthSeriesDer(shape, fs0, n, new L.RNG(2026), sig), x = z.x, a = z.a;
  let s2 = 0, s4 = 0, nx = 0, sa = 0; for (let i = 0; i < n; i++) { s2 += x[i] * x[i]; s4 += x[i] ** 4; sa += a[i] * a[i]; if (Math.abs(x[i]) > 3 * sig) nx++; }
  const rms = Math.sqrt(s2 / n), kurt = (s4 / n) / (s2 / n) ** 2, exc = nx / n, ar = Math.sqrt(sa / s2), arE = L.accRatio(shape, Math.sqrt(q.f1 * q.f2));
  // istatistiksel belirsizlik: N_eff = T·(∫S)²/∫S² (tek taraflı); RMS'in göreli std'si 1/(2√N_eff)
  let i1 = 0, i2 = 0, iin = 0; for (let fq = 1e-3; fq <= 5; fq += 1e-4) { const v = shape(fq); i1 += v; i2 += v * v; if (fq >= q.f1 / 1.5 && fq <= 1.5 * q.f2) iin += v; }
  const Neff = Tn * i1 * i1 * 1e-4 / i2, se = 1 / (2 * Math.sqrt(Neff)), inBand = iin / i1;
  add('S', 'S1', 'Bant sınırlı deniz profili sentezi (6-DOF)', `SS5 roll: ±${q.A}° tepe → σ = A/3, bant ${q.f1}–${q.f2} Hz (4. derece Butterworth), 20 Hz, ${f(Tn / 3600, 2)} saat. Gerçekleşme hedef RMS'e ölçeklenir (yapı gereği); sınanan: Gauss dağılımı (|x| > 3σ oranı, basıklık), ivme/konum RMS oranı (synthSeriesDer'in spektral türevi) ↔ (2π)²·√(∫f⁴S/∫S), varyansın [f1/1,5; 1,5·f2] içindeki payı`,
    `RMS = σ (${f(sig / D2R, 4)}°), aşım %0,270, basıklık 3, ivme oranı ${f(arE, 4)} 1/s²`, `RMS ${f(rms / D2R, 4)}°, aşım %${f(exc * 100, 3)}, basıklık ${f(kurt, 3)}, ivme oranı ${f(ar, 4)} (${f((ar / arE - 1) * 100, 2)} %), bant içi pay %${f(inBand * 100, 1)}`,
    `aşım %0,10–0,50 (N_eff ≈ ${f(Neff, 0)}, ≈ 25 bağımsız olay); basıklık 3 ± 0,25; ivme oranı ±%3 (RMS kestirim belirsizliği ≈ ${f(se * 100, 2)} %); bant içi ≥ %95`,
    Math.abs(rms / sig - 1) <= 3 * se && exc >= 0.001 && exc <= 0.005 && Math.abs(kurt - 3) <= 0.25 && Math.abs(ar / arE - 1) <= 0.03 && inBand >= 0.95);
}
if (run('S2')) {
  // kaldıraç kolu ivmesi: motorun rijit cisim ifadesi (a = ω̇_B × r + ω_B × (ω_B × r), ω_B Euler hızlarından) ↔ bağımsız tam
  // kinematik: p(t) = Rz(ψ)Ry(θ)Rx(φ)·r, p̈ beş noktalı (4. derece) merkezi farkla, gövde çerçevesine Rᵀ ile. Yalnız açısal
  // serbestlik dereceleri (SS4). Üç kol: düşey (0, 0, 15) m, tam vektör (20, −4, 15) m, yalnız boyuna (30, 0, 0) m (v13.1).
  // Ayrıca bütçe kestirimi (seaAccDirector, birinci derece, bağımsız terimler) ↔ tam RMS (kolun ivme ürettiği eksenlerde).
  const one = (r, seed) => {
    const P = full('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); P.wb.sea.rx = r[0]; P.wb.sea.ry = r[1]; P.wb.sea.h = r[2];
    for (const k of ['surge', 'sway', 'heave']) P.wb.sea.dof[k].A = 0;
    const T = 3000, M = L.seaMotion(P, T, L.makeRngFactory(seed), { world: 'op' }), fs0 = 20;
    const ang = [0, 1, 2].map(ax => M.cmd.find(c => c.axis === ax).data), acc = [0, 1, 2].map(ax => { const c = M.acc.find(q => q.axis === ax); return c ? c.data : null; });
    const nS = ang[0].length, pos = [];
    for (let i = 0; i < nS; i++) { const R = mm(Rz(ang[2][i]), mm(Ry(ang[1][i]), Rx(ang[0][i]))); pos.push(mv(R, r)); }
    const e = [0, 0, 0], q = [0, 0, 0], i0 = Math.round(30 * fs0), i1 = nS - i0;
    for (let i = i0; i < i1; i++) {
      const R = mm(Rz(ang[2][i]), mm(Ry(ang[1][i]), Rx(ang[0][i]))), pdd = [0, 1, 2].map(k => (-pos[i + 2][k] + 16 * pos[i + 1][k] - 30 * pos[i][k] + 16 * pos[i - 1][k] - pos[i - 2][k]) / 12 * fs0 * fs0);
      const aB = [0, 1, 2].map(k => R[0][k] * pdd[0] + R[1][k] * pdd[1] + R[2][k] * pdd[2]);       // Rᵀ·p̈
      for (let k = 0; k < 3; k++) { const m = acc[k] ? acc[k][i] : 0; e[k] += (m - aB[k]) ** 2; q[k] += aB[k] ** 2; }
    }
    const NN = i1 - i0, rms = q.map(v => Math.sqrt(v / NN)), A = L.seaAccDirector(P), mx = Math.max(...rms);
    const bud = [0, 1, 2].map(k => (A.lever[k] > 0.1 * mx ? A.lever[k] / rms[k] - 1 : null));
    return { r, rel: e.map((v, k) => Math.sqrt(v / q[k])), rms, A, bud };
  };
  const cs = [one([0, 0, 15], 77), one([20, -4, 15], 78), one([30, 0, 0], 79)];
  const ok = cs.every(o => o.rel.every(v => v <= 0.005) && o.bud.every(v => v == null || Math.abs(v) <= 0.10));
  const tx = (o) => `r = (${o.r.join(', ')}) m: fark x ${f(o.rel[0] * 100, 3)} %, y ${f(o.rel[1] * 100, 3)} %, z ${f(o.rel[2] * 100, 3)} %; tam RMS ${o.rms.map(v => f(v, 4)).join(' / ')} m/s²; bütçe ${o.A.lever.map(v => f(v, 4)).join(' / ')} (${o.bud.map(v => (v == null ? '—' : f(v * 100, 1) + ' %')).join(' / ')})`;
  add('S', 'S2', 'Kaldıraç kolu ivmesi ↔ tam rijit cisim kinematiği', 'SS4 açısal profil, 3000 s, üç kol: (0, 0, 15), (20, −4, 15) ve (30, 0, 0) m. Motorun işletme ivme serisi (a = ω̇_B × r + ω_B × (ω_B × r), ω_B = (φ̇ − ψ̇sθ, θ̇cφ + ψ̇cθsφ, −θ̇sφ + ψ̇cθcφ)) ↔ p = Rz(ψ)Ry(θ)Rx(φ)·r konumunun beş noktalı merkezi farkla ikinci türevi, gövdeye Rᵀ ile; bütçe kestirimi (birinci derece, bağımsız terimler: a_x = θ̈r_z − ψ̈r_y, a_y = ψ̈r_x − φ̈r_z, a_z = φ̈r_y − θ̈r_x) ↔ tam RMS. v13.1 bulgusu: önceki küçük açı ifadesi (ω ≈ Euler hızları) boyuna kolda y ivmesini SS4\'te %19 yanlış veriyordu (probe/k3/exactacc.js)',
    'özdeş (sayısal türev hatası düzeyinde); bütçe ±%10', cs.map(tx).join(' · '), 'fark ≤ %0,5 (her eksen, her kol; referansın sayısal türev hatası ≈ %0,02–0,3); bütçe kestirimi tam RMS\'ten ±%10 (kolun ivme ürettiği eksenler, tek gerçekleşme)', ok);
}
if (run('S3')) {
  // laboratuvar öteleme talebi: yer değiştirme = ağırlık merkezi ötelemesi + (R − I)·r, R = Rz(ψ)·Ry(θ)·Rx(φ). İkinci uygulama:
  // aynı tohumla açısal diziler (cmd) ve kolsuz koşunun ötelemesi (yalnız ağırlık merkezi) alınır, (R − I)·r bağımsız matrislerle
  // eklenir. Ölçek sonrası tepe ↔ strok; RMS ↔ birinci derece analitik √(σ_öteleme² + Σ(r·σ_açı)²) (eksen başına).
  const r = [20, -4, 15], mkP = (rr) => { const P = full('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); P.wb.sea.rx = rr[0]; P.wb.sea.ry = rr[1]; P.wb.sea.h = rr[2]; return P; };
  const P = mkP(r), T = 6000, M = L.seaMotion(P, T, L.makeRngFactory(91), { world: 'lab' }), M0 = L.seaMotion(mkP([0, 0, 0]), T, L.makeRngFactory(91), { world: 'lab' });
  const D = L.seaDOF(P), st = P.lab.hexStroke, ang = [0, 1, 2].map(ax => M.cmd.find(c => c.axis === ax).data), g = (MM, ax) => (MM.trans.find(c => c.axis === ax) || {}).data;
  const nS = ang[0].length; let dMax = 0;
  for (let i = 0; i < nS; i++) {
    const R = mm(Rz(ang[2][i]), mm(Ry(ang[1][i]), Rx(ang[0][i]))), pr = mv(R, r);
    for (let k = 0; k < 3; k++) { const c = g(M0, k), v = (c ? c[i] : 0) + pr[k] - r[k]; dMax = Math.max(dMax, Math.abs(v - g(M, k)[i])); }
  }
  const i0 = 20 * 20, i1 = (T - 20) * 20, rmsOf = (d) => { let q = 0; for (let i = i0; i < i1; i++) q += d[i] * d[i]; return Math.sqrt(q / (i1 - i0)); };
  let pk = 0; for (const t of M.trans) for (let i = 0; i < t.data.length; i++) pk = Math.max(pk, Math.abs(t.data[i] * t.scale));
  const sA = D.ang.map(q => q.sigma), sL = D.lin.map(q => q.sigma);
  const ex = [Math.sqrt(sL[0] ** 2 + (r[2] * sA[1]) ** 2 + (r[1] * sA[2]) ** 2), Math.sqrt(sL[1] ** 2 + (r[2] * sA[0]) ** 2 + (r[0] * sA[2]) ** 2), Math.sqrt(sL[2] ** 2 + (r[1] * sA[0]) ** 2 + (r[0] * sA[1]) ** 2)];
  const rr = [0, 1, 2].map(k => rmsOf(g(M, k))), er = rr.map((v, k) => v / ex[k] - 1);
  add('S', 'S3', 'Laboratuvar öteleme talebi ve ölçek q', `SS5, r = (20, −4, 15) m, ${T} s: hexapod yer değiştirmesi = ağırlık merkezi ötelemesi + (R − I)·r, R = Rz(ψ)Ry(θ)Rx(φ) ↔ bağımsız matrislerle yeniden hesap (aynı tohum: kolsuz koşunun ötelemesi + açısal diziler); ölçek sonrası tepe ↔ strok; RMS ↔ birinci derece analitik √(σ_öteleme² + Σ(r·σ_açı)²)`,
    `özdeş; tepe = ±${st} m; x ${f(ex[0], 3)}, y ${f(ex[1], 3)}, z ${f(ex[2], 3)} m RMS`, `en büyük fark ${f(dMax, 2)} m; q = ${f(M.q, 5)}, ölçek sonrası tepe ${f(pk, 6)} m; x ${f(rr[0], 3)} (${f(er[0] * 100, 1)} %), y ${f(rr[1], 3)} (${f(er[1] * 100, 1)} %), z ${f(rr[2], 3)} (${f(er[2] * 100, 1)} %) m RMS; tepe/σ = ${f(M.demand / Math.max(...rr), 2)}`,
    'fark ≤ 1·10⁻¹² m; tepe ±1·10⁻¹² m; RMS ±%5 (tek gerçekleşme, N_eff ≈ 900)', dMax <= 1e-12 && Math.abs(pk - st) <= 1e-12 && er.every(v => Math.abs(v) <= 0.05));
}
if (run('S4')) {
  // T2.5 yol ayrımlı kestirimi (laboratuvar 2–3 Hz duyarlılık × işletme ivmesi; v13.4'e kadar 1–2 Hz) ↔ işletme benzetiminde B1-08 satırı; iki kol:
  // düşey r = (0, 0, 15) m (v11) ve tam vektör r = (20, −4, 15) m (v13.1)
  const one = (rr) => {
    const P = full('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); P.wb.sea.rx = rr[0]; P.wb.sea.ry = rr[1]; P.wb.sea.h = rr[2];
    const r25 = L.runTest('T2.5', P, {}), tr = r25.num && r25.num.tr6, row = L.OP_ROWS.find(q => q.id === 'B1-08');
    const R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20, psd: false });
    const opE = M.rms.el, opX = M.rms.xel, ok = tr && tr.predEl >= opE && tr.predXel >= opX && tr.predEl <= 4 * opE && tr.predXel <= 4 * opX;
    return { tr, opE, opX, ok };
  };
  const a = one([0, 0, 15]), b = one([20, -4, 15]);
  const txt = (o, nm) => (o.tr ? `${nm}: kestirim el ${f(o.tr.predEl * 1e6, 3)} / xel ${f(o.tr.predXel * 1e6, 3)} µrad; işletme el ${f(o.opE * 1e6, 3)} / xel ${f(o.opX * 1e6, 3)} µrad; yol ayrımı olmadan ${f(o.tr.dirEl * 1e6, 3)} / ${f(o.tr.dirXel * 1e6, 3)} µrad` : `${nm}: T2.5 öteleme bölümü koşmadı`);
  add('S', 'S4', 'T2.5 kestirimi ↔ işletme benzetimi (B1-08)', 'gemi, SS5 6-DOF, iki kaldıraç kolu (r = (0, 0, 15) m ve (20, −4, 15) m): T2.5 (x, y, z öteleme 2 ve 3 Hz, 2 m/s² (v13.5; önceden 1 ve 2 Hz); ayna ve video − ayna yolları ayrı, doğrusal toplam) × işletme ivmesi ↔ aynı DUT\'un işletme ayrıştırmasındaki B1-08 satırı (600 s, öteleme + kaldıraç kolu, açısal hareketin kendisi yok)',
    'kestirim ≥ işletme (muhafazakâr), ≤ 4 kat', txt(a, 'r = (0, 0, 15) m') + ' · ' + txt(b, 'r = (20, −4, 15) m'), 'işletme ≤ kestirim ≤ 4 × işletme (iki eksen, iki kol)', !!(a.ok && b.ok));
}

// ============================================================ F — FOG parametreleri (v11)
if (run('F1')) {
  // gecikme: zaman alanı DRR ↔ analitik model (e^(−jωτ)); faz payı kaybı = 360·f_c·τ (kazanç kesimi değişmez)
  const P = full(); P.dut.gyro.lat_ms = 1; const P0 = full(); P0.dut.gyro.lat_ms = 0;
  const mech = Object.assign({}, MECH_OFF, { coupling: true, earth: true }), d = L.derive(P), d0 = L.derive(P0);
  let worst = 0; const parts = [];
  for (const fq of [1, 3, 8, 20, 40, 60]) {
    const r = drrRun(P, 0, fq, mech, 0.05 * D2R), m = L.cabs(d.loopEl.drr(TAU * fq)), m0 = L.cabs(d0.loopEl.drr(TAU * fq)), dB = 20 * Math.log10(r.g / m);
    worst = Math.max(worst, Math.abs(dB)); parts.push(`${fq} Hz: ${f(20 * Math.log10(r.g), 2)}/${f(20 * Math.log10(m), 2)} dB (gecikmesiz ${f(20 * Math.log10(m0), 2)})`);
  }
  const dPM = d0.loopEl.pm - d.loopEl.pm, exPM = 360 * d.loopEl.fcx * 1e-3, dfc = Math.abs(d.loopEl.fcx / d0.loopEl.fcx - 1);
  add('F', 'F1', 'FOG gecikmesi: DRR ve faz payı', 'el döngüsü, 1 ms ek gecikme (benzetimde kontrol hızında gecikme hattı); 0,05° sinüs 1–60 Hz, zaman alanı ↔ analitik model; faz payı kaybı ↔ 360·f_c·τ', `|DRR| model; ΔPM = ${f(exPM, 3)}°, f_c değişmez`,
    `en büyük fark ${f(worst, 3)} dB; ΔPM ${f(dPM, 3)}° (PM ${f(d0.loopEl.pm, 2)}° → ${f(d.loopEl.pm, 2)}°), f_c farkı ${f(dfc * 100, 4)} %`, 'DRR ±0,25 dB (D1 ile aynı); ΔPM ±0,01°; f_c ≤ %0,01', worst <= 0.25 && Math.abs(dPM - exPM) <= 0.01 && dfc <= 1e-4, { detail: parts.join(' · ') });
}
if (run('F2')) {
  // ölçek hatası: (a) bozucu bastırmaya etkisi kazanç ölçeği kadar (ihmal edilebilir); (b) dönüşte pointing hatası −S_etkin·θ
  const mech = Object.assign({}, MECH_OFF, { coupling: true, earth: true }), dd = [];
  for (const fq of [0.125, 3]) { const Pa = full(), Pb = full(); Pa.dut.gyro.sf_ppm = 0; Pb.dut.gyro.sf_ppm = 1000;
    dd.push(20 * Math.log10(drrRun(Pb, 0, fq, mech, 0.05 * D2R).g / drrRun(Pa, 0, fq, mech, 0.05 * D2R).g)); }
  const exA = -20 * Math.log10(1.001);
  const P1 = full(), r1 = L.runTest('T1.8', P1, {}), n1 = r1.num;
  const P2 = full(); Object.assign(P2.dut.gyro, { sfnl_ppm: 50, range_dps: 300 }); const r2 = L.runTest('T1.8', P2, {}), n2 = r2.num;
  const okB = (n) => n && Math.abs(n.sfPart - n.sfExp) <= Math.max(0.05 * Math.abs(n.sfExp), 0.3e-6);
  add('F', 'F2', 'FOG ölçek hatası: bozucu bastırma ve dönüş', '(a) S_f = 0 ↔ 1000 ppm, 0,125 ve 3 Hz DRR (zaman alanı); (b) T1.8 (10° @ 30°/s): ölçek hatasının yalıtılmış payı (aynı tohum, S_f = S_nl = 0 koşusuyla fark) ↔ −S_etkin·θ; S_etkin = S_f − 1,5·S_nl + 2,5·S_nl·⟨ω²⟩/FS² (kübik doğrusalsızlık)',
    `(a) ${f(exA, 4)} dB; (b) S_f = 100 ppm: ${f(n1 && n1.sfExp * 1e6, 2)} µrad; + S_nl = 50 ppm·FS, FS = 300 °/s: ${f(n2 && n2.sfExp * 1e6, 2)} µrad`,
    `(a) ${dd.map(x => f(x, 4)).join(' / ')} dB; (b) ${f(n1 && n1.sfPart * 1e6, 2)} / ${f(n2 && n2.sfPart * 1e6, 2)} µrad`, '(a) |Δ| ≤ 0,05 dB; (b) ±%5 ya da ±0,3 µrad', dd.every(x => Math.abs(x) <= 0.05) && okB(n1) && okB(n2));
}
if (run('F3')) {
  // eksen kaçıklığı: LOS etrafındaki dönme ε kadar el gyrosuna sızar → el ≈ ε·θ (B1-04, σ = εθ/√2)
  const P = full(), am = L.axisMap(P, 1), mech = Object.assign({}, MECH_OFF, { coupling: true, misalign: true }), d = L.derive(P), eps = P.dut.gyro.epsEl * 1e-3;
  const A = 3 * D2R, fq = 0.125, T = 1 + 2 * 8 + 6 / fq + 1;
  const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech, meas: MEAS_OFF, hexActive: false, cooler: false, hexF: 1500,
    cmd: [{ type: 'sine', axis: 1, A, f: fq, t0: 1, t1: T - 1, ramp: 8 }], rec: { fs: 1000, ch: ['opt_el', 'base_p'] } });
  const t = rec(R), [i0, i1] = idx(t, 1 + 8 + 2, T - 1 - 8 - 2), fo = L.sineFit(t, R.rec.opt_el, fq, { i0, i1 }), fi = L.sineFit(t, R.rec.base_p, fq, { i0, i1 });
  const w = TAU * fq, ex = eps * fi.A * w * L.cabs(d.loopEl.gyroN(w)) / Math.hypot(1, w / (TAU * P.dut.gyro.fbw));
  add('F', 'F3', 'Gyro eksen kaçıklığı: LOS etrafındaki dönmenin sızması', `yanal bakış (pitch = LOS ekseni etrafında dönme: ${am.los}), 3° @ 0,125 Hz, stab ON, yalnız kuplaj + eksen kaçıklığı ε = ${P.dut.gyro.epsEl} mrad; el genliği ↔ ε·θ·ω·|θ/n(ω)| (analitik gyro yolu)`,
    `${f(ex * 1e6, 4)} µrad (≈ ε·θ = ${f(eps * fi.A * 1e6, 4)}; RMS εθ/√2 = ${f(eps * fi.A / Math.SQRT2 * 1e6, 3)})`, `${f(fo.A * 1e6, 4)} µrad`, '±%1', am.los === 'rot' && Math.abs(fo.A / ex - 1) <= 0.01);
}
if (run('F4')) {
  // (a) bias sıcaklık katsayısı → LOS kayma hızı |b0 + TC·ΔT|; (b) doyma: menzil < dönüş hızı → doyum sayılır;
  // (c) g-duyarlılığı: üç eksende sinüs ivme, el yanıtlarının karesel toplamı ↔ k_g·a/g·|θ/n(ω)| (y_E birim vektör)
  const Pa = full(); Object.assign(Pa.dut.gyro, { bias0: 0, bi: 0, tcBias: 0.01, Tcal: 20, Top: 55 });
  const Ra = L.runSim(Pa, { T: 60, fs: 2000, world: 'lab', stab: true, seed: 5, mech: Object.assign({}, MECH_OFF, { gyroBias: true }), meas: MEAS_OFF, hexActive: false, cooler: false, rec: { fs: 100, ch: ['opt_el', 'opt_xel'] } });
  const ta = rec(Ra), [a0, a1] = idx(ta, 10, 59.9), exB = 0.01 * 35 * Math.PI / 180 / 3600;
  const sEl = Math.abs(slope(ta, Ra.rec.opt_el, a0, a1)), sXel = Math.abs(slope(ta, Ra.rec.opt_xel, a0, a1)), eB = Math.max(Math.abs(sEl / exB - 1), Math.abs(sXel / exB - 1));
  const Pb = full(); Pb.dut.gyro.range_dps = 20; const nb = L.runTest('T1.8', Pb, {}).num, nd = L.runTest('T1.8', full(), {}).num;
  const Pc = full(); Pc.dut.gyro.kg = 1; const dc = L.derive(Pc), fq = 2, w = TAU * fq, aA = 2.0;
  let s2 = 0; for (const ax of [0, 1, 2]) {
    const T = 1 + 1 + 12 / fq + 1;
    const R = L.runSim(Pc, { T, fs: 4000, world: 'lab', stab: true, seed: 3, mech: Object.assign({}, MECH_OFF, { gyroG: true }), meas: MEAS_OFF, hexActive: false, cooler: false,
      acc: [{ type: 'sine', axis: ax, A: aA, f: fq, t0: 0.5, ramp: 1 }], rec: { fs: 2000, ch: ['opt_el'] } });
    const t = rec(R), [i0, i1] = idx(t, 3, T - 0.5); s2 += L.sineFit(t, R.rec.opt_el, fq, { i0, i1 }).A ** 2;
  }
  const exG = 1 * Math.PI / 180 / 3600 / 9.80665 * aA * L.cabs(dc.loopEl.gyroN(w)), gG = Math.sqrt(s2);
  add('F', 'F4', 'FOG sıcaklık katsayısı, doyma, g-duyarlılığı', '(a) b0 = 0, TC = 0,01 °/h/°C, T_op − T_cal = 35 °C, yalnız sabit bias: LOS kayma hızı; (b) T1.8 menzil 20 °/s (dönüş 30 °/s) ↔ varsayılan 1000 °/s; (c) k_g = 1 °/h/g, 2 m/s² @ 2 Hz üç eksende ayrı: el genliklerinin karesel toplamı',
    `(a) ${f(exB * 1e6, 4)} µrad/s; (b) doyum > 0 / = 0; (c) ${f(exG * 1e9, 3)} nrad`, `(a) el ${f(sEl * 1e6, 4)} / xel ${f(sXel * 1e6, 4)} µrad/s; (b) ${nb && nb.gSat} / ${nd && nd.gSat} örnek, tepe ${f(nb && nb.gMax / D2R, 1)} °/s; (c) ${f(gG * 1e9, 3)} nrad`,
    '(a) ±%0,5; (b) doyum yalnız dar menzilde; (c) ±%2', eB <= 0.005 && nb && nb.gSat > 0 && nd && nd.gSat === 0 && Math.abs(gG / exG - 1) <= 0.02);
}

// ============================================================ G — proje LOS kalıntı metrikleri (v12)
// bağımsız üreteç (motorun RNG'sinden ayrı): mulberry32 + Box–Muller
function mb32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r()); }
if (run('G1')) {
  // (a) iki eksende bağımsız beyaz Gauss gürültü σ = 2 µrad, 2 kHz, 620 s; (b) El'de saf ton 3 µrad @ 7,3 Hz (+ 1 nrad gürültü)
  const P = full(), lim = L.losLimits(P), b = lim.bands, fs = 2000, T = 620, n = T * fs, sg = 2e-6, fN = fs / 2;
  const r1 = mb32(19001), el = new Float64Array(n), xel = new Float64Array(n);
  for (let i = 0; i < n; i++) { el[i] = sg * gss(r1); xel[i] = sg * gss(r1); }
  const m = L.losReqMetrics(P, el, xel, fs, { skip: 20 });
  const eP = 3 * sg, eR = Math.sqrt(-2 * Math.log(1 - 0.9973)) * sg, eB = b.slice(0, -1).map((b0, i) => sg * Math.sqrt((b[i + 1] - b0) / fN));
  const ea = [rel(m.sEl.pooled, sg), rel(m.sXel.pooled, sg), rel(m.sVec.pooled, Math.SQRT2 * sg), rel(m.p9973.el, eP), rel(m.p9973.xel, eP), rel(m.p9973.rad, eR)];
  const eb = m.pe.bands.map((v, i) => rel(v, eB[i])), tot = Math.sqrt(m.pe.bands.reduce((a, v) => a + v * v, 0) + m.pe.below ** 2 + m.pe.above ** 2), cons = rel(tot, m.pe.total);
  const A = 3e-6, f0 = 7.3, Te = lim.Texp, r2 = mb32(19002), e2 = new Float64Array(n), x2 = new Float64Array(n);
  for (let i = 0; i < n; i++) { e2[i] = A * Math.sin(TAU * f0 * i / fs + 0.4) + 1e-9 * gss(r2); x2[i] = 1e-9 * gss(r2); }
  const m2 = L.losReqMetrics(P, e2, x2, fs, { skip: 20 });
  const xs = Math.PI * f0 * Te, sc = Math.sin(xs) / xs, eExp = A / Math.SQRT2 * Math.sqrt(1 - sc * sc), eQ = A * Math.sin(Math.PI / 2 * 0.9973);
  const tn = m2.pe.tones.filter(t => t.rms > 0.01 * A), t0 = tn[0];
  const ec = [rel(m2.sEl.pooled, A / Math.SQRT2), rel(m2.ppEl, 2 * A), rel(m2.p9973.el, eQ), rel(m2.exp.el, eExp), rel(m2.exp.tdEl, eExp), t0 ? rel(t0.rms, A / Math.SQRT2) : 1, rel(m2.pe.bands[1], A / Math.SQRT2)];
  const fOk = !!t0 && tn.length === 1 && Math.abs(t0.f - f0) <= m2.df && t0.band === 1;
  const u = (x, d = 3) => f(x * 1e6, d);
  add('G', 'G1', 'Proje metrik motoru: Gauss gürültü ve saf ton', '(a) iki eksende bağımsız beyaz Gauss gürültü σ = 2 µrad, 2 kHz, 620 s (ilk 20 s atılır): σ, σ_vek, P99,73 eksen ve radyal, bant RMS\'leri, bantların toplamı, ton yokluğu; (b) El\'de 3 µrad @ 7,3 Hz saf ton: σ, PPV, P99,73, pozlama içi (PSD ve zaman alanı), ton tespiti ve bandı',
    `(a) σ ${u(sg)}, σ_vek ${u(Math.SQRT2 * sg)}, P99,73 3σ = ${u(eP)}, radyal √(−2 ln 0,0027)·σ = ${u(eR)}; bantlar σ·√(Δf/f_N) = ${eB.map(v => u(v)).join(' / ')}; ton yok · (b) σ = A/√2 = ${u(A / Math.SQRT2)}, PPV 2A = ${u(2 * A)}, P99,73 A·sin(0,9973·π/2) = ${u(eQ)}, pozlama (A/√2)·√(1 − sinc²(πfT_e)) = ${u(eExp)} µrad; tek ton 7,3 Hz, 2,5–20 Hz bandında`,
    `(a) σ ${u(m.sEl.pooled)} / ${u(m.sXel.pooled)}, σ_vek ${u(m.sVec.pooled)}, P99,73 ${u(m.p9973.el)} / ${u(m.p9973.xel)}, radyal ${u(m.p9973.rad)}; bantlar ${m.pe.bands.map(v => u(v)).join(' / ')}; ${m.pe.tones.length} ton · (b) σ ${u(m2.sEl.pooled)}, PPV ${u(m2.ppEl)} (PPV/σ ${f(m2.rEl, 3)}), P99,73 ${u(m2.p9973.el)}, pozlama ${u(m2.exp.el)} (zaman alanı ${u(m2.exp.tdEl)}); ton ${t0 ? f(t0.f, 3) + ' Hz ' + u(t0.rms) : '—'}`,
    '(a) σ ve yüzdelikler ±%1, bantlar ±%5, bant toplamı = toplam, ton yok; (b) ±%0,5, ton frekansı ±1 kutu', Math.max(...ea) <= 0.01 && Math.max(...eb) <= 0.05 && cons <= 1e-9 && m.pe.tones.length === 0 && Math.max(...ec) <= 0.005 && fOk,
    { detail: `en büyük göreli fark (a) ${f(Math.max(...ea) * 100, 3)} %, bant ${f(Math.max(...eb) * 100, 2)} %; (b) ${f(Math.max(...ec) * 100, 3)} %. Kutu genişliği Δf = ${f(m2.df, 4)} Hz (≥ 30 s Welch segmenti). Bu kontrol bir hata yakaladı: sıfır fazlı yüksek geçirenin ters geçişi kaydın sonundaki değerin DC kararlı durumundan başladığı için son ~15 s'de geçici rejim bırakıyordu ve son pencereye giriyordu (saf tonda PPV +%22, P99,73 +%1). Yansımalı dolgu salınımlı sinyalde bunu gidermiyor; düzeltme: sondan da süzgecin sönüm süresi (0,1 Hz'de 21 s) atılır, T1.9 kaydı 645 s'ye uzatıldı (10 × 60 s pencere korunur).` });
}
if (run('G2')) {
  // sıfır fazlı yüksek geçiren: 2. derece Butterworth (RBJ, ön-bükmeli bilineer) ileri + geri → |H|² = r⁴/(1 + r⁴), faz 0
  const fc = 0.1, rows = []; let worst = 0, wph = 0;
  for (const fs of [2000, 50]) for (const fq of [0.05, 0.1, 0.3, 1]) {
    const T = 1200, n = T * fs, x = new Float64Array(n), t = new Float64Array(n);
    for (let i = 0; i < n; i++) { t[i] = i / fs; x[i] = Math.sin(TAU * fq * t[i] + 0.7); }
    const y = L.filtfiltHP(x, fs, fc), [i0, i1] = idx(t, 200, T - 200);
    const fx = L.sineFit(t, x, fq, { i0, i1 }), fy = L.sineFit(t, y, fq, { i0, i1 });
    const r = Math.tan(Math.PI * fq / fs) / Math.tan(Math.PI * fc / fs), ex = r ** 4 / (1 + r ** 4), g = fy.A / fx.A;
    const dph = ((fy.ph - fx.ph) * 180 / Math.PI + 540) % 360 - 180;
    worst = Math.max(worst, rel(g, ex)); wph = Math.max(wph, Math.abs(dph));
    rows.push(`${fs} Hz / ${fq} Hz: ${f(g, 5)} (${f(ex, 5)}), ${f(dph, 4)}°`);
  }
  add('G', 'G2', 'Sıfır fazlı yüksek geçiren (0,1 Hz)', '2 kHz (gerçek LOS) ve 50 Hz (video) örneklemede 0,05 / 0,1 / 0,3 / 1 Hz sinüs, 1200 s, uçlardan 200 s atılarak sinüs uydurma; genlik oranı ve faz farkı',
    `|H|² = r⁴/(1 + r⁴), r = tan(πf/f_s)/tan(πf_c/f_s): 0,1 Hz'de 0,5 (−6,02 dB), 0,3 Hz'de ${f(81 / 82, 4)}; faz 0`, `en büyük göreli fark ${f(worst, 2)}, en büyük faz ${f(wph, 4)}°`, '±%0,2; |faz| ≤ 0,05°', worst <= 0.002 && wph <= 0.05, { detail: rows.join(' · ') });
}
if (run('G3')) {
  // dış kamera takip döngüsü: optik alt montajın yarı statik sapması (özgül kuvvet × ∂θ/∂a) gyro'nun görmediği bir LOS bozucusudur;
  // yalnız video (gürültüsüz) üzerinden takip döngüsü düzeltir. Takip açık / kapalı genlik oranı = |S(f)|; analitik: trkModel
  const P = full(), tk = L.trkModel(P), Tr = P.ana.los.trk, mech = Object.assign({}, MECH_OFF, { optMode: true });
  const meas = { video: true, ac: false, imu: false, air: false, microvib: false, noise: false }, rows = [];
  let worst = 0, lost = 0, simPk = NaN, anaPk = NaN;
  const one = (fq, on) => {
    const T = 6 + Math.max(16 / fq, 8);
    const R = L.runSim(P, { T, fs: 4000, world: 'lab', stab: true, seed: 7, mech, meas, hexActive: false, cooler: false,
      acc: [{ type: 'sine', axis: 2, A: 2.0, f: fq, t0: 0.5, ramp: 1 }], tracker: on ? { bw: Tr.bw, lat_frames: Tr.lat_frames, gate_px: Tr.gate_px } : null, rec: { fs: 1000, ch: ['opt_el'] } });
    const t = rec(R), [i0, i1] = idx(t, 5, T - 0.02); lost += R.stats.trackLost || 0;
    return L.sineFit(t, R.rec.opt_el, fq, { i0, i1 }).A;
  };
  for (const fq of [0.3, 1, 2, Math.round(tk.fPk * 100) / 100, 6]) {
    const sdb = 20 * Math.log10(one(fq, true) / one(fq, false)), adb = 20 * Math.log10(L.cabs(tk.S(fq)));
    worst = Math.max(worst, Math.abs(sdb - adb)); rows.push(`${f(fq, 2)} Hz: ${f(sdb, 2)} (${f(adb, 2)}) dB`);
    if (Math.abs(fq - tk.fPk) < 0.01) { simPk = sdb; anaPk = adb; }
  }
  add('G', 'G3', 'Dış kamera takip döngüsü: duyarlılık |S(f)|', `bant ${Tr.bw} Hz, ${Tr.lat_frames} kare gecikme; optik alt montajın ivmeyle yarı statik sapması (gyro görmez), 2 m/s² dikey sinüs, gürültüsüz video; takip açık / kapalı El genlik oranı ↔ analitik L(s) = K(1 + W_i/s)/s·e^(−sτ) (iç döngü ideal)`,
    `|S| analitik; tepe ${f(20 * Math.log10(tk.sPk), 2)} dB @ ${f(tk.fPk, 2)} Hz, |S| = 1 @ ${f(tk.f0, 2)} Hz`, `${rows.join(' · ')}; kilit kaybı ${lost}`, '±0,6 dB (örneklemeli döngünün sürekli yaklaşımı); tepede ±0,3 dB',
    worst <= 0.6 && Math.abs(simPk - anaPk) <= 0.3 && lost === 0, { detail: 'Fark kesim civarında (|S| ≈ 1) en büyüktür; orada |1 + L| faz hatasına duyarlıdır: 2 Hz\'de 2° faz farkı ≈ 0,4 dB. Kaynakları: kare başına bir kez güncellenen PI (geri Euler integral), ZOH\'nin T_kare/2 gecikmeyle yaklaşımı, iç stabilizasyon döngüsünün komut yanıtı (6–8 Hz\'de |T_iç| 1,08–1,15).' });
}
if (run('G4')) {
  // pozlama içi jitter: karar değeri √∫S·(1 − sinc²(πfT_e))df (faz ortalaması); zaman alanı (kare başına RMS'lerin karesel ortalaması) bir gerçekleşmedir.
  // (a) beyaz gürültü ve (b) kare hızına kilitli olmayan ton: ikisi aynı; (c) 50 fps'ye kilitli 50 Hz ton: zaman alanı faza bağlı
  const P = full(), fs = 2000, T = 140, n = T * fs, Te = L.losLimits(P).Texp, NE = Math.round(Te * fs), A = 2e-6;
  const r1 = mb32(19004), wE = new Float64Array(n), wX = new Float64Array(n); for (let i = 0; i < n; i++) { wE[i] = A * gss(r1); wX[i] = A * gss(r1); }
  const ma = L.losReqMetrics(P, wE, wX, fs, { skip: 20 }), exA = A * Math.sqrt(1 - 1 / NE);
  const tone = (fq, ph) => { const e = new Float64Array(n), x = new Float64Array(n); for (let i = 0; i < n; i++) { e[i] = A * Math.sin(TAU * fq * i / fs + ph); x[i] = 1e-9 * Math.sin(0.37 * i); } return L.losReqMetrics(P, e, x, fs, { skip: 20 }); };
  const sincT = (fq) => { const z = Math.PI * fq * Te; return Math.sin(z) / z; };
  const mb = tone(49.3, 0.3), exB = A / Math.SQRT2 * Math.sqrt(1 - sincT(49.3) ** 2);
  const s50 = sincT(50), exC = A / Math.SQRT2 * Math.sqrt(1 - s50 ** 2), loC = A / Math.SQRT2 * Math.sqrt(1 - 2 * s50 ** 2), hiC = A / Math.SQRT2;
  const tdC = [], psdC = []; for (let k = 0; k < 12; k++) { const mc = tone(50, k * Math.PI / 12); tdC.push(mc.exp.tdEl); psdC.push(mc.exp.el); }
  const rmsTd = Math.sqrt(tdC.reduce((a, v) => a + v * v, 0) / tdC.length), mn = Math.min(...tdC), mx = Math.max(...tdC);
  const e = [rel(ma.exp.tdEl, exA), rel(ma.exp.el, exA), rel(mb.exp.tdEl, exB), rel(mb.exp.el, exB), rel(rmsTd, exC), Math.max(...psdC.map(v => rel(v, exC))), rel(mn, loC), rel(mx, hiC)];
  const u = (x) => f(x * 1e6, 4);
  add('G', 'G4', 'Pozlama içi jitter: zaman alanı ↔ PSD', `T_e = ${Te * 1e3} ms, 50 fps, 2 kHz: (a) beyaz gürültü σ = 2 µrad; (b) 2 µrad, 49,3 Hz ton (kare hızına kilitli değil); (c) 2 µrad, 50 Hz ton, 12 faz (kare hızına kilitli)`,
    `(a) σ·√(1 − 1/N) = ${u(exA)}; (b) (A/√2)·√(1 − sinc²) = ${u(exB)}; (c) PSD = faz ortalaması ${u(exC)}, zaman alanı faza bağlı ${u(loC)}…${u(hiC)} µrad`,
    `(a) zaman ${u(ma.exp.tdEl)}, PSD ${u(ma.exp.el)}; (b) ${u(mb.exp.tdEl)} / ${u(mb.exp.el)}; (c) zaman ${u(mn)}…${u(mx)} (fazlar üzerinden karesel ortalama ${u(rmsTd)}), PSD ${u(Math.min(...psdC))}…${u(Math.max(...psdC))} µrad`,
    '±%1', Math.max(...e) <= 0.01, { detail: 'Kare hızına kilitli tonda (ör. 50 Hz yardımcı makine, 50 fps kamera) her kare tonun aynı fazını görür; gerçekleşen pozlama içi jitter faza göre faz ortalamasının 0,57–1,30 katıdır. Karar değeri PSD\'den (faz ortalaması) alınır; kilitli tonlarda en kötü durum tonun tam RMS\'idir. Bu, işletme kayıtlarında zaman alanı ile PSD kestirimi arasındaki eksene göre değişen ±%5 farkın nedenidir.' });
}

if (run('G5')) {
  // v13.12 (§12): T1.9'un PPV/σ için yazdığı Gauss beklentisi (Rice: 2·√(2 ln(ν0·n_W·T_w)), ν0 = √(m2/m0) Welch tayfından) ↔ aynı tayfta
  // Gauss sürecin ölçülen PPV/σ'sı (losReqMetrics; 645 s, 2 kHz, 0,1 Hz sıfır fazlı yüksek geçiren, 60 s pencere), dört gerçekleşme ortalaması
  const P = full('sub'), fs0 = 2000, N = Math.round(645 * fs0), rows = []; let worst = 0;
  for (const [nm, hp, lp] of [['dar 0,2–2,5 Hz', 0.2, 2.5], ['geniş 0,5–400 Hz', 0.5, 400]]) {
    const rr = [], gg = [];
    for (let k = 0; k < 4; k++) {
      const rngf = (key) => new L.RNG(L.hash32(5000 + 17 * k, key.length * 131 + key.charCodeAt(0)));
      const ce = L.makeComponent({ type: 'noise', axis: 0, rms: 3e-6, hp, lp, stream: 'g5e' }, fs0, rngf), cx = L.makeComponent({ type: 'noise', axis: 1, rms: 3e-6, hp, lp, stream: 'g5x' }, fs0, rngf);
      const el = new Float64Array(N), xel = new Float64Array(N); for (let i = 0; i < N; i++) { el[i] = ce.value(i / fs0); xel[i] = cx.value(i / fs0); }
      const m = L.losReqMetrics(P, el, xel, fs0, { skip: 20 }); rr.push((m.rEl + m.rXel) / 2); gg.push((m.gauss.el + m.gauss.xel) / 2);
    }
    const mr = rr.reduce((x, y) => x + y, 0) / rr.length, mg = gg.reduce((x, y) => x + y, 0) / gg.length, e = mr / mg - 1; worst = Math.max(worst, Math.abs(e));
    rows.push(`${nm}: ölçülen ${f(mr, 2)} (${rr.map(v => f(v, 2)).join(', ')}) / Rice ${f(mg, 2)} (${f(100 * e, 1)} %)`);
  }
  add('G', 'G5', 'PPV/σ için Gauss beklentisi (Rice) ↔ Gauss süreç (v13.12)', 'iki tayf (dar 0,2–2,5 Hz, geniş 0,5–400 Hz), σ = 3 µrad, 645 s, 2 kHz; T1.9 ön işlemi (0,1 Hz sıfır fazlı yüksek geçiren, 60 s pencerede doğrusal trend); dört gerçekleşme',
    '2·√(2 ln(ν0·n_W·T_w)), ν0 = √(m2/m0)', rows.join(' · '), '±%6', worst <= 0.06,
    { detail: 'Bağımsız numpy Monte Carlo (k14/limits_ref.py, 100 gerçekleşme) T1.9 takip sonrası tayfıyla 9,14 / 9,24 (tonlu), tonsuz 9,39; yalnız 0,1–2,5 Hz bandıyla 7,24 verir. PPV sınırı 6,5·σ olduğu için σ sınırında Gauss bir artık PPV ölçütünü geçemez.' });
}

if (run('G6')) {
  // v13.17 (§14 K2 c): işletme ayrıştırmasının "dalga çarpması hariç" ek koşusu (aynı tohum, yalnız slap kaynağı kapalı). (i) Diğer
  // kaynakların gerçekleşmesi aynı olmalı: çarpma yalnız roll komutuna girer, Az kalıntısına (σ, PPV) yalnız çapraz kuplajla geçer → ≤ %0,1
  // (rastgele akışlar değişseydi fark tohumlar arası saçılım mertebesinde, yüzdeler düzeyinde olurdu); (ii) çarpmasız
  // kalıntı Gauss olmalı: PPV/σ El kendi tayfının Rice beklentisine ±%15 (tek gerçekleşmenin uç değer saçılımı ≈ %4 sd); (iii) çarpmalı
  // koşuda PPV/σ El beklentinin 2 katından büyük (geçişler PPV'yi belirler).
  const P = full('sub'), D = L.opDecomposition(P, { T: 600, seed: 11 }, null), q = D.req, ns = q.noSlap, ds = (w) => L.decideStat(w, P.ana.los.decide), rows = [];
  let okAz = true, eG = 0, minR = Infinity;
  for (const k of ['pre', 'post']) { const a = q[k], b = ns && ns[k]; if (!a || !b) { okAz = false; continue; }
    const dAz = Math.max(Math.abs(a.ppXel / b.ppXel - 1), Math.abs(ds(a.sXel) / ds(b.sXel) - 1)); okAz = okAz && dAz <= 1e-3;
    const e = b.rEl / b.gauss.el - 1; eG = Math.max(eG, Math.abs(e)); minR = Math.min(minR, a.rEl / a.gauss.el);
    rows.push(`${k === 'pre' ? 'takip öncesi' : 'takip sonrası'}: PPV El ${f(a.ppEl * 1e6, 1)} → ${f(b.ppEl * 1e6, 1)} µrad, PPV/σ El ${f(a.rEl, 2)} → ${f(b.rEl, 2)} (Rice ${f(b.gauss.el, 2)}, ${f(100 * e, 1)} %), Az farkı ${dAz.toExponential(1)}`); }
  add('G', 'G6', 'İşletme: çarpmasız ek koşu yalnız dalga çarpmasını kaldırır, kalıntı Gauss (v13.17)', 'denizaltı varsayılanı, 600 s, tohum 11, bütün kaynaklar; aynı tohumla slap kaynağı kapalı ek koşu (takip öncesi / sonrası)',
    'Az (yalnız çapraz kuplaj): ≤ %0,1; çarpmasız PPV/σ El = Rice ± %15; çarpmalı PPV/σ El > 2 × Rice', rows.join(' · '), '%0,1 · ±%15 · > 2×', okAz && eG <= 0.15 && minR > 2,
    { detail: `Çarpmalı koşuda PPV/σ El en az Rice beklentisinin ${f(minR, 2)} katı: PPV ve P99,73'ü seyrek geçişler belirler. 60 s'lik pencereden çarpma içerenleri atmak uygulanamaz (λ·T_w = ${f(P.env.slap.rate * P.ana.los.Tw, 0)} olay, olaysız pencere olasılığı ${f(100 * Math.exp(-P.env.slap.rate * P.ana.los.Tw), 2)} %); bu yüzden aynı tohumla çarpmasız ek koşu kullanılır.` });
}

if (run('K8')) {
  // v13.14 (§13): Düzenek darbe senaryosunda hexapod'un gerçekleştirdiği tepe θ / ω / α (motor: komut → Osc2 f_bw, ζ 0,7071,
  // 1 kHz, FOH) ↔ bağımsız sürekli zaman çözümü (RK4, 20 kHz) aynı yarım sinüs açı komutuyla; genlik kuralı 0,9·min(θ_max, ω_max·T_p/π,
  // α_max·(T_p/π)²). Yarım sinüs açı darbesinin başında ve sonunda ω sıçradığı için gerçekleşen α, iç tepe kuralının verdiğinin üstündedir.
  const P = full('sub'), hx = P.wb.hex, w = 2 * Math.PI * hx.fbw, z = 0.7071, rows = []; let refMax = 0, Ab = 0;
  const rk = (Tp, A) => { let x = 0, v = 0, t = 0, am = 0, vm = 0, xm = 0; const dt = 5e-5, u = (tt) => (tt >= 0 && tt <= Tp) ? A * Math.sin(Math.PI * tt / Tp) : 0;
    const fn = (tt, x, v) => [v, w * w * (u(tt) - x) - 2 * z * w * v];
    while (t < Tp + 0.4) { const k1 = fn(t, x, v), k2 = fn(t + dt / 2, x + dt / 2 * k1[0], v + dt / 2 * k1[1]), k3 = fn(t + dt / 2, x + dt / 2 * k2[0], v + dt / 2 * k2[1]), k4 = fn(t + dt, x + dt * k3[0], v + dt * k3[1]);
      x += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); t += dt; am = Math.max(am, Math.abs(w * w * (u(t) - x) - 2 * z * w * v)); vm = Math.max(vm, Math.abs(v)); xm = Math.max(xm, Math.abs(x)); }
    return [xm, vm, am]; };
  const ref = [];
  for (const Tp of [0.05, 0.1, 0.2]) { const A = 0.9 * Math.min(hx.theta_max, hx.omega_max * Tp / Math.PI, hx.alpha_max * Math.pow(Tp / Math.PI, 2)), r = rk(Tp, A); ref.push(r);
    rows.push(`T_p ${f(Tp * 1e3, 0)} ms: A ${f(A, 3)}° → α ${f(r[2], 0)} °/s²`); }
  const R = ref.reduce((m, r) => r[2] > m[2] ? r : m, ref[0]), out = L.playScenario(P, { kind: 'slap', T: 60, stab: true }, null), b = out.metrics.base[0];
  const e = Math.max(Math.abs(b.th / R[0] - 1), Math.abs(b.om / R[1] - 1), Math.abs(b.al / R[2] - 1));
  add('K', 'K8', 'Düzenek: hexapod\'un gerçekleştirdiği darbe tepeleri (v13.14)', 'yarım sinüs açı darbesi (roll, T_p 50 / 100 / 200 ms, A = 0,9·min(θ_max, ω_max·T_p/π, α_max·(T_p/π)²)); hexapod 2. derece f_bw 20 Hz, ζ 0,7071: motorun oynatma metriği ↔ sürekli zaman RK4 (20 kHz)',
    `${rows.join(' · ')}; en büyük θ ${f(R[0], 3)}°, ω ${f(R[1], 2)} °/s, α ${f(R[2], 1)} °/s²`, `θ ${f(b.th, 3)}°, ω ${f(b.om, 2)} °/s, α ${f(b.al, 1)} °/s² (komutun sayısal türevi: ${f(b.cmd.al, 0)} °/s²)`, '±%1', e <= 0.01,
    { detail: `Sınır α_max ${hx.alpha_max} °/s²: 200 ms'lik darbe sınırın ${f(R[2] / hx.alpha_max, 2)} katına çıkar (iç tepe kuralı ${f(0.9 * hx.alpha_max, 0)} °/s² verirdi); 100 ms ${f(ref[1][2] / hx.alpha_max, 2)} kat, 50 ms ${f(ref[0][2] / hx.alpha_max, 2)} kat. Komutun sayısal türevi hız sıçramasında örnekleme hızına bağlıdır (Δω·f_s). Aynı profil T2.4'te kullanılır.` });
}

// v13.15 (§14): yinelenen kimlik denetimi (v13.14'te K7 iki kez verilmişti; tablo ve sayılar kimliğe göre okunur)
{ const seen = new Map(); for (const o of OUT) seen.set(o.id, (seen.get(o.id) || 0) + 1); const dup = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  if (dup.length) { console.log(`\nUYARI: yinelenen V&V kimliği: ${dup.join(', ')}`); process.exitCode = 1; } }
const pass = OUT.filter(o => o.pass).length;
console.log(`\n${pass}/${OUT.length} doğrulama geçti (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
const file = path.join(__dirname, only ? 'vv_partial.json' : 'vv.json');
fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), engine: 'v3', items: OUT, elapsed: (Date.now() - T0) / 1000 }, null, 1));
