// §6 (ölçüm zinciri ve belirsizlik) — analitik tarama: motordan bağımsız ikinci uygulama ↔ motor (turInfo, uncertaintySheet,
// pixPhaseInfo), 15 durum. Bağımsız taraf yalnız parametre tablosunu okur: IFOV = p/f, W = k_wander·IFOV, S = k_smear·IFOV,
// U kalemleri, karesel toplamlar, TUR (k = 1 / Z540.3), taban sınırı, şişme, senkron fazı (Δt ve Δt + τ_g), kayıt istatistiği
// (Hann %50 örtüşme ρ sayısal pencereden), piksel fazı kazancı ve T0.2'nin bu koşulda beklenen zincir tabanı.
// Çıktı: sweep.json + konsol tablosu (doc §6 değişim tablosu için).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const TAU = 2 * Math.PI;
// ---- bağımsız uygulama
function indep(P) {
  const wb = P.wb, ch = wb.chain, u = wb.unc, C = wb.channels.find(c => c.name === wb.refChannel);
  const IF = C.p_um / C.f_mm * 1e3;                         // µrad
  const W = wb.k_wander * IF, S = wb.k_smear * IF;          // µrad
  const U = { U01: ch.centroid_px * IF, U02: ch.air, U03: wb.hex.microvib, U04: ch.imu_noise, U05v: ch.scale_eps * W, U05h: ch.scale_eps * S, U06: ch.pixlock_px * IF, U07: ch.ac_noise };
  const rss = (...a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const uv = rss(U.U01, U.U02, U.U03, U.U05v, U.U06), uh = rss(U.U02, U.U03, U.U04, U.U05h, U.U07);
  const uvA = rss(U.U01, U.U02, U.U03, U.U06), uhA = rss(U.U02, U.U03, U.U04, U.U07);
  const m = /^Z540/.test(String(wb.TUR_def)) ? wb.k_exp : 1;
  const fb = wb.hex.fbw, dt = ch.dt_sync_ms * 1e-3, gd = Math.SQRT2 / (TAU * ch.imu_bw);
  const Tseg = u.perSeg / u.fmin, nd = Math.max(1, Math.floor(2 * u.Trec / Tseg - 1));
  const N = 2048; let so = 0, s2 = 0; for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(TAU * i / N); s2 += w * w; if (i >= N / 2) { const w2 = 0.5 - 0.5 * Math.cos(TAU * (i - N / 2) / N); so += w * w2; } }
  const rho = so / s2;
  const a = Math.SQRT2 * ch.pixlock_px, fr = (x) => ((x % 1) + 1) % 1, g = (ph) => 1 + TAU * a * Math.cos(TAU * fr(ph));
  const gX = g(P.dut.video.x0), gY = g(P.dut.video.y0);
  return { IF, W, S, U, uv, uh, uvA, uhA, turW: W / (m * uv), turS: S / (m * uh), maxFloor: W / (wb.TUR_target * m),
    inflW: Math.sqrt(1 + (uv / W) ** 2) - 1, inflS: Math.sqrt(1 + (uh / S) ** 2) - 1,
    phase: 360 * fb * dt, diffErr: 2 * Math.sin(Math.PI * fb * dt), gd, phaseTot: 360 * fb * (dt + gd), diffErrTot: 2 * Math.sin(Math.PI * fb * (dt + gd)),
    Tmin: u.Nper / u.fmin, Tseg, nd, epsR0: 1 / Math.sqrt(nd), epsR: Math.sqrt((1 + 2 * rho * rho * (1 - 1 / nd)) / nd), rho,
    gX, gY, gMin: 1 - TAU * a, gMax: 1 + TAU * a, expEl: rss(U.U01, gY * U.U02), expXel: rss(U.U01, gX * U.U02) };
}
function engine(P) {
  const ti = L.turInfo(P), us = L.uncertaintySheet(P), pp = L.pixPhaseInfo(P, null), d = L.derive(P), ch = P.wb.chain;
  const Uo = Object.fromEntries(ti.U.map(q => [q.id, q]));
  const U01 = ch.centroid_px * d.IFOV * 1e6;
  return { IF: d.IFOV * 1e6, W: d.req.wander * 1e6, S: d.req.smear * 1e6,
    U: { U01: Uo['U-01'].v, U02: Uo['U-02'].v, U03: Uo['U-03'].v, U04: Uo['U-04'].v, U05v: Uo['U-05'].v, U05h: Uo['U-05'].vh, U06: Uo['U-06'].v, U07: Uo['U-07'].v },
    uv: ti.uv, uh: ti.uh, uvA: ti.uvAdd, uhA: ti.uhAdd, turW: ti.turW, turS: ti.turS, maxFloor: ti.maxFloor, inflW: us.inflW, inflS: us.inflS,
    phase: us.phase, diffErr: us.diffErr, gd: us.gd, phaseTot: us.phaseTot, diffErrTot: us.diffErrTot, Tmin: us.Tmin, Tseg: us.Tseg, nd: us.nd, epsR0: us.epsR0, epsR: us.epsR,
    gX: pp.gX, gY: pp.gY, gMin: 2 - pp.gMax, gMax: pp.gMax, expEl: Math.hypot(U01, pp.gY * ch.air), expXel: Math.hypot(U01, pp.gX * ch.air) };
}
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const cases = [
  ['varsayılan (denizaltı, MWIR-NFOV)', mk()],
  ['gemi', mk('ship')],
  ['referans kanal MWIR-WFOV (IFOV 240)', mk(null, P => { P.wb.refChannel = 'MWIR-WFOV'; })],
  ['referans kanal HDTV-NFOV (IFOV 11,5)', mk(null, P => { P.wb.refChannel = 'HDTV-NFOV'; })],
  ['centroid 0,06 px', mk(null, P => { P.wb.chain.centroid_px = 0.06; })],
  ['hava 3 µrad', mk(null, P => { P.wb.chain.air = 3; })],
  ['piksel fazı 0,05 px', mk(null, P => { P.wb.chain.pixlock_px = 0.05; })],
  ['IMU gürültüsü 2 µrad', mk(null, P => { P.wb.chain.imu_noise = 2; })],
  ['otokolimatör gürültüsü 2 µrad', mk(null, P => { P.wb.chain.ac_noise = 2; })],
  ['ölçek ε 0,02', mk(null, P => { P.wb.chain.scale_eps = 0.02; })],
  ['senkron Δt 2 ms', mk(null, P => { P.wb.chain.dt_sync_ms = 2; })],
  ['IMU bandı 100 Hz', mk(null, P => { P.wb.chain.imu_bw = 100; })],
  ['TUR tanımı Z540.3 (k = 2)', mk(null, P => { P.wb.TUR_def = 'Z540.3'; P.wb.k_exp = 2; })],
  ['hedef TUR 10', mk(null, P => { P.wb.TUR_target = 10; })],
  ['masa mikro-titreşimi 5 µrad', mk(null, P => { P.wb.hex.microvib = 5; })],
  ['kayıt 300 s, f_min 0,1 Hz', mk(null, P => { P.wb.unc.Trec = 300; P.wb.unc.fmin = 0.1; })],
  ['hedef noktası x0 = y0 = 0', mk(null, P => { P.dut.video.x0 = 0; P.dut.video.y0 = 0; })],
];
let worst = 0, where = '', nNum = 0;
const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object') ? flat(v, pre + k + '.') : [[pre + k, v]]);
const rows = [];
for (const [nm, P] of cases) {
  const A = indep(P), E = engine(P), fa = Object.fromEntries(flat(A));
  for (const [k, v] of flat(E)) {
    const r = fa[k]; if (r == null) continue; nNum++;
    const e = Math.abs(v - r) / Math.max(Math.abs(r), 1e-300);
    if (e > worst) { worst = e; where = `${nm} · ${k}`; }
  }
  rows.push({ nm, A });
  console.log(`${nm.padEnd(38)} u_v ${f(A.uv, 2)} u_h ${f(A.uh, 2)} | TUR W ${f(A.turW, 2)} S ${f(A.turS, 2)} | taban ≤ ${f(A.maxFloor, 2)} | şişme %${f(100 * A.inflW, 2)}/%${f(100 * A.inflS, 2)} | faz ${f(A.phase, 2)}° → ${f(A.phaseTot, 2)}° (fark %${f(100 * A.diffErrTot, 1)}) | n_d ${A.nd} ε_r ${f(A.epsR, 3)} (${f(A.epsR0, 3)}) | g ${f(A.gX, 3)}/${f(A.gY, 3)} [${f(A.gMin, 3)}–${f(A.gMax, 3)}] | T0.2 beklenen ${f(A.expEl, 2)}/${f(A.expXel, 2)}`);
}
console.log(`\nmotor ↔ bağımsız: ${nNum} sayı, en büyük göreli fark ${worst.toExponential(2)} (${where}); Hann %50 ρ = ${f(rows[0].A.rho, 6)}`);
require('fs').writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify({ worst, where, nNum, rows }, null, 1));
