// §5 taban düzeltmesi: masa mikro-titreşiminin T1.3'teki (deniz profili altında, yerinde) ölçüme geçen payı ↔ yalıtılmış
// statik koşunun payı (tableShare, 'zincir' kipinin düştüğü değer). Yöntem: aynı tohum, ortak rastgele sayılar; mikro-titreşim
// açık ve kapalı iki koşu; fark sinyalinin (açık − kapalı) aynı pencereli wander metriği = yerinde pay (etkileşimler dahil).
// Argüman: 'sub' | 'ship' [tohum sayısı]. Çıktı: konsol, mvsitu_<tür>.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', nS = +(process.argv[3] || 1), mvA = process.argv[4] != null ? +process.argv[4] : null;
const P = L.defaultParams(kind), ctx = {}; if (mvA != null) P.wb.hex.microvib = mvA; L.runTest('T0.1', P, ctx, null);
const sh = L.tableShare(P);
const out = { kind, mv: P.wb.hex.microvib, share: { vid: sh.on.vid, ac: sh.on.ac, los: sh.on.los, table: sh.on.table }, runs: [] };
const wwin = (x, ok) => L.windowedWander(x, ok, Math.round(P.ana.Tw * 50), P.ana.detrend).rms;
for (let s = 0; s < nS; s++) {
  const t0 = Date.now();
  const S1 = L.seaLabScenario(P, { T: 620, seed: 1301 + s }), S0 = L.seaLabScenario(P, { T: 620, seed: 1301 + s });
  S0.meas = Object.assign({}, S0.meas, { microvib: false });
  S1.rec = S0.rec = { fs: 1000, ch: ['opt_el', 'opt_xel', 'ac_el', 'ac_xel', 'imu_r', 'base_r'] };
  const R1 = L.runSim(P, S1), R0 = L.runSim(P, S0);
  const v1 = L.videoAngles(R1, ctx), v0 = L.videoAngles(R0, ctx), n = Math.min(v1.t.length, v0.t.length);
  const sel = (v) => { const e = [], x = [], ok = []; for (let i = 0; i < n; i++) if (v.t[i] > 20) { e.push(v.el[i]); x.push(v.xel[i]); ok.push(v1.ok[i] && v0.ok[i] ? 1 : 0); } return { e: Float64Array.from(e), x: Float64Array.from(x), ok: Uint8Array.from(ok) }; };
  const a = sel(v1), b = sel(v0), dE = a.e.map((v, i) => v - b.e[i]), dX = a.x.map((v, i) => v - b.x[i]);
  const w1 = { el: wwin(a.e, a.ok), xel: wwin(a.x, a.ok) }, w0 = { el: wwin(b.e, a.ok), xel: wwin(b.x, a.ok) }, wd = { el: wwin(dE, a.ok), xel: wwin(dX, a.ok) };
  const i0 = 20000, rd = (c) => { const x = R1.rec[c], y = R0.rec[c], o = new Float64Array(x.length - i0); for (let i = i0; i < x.length; i++) o[i - i0] = x[i] - y[i]; return L.aRms(L.detrend(o, 'linear')); };
  const r = { seed: 1301 + s, w1, w0, wd, quad: { el: Math.sqrt(Math.max(0, w1.el ** 2 - w0.el ** 2)), xel: Math.sqrt(Math.max(0, w1.xel ** 2 - w0.xel ** 2)) },
    ac: { el: rd('ac_el'), xel: rd('ac_xel') }, los: { el: rd('opt_el'), xel: rd('opt_xel') }, table: rd('base_r') };
  out.runs.push(r);
  const u = (x) => (x * 1e6).toFixed(3);
  console.log(`${kind} mv ${P.wb.hex.microvib} µrad, tohum ${r.seed} [${((Date.now() - t0) / 1000).toFixed(0)} s]: wander açık ${u(w1.el)} / ${u(w1.xel)}, kapalı ${u(w0.el)} / ${u(w0.xel)} µrad; ` +
    `fark sinyali (yerinde pay) video ${u(wd.el)} / ${u(wd.xel)}, karesel fark ${u(r.quad.el)} / ${u(r.quad.xel)}; otokolimatör ${u(r.ac.el)} / ${u(r.ac.xel)}; gerçek LOS ${u(r.los.el)} / ${u(r.los.xel)}; tabla ${u(r.table)} µrad`);
}
const u = (x) => (x * 1e6).toFixed(3);
console.log(`yalıtılmış statik koşu (tableShare, stab ON): video ${u(sh.on.vid.el)} / ${u(sh.on.vid.xel)}, otokolimatör ${u(sh.on.ac.el)} / ${u(sh.on.ac.xel)}, gerçek LOS ${u(sh.on.los.el)} / ${u(sh.on.los.xel)}, tabla ${u(sh.on.table)} µrad`);
require('fs').writeFileSync(path.join(__dirname, `mvsitu_${kind}${mvA != null ? '_mv' + mvA : ''}.json`), JSON.stringify(out, null, 1));
