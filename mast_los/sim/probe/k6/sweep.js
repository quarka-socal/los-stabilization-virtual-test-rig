// §5 analitik tarama (v13.4): hexapod erişimi ve köşe frekansları, Osc2 genlik/faz yanıtı, stab-OFF genlik sınırı, kolimatör
// geometrisi, iki daire örtüşmesi, göz bebeği yanal kayması ve test hareket profillerinden en büyük kayma. Her büyüklük motordan
// bağımsız ikinci bir uygulamayla hesaplanır (motor fonksiyonları yalnız karşılaştırılır):
//   • erişim: min(θ, ω/2πf, α/(2πf)²) doğrudan; köşeler ω/(2πθ), α/(2πω)
//   • Osc2: motorun ayrık süzgecine sinüs sürülür, en küçük kareler genlik/faz ↔ sürekli Butterworth 1/√(1+r⁴)
//   • FOV: 2·atan(N·p/2f); kolimatör oranları elle
//   • örtüşme: kutupsal sayısal integral (Simpson, 4000 halka) ↔ motorun kapalı biçimi
//   • kayma: temel dönüş matrislerinin çarpımı (Rz·Ry·Rx), gövde-dinlenme çerçevesinde E − E0, LOS'a dik izdüşüm (yön tabanından
//     bağımsız büyüklük) ↔ motorun pupilShift'i (β dönüşü + yr/zr izdüşümü); profiller 1 kHz'de (motor 50 Hz) değerlendirilir
//   • paralaks duyarlılığı: kolimatör odak hatası δ → hedef uzaklığı R = f_c²/δ → görünür hedef kayması e/R (motorda yok)
// Kullanım: node sweep.js [sub|ship] → sweep_<plat>.json ve konsol özeti
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const D2R = Math.PI / 180, TAU = 2 * Math.PI;
const plat = process.argv[2] || 'sub';
const set = (P, k, v) => { const a = k.split('.'); let o = P; for (let i = 0; i < a.length - 1; i++) o = o[a[i]]; o[a[a.length - 1]] = v; };
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const CASES = [
  ['varsayılan', {}],
  ['küçük hexapod 10°/20°/s/200°/s²', { 'wb.hex.theta_max': 10, 'wb.hex.omega_max': 20, 'wb.hex.alpha_max': 200 }],
  ['f_bw 10 Hz', { 'wb.hex.fbw': 10 }],
  ['strok ±50 mm', { 'lab.hexStroke': 0.05 }],
  ['stab-OFF payı 0,2', { 'wb.hex.stabOff_ratio': 0.2 }],
  ['θ_test 10°', { 'wb.hex.theta_test': 10 }],
  ['D_c 250 mm', { 'wb.coll.Dc_mm': 250 }],
  ['f_c 900 mm', { 'wb.coll.fc_mm': 900 }],
  ['iğne deliği 100 µm', { 'wb.coll.pinhole_um': 100 }],
  ['HDTV-NFOV kanalı', { 'wb.refChannel': 'HDTV-NFOV' }],
  ['L_off 0,15 m', { 'wb.hex.L_off': 0.15 }],
  ['mikro-titreşim 5 µrad', { 'wb.hex.microvib': 5 }],
];
// ---------------------------------------------------------------- bağımsız uygulamalar
const reachI = (hx, fr) => { const w = TAU * fr; return Math.min(hx.theta_max, hx.omega_max / w, hx.alpha_max / (w * w)); };
const fovI = (ch) => { const fm = ch.f_mm * 1e-3, p = ch.p_um * 1e-6; return [2 * Math.atan(ch.Nh * p / (2 * fm)) / D2R, 2 * Math.atan(ch.Nv * p / (2 * fm)) / D2R]; };
const rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const mm = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return a.map(x => x / n); };
function geomI(P) {
  const d = L.derive(P), a0 = d.a0, e0 = d.e0, l = [Math.cos(e0) * Math.cos(a0), Math.cos(e0) * Math.sin(a0), Math.sin(e0)];
  const hz = nrm(cross([0, 0, 1], l)), vt = cross(l, hz);
  return { l, hz, vt, Lpg: P.dut.L_pg, Loff: P.wb.hex.L_off || 0 };
}
// pivot göz bebeğinde (O = E0). stab ON: G = O + R(G0 − O) + t, E = G + L_pg·l (LOS laboratuvarda sabit); stab OFF: E = O + t
function shiftI(g, ph, th, ps, t, stab) {
  const R = mm(rz(ps), mm(ry(th), rx(ph)));
  let dE;
  if (stab) { const G0 = g.l.map(x => -g.Lpg * x), G = mv(R, G0); dE = [G[0] + g.Lpg * g.l[0], G[1] + g.Lpg * g.l[1], G[2] + g.Lpg * g.l[2]]; }
  else dE = [0, 0, 0];
  if (t) dE = dE.map((x, i) => x + t[i]);
  const a = dot(dE, g.l), lat = dE.map((x, i) => x - a * g.l[i]);
  return { e: Math.hypot(lat[0], lat[1], lat[2]), h: dot(lat, g.hz), v: dot(lat, g.vt) };
}
// kutupsal integral: pupil merkezli ρ yarıçaplı çemberin demet dairesi içinde kalan yay oranı, ρ üzerinden alan ağırlıklı
function overlapI(Dp, Dc, s) {
  const r = Dp / 2, R = Dc / 2, N = 4000; if (!(r > 0)) return 1;
  const fr = (rho) => { if (rho === 0) return s <= R ? 1 : 0; if (s === 0) return rho <= R ? 1 : 0;
    const c = (rho * rho + s * s - R * R) / (2 * rho * s); return c <= -1 ? 1 : (c >= 1 ? 0 : Math.acos(c) / Math.PI); };
  let S = 0; const hh = r / N;
  for (let i = 0; i <= N; i++) { const rho = i * hh, w = i === 0 || i === N ? 1 : (i % 2 ? 4 : 2); S += w * 2 * Math.PI * rho * fr(rho); }
  return S * hh / 3 / (Math.PI * r * r);
}
// senaryo profili 1 kHz'de: en büyük kayma (L_off·sin θ⊥ dahil), en düşük örtüşme, vinyetleme süresi ve RMS (yatay/düşey)
function excursionI(P, S, fsI) {
  const g = geomI(P), C = P.wb.coll, ch = L.derive(P).ch, Dp = ch.Dp_mm * 1e-3, Dc = C.Dc_mm * 1e-3, k = C.ap_margin, eFree = (Dc / k - Dp) / 2;
  const n = Math.max(3, Math.round(S.T * fsI)), rng = L.makeRngFactory(S.seed == null ? 1 : S.seed), cm = L.makeChannel(S.cmd || [], fsI, rng), tr = L.makeChannel(S.trans || [], fsI, rng);
  const a = [0, 0, 0], t = [0, 0, 0], stab = S.stab !== false;
  // vinyetleme: örtüşme < 1 ⇔ e > (D_c − D_p)/2 (fiziksel); pay aşımı: e > e_free = (D_c/k − D_p)/2 (kabul kuralı)
  const eVig = (Dc - Dp) / 2; let eMax = 0, nVig = 0, nMar = 0, sh = 0, sv = 0, ovMin = 1;
  const hs = new Float64Array(n), vs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cm.eval(i / fsI, a); if (tr.comps.length) tr.eval(i / fsI, t);
    const q = shiftI(g, a[0], a[1], a[2], tr.comps.length ? t : null, stab);
    const ad = dot(a, g.l), tp = Math.hypot(a[0] - ad * g.l[0], a[1] - ad * g.l[1], a[2] - ad * g.l[2]);
    const e = q.e + g.Loff * Math.sin(Math.min(tp, Math.PI / 2));
    if (e > eMax) eMax = e; if (e > eVig + 1e-12) nVig++; if (e > eFree + 1e-12) nMar++;
    hs[i] = q.h; vs[i] = q.v;
  }
  const mean = (x) => x.reduce((s, y) => s + y, 0) / x.length, mh = mean(hs), mvv = mean(vs);
  for (let i = 0; i < n; i++) { sh += (hs[i] - mh) ** 2; sv += (vs[i] - mvv) ** 2; }
  ovMin = overlapI(Dp, Dc, eMax);
  return { eMax, ovMin, fVig: nVig / n, fMar: nMar / n, rmsH: Math.sqrt(sh / n), rmsV: Math.sqrt(sv / n), eFree, req: k * (Dp + 2 * eMax) };
}
// ---------------------------------------------------------------- koşu
const OUT = { plat, cases: [] }; let worstRel = { v: 0, what: '' };
const track = (what, a, b, tol) => { const r = rel(a, b); if (r > worstRel.v && tol == null) worstRel = { v: r, what }; return r; };
for (const [name, ch] of CASES) {
  const P = L.defaultParams(plat); for (const [k, v] of Object.entries(ch)) set(P, k, v);
  const d = L.derive(P), hx = P.wb.hex, C = P.wb.coll, rec = { name, ch };
  console.log(`\n== ${plat} · ${name}`);
  // 1) erişim ve köşeler
  const fr = [0.05, 0.125, 0.4244, 0.5, 1, 1.5915, 2, 3, 4.1, 5.48, 10, 20];
  const rr = fr.map(x => ({ f: x, eng: d.reach(x), ind: reachI(hx, x), lim: d.reachLim(x) }));
  const rMax = Math.max(...rr.map(o => track('erişim', o.eng, o.ind)));
  const c1 = hx.omega_max / (TAU * hx.theta_max), c2 = hx.alpha_max / (TAU * hx.omega_max);
  rec.reach = { rows: rr, c1, c2, maxRel: rMax };
  console.log(`  erişim: köşe θ→ω ${f(c1, 4)} Hz, ω→α ${f(c2, 4)} Hz; ${rr.filter(o => [0.125, 1, 2, 5.48, 10].includes(o.f)).map(o => `${o.f} Hz ${f(o.eng, 4)}° (${o.lim})`).join(', ')}; en büyük göreli fark ${rMax.toExponential(1)}`);
  // 2) Osc2 (yalnız f_bw değişen durumlarda ve varsayılanda)
  if (name === 'varsayılan' || ch['wb.hex.fbw']) {
    const fb = hx.fbw, dt = 1 / 4000, z = 0.7071, rows = [];
    for (const x of [1, 2, 5, 0.37748 * fb, 10, fb]) {
      const o = new L.Osc2(fb, z, dt), N = Math.round(12 / dt), M0 = Math.round(4 / dt); let ss = 0, sc = 0, cc = 0, sn2 = 0, cs = 0;
      for (let i = 0; i < N; i++) { const tt = i * dt, u = Math.sin(TAU * x * tt), y = o.step(u); if (i >= M0) { const s1 = Math.sin(TAU * x * tt), c1 = Math.cos(TAU * x * tt); ss += y * s1; sc += y * c1; sn2 += s1 * s1; cc += c1 * c1; cs += s1 * c1; } }
      const det = sn2 * cc - cs * cs, A = (ss * cc - sc * cs) / det, B = (sc * sn2 - ss * cs) / det, mag = Math.hypot(A, B), ph = Math.atan2(B, A) / D2R;
      const r = x / fb, magA = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2), phA = -Math.atan2(2 * z * r, 1 - r * r) / D2R;
      rows.push({ f: x, mag, magA, ph, phA });
    }
    const f99 = fb * Math.pow(1 / 0.99 ** 2 - 1, 0.25), f95 = fb * Math.pow(1 / 0.95 ** 2 - 1, 0.25);
    rec.osc = { rows, f99, f95, rel: hx.rel_ratio * fb };
    console.log(`  Osc2 (f_bw ${fb} Hz, ζ ${z}, 4 kHz FOH): ${rows.map(o => `${f(o.f, 2)} Hz |H| ${f(o.mag, 4)} (analitik ${f(o.magA, 4)}), φ ${f(o.ph, 1)}° (${f(o.phA, 1)}°)`).join('; ')}`);
    console.log(`  |H| = 0,99 → ${f(f99, 2)} Hz, 0,95 → ${f(f95, 2)} Hz; güvenilir bant ${f(hx.rel_ratio * fb, 1)} Hz'de |H| ${f(1 / Math.sqrt(1 + (hx.rel_ratio) ** 4), 4)}, faz ${f(-Math.atan2(2 * z * hx.rel_ratio, 1 - hx.rel_ratio ** 2) / D2R, 1)}°`);
  }
  // 3) stab-OFF sınırı
  const fv = fovI(d.ch), soI = hx.stabOff_ratio * Math.min(fv[0], fv[1]);
  rec.stabOff = { eng: d.stabOffMax, ind: soI, fov: fv, rel: track('stab-OFF', d.stabOffMax, soI) };
  console.log(`  FOV ${f(fv[0], 4)}° × ${f(fv[1], 4)}° (motor ${f(d.FOVh, 4)} × ${f(d.FOVv, 4)}); stab-OFF sınırı ${f(soI, 4)}° (motor ${f(d.stabOffMax, 4)})`);
  // 4) kolimatör geometrisi
  const G = L.collGeom(P), Dp = d.ch.Dp_mm * 1e-3, Dc = C.Dc_mm * 1e-3, IF = d.ch.p_um / d.ch.f_mm * 1e-3;
  const gi = { ratio: C.fc_mm / d.ch.f_mm, phRad: C.pinhole_um / C.fc_mm * 1e-3, phImg: C.pinhole_um * d.ch.f_mm / C.fc_mm, eFree: (Dc / C.ap_margin - Dp) / 2 };
  gi.phIFOV = gi.phRad / IF; gi.phOk = gi.phImg <= d.ch.p_um; gi.ratioOk = gi.ratio >= C.ratio_min; gi.apOk = Dc >= C.ap_margin * Dp;
  const gm = Math.max(track('oran', G.ratio, gi.ratio), track('iğne', G.phRad, gi.phRad), track('iğne görüntü', G.phImg_um, gi.phImg), track('e_free', G.eFree, gi.eFree), track('IFOV oranı', G.phIFOV, gi.phIFOV));
  const flags = G.phOk === gi.phOk && G.ratioOk === gi.ratioOk && G.apOk === gi.apOk;
  rec.coll = { gi, eng: { ratio: G.ratio, phRad: G.phRad, phImg: G.phImg_um, eFree: G.eFree, phIFOV: G.phIFOV, phOk: G.phOk, ratioOk: G.ratioOk, apOk: G.apOk }, maxRel: gm, flags };
  console.log(`  kolimatör: f_c/f ${f(gi.ratio, 2)} (${gi.ratioOk ? 'OK' : 'KISA'}), iğne ${f(gi.phRad * 1e6, 1)} µrad = ${f(gi.phIFOV, 3)} IFOV, görüntü ${f(gi.phImg, 2)} µm / piksel ${d.ch.p_um} µm (${gi.phOk ? 'alt piksel' : 'PİKSELDEN BÜYÜK'}), D_p ${d.ch.Dp_mm} mm, e_free ${f(gi.eFree * 1e3, 2)} mm, durağan ${gi.apOk ? 'OK' : 'YETMEZ'}; motorla en büyük göreli fark ${gm.toExponential(1)}, bayraklar ${flags ? 'aynı' : 'FARKLI'}`);
  // 5) örtüşme: kapalı biçim ↔ kutupsal integral
  const ss = [0, gi.eFree * C.ap_margin, gi.eFree, (Dc - Dp) / 2, 0.025, 0.04, 0.0577, (Dc + Dp) / 2 - 0.01, (Dc + Dp) / 2 + 0.001].filter((v, i, a) => a.indexOf(v) === i);
  const ov = ss.map(s => ({ s, eng: L.pupilOverlap(Dp, Dc, s), ind: overlapI(Dp, Dc, s) }));
  const ovErr = Math.max(...ov.map(o => Math.abs(o.eng - o.ind)));
  rec.overlap = { rows: ov, maxAbs: ovErr };
  console.log(`  örtüşme (D_p ${d.ch.Dp_mm}, D_c ${C.Dc_mm} mm): ${ov.map(o => `s ${f(o.s * 1e3, 1)} → ${f(o.eng, 4)}`).join(', ')}; integralle en büyük mutlak fark ${ovErr.toExponential(1)}`);
  // 6) pupilShift: rastgele duruş/öteleme örnekleri (büyüklük ve yatay/düşey bileşen)
  { const g = geomI(P), Gm = L.collGeom(P); let mx = 0, mxH = 0; let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let k = 0; k < 2000; k++) {
      const ang = [rnd() * 0.25, rnd() * 0.25, rnd() * 0.25], t = [rnd() * 0.1, rnd() * 0.1, rnd() * 0.1], st = k % 2 === 0;
      const [h, v] = L.pupilShift(Gm, ang[0], ang[1], ang[2], t, st, 0), q = shiftI(g, ang[0], ang[1], ang[2], t, st);
      mx = Math.max(mx, Math.abs(Math.hypot(h, v) - q.e)); mxH = Math.max(mxH, Math.abs(Math.abs(h) - Math.abs(q.h)));
    }
    rec.shift = { maxAbs_m: mx, maxAbsH_m: mxH };
    console.log(`  pupilShift (2000 rastgele duruş ±14°, öteleme ±100 mm, stab ON/OFF): |e| farkı en çok ${(mx * 1e9).toFixed(3)} nm, |yatay| farkı ${(mxH * 1e9).toFixed(3)} nm`);
  }
  // 7) test profilleri: motor (50 Hz) ↔ bağımsız (1 kHz)
  const X = L.collExcursions(P), rows = [];
  for (const x of X) {
    let S = null;
    if (x.id === 'T0.3') { const th = hx.theta_test * D2R, sg = /\+/.test(x.label) ? 1 : -1; S = L.labScenario(P, { T: 8, stab: true, cmd: [0, 1, 2].map(i => ({ type: 'steps', axis: i, knots: [{ t: 0, v: 0 }, { t: 1, v: sg * th }], trans: 4 })) }); }
    else if (x.id === 'T2.1') { const ax = /roll/.test(x.label) ? 0 : 2; S = L.labScenario(P, { T: 70, stab: true, cmd: [{ type: 'chirp', axis: ax, f0: 1, f1: Math.min(20, hx.fbw), octPerMin: 1, ampFn: (q) => d.reach(q) * D2R, t0: 2, ramp: 2 }] }); }
    else if (x.id === 'T1.3') S = L.seaLabScenario(P, { T: 620, seed: 1301 });
    else if (x.id === 'T2.3') S = L.seaLabScenario(P, { T: 620, seed: 1301, viv: true });
    else if (x.id === 'T2.5') { const ax = 'xyz'.indexOf(x.label.split(' ')[1]); const sg = L.segSines([{ f: 1, a: 2, nper: 30 }, { f: 2, a: 2, nper: 40 }].map(q => ({ axis: ax, f: q.f, A: Math.min(q.a / (TAU * q.f) ** 2, 0.9 * P.lab.hexStroke), nper: q.nper }))); S = L.labScenario(P, { T: sg.T, stab: true, cmd: [], trans: sg.cmd }); }
    if (!S) { rows.push({ id: x.id, label: x.label, eng: x.eMax, ovE: x.ovMin, okE: x.ok }); continue; }
    const I = excursionI(P, S, 1000);
    rows.push({ id: x.id, label: x.label, eng: x.eMax, ind: I.eMax, ovE: x.ovMin, ovI: I.ovMin, fVigE: x.fVig, fVigI: I.fVig, fMarI: I.fMar, okE: x.ok, okI: I.eMax <= I.eFree + 1e-12, req: I.req, rmsH: I.rmsH, rmsV: I.rmsV });
  }
  // kapalı biçimler: T2.5 genliği, T0.3 üç eksen uç pozu, T2.1 1 Hz erişimi
  const A25 = Math.min(2 / (TAU * 1) ** 2, 0.9 * P.lab.hexStroke), g = geomI(P), th = hx.theta_test * D2R;
  const t03p = shiftI(g, th, th, th, null, true).e, t03m = shiftI(g, -th, -th, -th, null, true).e, t21 = P.dut.L_pg * Math.sin(d.reach(1) * D2R);
  rec.tests = { rows, closed: { T25: A25, T03p: t03p, T03m: t03m, T21cap: t21 } };
  for (const r of rows) console.log(`  ${r.id} ${r.label}: motor ${f(r.eng * 1e3, 2)} mm${r.ind != null ? ` · bağımsız (1 kHz) ${f(r.ind * 1e3, 2)} mm (fark %${f(r.ind < 1e-9 && r.eng < 1e-9 ? 0 : 100 * rel(r.eng, r.ind), 2)}) · örtüşme ${f(100 * r.ovE, 1)}/${f(100 * r.ovI, 1)} % · vinyetleme süresi ${f(100 * r.fVigE, 1)}/${f(100 * r.fVigI, 1)} % (pay sınırı aşımı ${f(100 * r.fMarI, 1)} %) · gerekli D_c ${f(r.req * 1e3, 0)} mm · RMS yatay/düşey ${f(r.rmsH * 1e3, 1)}/${f(r.rmsV * 1e3, 1)} mm` : ''} → ${r.okE ? 'OK' : 'YETERSİZ'}${r.okI != null && r.okI !== r.okE ? ' (bağımsız karar FARKLI)' : ''}`);
  console.log(`  kapalı biçim: T2.5 genlik ${f(A25 * 1e3, 2)} mm; T0.3 +θ ${f(t03p * 1e3, 2)} / −θ ${f(t03m * 1e3, 2)} mm; T2.1 tavanı L_pg·sin(erişim 1 Hz) ${f(t21 * 1e3, 2)} mm`);
  // 8) paralaks duyarlılığı (motorda yok): δ odak hatası → R = f_c²/δ; görünür hedef kayması e/R. T1.3 RMS ve tepe
  const t13 = rows.find(r => r.id === 'T1.3' && r.ind != null);
  if (t13) {
    const fc = C.fc_mm * 1e-3, Nc = C.fc_mm / C.Dc_mm, dofs = [2 * 4e-6 * Nc * Nc, 2 * 1e-6 * Nc * Nc];
    const par = [0.02e-3, 0.05e-3, 0.1e-3, 0.225e-3, dofs[0]].map(dl => ({ delta_mm: dl * 1e3, R_km: fc * fc / dl / 1e3, peak_urad: t13.ind * dl / (fc * fc) * 1e6, rmsH_urad: t13.rmsH * dl / (fc * fc) * 1e6, rmsV_urad: t13.rmsV * dl / (fc * fc) * 1e6 }));
    rec.parallax = { rows: par, Nc, dof4um_mm: dofs[0] * 1e3, dof1um_mm: dofs[1] * 1e3, deltaFor1urad_mm: fc * fc * 1e-6 / t13.ind * 1e3 };
    console.log(`  paralaks (T1.3 hareketi): ${par.map(o => `δ ${f(o.delta_mm, 3)} mm → R ${f(o.R_km, 1)} km, tepe ${f(o.peak_urad, 2)} µrad, RMS yatay ${f(o.rmsH_urad, 2)} / düşey ${f(o.rmsV_urad, 2)} µrad`).join('; ')}`);
    console.log(`    F/# ${f(Nc, 1)} → odak derinliği ±2λN²: MWIR (4 µm) ±${f(dofs[0] * 1e3, 3)} mm, 1 µm ±${f(dofs[1] * 1e3, 3)} mm; tepe görünür kaymayı 1 µrad'da tutan δ ≤ ${f(fc * fc * 1e-6 / t13.ind * 1e3, 4)} mm`);
  }
  OUT.cases.push(rec);
}
OUT.worstRel = worstRel;
{ const P = L.defaultParams(plat); P.wb.coll.Dc_mm = 151; const t0 = Date.now(); L.collExcursions(P); OUT.tCollX_ms = Date.now() - t0; console.log(`collExcursions süresi (200 Hz değerlendirme): ${OUT.tCollX_ms} ms`); }
console.log(`\nen büyük göreli fark (erişim, stab-OFF, kolimatör): ${worstRel.v.toExponential(2)} (${worstRel.what})`);
fs.writeFileSync(path.join(__dirname, `sweep_${plat}.json`), JSON.stringify(OUT, null, 1));
