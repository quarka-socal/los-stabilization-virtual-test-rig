// Teknik kılavuz §3 (deniz hareketi) — v13.5'in değiştirdiği sayılar: T2.5 kestirimi (öteleme segmentleri 1 ve 2 Hz → 2 ve 3 Hz)
// kaldıraç kolu tablosunun dört durumunda (probe/k3/sweep.js'in 'heavy' durumları) ve laboratuvar ötelemesi kolimatöre sığdırılınca
// T1.3 wander'ı (§3 değişim tablosunun T1.3 gözlemleri: roll 6°, h = 10 m, 6-DOF SS4 h = 0 ve h = 1 m).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const mk = (kind, f) => { const P = L.defaultParams(kind); if (f) f(P); return P; };
const arm = (P, r) => { P.wb.sea.rx = r[0]; P.wb.sea.ry = r[1]; P.wb.sea.h = r[2]; };
const six = (P, ss) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[ss])); };
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
const out = { t25: [], t13: [] };
const C25 = [
  ['D1', 'denizaltı varsayılanı, h = 1 m', mk('sub')],
  ['G1', 'gemi varsayılanı, h = 15 m', mk('ship')],
  ['G3', 'gemi, r = (20, −4, 15) m', mk('ship', P => arm(P, [20, -4, 15]))],
  ['G6', 'gemi SS4, r = (20, −4, 15) m', mk('ship', P => { six(P, 'SS4'); arm(P, [20, -4, 15]); })],
];
for (const [id, nm, P] of C25) {
  const t0 = Date.now(), r = L.runTest('T2.5', P, {}), tr = r.num && r.num.tr6;
  const o = { id, nm, status: r.status, measured: r.measured, predEl: tr && tr.predEl, predXel: tr && tr.predXel, upEl: tr && tr.predElUp, upXel: tr && tr.predXelUp };
  out.t25.push(o);
  console.log(`T2.5 ${id} ${nm}: ${r.status} | kestirim el ${f(o.predEl * 1e6)} / xel ${f(o.predXel * 1e6)} (ilişkili ${f(o.upEl * 1e6)} / ${f(o.upXel * 1e6)}) µrad | ${r.measured.slice(0, 120)} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
const C13 = [
  ['Roll genliği 6°', mk('sub', P => { P.wb.sea.roll_A = 6; })],
  ['h = 10 m', mk('sub', P => arm(P, [0, 0, 10]))],
  ['6-DOF SS4 (h = 0)', mk('sub', P => { six(P, 'SS4'); arm(P, [0, 0, 0]); })],
  ['6-DOF SS4 (h = 1 m)', mk('sub', P => six(P, 'SS4'))],
  ['6-DOF SS4 (h = 1 m), sığdırma kapalı', mk('sub', P => { six(P, 'SS4'); P.wb.coll.fitTrans = false; })],
];
for (const [nm, P] of C13) {
  const t0 = Date.now(), r = L.runTest('T1.3', P, {}, null);
  const q = (r.kv || []).find(([k]) => /Deniz ötelemesi/.test(k));
  const o = { nm, status: r.status, measured: r.measured, q: q ? String(q[1]) : '' };
  out.t13.push(o);
  console.log(`T1.3 ${nm}: ${r.status} | ${r.measured.slice(0, 80)} | ${o.q.slice(0, 200)} [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 's3.json'), JSON.stringify(out, null, 1));
