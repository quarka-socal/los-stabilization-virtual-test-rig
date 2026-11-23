// Teknik kılavuz §4 (VIV) — v13.2 düzeltmeleri sonrası test yanıtları: T2.1 bandı (f_n dahil), T2.2 (erişim bayrağı,
// dar bant kapsamı, doğrusal model DRR'ı, gemide yol ayrımı), T2.3 (ton koşusunda resF = f_n). Argüman: 'sub' | 'ship' | durum kimlikleri
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const kind = process.argv[2] || 'sub', only = process.argv.slice(3);
const mk = (k, fn) => { const P = L.defaultParams(k); if (fn) fn(P); return P; };
const all = {
  sub: [
    ['S0', 'varsayılan', mk('sub')],
    ['S2', 'St = 0,25', mk('sub', P => { P.wb.viv.St = 0.25; })],
    ['S3', 'f_n = 2 Hz', mk('sub', P => { P.wb.viv.fn = 2; })],
    ['S5', 'f_n = 8 Hz', mk('sub', P => { P.wb.viv.fn = 8; })],
    ['S11', 'genlik 1,5° (erişim sınırı)', mk('sub', P => { P.wb.viv.amp_deg = 1.5; })],
    ['S12', 'f_n = 12 Hz (taramada risk yok)', mk('sub', P => { P.wb.viv.fn = 12; })],
  ],
  ship: [
    ['W0', 'varsayılan', mk('ship')],
    ['W1', 'β = 90°', mk('ship', P => { P.wb.wviv.beta = 90; })],
    ['W13', 'ölçülmüş genlik 0,7° (erişim sınırı)', mk('ship', P => { P.wb.wviv.amp_deg = 0.7; })],
  ],
};
const cases = all[kind].filter(c => !only.length || only.includes(c[0]));
const out = [];
for (const [id, nm, P] of cases) {
  const t0 = Date.now(), ctx = {}, o = { id, nm };
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) {
    const r = L.runTest(tid, P, ctx, null);
    o[tid] = { status: r.status, measured: r.measured, fill: r.fill, kv: r.kv, notes: r.notes };
  }
  out.push(o);
  console.log(`${id} ${nm} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
  for (const tid of ['T2.1', 'T2.2', 'T2.3']) {
    console.log(`   ${tid} ${o[tid].status} | ${o[tid].measured.slice(0, 420)}`);
    if (tid !== 'T2.1') for (const [k, v] of o[tid].kv) console.log(`      · ${k}: ${String(v).slice(0, 260)}`);
    if (tid === 'T2.2') for (const n of o[tid].notes) console.log(`      ~ ${n.slice(0, 400)}`);
  }
}
require('fs').writeFileSync(path.join(__dirname, `tests2_${kind}${only.length ? '_' + only.join('_') : ''}.json`), JSON.stringify(out, null, 1));
