// §10: Model'de F_c değiştirmenin yan etkisi. Arayüz F_c'yi değiştirince F_s = 1,1·F_c yapar, σ0'ı değiştirmez → ön-kayma ölçeği F_c/σ0 kayar.
// Karşılaştırma: el F_c × 0,5 / × 2, (a) arayüz gibi σ0 sabit, (b) σ0 F_c ile birlikte (ön-kayma 1 mrad korunur). Çıktı: fcui.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre_v139_full2.json');
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const mk = (fn) => { const P = L.defaultParams('sub'); if (fn) fn(P); return P; };
const T16 = (P) => { const r = L.runTest('T1.6', P, { IFOVcal: pre.ctx.IFOVcal }, null), m = r.measured.match(/tepe ([\d.]+) µrad/); return { st: r.status, pk: m ? +m[1] : NaN }; };
const op = (P, id) => { const row = L.OP_ROWS.find(q => q.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 }); return { el: M.rms.el, xel: M.rms.xel }; };
const out = [];
for (const s of [0.5, 2]) for (const tie of [false, true]) {
  const t0 = Date.now(), P = mk(P => { const a = P.dut.el; a.Fc *= s; a.Fs = 1.1 * a.Fc; if (tie) a.sigma0 *= s; });
  const t = T16(P), o = op(P, 'B1-07');
  out.push({ s, tie, st: t.st, pk: t.pk, opEl: o.el, xps: P.dut.el.Fc / P.dut.el.sigma0 });
  console.log(`el F_c × ${s} ${tie ? 'σ0 birlikte' : 'σ0 sabit (arayüz)'} [ön-kayma ${f(P.dut.el.Fc / P.dut.el.sigma0 * 1e3, 2)} mrad]: T1.6 ${t.st} ${f(t.pk, 1)} µrad | B1-07 el ${u(o.el)} µrad [${f((Date.now() - t0) / 1000, 0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'fcui.json'), JSON.stringify(out, null, 1));
