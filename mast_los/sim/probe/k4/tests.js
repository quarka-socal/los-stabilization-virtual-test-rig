// Teknik kılavuz §4 (VIV) — test yanıtları: T2.1 (açısal süpürme, VIV bandı), T2.2 (dwell, dar bant OFF/ON), T2.3 (deniz + VIV
// doğrusallık) ve işletme ayrıştırmasının B2-01 satırı (600 s). Argüman: 'sub' ya da 'ship'.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub';
const mk = (fn) => { const P = L.defaultParams(kind); if (fn) fn(P); return P; };
const cases = kind === 'sub' ? [
  ['S0', 'varsayılan', mk()],
  ['S2', 'St = 0,25', mk(P => { P.wb.viv.St = 0.25; })],
  ['S3', 'f_n = 2 Hz', mk(P => { P.wb.viv.fn = 2; })],
  ['S5', 'f_n = 8 Hz', mk(P => { P.wb.viv.fn = 8; })],
  ['S6', 'genlik 0,10°', mk(P => { P.wb.viv.amp_deg = 0.10; })],
  ['S10', 'dar bant kontrol kapalı', mk(P => { P.dut.ctl.res.on = false; })],
] : [
  ['W0', 'varsayılan', mk()],
  ['W1', 'β = 90°', mk(P => { P.wb.wviv.beta = 90; })],
  ['W2', 'δ_s = 0,05', mk(P => { P.wb.wviv.delta = 0.05; })],
  ['W3', 'U_max = 6 m/s', mk(P => { P.wb.wviv.Umax = 6; })],
  ['W4', 'f_n = 3 Hz', mk(P => { P.wb.wviv.fn = 3; })],
  ['W10', 'ölçülmüş 0,02°', mk(P => { P.wb.wviv.amp_deg = 0.02; })],
  ['W11', 'öteleme kapalı', mk(P => { P.wb.wviv.lin = false; })],
];
const out = [];
for (const [id, nm, P] of cases) {
  const t0 = Date.now(), ctx = {}, o = { id, nm };
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) {
    const r = L.runTest(tid, P, ctx, null);
    o[tid] = { status: r.status, measured: r.measured, fill: r.fill, kv: r.kv };
  }
  const row = L.OP_ROWS.find(q => q.id === 'B2-01'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20, psd: false });
  o.op = { el: M.rms.el, xel: M.rms.xel };
  out.push(o);
  console.log(`${id} ${nm} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) console.log(`   ${tid} ${o[tid].status} | ${o[tid].measured.slice(0, 330)}`);
  console.log(`   işletme B2-01 el ${(o.op.el * 1e6).toFixed(2)} / xel ${(o.op.xel * 1e6).toFixed(2)} µrad`);
}
require('fs').writeFileSync(path.join(__dirname, `tests_${kind}.json`), JSON.stringify(out, null, 1));
