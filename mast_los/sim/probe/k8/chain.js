// Teknik kılavuz §6 (ölçüm zinciri ve belirsizlik) — zaman alanı denetimleri, motordan bağımsız beklenen değerlerle:
// A) piksel fazı (S-eğrisi) yanlılığı: durağan sapma ve küçük hareketin kazancı, sub-piksel konuma göre
//    beklenen: sapma = a·sin(2πφ), kazanç = 1 + 2πa·cos(2πφ), a = √2·pixlock_px (modeldeki biçim)
// B) IMU ve otokolimatör gürültüsü: örnek başına RMS, spektrum (imu_bw süzgeci gürültüyü sınırlıyor mu)
// C) T0.2 tabanının ayrışımı: centroid, hava, soğutucu, piksel fazı ayrı ayrı kapatılarak
// D) yüksek hızlı (otokolimatör) kanalın ölçülen tabanı ↔ u_h
// Çıktı: chain.json, konsol özeti.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const out = {};
const P0 = () => L.defaultParams('sub');
// ---------------------------------------------------------------- A) piksel fazı
{
  const rows = [];
  for (const ph of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const P = P0(); P.wb.chain.centroid_px = 0; P.dut.video.x0 = ph; P.dut.video.y0 = ph;
    const d = L.derive(P), IFt = d.IFOV * (1 + P.dut.optics.scaleErr), A = 4e-6, fr = 0.2, fy = 0.31, T = 64;
    const S = L.labScenario(P, { label: 'A', T, fs: 2000, stab: false, cooler: false, seed: 11,
      meas: { video: true, ac: false, imu: false, air: false, microvib: false, noise: true },
      cmd: [{ type: 'sine', axis: 0, A, f: fr, t0: 1, t1: T - 1, ramp: 2 }, { type: 'sine', axis: 2, A, f: fy, t0: 1, t1: T - 1, ramp: 2 }],
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel'] } });
    const R = L.runSim(P, S), v = L.videoAngles(R, { IFOVcal: IFt });
    const i0 = v.t.findIndex(t => t > 4), i1 = v.t.findIndex(t => t > T - 4);
    const tR = Float64Array.from({ length: R.meta.nRec }, (_, i) => i / R.meta.fRec);
    const j0 = Math.round(4 * R.meta.fRec), j1 = Math.round((T - 4) * R.meta.fRec);
    const vE = L.sineFit(v.t, v.el, fr, { i0, i1 }), vX = L.sineFit(v.t, v.xel, fy, { i0, i1 });
    const oE = L.sineFit(tR, R.rec.opt_el, fr, { i0: j0, i1: j1 }), oX = L.sineFit(tR, R.rec.opt_xel, fy, { i0: j0, i1: j1 });
    const a = Math.SQRT2 * P.wb.chain.pixlock_px;
    // sub-piksel konum: piksel koordinatı = açı/IFOV_gerçek + x0 (distorsiyon merkeze yakın ihmal); faz = frac(x0)
    const gE = vE.A / oE.A, gX = vX.A / oX.A, gEx = 1 + 2 * Math.PI * a * Math.cos(2 * Math.PI * ph), gXx = gEx;
    const bE = (vE.c0 - oE.c0) / IFt, bX = (vX.c0 - oX.c0) / IFt, bx = a * Math.sin(2 * Math.PI * ph);
    rows.push({ ph, gE, gX, gEx, gXx, bE, bX, bx });
    console.log(`A φ = ${f(ph, 3)}: kazanç el ${f(gE, 4)} / xel ${f(gX, 4)} (beklenen ${f(gEx, 4)}) · durağan sapma el ${f(bE, 4)} / xel ${f(bX, 4)} px (beklenen ${f(bx, 4)})`);
  }
  const worst = rows.reduce((m, r) => Math.max(m, Math.abs(r.gE - r.gEx), Math.abs(r.gX - r.gXx)), 0), worstB = rows.reduce((m, r) => Math.max(m, Math.abs(r.bE - r.bx), Math.abs(r.bX - r.bx)), 0);
  const rmsG = Math.sqrt(rows.reduce((s, r) => s + (r.gE - 1) ** 2, 0) / rows.length);
  console.log(`A özet: kazanç en büyük fark ${f(worst, 5)}, sapma en büyük fark ${f(worstB, 5)} px; kazanç hatasının RMS'i (8 faz) ${f(rmsG, 4)} (beklenen 2π·pixlock = ${f(2 * Math.PI * P0().wb.chain.pixlock_px, 4)})`);
  out.A = { rows, worst, worstB, rmsG };
}
// ---------------------------------------------------------------- B) IMU ve otokolimatör gürültüsü
{
  const res = [];
  for (const [nm, mod] of [['varsayılan (imu_bw 500 Hz)', null], ['imu_bw 100 Hz', (P) => { P.wb.chain.imu_bw = 100; }]]) {
    const P = P0(); if (mod) mod(P);
    const S = L.labScenario(P, { label: 'B', T: 65, fs: 4000, stab: false, hexActive: false, cooler: false, seed: 12,
      meas: { video: false, ac: true, imu: true, air: false, microvib: false, noise: true }, rec: { fs: 1000, ch: ['imu_r', 'ac_el', 'mech_el'] } });
    const R = L.runSim(P, S), n0 = 5000;
    const imu = Float64Array.from(R.rec.imu_r.subarray(n0)), ac = Float64Array.from(R.rec.ac_el.subarray(n0)), me = Float64Array.from(R.rec.mech_el.subarray(n0));
    const acN = ac.map((x, i) => x - me[i]);
    const pI = L.welch(L.detrend(imu, 'linear'), 1000, 4096), pA = L.welch(L.detrend(acN, 'linear'), 1000, 4096);
    const band = (p, a, b) => Math.sqrt(L.bandRms(p.f, p.P, a, b) ** 2);
    const r = { nm, imuRms: L.aRms(L.detrend(imu, 'linear')), imuLo: band(pI, 1, 100), imuHi: band(pI, 100, 499), acRms: L.aRms(L.detrend(acN, 'linear')), acLo: band(pA, 1, 100), acHi: band(pA, 100, 499) };
    res.push(r);
    console.log(`B ${nm}: IMU RMS ${f(r.imuRms * 1e6)} µrad (1–100 Hz ${f(r.imuLo * 1e6)}, 100–499 Hz ${f(r.imuHi * 1e6)}) · otokolimatör gürültüsü RMS ${f(r.acRms * 1e6)} µrad (1–100 ${f(r.acLo * 1e6)}, 100–499 ${f(r.acHi * 1e6)})`);
  }
  out.B = res;
}
// ---------------------------------------------------------------- C) T0.2 tabanının ayrışımı (stab OFF, hexapod kapalı, 120 s)
{
  const res = [];
  const cases = [
    ['tam zincir (T0.2 stab OFF)', null],
    ['soğutucu kapalı', { cooler: false }],
    ['hava kapalı', { air: false }],
    ['centroid gürültüsü 0', null, (P) => { P.wb.chain.centroid_px = 0; }],
    ['piksel fazı 0', null, (P) => { P.wb.chain.pixlock_px = 0; }],
    ['yalnız centroid', { cooler: false, air: false }, (P) => { P.wb.chain.pixlock_px = 0; }],
    ['yalnız hava', { cooler: false }, (P) => { P.wb.chain.pixlock_px = 0; P.wb.chain.centroid_px = 0; }],
    ['yalnız soğutucu', { air: false }, (P) => { P.wb.chain.pixlock_px = 0; P.wb.chain.centroid_px = 0; }],
  ];
  for (const [nm, opt, mod] of cases) {
    const P = P0(); if (mod) mod(P);
    const meas = { video: true, ac: true, imu: false, air: !(opt && opt.air === false), microvib: false, noise: true };
    const sims = [];
    for (let r = 0; r < 3; r++) {
      const S = L.labScenario(P, Object.assign({ label: 'C', T: 125, fs: 2000, stab: false, hexActive: false, seed: 251 + r, meas, rec: { fs: 1000, ch: ['ac_el', 'ac_xel', 'mech_el', 'mech_xel'] } }, opt && opt.cooler === false ? { cooler: false } : {}));
      const R = L.runSim(P, S), v = L.videoAngles(R, {});
      const sel = (a) => { const o = []; for (let i = 0; i < a.length; i++) if (v.t[i] > 5 && v.ok[i]) o.push(a[i]); return Float64Array.from(o); };
      const el = L.detrend(sel(v.el), 'linear'), xel = L.detrend(sel(v.xel), 'linear');
      const acE = L.detrend(Float64Array.from(R.rec.ac_el.subarray(5000)), 'linear'), acX = L.detrend(Float64Array.from(R.rec.ac_xel.subarray(5000)), 'linear');
      sims.push({ el: L.aRms(el), xel: L.aRms(xel), acE: L.aRms(acE), acX: L.aRms(acX) });
    }
    const q = (k) => Math.sqrt(sims.reduce((s, x) => s + x[k] ** 2, 0) / sims.length);
    const r = { nm, el: q('el'), xel: q('xel'), acE: q('acE'), acX: q('acX') };
    res.push(r);
    console.log(`C ${nm}: video el / xel ${f(r.el * 1e6)} / ${f(r.xel * 1e6)} µrad · otokolimatör el / xel ${f(r.acE * 1e6)} / ${f(r.acX * 1e6)} µrad`);
  }
  out.C = res;
}
// ---------------------------------------------------------------- D) analitik karşılaştırma için bütçe değerleri
{
  const P = P0(), ti = L.turInfo(P), us = L.uncertaintySheet(P), d = L.derive(P), ch = P.wb.chain;
  const gd = Math.SQRT2 / (2 * Math.PI * ch.imu_bw);
  out.D = { uv: ti.uv, uh: ti.uh, U: ti.U, phaseDt: us.phase, phaseTot: 360 * P.wb.hex.fbw * (ch.dt_sync_ms * 1e-3 + gd), gd,
    addFloor: Math.hypot(ch.centroid_px * d.IFOV * 1e6, ch.air), acFloor: Math.hypot(ch.air, ch.ac_noise) };
  console.log(`D bütçe: u_v ${f(ti.uv)} / u_h ${f(ti.uh)} µrad; toplanır video tabanı (centroid ⊕ hava) ${f(out.D.addFloor)}; otokolimatör (hava ⊕ gürültü) ${f(out.D.acFloor)} µrad; senkron fazı panelde ${f(us.phase, 2)}°, IMU grup gecikmesiyle ${f(out.D.phaseTot, 2)}° (τ_g ${f(gd * 1e3, 3)} ms)`);
}
require('fs').writeFileSync(path.join(__dirname, 'chain.json'), JSON.stringify(out, null, 1));
