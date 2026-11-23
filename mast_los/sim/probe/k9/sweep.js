// §7 Dünya dönüşü — analitik tarama: motordan bağımsız ikinci uygulama ↔ motor (earthSheet, derive().earthImg, earthLimits,
// computeBudget drift alanları), 21 durum. Bağımsız taraf: ENU'da Ω = Ω[0, cos φ, sin φ], LOS ℓ, görüntü eksenleri h = ẑ×ℓ/|·|
// (yatay), u = ℓ×h (yukarı); yatay kayma |Ω·u|, düşey |Ω·h|, LOS etrafında |Ω·ℓ|. Üçüncü yol: ℓ'nin Rodrigues dönüşüyle (−Ω, 1 s)
// sonlu farkı. Ayrıca çıkış süresi (kenar payıyla), kompanzasyon artığı, T0.7 eşikleri ve bütçe drift terimleri.
// Çıktı: sweep.json + konsol tablosu (doc §7 değişim tablosu için).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const D2R = Math.PI / 180, DPH = Math.PI / 180 / 3600;
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = (a) => Math.hypot(...a);
function rodrigues(v, k, th) {   // v'yi birim k ekseni etrafında th döndür
  const c = Math.cos(th), s = Math.sin(th), kv = cr(k, v), kd = dot(k, v);
  return [0, 1, 2].map(i => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
}
function indep(P) {
  const wb = P.wb, E = wb.earth, ch = wb.channels.find(c => c.name === wb.refChannel), IF = ch.p_um / ch.f_mm * 1e-3, eg = P.ana.edgeMargin_px;
  const ph = E.lat * D2R, Om = E.Omega, W = [0, Om * Math.cos(ph), Om * Math.sin(ph)];
  const rates = (azDeg) => {
    const al = azDeg * D2R, ep = E.el * D2R, l = [Math.sin(al) * Math.cos(ep), Math.cos(al) * Math.cos(ep), Math.sin(ep)];
    let h = cr([0, 0, 1], l); const hn = nrm(h); h = hn > 1e-12 ? h.map(x => x / hn) : [1, 0, 0];
    const u = cr(l, h);
    return { h: Math.abs(dot(W, u)), v: Math.abs(dot(W, h)), r: Math.abs(dot(W, l)), l, hx: h, ux: u };
  };
  const R0 = rates(E.az);
  // üçüncü yol: laboratuvara göre eylemsiz LOS, −Ω etrafında 1 s döner; görüntü eksenlerine izdüşen açı değişimi
  const Wn = nrm(W), l1 = rodrigues(R0.l, W.map(x => -x / Wn), Wn * 1);
  const fdH = Math.abs(dot(l1, R0.hx)), fdV = Math.abs(dot(l1, R0.ux));     // ℓ'nin yatay eksene izdüşümü yatay kaymadır
  const exitT = (h, v) => Math.min(h > 0 ? (ch.Nh / 2 - eg) * IF / h : 1e9, v > 0 ? (ch.Nv / 2 - eg) * IF / v : 1e9);
  const comp = Om * E.delta_deg * D2R, tau = wb.tau, Trec = wb.unc.Trec;
  const H = wb.H, ext = wb.extRows !== false;
  const biasDph = H.bias + (ext ? (H.b0_res || 0) + Math.abs((H.tc_bias || 0) * (H.dT || 0)) : 0);
  const E96 = H.arw * D2R / 60 * 1e6 * Math.sqrt(tau), E99 = H.bias * DPH * 1e6 * tau, E119 = comp * 1e6, E120 = E119 * tau;
  const Eb0 = ext ? ((H.b0_res || 0) + Math.abs((H.tc_bias || 0) * (H.dT || 0))) * DPH * 1e6 * tau : 0;
  const tab = []; for (let a = 0; a < 360; a += 30) { const q = rates(a); tab.push({ h: q.h * 1e6, v: q.v * 1e6, r: q.r * 1e6, max: Math.max(q.h, q.v) * 1e6, px2: Math.max(q.h, q.v) * 120 / IF, pxRec: Math.max(q.h, q.v) * Trec / IF }); }
  const tOffExit = Math.min(ch.Nh / 2 * IF / Math.max(R0.h, 1e-12), ch.Nv / 2 * IF / Math.max(R0.v, 1e-12));
  return { h: R0.h * 1e6, v: R0.v * 1e6, r: R0.r * 1e6, fdH: fdH * 1e6, fdV: fdV * 1e6, comp: comp * 1e6,
    offDrift: Math.max(R0.h, R0.v) * 1e6 * tau, offExit: exitT(R0.h, R0.v), offPxH: R0.h * Trec / IF, offPxV: R0.v * Trec / IF, offPx2: Math.max(R0.h, R0.v) * 120 / IF,
    onDrift: comp * 1e6 * tau, onExit: exitT(comp, comp), onPxH: comp * Trec / IF, onPx2: comp * 120 / IF,
    limOn: (comp + biasDph * DPH) * 1e6, tolH: (0.1 * R0.h + biasDph * DPH) * 1e6, tolV: (0.1 * R0.v + biasDph * DPH) * 1e6, tOff: Math.min(120, 0.8 * tOffExit),
    E96, E99, E119, E120, Eb0, drift: Math.sqrt(E96 * E96 + (E99 + Eb0 + E120) ** 2), driftReq: wb.drift_ifov * IF * 1e6, tab };
}
function engine(P) {
  const es = L.earthSheet(P), d = L.derive(P), el = L.earthLimits(P), b = L.computeBudget(P, null);
  return { h: es.h, v: es.v, r: es.r, fdH: d.earthImg.h * 1e6, fdV: d.earthImg.v * 1e6, comp: es.comp,
    offDrift: es.off.drift, offExit: es.off.exit, offPxH: es.off.pxH, offPxV: es.off.pxV, offPx2: es.off.px2,
    onDrift: es.on.drift, onExit: es.on.exit, onPxH: es.on.pxH, onPx2: es.on.px2,
    limOn: el.on * 1e6, tolH: el.offTol(d.earthImg.h) * 1e6, tolV: el.offTol(d.earthImg.v) * 1e6,
    tOff: Math.min(120, 0.8 * Math.min(d.Nh / 2 * d.IFOV / Math.max(d.earthImg.h, 1e-12), d.Nv / 2 * d.IFOV / Math.max(d.earthImg.v, 1e-12))),
    E96: b.E96, E99: b.E99, E119: b.E119, E120: b.E120, Eb0: b.Eb0, drift: b.drift, driftReq: b.driftReq,
    tab: es.tab.map(t => ({ h: t.h, v: t.v, r: t.r, max: t.max, px2: t.px2, pxRec: t.pxRec })) };
}
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const cases = [
  ['varsayılan (φ 40°, α 90°, ε 0°, δ 1°)', mk()], ['gemi', mk('ship')],
  ['enlem 0°', mk(null, P => { P.wb.earth.lat = 0; })], ['enlem 80°', mk(null, P => { P.wb.earth.lat = 80; })], ['enlem −40° (güney)', mk(null, P => { P.wb.earth.lat = -40; })],
  ['α 0° (kuzey)', mk(null, P => { P.wb.earth.az = 0; })], ['α 45°', mk(null, P => { P.wb.earth.az = 45; })], ['α 180°', mk(null, P => { P.wb.earth.az = 180; })], ['α 270°', mk(null, P => { P.wb.earth.az = 270; })],
  ['ε 30°', mk(null, P => { P.wb.earth.el = 30; })], ['ε 60°', mk(null, P => { P.wb.earth.el = 60; })], ['ε 89,9°', mk(null, P => { P.wb.earth.el = 89.9; })],
  ['δ 0,1°', mk(null, P => { P.wb.earth.delta_deg = 0.1; })], ['δ 5°', mk(null, P => { P.wb.earth.delta_deg = 5; })],
  ['referans kanal MWIR-WFOV', mk(null, P => { P.wb.refChannel = 'MWIR-WFOV'; })], ['referans kanal HDTV-NFOV', mk(null, P => { P.wb.refChannel = 'HDTV-NFOV'; })],
  ['kayıt 300 s', mk(null, P => { P.wb.unc.Trec = 300; })], ['drift penceresi τ 10 s', mk(null, P => { P.wb.tau = 10; })],
  ['ek bütçe satırları kapalı', mk(null, P => { P.wb.extRows = false; })], ['gyro bias varsayımı 0,2 °/h', mk(null, P => { P.wb.H.bias = 0.2; })],
  ['FOG sıcaklık katsayısı 0,002 °/h/°C', mk(null, P => { P.wb.H.tc_bias = 0.002; })],
];
let worst = 0, where = '', nNum = 0, fdWorst = 0;
const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object') ? flat(v, pre + k + '.') : [[pre + k, v]]);
const rows = [];
for (const [nm, P] of cases) {
  const A = indep(P), E = engine(P), fa = Object.fromEntries(flat(A));
  for (const [k, v] of flat(E)) {
    const r = fa[k]; if (r == null) continue;
    if (k === 'fdH' || k === 'fdV') { fdWorst = Math.max(fdWorst, Math.abs(v - r)); continue; }     // sonlu fark: ikinci derece terim (Ω²·t²/2)
    nNum++;
    const e = Math.abs(v - r) / Math.max(Math.abs(r), 1e-9);
    if (e > worst) { worst = e; where = `${nm} · ${k}`; }
  }
  rows.push({ nm, A });
  console.log(`${nm.padEnd(38)} yatay/düşey/roll ${f(A.h, 2)} / ${f(A.v, 2)} / ${f(A.r, 2)} µrad/s (sonlu fark ${f(A.fdH, 2)} / ${f(A.fdV, 2)}) | çıkış ${f(A.offExit, 0)} s | 120 s'de ${f(A.offPx2, 1)} px | AÇIK Ω·δ ${f(A.comp, 3)}, eşik ${f(A.limOn, 3)} | drift(τ) ${f(A.drift, 2)} / ${f(A.driftReq, 0)} µrad (E120 ${f(A.E120, 2)}, Eb0 ${f(A.Eb0, 2)})`);
}
console.log(`\nmotor ↔ bağımsız: ${nNum} sayı, en büyük göreli fark ${worst.toExponential(2)} (${where}); Rodrigues sonlu farkı (1 s) ↔ izdüşüm en büyük mutlak fark ${fdWorst.toExponential(2)} µrad/s`);
require('fs').writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify({ worst, where, nNum, fdWorst, rows }, null, 1));
