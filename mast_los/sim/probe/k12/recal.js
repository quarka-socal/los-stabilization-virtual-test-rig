// §10 K1 seçeneği (b): tork yolundaki üç satırı yapılandırılmış DUT'a yeniden kalibre etmenin etkisi (yaklaşık doğrusal oranlarla).
// F_c (F_s, σ0 birlikte; iki eksen) × 3/2,71; dengesizlik kütleleri × 2/1,64; vuruntu genliği (iki eksen) × 1,5/0,85. Çıktı: recal.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre_v139_full2.json');
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const sF = 3 / 2.71, sI = 2 / 1.64, sC = 1.5 / 0.85;
const P = L.defaultParams('sub');
for (const a of [P.dut.el, P.dut.az]) { a.Fc *= sF; a.Fs = 1.1 * a.Fc; a.sigma0 *= sF; a.cogA *= sC; }
P.dut.imb.me *= sI; P.dut.imb.ma *= sI;
const run = (id) => L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null);
const op = (id) => { const row = L.OP_ROWS.find(q => q.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 }); return { el: M.rms.el, xel: M.rms.xel }; };
const out = { sF, sI, sC, op: {}, t: {} };
for (const id of ['B1-07', 'B2-03', 'B2-04']) { out.op[id] = op(id); console.log(`işletme ${id} el ${u(out.op[id].el)} / xel ${u(out.op[id].xel)} µrad`); }
for (const id of ['T1.6', 'T2.5', 'T2.4', 'T4.2', 'T2.3']) { const r = run(id); out.t[id] = { st: r.status, m: r.measured }; console.log(`${id} ${r.status}: ${r.measured.slice(0, 260)}`); }
require('fs').writeFileSync(path.join(__dirname, 'recal.json'), JSON.stringify(out, null, 1));
