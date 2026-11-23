// Teknik kılavuz §3 (v13.1) — kaldıraç kolu vektörü taraması: her durumda motorun analitik değerleri (seaAccDirector,
// B1-08/B1-10, seaLabDemand) ↔ zaman serisi (işletme ivmesi 3000 s, laboratuvar ötelemesi 620 s tohum 1301) ve seçili
// durumlarda işletme ayrıştırmasının B1-08 satırı (600 s) ile T2.5 kestirimi.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const mk = (kind, f) => { const P = L.defaultParams(kind); if (f) f(P); return P; };
const arm = (P, r) => { P.wb.sea.rx = r[0]; P.wb.sea.ry = r[1]; P.wb.sea.h = r[2]; };
const six = (P, ss) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[ss])); };
const cases = [
  ['D1', 'denizaltı varsayılanı, h = 1 m', mk('sub'), true],
  ['D2', 'denizaltı, h = 0 (v13 varsayılanı)', mk('sub', P => arm(P, [0, 0, 0])), false],
  ['D3', 'denizaltı, h = 10 m', mk('sub', P => arm(P, [0, 0, 10])), false],
  ['G1', 'gemi varsayılanı, h = 15 m', mk('ship'), true],
  ['G2', 'gemi, r = (20, 0, 15) m', mk('ship', P => arm(P, [20, 0, 15])), false],
  ['G3', 'gemi, r = (20, −4, 15) m', mk('ship', P => arm(P, [20, -4, 15])), true],
  ['G4', 'gemi, r = (30, 0, 0) m', mk('ship', P => arm(P, [30, 0, 0])), false],
  ['G5', 'gemi SS4, h = 15 m', mk('ship', P => six(P, 'SS4')), false],
  ['G6', 'gemi SS4, r = (20, −4, 15) m', mk('ship', P => { six(P, 'SS4'); arm(P, [20, -4, 15]); }), true],
  ['D4', 'denizaltı SS5, r = (−8, 3, −2) m', mk('sub', P => { six(P, 'SS5'); arm(P, [-8, 3, -2]); }), false],
];
const out = [];
for (const [id, nm, P, heavy] of cases) {
  const t0 = Date.now(), A = L.seaAccDirector(P), LD = L.seaLabDemand(P), rows = L.budgetRows(P), r8 = rows.find(q => q.id === 'B1-08');
  // zaman serisi: işletme ivmesi (tam rijit cisim) RMS
  const M = L.seaMotion(P, 3000, L.makeRngFactory(77), { world: 'op' }), i0 = 30 * 20;
  const rmsT = [0, 1, 2].map(k => { const c = M.acc.find(q => q.axis === k); if (!c) return 0; let s = 0, n = 0; for (let i = i0; i < c.data.length - i0; i++) { s += c.data[i] ** 2; n++; } return Math.sqrt(s / n); });
  // laboratuvar ötelemesi (T1.3 tohum 1 ile aynı profil): talep ve q
  const S = L.seaLabScenario(P, { T: 620, seed: 1301 });
  const o = { id, nm, r: L.seaArm(P), acc: { x: A.x, y: A.y, z: A.z, eff: A.eff, up: A.corrUp.eff, fa: A.fa }, accT: rmsT, effT: Math.hypot(...rmsT),
    B108: r8.E, B108up: P.wb.H.accSens * A.corrUp.eff, lab: { sig: LD.axes.map(a => a.sigma), pk: LD.pk, q: LD.q }, labT: { demand: S.seaDemand, q: S.seaQ } };
  if (heavy) {
    const row = L.OP_ROWS.find(q => q.id === 'B1-08'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), Mt = L.losMetrics(R, P, { skip: 20, psd: false });
    const t25 = L.runTest('T2.5', P, {}), tr = t25.num && t25.num.tr6;
    o.op = { el: Mt.rms.el, xel: Mt.rms.xel }; o.t25 = tr ? { predEl: tr.predEl, predXel: tr.predXel, upEl: tr.predElUp, upXel: tr.predXelUp, fOp: tr.fOp } : null;
  }
  out.push(o);
  const f = (x, d = 3) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d);
  console.log(`${id} ${nm}: |a| ${f(A.eff)} (zaman ${f(o.effT)}; x/y/z ${[A.x, A.y, A.z].map(v => f(v)).join('/')} ↔ ${rmsT.map(v => f(v)).join('/')}) m/s², tam ilişkili ${f(A.corrUp.eff)}, f_a ${f(A.fa)} Hz, B1-08 ${f(r8.E, 2)} (üst ${f(o.B108up, 2)}) µrad | lab q analitik ${f(LD.q, 4)} ↔ koşu ${f(S.seaQ, 4)} (talep ${f(S.seaDemand, 3)} m)` +
    (o.op ? ` | işletme B1-08 el ${f(o.op.el * 1e6, 2)} / xel ${f(o.op.xel * 1e6, 2)}, T2.5 kestirimi el ${f(o.t25.predEl * 1e6, 2)} / xel ${f(o.t25.predXel * 1e6, 2)} (ilişkili ${f(o.t25.upEl * 1e6, 2)} / ${f(o.t25.upXel * 1e6, 2)}) µrad` : '') + ` [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'sweep.json'), JSON.stringify(out, null, 1));
