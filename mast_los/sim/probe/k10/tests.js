// §8 Bütçe varsayımları — test yanıtları (v13.7 motoru): T0.6 (ARW, bias kararsızlığı ↔ B1-05/B1-06 varsayımları), T1.1 B1-04
// (çapraz eksen katsayısı ↔ bütçe roll tabanı ve LOS ekseni tabanı), T1.5 (türetme artığı ↔ R-01 varsayımı; ölçek / gecikme
// ayrımı), işletme satırları (B1-04 LOS geometrisine göre; B1-05 wander penceresi ↔ σ√(T/15), dört tohum). Çıktı: tests.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const D2R = Math.PI / 180, f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const pre = require('../../../app/pre.json');
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const out = { t06: [], t11: [], t15: [], op: [] };
const run = (id, P) => { const t0 = Date.now(); const r = L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null); r._s = (Date.now() - t0) / 1000; return r; };
// T0.6
for (const [nm, P] of [['varsayılan', mk()], ['DUT ARW 0,008 °/√h', mk(null, P => { P.dut.gyro.arw = 0.008; })], ['DUT bias kararsızlığı 0,08 °/h', mk(null, P => { P.dut.gyro.bi = 0.08; })],
  ['bütçe ARW 0,003 / bias 0,03 (sıkı)', mk(null, P => { P.wb.H.arw = 0.003; P.wb.H.bias = 0.03; })]]) {
  const r = run('T0.6', P); out.t06.push({ nm, st: r.status, m: r.measured, fill: r.fill });
  console.log(`T0.6 ${nm}: ${r.status} — ${r.measured} · dolgu B1-05 ${u(r.fill['B1-05'], 3)} B1-06 ${u(r.fill['B1-06'], 3)} µrad [${f(r._s, 0)} s]`);
}
// T1.1 → B1-04
for (const [nm, P] of [['varsayılan', mk()], ['gemi', mk('ship')], ['DUT ε 0,5 mrad', mk(null, P => { P.dut.gyro.epsEl = 0.5; P.dut.gyro.epsXel = 0.5; P.wb.H.eps_mrad = 0.5; })],
  ['LOS pruvaya bakar (a0 = 0°)', mk(null, P => { P.dut.geom.a0 = 0; })]]) {
  const r = run('T1.1', P), b = L.computeBudget(P, null).rows.find(q => q.id === 'B1-04');
  const kv = (r.kv || []).filter(([k]) => /çapraz eksen|B1-04/.test(k)).map(([k, v]) => k + ': ' + v).join(' | ');
  out.t11.push({ nm, st: r.status, b104: r.fill['B1-04'], budget: b.I, kv });
  console.log(`T1.1 ${nm}: ${r.status} · B1-04 ölçülen ${u(r.fill['B1-04'])} µrad ↔ bütçe (roll tabanı) ${f(b.I, 2)} [${f(r._s, 0)} s]\n   ${kv}`);
}
// T1.5 → R-01: türetme artığı ölçek hatası (sf) ve gecikmeden: ψ_res ≈ σ_rot·√(sf² + (2πf·τ)²) (dar bant)
for (const [nm, P] of [['varsayılan', mk()], ['gemi', mk('ship')], ['türetme ölçek hatası 0', mk(null, P => { P.dut.derot.sf = 0; })], ['türetme gecikmesi 0', mk(null, P => { P.dut.derot.lat_ms = 0; })],
  ['gemi, türetme gecikmesi 10 ms', mk('ship', P => { P.dut.derot.lat_ms = 10; })]]) {
  const r = run('T1.5', P), SD = L.seaDOF(P), am = [0, 1].map(ax => L.axisMap(P, ax)), d = L.derive(P);
  const sr = Math.hypot(am[0].rotW * SD.ang[0].sigma, am[1].rotW * SD.ang[1].sigma), fr = Math.abs(am[1].rotW) >= Math.abs(am[0].rotW) ? SD.ang[1].fdom : SD.ang[0].fdom;
  const exp = sr * Math.hypot(P.dut.derot.sf, 2 * Math.PI * fr * P.dut.derot.lat_ms * 1e-3);
  out.t15.push({ nm, st: r.status, m: r.measured, fill: r.fill['R-01'], exp, expPt: exp * d.rot.ang });
  console.log(`T1.5 ${nm}: ${r.status} — ${r.measured.slice(0, 150)} · analitik artık ${u(exp, 1)} µrad → köşe ${u(exp * d.rot.ang, 2)} µrad (bütçe varsayımı ${P.wb.H.roll_res_mrad} mrad → ${u(P.wb.H.roll_res_mrad * 1e-3 * d.rot.ang, 2)}) [${f(r._s, 0)} s]`);
}
// işletme satırları: B1-04 (a0 = 0 ve 90°), B1-05 dört tohumda wander penceresi
const opRow = (P, id, seed) => { const row = L.OP_ROWS.find(r => r.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed })), M = L.losMetrics(R, P, { skip: 20 }); return { el: M.rms.el, xel: M.rms.xel, wEl: M.video.wander.el, wXel: M.video.wander.xel, pdeEl: M.video.pde.el.rms, pdeXel: M.video.pde.xel.rms }; };
for (const [nm, P] of [['B1-04, a0 = 0° (LOS ekseni = roll)', mk(null, P => { P.dut.geom.a0 = 0; })]]) {
  const t0 = Date.now(), r = opRow(P, 'B1-04', 11), SD = L.seaDOF(P);
  out.op.push({ nm, id: 'B1-04', r, expLos: P.dut.gyro.epsEl * 1e-3 * SD.ang[0].sigma });
  console.log(`işletme ${nm}: el ${u(r.el)} / xel ${u(r.xel)} µrad (ε·σ_roll ${u(P.dut.gyro.epsEl * 1e-3 * SD.ang[0].sigma)}) [${f((Date.now() - t0) / 1000, 0)} s]`);
}
{ const P = mk(), sig = P.dut.gyro.arw * D2R / 60, wExp = sig * Math.sqrt(P.ana.Tw / 15), pdeExp = sig * Math.sqrt(P.wb.tau), rows = [];
  for (const seed of [11, 12, 13, 14]) { const t0 = Date.now(), r = opRow(P, 'B1-05', seed); rows.push(r); console.log(`işletme B1-05 tohum ${seed}: wander penceresi el ${u(r.wEl)} / xel ${u(r.wXel)} · τ penceresi (PDE) ${u(r.pdeEl)} / ${u(r.pdeXel)} µrad [${f((Date.now() - t0) / 1000, 0)} s]`); }
  const m = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  out.op.push({ id: 'B1-05', rows, wExp, pdeExp });
  console.log(`B1-05 ortalama: wander el ${u(m('wEl'))} xel ${u(m('wXel'))} ↔ σ√(T_w/15) ${u(wExp)} µrad; PDE el ${u(m('pdeEl'))} xel ${u(m('pdeXel'))} ↔ σ√τ ${u(pdeExp)} (DUT ARW ${P.dut.gyro.arw} °/√h)`);
}
require('fs').writeFileSync(path.join(__dirname, 'tests.json'), JSON.stringify(out, null, 1));
