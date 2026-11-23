// §7 Dünya dönüşü — test yanıtları: T0.7 (KAPALI hız ↔ hesap, AÇIK artık ↔ sınır) parametre değişimleriyle; AÇIK koşunun kayma
// ayrıştırması (dr_e: kompanzasyon artığı Ω̂ − Ω, dr_b: gyro bias'ı) ve bağımsız beklenen izdüşüm (Δ·u, Δ·h); kompanzasyon kapalıyken
// uzun testlerin durumu. Çıktı: earth.json, konsol özeti.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const D2R = Math.PI / 180;
const mk = (fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return P; };
const slope = (t, y) => { const n = t.length, tm = t.reduce((a, b) => a + b, 0) / n, ym = y.reduce((a, b) => a + b, 0) / n; let a = 0, b = 0; for (let i = 0; i < n; i++) { a += (t[i] - tm) * (y[i] - ym); b += (t[i] - tm) ** 2; } return a / b; };
// bağımsız: ENU, LOS ℓ, görüntü ekseni sağ h = ẑ×ℓ/|·| (yatay), yukarı u = ℓ×h; kompanzasyon hatası Δ ∥ ℓ×Ω, |Δ| = Ω·δ
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
];
const out = { t07: [], longOff: [] };
for (const [nm, P] of cases) {
  const t0 = Date.now(), ctx = {};
  const r = L.runTest('T0.7', P, ctx, null), n = r.num, X = expectProj(P);
  // AÇIK koşunun kayma ayrıştırması (aynı tohum ve süre)
  const S = L.labScenario(P, { label: 'k9 AÇIK', T: P.wb.unc.Trec + 3, fs: 2000, earthComp: true, seed: 702, meas: { video: false, ac: false, imu: false, air: false, microvib: false, noise: false },
    rec: { fs: 20, ch: ['opt_el', 'opt_xel', 'dr_e_el', 'dr_e_xel', 'dr_b_el', 'dr_b_xel'] } });
  const R = L.runSim(P, S), tt = Array.from({ length: R.meta.nRec }, (_, i) => i / R.meta.fRec), i0 = Math.round(3 * R.meta.fRec);
  const sl = (ch) => slope(tt.slice(i0), Array.from(R.rec[ch].subarray(i0)));
  const dec = { eEl: sl('dr_e_el'), eXel: sl('dr_e_xel'), bEl: sl('dr_b_el'), bXel: sl('dr_b_xel'), optEl: sl('opt_el'), optXel: sl('opt_xel') };
  const o = { nm, st: r.status, offH: Math.abs(n.offH), offV: Math.abs(n.offV), calcH: n.calcH, calcV: n.calcV, onH: Math.abs(n.onH), onV: Math.abs(n.onV), limOn: n.limOn, X, dec, s: (Date.now() - t0) / 1000 };
  out.t07.push(o);
  const u = (x, d = 3) => f(x * 1e6, d);
  console.log(`${nm} [${f(o.s, 0)} s] T0.7 ${o.st}`);
  console.log(`  KAPALI ${u(o.offH, 2)} / ${u(o.offV, 2)} µrad/s (hesap ${u(o.calcH, 2)} / ${u(o.calcV, 2)}; bağımsız ${u(X.offH, 2)} / ${u(X.offV, 2)}; roll ${u(X.roll, 2)})`);
  console.log(`  AÇIK ${u(o.onH)} / ${u(o.onV)} µrad/s (sınır ${u(o.limOn)}); beklenen kompanzasyon artığı yatay / düşey ${u(X.resH)} / ${u(X.resV)} (|Δ| ${u(X.resMag)})`);
  console.log(`  ayrıştırma (gürültüsüz koşu): artık el / xel ${u(Math.abs(dec.eEl))} / ${u(Math.abs(dec.eXel))} · bias el / xel ${u(dec.bEl)} / ${u(dec.bXel)} · gerçek LOS ${u(dec.optEl)} / ${u(dec.optXel)} µrad/s`);
}
// kompanzasyon kapalı: uzun testler (hedef ≈ 367 s'de alandan çıkar)
for (const [nm, P] of [['kompanzasyon KAPALI', mk(P => { P.wb.earth.comp = false; })]]) {
  const ctx = {}; L.runTest('T0.1', P, ctx, null);
  for (const id of ['T1.1', 'T1.3', 'T1.4', 'T2.3', 'T1.9', 'T1.7']) {
    const t0 = Date.now(), r = L.runTest(id, P, ctx, null);
    const kvF = (r.kv || []).filter(([k]) => /FOV|alanda|kalma|kilid|geçerli|GEÇERSİZ/i.test(k)).map(([k, v]) => k + ': ' + v).join(' | ');
    out.longOff.push({ nm, id, st: r.status, measured: r.measured, kv: kvF, notes: (r.notes || []).filter(n => /alan|FOV|dünya|kompanzasyon/i.test(n)) });
    console.log(`${nm} ${id} ${r.status} [${f((Date.now() - t0) / 1000, 0)} s]: ${String(r.measured).slice(0, 220)}`);
    if (kvF) console.log('   ' + kvF.slice(0, 300));
  }
}
require('fs').writeFileSync(path.join(__dirname, 'earth.json'), JSON.stringify(out, null, 1));
