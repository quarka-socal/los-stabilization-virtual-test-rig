// v13.13 K1: Campbell (2,000 µrad @ 2100, dar bant kapalı) ile işletme B2-02 satırı topluluğunun karşılaştırması — 24 tohumdaki −%3,4
// farkın örnekleme mi, ölçüt (doğrusal trend çıkarma, 20 s atlama) mi olduğunu ayırmak için 100–123'ten ayrık 72 tohum (124–195),
// her koşuda hem losMetrics RMS'i (trend çıkarılmış) hem ham RMS (ortalama çıkarılmış) — slap_ens.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const row = L.OP_ROWS.find(q => q.id === 'B2-02'), v = [], raw = [], t0 = Date.now();
for (let s = 124; s < 196; s++) { const P = L.defaultParams('sub'); P.dut.ctl.res.on = false; const R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: s })), M = L.losMetrics(R, P, { skip: 20 });
  v.push(M.rms.el * 1e6); const el = R.rec.opt_el, fr = R.meta.fRec, i0 = Math.round(20 * fr); let m = 0, q = 0, n = 0;
  if (el) { for (let i = i0; i < R.meta.nRec; i++) { m += el[i]; n++; } m /= n; for (let i = i0; i < R.meta.nRec; i++) q += (el[i] - m) ** 2; raw.push(Math.sqrt(q / n) * 1e6); } }
const st = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length, sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)), ms = Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length); return { n: a.length, mean: m, sd, rms: ms, seRms: sd / Math.sqrt(a.length) }; };
const o = { trend: st(v), raw: raw.length ? st(raw) : null, campbell: 2.0002, s: (Date.now() - t0) / 1000 };
console.log(JSON.stringify(o)); require('fs').writeFileSync(path.join(__dirname, 'slap_ens.json'), JSON.stringify(Object.assign(o, { v, rawV: raw })));
