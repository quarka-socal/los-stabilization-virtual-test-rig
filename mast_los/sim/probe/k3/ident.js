// Teknik kılavuz §3 (v13.1) — kaldıraç kolu vektörü genişletmesinin eski r = (0,0,h) durumunu koruduğunun kanıtı:
// eski motor (bak_v13) ↔ yeni motor, aynı parametre ve tohumla: (1) seaAccDirector, (2) işletme ivme dizileri (bit düzeyi),
// (3) laboratuvar ötelemesi (ψ = 0'da yuvarlama düzeyi; ψ ≠ 0'da yaw bağlaşımının büyüklüğü), (4) bütçe satırları.
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '../../engine.js')), O = require(path.join(__dirname, '../../../oldeng/engine.js'));
const out = {}, log = (...a) => console.log(...a);
const setH = (P, h) => { P.wb.sea.h = h; return P; };
const cases = [
  ['gemi varsayılanı (dar, h = 15)', (L) => L.defaultParams('ship')],
  ['gemi SS4 6-DOF, h = 15', (L) => { const P = L.defaultParams('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); return P; }],
  ['gemi SS5 6-DOF, h = 15', (L) => { const P = L.defaultParams('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5)); return P; }],
  ['denizaltı, h = 0 (eski varsayılan)', (L) => setH(L.defaultParams('sub'), 0)],
  ['denizaltı SS4, h = 0', (L) => { const P = setH(L.defaultParams('sub'), 0); P.wb.sea.mode = '6dof'; return P; }],
  ['denizaltı, h = 10', (L) => setH(L.defaultParams('sub'), 10)],
];
// (1) seaAccDirector
const r1 = [];
for (const [nm, mk] of cases) {
  const a = O.seaAccDirector(mk(O)), b = N.seaAccDirector(mk(N));
  // spektral moment ızgarası v13.1'de genişletildi (±30 → ±200 kat): dar kipte (log-Gauss) fark yuvarlama düzeyinde, 6-DOF bant
  // biçiminde eski ızgaranın kesme hatası kadar (≈ 6·10⁻⁵). Izgara değişikliğinden önce bu karşılaştırma bütün durumlarda özdeşti.
  const rel = Math.max(...['x', 'y', 'z', 'eff'].map(k => Math.abs(b[k] - a[k]) / Math.max(Math.abs(a[k]), 1e-30)), ...[0, 1].map(k => Math.abs(b.lever[k] - a.lever[k]) / Math.max(a.lever[k], 1e-30)));
  r1.push({ nm, rel, eff: b.eff, lever2: b.lever[2] }); log('acc', nm, 'en büyük göreli fark', rel.toExponential(2), '| a_z kolu', b.lever[2], '| |a|', b.eff.toFixed(6));
}
out.acc = r1;
// (2) işletme ivme dizileri (bit düzeyi) ve açısal komutlar
const r2 = [];
for (const [nm, mk] of cases) {
  const T = 300, a = O.seaMotion(mk(O), T, O.makeRngFactory(77), { world: 'op' }), b = N.seaMotion(mk(N), T, N.makeRngFactory(77), { world: 'op' });
  let diff = 0, n = 0;
  const cmpArr = (x, y) => { if (!x && !y) return; if (!x || !y || x.length !== y.length) { diff++; return; } for (let i = 0; i < x.length; i++) { n++; if (x[i] !== y[i] && !(x[i] === 0 && y[i] === 0)) diff++; } };
  if (a.acc.length !== b.acc.length) diff++;
  for (let k = 0; k < 3; k++) cmpArr((a.acc.find(c => c.axis === k) || {}).data, (b.acc.find(c => c.axis === k) || {}).data);
  for (let k = 0; k < 3; k++) cmpArr((a.cmd.find(c => c.axis === k) || {}).data, (b.cmd.find(c => c.axis === k) || {}).data);
  r2.push({ nm, diff, n, nacc: b.acc.length }); log('op', nm, diff === 0 ? 'bit düzeyinde aynı' : 'FARK ' + diff, n, 'örnek, acc kanalı', b.acc.length);
}
out.op = r2;
// (3) laboratuvar ötelemesi: ψ = 0 (yaw kapalı) → yuvarlama düzeyi; varsayılan (yaw açık) → yaw bağlaşımı
const r3 = [];
for (const [nm, mk] of cases.slice(0, 3).concat([cases[5]])) {
  for (const yaw of [false, true]) {
    const on = { sea_r: true, sea_p: true, sea_y: yaw, sea_s: true, sea_w: true, sea_h: true };
    const a = O.seaMotion(mk(O), 600, O.makeRngFactory(91), { world: 'lab', on }), b = N.seaMotion(mk(N), 600, N.makeRngFactory(91), { world: 'lab', on });
    let dmax = 0, pk = 0;
    for (let k = 0; k < 3; k++) { const x = (a.trans.find(c => c.axis === k) || {}).data, y = (b.trans.find(c => c.axis === k) || {}).data; if (!x || !y) continue;
      for (let i = 0; i < x.length; i++) { dmax = Math.max(dmax, Math.abs(x[i] - y[i])); pk = Math.max(pk, Math.abs(y[i])); } }
    r3.push({ nm, yaw, dmax, pk, qOld: a.q, qNew: b.q });
    log('lab', nm, yaw ? 'yaw açık' : 'yaw kapalı', 'en büyük fark', dmax.toExponential(2), 'm; tepe', pk.toFixed(4), 'm; q', a.q.toFixed(5), '→', b.q.toFixed(5));
  }
}
out.lab = r3;
// (4) bütçe satırları
const cols = ['E', 'G', 'H', 'I', 'K', 'N', 'O', 'Pp', 'Q', 'AA', 'AB', 'AC', 'AD', 'AE', 'AH'], r4 = [];
for (const [nm, mk] of cases) {
  const a = O.computeBudget(mk(O)), b = N.computeBudget(mk(N)), d = [];
  a.rows.forEach((r, i) => { for (const c of cols) if (r[c] !== b.rows[i][c] && !(Number.isNaN(r[c]) && Number.isNaN(b.rows[i][c]))) d.push(`${r.id}.${c}: ${r[c]} → ${b.rows[i][c]}`); });
  for (const k of ['wander', 'smear', 'los', 'eisWander', 'drift', 'peak']) if (a[k] !== b[k]) d.push(`${k}: ${a[k]} → ${b[k]}`);
  r4.push({ nm, n: d.length, d: d.slice(0, 12) }); log('bütçe', nm, d.length ? d.length + ' fark' : 'özdeş'); d.slice(0, 12).forEach(x => log('   ', x));
}
out.budget = r4;
require('fs').writeFileSync(path.join(__dirname, 'ident.json'), JSON.stringify(out, null, 1));
