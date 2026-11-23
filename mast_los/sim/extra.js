// Bulgular için ek koşu: dar bant (rezonans) kontrol KAPALI iken T2.3 doğrusallık sınaması ve işletme RSS sınaması; v13.9: sürtünme
// ileri beslemesi η taraması (T1.6, işletme B1-07); v13.10: kestirim hatası, gözlemci oranları, σ0, direk modu; v13.11: T0.6 ve T0.1 dağılımı,
// mod frekansı, g-duyarlılığı; v13.12: dalga çarpması tohum dağılımı, taban döngüde B2-03 / B2-06, sürtünmesiz T2.4
'use strict';
const L = require('./engine.js');
const fs = require('fs');
const path = require('path');
// v13.10: video ölçen testler (T2.2, T2.3, T4.2) önhesaptaki ana koşularla aynı ölçekte olsun diye T0.1'in kalibre IFOV'u kullanılır (pre.json ctx);
// v13.9'a kadar ek koşular nominal IFOV ile ölçüyordu (fark ≈ %0,4)
const preCtx = (() => { try { return { IFOVcal: require('../app/pre.json').ctx.IFOVcal }; } catch (e) { return {}; } })();
const P = L.defaultParams(); P.dut.ctl.res.on = false;
const t0 = Date.now();
const r23 = L.runTest('T2.3', P, preCtx, null);
const m = r23.measured.match(/sapma ([-\d.]+) %/);
const D = L.opDecomposition(P, { T: 600, seed: 11 }, null);
const ids = ['B1-01', 'B1-02', 'B1-03', 'B1-04', 'B1-05', 'B1-06', 'B1-07', 'B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-06', 'B3-01', 'B3-02', 'B3-03', 'B3-04'];
const rss = Math.sqrt(ids.reduce((s, id) => s + Math.pow(D.rows[id].wEl, 2), 0));
const all = D.all.M.video.wander.el;
// v13.9 (§9): sürtünme ileri beslemesinin doğruluğu — η taraması (gözlemci F_c'yi ±%δ yanlış bilirse FF torku η(1 ± δ) olur): T1.6 tepe
// değeri ve işletme B1-07 (yalnız sürtünme, 600 s, tohum 11)
const ff = [];
for (const eta of [0, 0.855, 0.9, 1.0, 1.045, 1.14]) {
  const Q = L.defaultParams(); Q.dut.ctl.ff.eta = eta;
  const r16 = L.runTest('T1.6', Q, preCtx, null), mp = r16.measured.match(/tepe ([\d.]+) µrad/);
  const row = L.OP_ROWS.find(q => q.id === 'B1-07'), R = L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), M = L.losMetrics(R, Q, { skip: 20 });
  ff.push({ eta, t16: r16.status, t16peak: mp ? +mp[1] : null, opEl: M.rms.el, opXel: M.rms.xel });
}
// v13.10 (§9 kararları): dar bant frekans kestirim hatası (T2.2) ve gözlemci model hatası (T1.6, işletme B1-07)
const est = [];
for (const e of [0.05, 0.1]) { const Q = L.defaultParams(); Q.dut.ctl.res.estErr = e; const r = L.runTest('T2.2', Q, preCtx, null), mm = r.measured.match(/en kötü ([\d.]+) µrad/); est.push({ e, st: r.status, worst: mm ? +mm[1] : null }); }
const obs = [];
for (const o of [{ Fc: 0.9 }, { Fc: 1.1 }, { Fc: 0.9, Fs: 0.9 }, { Fc: 1.1, Fs: 1.1 }, { s0: 0.5 }, { s0: 2 }]) {
  const Q = L.defaultParams(); Object.assign(Q.dut.ctl.ff.obs, o); const r = L.runTest('T1.6', Q, preCtx, null), mp = r.measured.match(/tepe ([\d.]+) µrad/);
  const row = L.OP_ROWS.find(q => q.id === 'B1-07'), R = L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), M = L.losMetrics(R, Q, { skip: 20 });
  obs.push({ o, st: r.status, peak: mp ? +mp[1] : null, opEl: M.rms.el });
}
// v13.10 (§10 mekanik ve sürtünme): ön-kayma rijitliği σ0 (tesis ve gözlemci birlikte) — T1.6 ve işletme B1-07; direk tepesi açısal modu κ —
// platform titreşimi satırı (B2-06) ve bütün kaynaklar birlikte wander
const s0 = [];
for (const m of [0.1, 10, 100]) {
  const Q = L.defaultParams(); Q.dut.el.sigma0 *= m; Q.dut.az.sigma0 *= m; const r = L.runTest('T1.6', Q, preCtx, null), mp = r.measured.match(/tepe ([\d.]+) µrad/);
  const row = L.OP_ROWS.find(q => q.id === 'B1-07'), R = L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), M = L.losMetrics(R, Q, { skip: 20 });
  s0.push({ m, st: r.status, peak: mp ? +mp[1] : null, opEl: M.rms.el });
}
const mount = [];
for (const k of [1e-5, 1e-4]) {
  const Q = L.defaultParams(); Q.dut.mount.kappa = k;
  const row = L.OP_ROWS.find(q => q.id === 'B2-06'), R = L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), M = L.losMetrics(R, Q, { skip: 20 });
  const Ra = L.runSim(Q, L.opScenario(Q, { T: 600, seed: 11, fs: 4000, derot: true })), Ma = L.losMetrics(Ra, Q, { skip: 20 });
  mount.push({ k, b206: M.rms.el, b206x: M.rms.xel, allW: Ma.video.wander.el, allWx: Ma.video.wander.xel });
}
// v13.11 (§11 gyro, modlar, optik): (1) T0.6 kestiricisinin tohumlar arası dağılımı (varsayılan ve BI 0,06 °/h; kabul oranı);
// (2) mod frekansı değişince işletme B3-03 / B3-04 (statik esneklik sabit); (3) g-duyarlılığı 1 °/h/g: bütçe B1-10 ↔ benzetim
// (deniz açıları + ötelemeleri + kaldıraç kolu; açısız); (4) T0.1 ölçek kestiriminin tohumlar arası hatası ↔ belirttiği belirsizlik
const st = (a) => { const s = a.slice().sort((x, y) => x - y), m = a.reduce((x, y) => x + y, 0) / a.length; return { n: a.length, mean: m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)), p05: s[Math.floor(0.05 * s.length)], p95: s[Math.floor(0.95 * s.length)] }; };
const t06 = {};
for (const [k, bi, N] of [['def', null, 100], ['bi06', 0.06, 60]]) {
  const A = [], B = []; let lim = null;
  for (let s = 0; s < N; s++) { const Q = L.defaultParams(); if (bi) Q.dut.gyro.bi = bi; Q.ana.seedOffset = s; lim = Q.wb.H.bias; const r = L.runTest('T0.6', Q, {}, null); A.push(r.num.arw); B.push(r.num.bi); }
  t06[k] = { bi: bi || L.defaultParams().dut.gyro.bi, lim, arw: st(A), biEst: st(B), pAcc: B.filter(x => x <= lim).length / N };
}
const modes = { opt: [], gim: [] };
for (const fo of [80, 200]) { const Q = L.defaultParams(); Q.dut.modes.opt.f = fo; const row = L.OP_ROWS.find(q => q.id === 'B3-03'), M = L.losMetrics(L.runSim(Q, L.rowScenario(Q, row, { T: 60, seed: 11 })), Q, { skip: 5 }); modes.opt.push({ f: fo, el: M.rms.el, xel: M.rms.xel }); }
for (const fg of [120, 300]) { const Q = L.defaultParams(); Q.dut.modes.gim.f = fg; const row = L.OP_ROWS.find(q => q.id === 'B3-04'), M = L.losMetrics(L.runSim(Q, L.rowScenario(Q, row, { T: 60, seed: 11 })), Q, { skip: 5 }); modes.gim.push({ f: fg, el: M.rms.el, xel: M.rms.xel }); }
const gsens = {};
for (const kind of ['sub', 'ship']) {
  const Q = L.defaultParams(kind); Q.dut.gyro.kg = 1; Q.wb.H.kg = 1; const r10 = L.computeBudget(Q, null).rows.find(r => r.id === 'B1-10');
  const MECH = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false])); MECH.gyroG = true;
  const src = { sea_r: true, sea_p: true, sea_y: true, sea_s: true, sea_w: true, sea_h: true, lever: true };
  const M1 = L.losMetrics(L.runSim(Q, L.opScenario(Q, { T: 600, seed: 11, src, mech: MECH, fs: 2000, label: 'kg' })), Q, { skip: 20 });
  const M2 = L.losMetrics(L.runSim(Q, L.opScenario(Q, { T: 600, seed: 11, src, mech: MECH, fs: 2000, label: 'kg', seaAngCmd: false })), Q, { skip: 20 });
  gsens[kind] = { budget: r10 ? r10.I : null, el: M1.rms.el, xel: M1.rms.xel, elNoAng: M2.rms.el, xelNoAng: M2.rms.xel };
}
const t01 = (() => { const E = [], U = [], K = []; let IFt = 0;
  for (let s = 0; s < 12; s++) { const Q = L.defaultParams(); Q.ana.seedOffset = s; const c = {}; L.runTest('T0.1', Q, c, null); IFt = L.derive(Q).IFOV * (1 + Q.dut.optics.scaleErr); E.push(c.T01.IFOVeff / IFt - 1); U.push(c.T01.relU); K.push(c.T01.k1); }
  return { err: st(E), u: st(U), k1: st(K), zMean: st(E).mean / st(U).mean }; })();
