// §7 Dünya dönüşü — düzeltmeler sonrası T0.7 yanıtları (v13.7 motoru): KAPALI mutlak tolerans (%10·hesap + bias payı), AÇIK eşik
// Ω·δ + (H.bias + b0_res + |tc·ΔT|); motorun kendi ayrıştırması (num.dec) ve bağımsız beklenen izdüşüm. Çıktı: earth2.json + konsol.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const D2R = Math.PI / 180;
const mk = (fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return P; };
function expectProj(P) {
  const E = P.wb.earth, ph = E.lat * D2R, al = E.az * D2R, ep = E.el * D2R, Om = E.Omega;
  const W = [0, Om * Math.cos(ph), Om * Math.sin(ph)], l = [Math.sin(al) * Math.cos(ep), Math.cos(al) * Math.cos(ep), Math.sin(ep)];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = (a) => Math.hypot(...a);
  let h = cr([0, 0, 1], l); const hn = nrm(h); h = hn > 1e-12 ? h.map(v => v / hn) : [1, 0, 0];
  const u = cr(l, h);
  let D = cr(l, W); const dn = nrm(D); D = dn > 1e-15 ? D.map(v => v / dn * Om * E.delta_deg * D2R) : [0, 0, Om * E.delta_deg * D2R];
  return { offH: Math.abs(dot(W, u)), offV: Math.abs(dot(W, h)), roll: Math.abs(dot(W, l)), resH: Math.abs(dot(D, u)), resV: Math.abs(dot(D, h)), resMag: nrm(D) };
}
const cases = [
  ['varsayılan (φ 40°, α 90°, ε 0°, δ 1°)', mk()],
  ['δ 0,1°', mk(P => { P.wb.earth.delta_deg = 0.1; })],
  ['δ 5°', mk(P => { P.wb.earth.delta_deg = 5; })],
  ['enlem 0°', mk(P => { P.wb.earth.lat = 0; })],
  ['enlem 80°', mk(P => { P.wb.earth.lat = 80; })],
  ['kolimatör yönü α 0° (kuzey)', mk(P => { P.wb.earth.az = 0; })],
  ['α 45°', mk(P => { P.wb.earth.az = 45; })],
  ['LOS elevasyonu 45°', mk(P => { P.wb.earth.el = 45; })],
  ['gyro sabit bias 0', mk(P => { P.dut.gyro.bias0 = 0; })],
  ['kayıt 300 s', mk(P => { P.wb.unc.Trec = 300; })],
  ['ek bütçe satırları kapalı (eski eşik)', mk(P => { P.wb.extRows = false; })],
];
const out = [];
for (const [nm, P] of cases) {
  const t0 = Date.now(), r = L.runTest('T0.7', P, {}, null), n = r.num, X = expectProj(P), u = (x, d = 3) => f(x * 1e6, d);
  const o = { nm, st: r.status, offH: Math.abs(n.offH), offV: Math.abs(n.offV), calcH: n.calcH, calcV: n.calcV, tolH: n.offTolH, tolV: n.offTolV,
    onH: Math.abs(n.onH), onV: Math.abs(n.onV), limOn: n.limOn, dec: n.dec, X, s: (Date.now() - t0) / 1000 };
  o.devH = Math.abs(o.offH - o.calcH); o.devV = Math.abs(o.offV - o.calcV);
  out.push(o);
  console.log(`${nm} [${f(o.s, 0)} s] T0.7 ${o.st}`);
  console.log(`  KAPALI ${u(o.offH, 2)} / ${u(o.offV, 2)} µrad/s; hesap ${u(o.calcH, 2)} / ${u(o.calcV, 2)}; |fark| ${u(o.devH)} / ${u(o.devV)} ≤ tolerans ${u(o.tolH)} / ${u(o.tolV)} (roll ${u(X.roll, 2)})`);
  console.log(`  AÇIK ${u(o.onH)} / ${u(o.onV)} µrad/s ≤ eşik ${u(o.limOn)}; beklenen artık yatay / düşey ${u(X.resH)} / ${u(X.resV)}; ayrıştırma artık el/xel ${u(Math.abs(n.dec.eEl))} / ${u(Math.abs(n.dec.eXel))}, bias el/xel ${u(n.dec.bEl)} / ${u(n.dec.bXel)}`);
}
require('fs').writeFileSync(path.join(__dirname, 'earth2.json'), JSON.stringify(out, null, 1));
