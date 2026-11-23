// §5 PROTOTİP (varsayılanı değiştirmez): kolimatör — göz bebeği kayması, vinyetleme ve kolimasyon hatasının paralaksı.
// Göz bebeği E, gimbal merkezi G'nin L_pg önünde (LOS boyunca); pivot O = E (testlerin kurulumu). Stab ON: LOS laboratuvarda
// sabit, ΔE = R·(G − O) − (G − O) + t; stab OFF: ΔE = R·(E − O) − (E − O) + t = t. Yanal bileşen d_⊥ = ΔE − (ΔE·l̂)l̂.
// Örtüşme: D_p çaplı göz bebeği dairesinin D_c çaplı demet dairesi içinde kalan alan oranı (iki daire kesişimi).
// Paralaks: kolimatör çıkışı sonlu R'deki sanal kaynaktan geliyorsa hedef doğrultusu −d_⊥/R kayar (LOS hatasına +d_⊥/R).
// Argüman: 'sub' | 'ship'. Çıktı: konsol, coll_<tür>.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', D2R = Math.PI / 180;
const P = L.defaultParams(kind), d = L.derive(P), C = P.wb.coll, Dp = d.ch.Dp_mm * 1e-3, Dc = C.Dc_mm * 1e-3, Lpg = P.dut.L_pg;
const ctx = {}; L.runTest('T0.1', P, ctx, null);
// iki dairenin kesişim alanı / küçük dairenin alanı (r: göz bebeği, Rb: demet, s: merkezler arası)
function overlap(r, Rb, s) {
  if (s >= r + Rb) return 0; if (s <= Rb - r) return 1; if (s <= r - Rb) return (Rb * Rb) / (r * r);
  const a = r * r * Math.acos((s * s + r * r - Rb * Rb) / (2 * s * r)), b = Rb * Rb * Math.acos((s * s + Rb * Rb - r * r) / (2 * s * Rb));
  const c = 0.5 * Math.sqrt((-s + r + Rb) * (s + r - Rb) * (s - r + Rb) * (s + r + Rb));
  return (a + b - c) / (Math.PI * r * r);
}
// laboratuvar geometrisi (03_sim.js ile aynı): kolimatör yönü α_C, LOS0, görüntü eksenleri yr (yatay, xel), zr (yukarı, el); gövde → lab dönüşü β
const a0 = P.dut.geom.a0 * D2R, e0 = (P.dut.geom.e0 != null ? P.dut.geom.e0 : P.wb.earth.el) * D2R, alC = P.wb.earth.az * D2R;
const los0 = [Math.sin(alC) * Math.cos(e0), Math.cos(alC) * Math.cos(e0), Math.sin(e0)];
const beta = Math.atan2(los0[1], los0[0]) - a0, cb = Math.cos(beta), sb = Math.sin(beta);
let yr = [-los0[1], los0[0], 0]; { const n = Math.hypot(yr[0], yr[1]); yr = [yr[0] / n, yr[1] / n, 0]; }
const zr = [los0[1] * yr[2] - los0[2] * yr[1], los0[2] * yr[0] - los0[0] * yr[2], los0[0] * yr[1] - los0[1] * yr[0]];
const losB = [Math.cos(a0) * Math.cos(e0), Math.sin(a0) * Math.cos(e0), Math.sin(e0)], rpg = losB.map(v => -Lpg * v);
const b2l = (v) => [cb * v[0] - sb * v[1], sb * v[0] + cb * v[1], v[2]];
// ΔE (gövde) → görüntü eksenlerinde yanal bileşenler (yatay: yr, düşey: zr)
function pupilShift(ph, th, ps, t, stab) {
  let dE = [t[0], t[1], t[2]];
  if (stab) {
    const cph = Math.cos(ph), sph = Math.sin(ph), cth = Math.cos(th), sth = Math.sin(th), cps = Math.cos(ps), sps = Math.sin(ps);
    const R = [[cps * cth, cps * sth * sph - sps * cph, cps * sth * cph + sps * sph], [sps * cth, sps * sth * sph + cps * cph, sps * sth * cph - cps * sph], [-sth, cth * sph, cth * cph]];
    for (let i = 0; i < 3; i++) dE[i] += R[i][0] * rpg[0] + R[i][1] * rpg[1] + R[i][2] * rpg[2] - rpg[i];
  }
  const l = b2l(dE); return [l[0] * yr[0] + l[1] * yr[1] + l[2] * yr[2], l[0] * zr[0] + l[1] * zr[1] + l[2] * zr[2]];
}
function analyse(label, S, stab) {
  S.rec = { fs: 1000, ch: ['base_r', 'base_p', 'base_y', 'tr_x', 'tr_y', 'tr_z'] };
  const R = L.runSim(P, S), n = R.meta.nRec, rc = R.rec, f = R.meta.fRec;
  let eMax = 0, ovMin = 1, nVig = 0, hMax = 0, vMax = 0; const H = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = [rc.tr_x ? rc.tr_x[i] : 0, rc.tr_y ? rc.tr_y[i] : 0, rc.tr_z ? rc.tr_z[i] : 0];
    const [h, v] = pupilShift(rc.base_r[i], rc.base_p[i], rc.base_y[i], t, stab); H[i] = h; V[i] = v;
    const e = Math.hypot(h, v), ov = overlap(Dp / 2, Dc / 2, e);
    if (i > 20 * f) { eMax = Math.max(eMax, e); ovMin = Math.min(ovMin, ov); if (ov < 1) nVig++; hMax = Math.max(hMax, Math.abs(h)); vMax = Math.max(vMax, Math.abs(v)); }
  }
  const nn = n - 20 * f, req = C.ap_margin * (Dp + 2 * eMax);
  console.log(`${label}: en büyük yanal kayma ${(eMax * 1e3).toFixed(1)} mm (yatay ${(hMax * 1e3).toFixed(1)}, düşey ${(vMax * 1e3).toFixed(1)}); vinyetleme süresi %${(100 * nVig / nn).toFixed(1)}, en düşük örtüşme %${(100 * ovMin).toFixed(1)}; gerekli D_c = k(D_p + 2e) = ${(req * 1e3).toFixed(0)} mm (mevcut ${C.Dc_mm})`);
  return { R, H, V, eMax, ovMin, fVig: nVig / nn, req, f };
}
const out = { kind, Dp, Dc, k: C.ap_margin, eFree: (Dc / C.ap_margin - Dp) / 2, tests: {} };
console.log(`${kind}: D_p ${Dp * 1e3} mm, D_c ${C.Dc_mm} mm, k ${C.ap_margin} → vinyetlemesiz yanal kayma ≤ (D_c/k − D_p)/2 = ${(out.eFree * 1e3).toFixed(1)} mm (k = 1: ${((Dc - Dp) / 2 * 1e3).toFixed(1)} mm); f_c/f ${C.fc_mm / d.ch.f_mm}, iğne deliği ${(C.pinhole_um / C.fc_mm * 1e3).toFixed(1)} µrad = ${(C.pinhole_um / C.fc_mm * 1e-3 / d.IFOV).toFixed(3)} IFOV, görüntüsü ${(C.pinhole_um * d.ch.f_mm / C.fc_mm).toFixed(1)} µm (piksel ${d.ch.p_um} µm)`);
// T1.3 (tohum 1301): deniz profili + kaldıraç kolu ötelemesi; paralaks R = 100 / 30 / 10 km → video wander
{
  const a = analyse('T1.3 (tohum 1301)', L.seaLabScenario(P, { T: 620, seed: 1301 }), true);
  const Rv = L.runSim(P, Object.assign(L.seaLabScenario(P, { T: 620, seed: 1301 }), {}));
  const v = L.videoAngles(Rv, ctx), perWin = Math.round(P.ana.Tw * 50), rows = [];
  for (const Rk of [Infinity, 100e3, 30e3, 10e3, 3e3]) {
    const e = [], x = [], ok = [], pe = [], px = [];
    for (let i = 0; i < v.t.length; i++) if (v.t[i] > 20) { const j = Math.min(a.H.length - 1, Math.round(v.t[i] * a.f)), ce = isFinite(Rk) ? a.V[j] / Rk : 0, cx = isFinite(Rk) ? a.H[j] / Rk : 0;
      e.push(v.el[i] + ce); x.push(v.xel[i] + cx); ok.push(v.ok[i]); pe.push(ce); px.push(cx); }
    const w = (arr) => L.windowedWander(Float64Array.from(arr), Uint8Array.from(ok), perWin, P.ana.detrend).rms;
    rows.push({ R: Rk, el: w(e), xel: w(x), pEl: w(pe), pXel: w(px), pkEl: Math.max(...pe.map(Math.abs)), pkXel: Math.max(...px.map(Math.abs)) });
    const r = rows[rows.length - 1];
    console.log(`   paralaks R = ${isFinite(Rk) ? (Rk / 1e3) + ' km (δ = f_c²/R = ' + (Math.pow(C.fc_mm * 1e-3, 2) / Rk * 1e6).toFixed(0) + ' µm)' : '∞'}: yalnız paralaks wander el ${(r.pEl * 1e6).toFixed(3)} / xel ${(r.pXel * 1e6).toFixed(3)} µrad (tepe ${(r.pkEl * 1e6).toFixed(2)} / ${(r.pkXel * 1e6).toFixed(2)}); T1.3 wander el ${(r.el * 1e6).toFixed(3)} / xel ${(r.xel * 1e6).toFixed(3)} µrad`);
  }
  out.tests.T13 = { eMax: a.eMax, ovMin: a.ovMin, fVig: a.fVig, req: a.req, parallax: rows };
}
// T0.3 uç poz (±θ_test üç eksende, stab ON), T2.1 (1 Hz, erişim genliği), T2.5 öteleme segmentleri, T2.3 (deniz + VIV)
{
  const th = P.wb.hex.theta_test * D2R, S = L.labScenario(P, { label: 'T0.3 uç', T: 20, fs: 2000, stab: true, cmd: [0, 1, 2].map(i => ({ type: 'steps', axis: i, knots: [{ t: 0, v: 0 }, { t: 1, v: th }], trans: 4 })), seed: 301 });
  const a = analyse('T0.3 uç poz +θ_test', S, true); out.tests.T03 = { eMax: a.eMax, ovMin: a.ovMin, req: a.req };
}
{
  const A = d.reach(1) * D2R, S = L.labScenario(P, { label: 'T2.1 1 Hz', T: 30, fs: 2000, stab: true, cmd: [{ type: 'sine', axis: 0, A, f: 1, t0: 1, ramp: 2 }, { type: 'sine', axis: 2, A, f: 1, t0: 1, ramp: 2 }], seed: 2101 });
  const a = analyse('T2.1 türü 1 Hz, erişim genliği (roll + yaw)', S, true); out.tests.T21 = { eMax: a.eMax, ovMin: a.ovMin, req: a.req };
}
{
  const st = P.lab.hexStroke, fq = [{ f: 1, a: 2 }, { f: 2, a: 2 }], cmd = [];
  let t = 1; for (const ax of [0, 2]) for (const q of fq) { const A = Math.min(q.a / Math.pow(2 * Math.PI * q.f, 2), 0.9 * st); cmd.push({ type: 'sine', axis: ax, A, f: q.f, t0: t, t1: t + 12, ramp: 2 }); t += 14; }
  const a = analyse('T2.5 öteleme x ve z (1 ve 2 Hz, 2 m/s²)', L.labScenario(P, { label: 'T2.5', T: t + 1, fs: 2000, cmd: [], trans: cmd, seed: 2510 }), true); out.tests.T25 = { eMax: a.eMax, ovMin: a.ovMin, req: a.req };
}
{
  const a = analyse('T2.3 (deniz + VIV)', L.seaLabScenario(P, { T: 620, seed: 1301, viv: true }), true); out.tests.T23 = { eMax: a.eMax, ovMin: a.ovMin, fVig: a.fVig, req: a.req };
}
require('fs').writeFileSync(path.join(__dirname, `coll_${kind}.json`), JSON.stringify(out, null, 1));