// v13.12 (§12 işletme ortamı ve proje gereksinimleri): (1) dalga çarpması B2-02 işletme satırının tohum dağılımı (dar bant kapalı ve
// yapılandırılmış, 24'er tohum) — kalibrasyon tek gerçekleşmeyle (tohum 11, dar bant kapalı) yapılmıştı; (2) dar bant kapalı taban döngüde
// B2-03 ve B2-06 (kalibrasyon tabanı); (3) T2.4'ün B2-02 kestirimi sürtünme ≈ 0 iken (darbe × sürtünme etkileşiminin payı)
const slap = {};
for (const [k, on] of [['off', false], ['cfg', true]]) { const v = [];
  for (let s2 = 0; s2 < 24; s2++) { const Q = L.defaultParams(); Q.dut.ctl.res.on = on; const row = L.OP_ROWS.find(q => q.id === 'B2-02'); v.push(L.losMetrics(L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 100 + s2 })), Q, { skip: 20 }).rms.el); }
  const Q = L.defaultParams(); Q.dut.ctl.res.on = on; const row = L.OP_ROWS.find(q => q.id === 'B2-02'), s11 = L.losMetrics(L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), Q, { skip: 20 }).rms.el;
  slap[k] = Object.assign(st(v), { rms: Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length), s11 }); }
const calibOff = {};
for (const id of ['B2-03', 'B2-06']) { const Q = L.defaultParams(); Q.dut.ctl.res.on = false; const row = L.OP_ROWS.find(q => q.id === id), M = L.losMetrics(L.runSim(Q, L.rowScenario(Q, row, { T: 600, seed: 11 })), Q, { skip: 20 }); calibOff[id] = { el: M.rms.el, xel: M.rms.xel }; }
const t24 = (() => { const Q = L.defaultParams(); for (const a of [Q.dut.el, Q.dut.az]) { a.Fc = 1e-6; a.Fs = 1.1e-6; a.sigma0 = 1e-3; } const r = L.runTest('T2.4', Q, preCtx, null), m = r.measured.match(/durgun gimbal ([\d.]+) \/ deniz profili üzerinde ([\d.]+)/);
  return { still: m ? +m[1] : null, sea: m ? +m[2] : null }; })();
// v13.9 (§9): sıcaklık programlı sürtünme modeli (T4.2)
const Qt = L.defaultParams(); Qt.dut.ctl.ff.tempSched = true; const r42 = L.runTest('T4.2', Qt, preCtx, null);
// v13.13: işletme bütün kaynaklar koşusunun wander'ı 60 / 120 / 240 s pencerede (iki platform, tohum 11; Yöntem'in iki pencere bulgusu)
const twOp = {}; for (const kind of ['sub', 'ship']) { const P = L.defaultParams(kind), R = L.runSim(P, L.opScenario(P, { T: 600, seed: 11, fs: 2000, label: 'tw' }));
  twOp[kind] = [60, 120, 240].map(Tw => { const Q = L.defaultParams(kind); Q.ana.Tw = Tw; const M = L.losMetrics(R, Q, { skip: 20 }); return { Tw, el: M.video.wander.el, xel: M.video.wander.xel }; }); }
const out = { slap, calibOff, t24nofric: t24, twOp, t06, modes, gsens, t01, est, obs, s0, mount, t42sched: { st: r42.status, m: r42.measured }, resOff: { t23dev: m ? +m[1] : null, t23: r23.measured, opAll: all, opRss: rss, opDev: 100 * (all / rss - 1) }, ff, elapsed: (Date.now() - t0) / 1000 };
fs.writeFileSync(path.join(__dirname, 'extra.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
