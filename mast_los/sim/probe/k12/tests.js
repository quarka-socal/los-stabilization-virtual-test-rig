// §10 Örnek DUT — mekanik ve sürtünme: test ve işletme yanıtları (motor, v13.10). Kalibrasyon sınaması (B1-07, B2-03, B2-04 taban döngü ↔
// yapılandırılmış DUT), J, b, k, F_c, σ0, vuruntu, dengesizlik ve direk tepesi modu değişimleri. Çıktı: tests.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const TAU = 2 * Math.PI, f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const mk = (fn, kind) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const run = (id, P) => { const t0 = Date.now(); const r = L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null); r._s = (Date.now() - t0) / 1000; return r; };
const op = (P, id) => { const row = L.OP_ROWS.find(q => q.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 }); return { el: M.rms.el, xel: M.rms.xel, wEl: M.video.wander.el }; };
const out = { calib: [], cases: [] };
// 1) kalibrasyon: B1-07, B2-03, B2-04 — yapılandırılmış DUT ↔ dar bant kapalı (taban döngü) ↔ dar bant ve ileri besleme kapalı
for (const [nm, P] of [['yapılandırılmış DUT', mk()], ['dar bant kapalı', mk(P => { P.dut.ctl.res.on = false; })], ['dar bant kapalı, η 1', mk(P => { P.dut.ctl.res.on = false; P.dut.ctl.ff.eta = 1; })]]) {
  const r = {}; for (const id of ['B1-07', 'B2-03', 'B2-04']) r[id] = op(P, id);
  out.calib.push({ nm, r }); console.log(`kalibrasyon ${nm}: B1-07 el ${u(r['B1-07'].el)} · B2-03 el ${u(r['B2-03'].el)} · B2-04 el ${u(r['B2-04'].el)} µrad (bütçe 3 / 2 / 1,5)`);
}
// 2) değişimler
const T16 = (P) => { const r = run('T1.6', P), m = r.measured.match(/tepe ([\d.]+) µrad/); return { st: r.status, pk: m ? +m[1] : NaN }; };
const T25 = (P) => { const r = run('T2.5', P); return { st: r.status, m: r.measured.slice(0, 140) }; };
const T11 = (P) => { const r = run('T1.1', P), m = r.measured.match(/roll 0\.125 Hz (-?[\d.]+) dB/); return { st: r.status, d: m ? +m[1] : NaN }; };
const T24 = (P) => { const r = run('T2.4', P); return { st: r.status, m: r.measured.slice(0, 160) }; };
const cases = [
  ['varsayılan', mk(), ['T11', 'T16', 'T25', 'T24', 'B1-07', 'B2-03', 'B2-04']],
  ['J × 0,5', mk(P => { P.dut.el.J *= 0.5; P.dut.az.Ja *= 0.5; P.dut.az.Jex *= 0.5; P.dut.az.Jez *= 0.5; }), ['T11', 'T16', 'T25', 'B1-07', 'B2-03', 'B2-04']],
  ['J × 2', mk(P => { P.dut.el.J *= 2; P.dut.az.Ja *= 2; P.dut.az.Jex *= 2; P.dut.az.Jez *= 2; }), ['T11', 'T16', 'T25', 'B1-07', 'B2-03', 'B2-04']],
  ['b × 2', mk(P => { P.dut.el.b *= 2; }), ['T11']], ['k × 2', mk(P => { P.dut.el.k *= 2; }), ['T11']],
  ['F_c × 0,5', mk(P => { for (const a of [P.dut.el, P.dut.az]) { a.Fc *= 0.5; a.Fs = 1.1 * a.Fc; a.sigma0 *= 0.5; } }), ['T16', 'B1-07']],
  ['F_c × 2', mk(P => { for (const a of [P.dut.el, P.dut.az]) { a.Fc *= 2; a.Fs = 1.1 * a.Fc; a.sigma0 *= 2; } }), ['T16', 'B1-07']],
  ['σ0 × 0,1 (ön-kayma 10 mrad)', mk(P => { P.dut.el.sigma0 *= 0.1; P.dut.az.sigma0 *= 0.1; }), ['T16', 'T24', 'B1-07']],
  ['σ0 × 10 (ön-kayma 0,1 mrad)', mk(P => { P.dut.el.sigma0 *= 10; P.dut.az.sigma0 *= 10; }), ['T16', 'T24', 'B1-07']],
  ['σ0 × 100 (ön-kayma 10 µrad)', mk(P => { P.dut.el.sigma0 *= 100; P.dut.az.sigma0 *= 100; }), ['T16', 'T24', 'B1-07']],
  ['ileri besleme kapalı, σ0 × 10', mk(P => { P.dut.ctl.ff.on = false; P.dut.el.sigma0 *= 10; P.dut.az.sigma0 *= 10; }), ['T16', 'B1-07']],
  ['vuruntu 0', mk(P => { P.dut.el.cogA = 0; P.dut.az.cogA = 0; }), ['T16', 'B2-04']],
  ['vuruntu × 2', mk(P => { P.dut.el.cogA *= 2; P.dut.az.cogA *= 2; }), ['T16', 'B2-04']],
  ['dengesizlik kütlesi × 2', mk(P => { P.dut.imb.me *= 2; }), ['T25', 'B2-03']],
  ['dengesizlik 0', mk(P => { P.dut.imb.me = 0; P.dut.imb.ma = 0; }), ['T25', 'B2-03']],
  ['direk tepesi modu κ 1e-4', mk(P => { P.dut.mount.kappa = 1e-4; }), ['B2-03', 'B1-08']],
];
for (const [nm, P, what] of cases) {
  const t0 = Date.now(), r = {}, d = L.derive(P);
  for (const w of what) r[w] = w === 'T11' ? T11(P) : w === 'T16' ? T16(P) : w === 'T25' ? T25(P) : w === 'T24' ? T24(P) : op(P, w);
  out.cases.push({ nm, r, pm: d.loopEl.pm, K: d.loopEl.K });
  console.log(`${nm} [PM ${f(d.loopEl.pm, 1)}°, K ${f(d.loopEl.K, 1)}]: ` + what.map(w => { const x = r[w]; return w === 'T11' ? `T1.1 ${x.st} ${f(x.d, 1)} dB` : w === 'T16' ? `T1.6 ${x.st} ${f(x.pk, 1)} µrad` : (w === 'T25' || w === 'T24') ? `${w === 'T25' ? 'T2.5' : 'T2.4'} ${x.st} ${x.m}` : `${w} el ${u(x.el)} / xel ${u(x.xel)}`; }).join(' | ') + ` [${f((Date.now() - t0) / 1000, 0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'tests.json'), JSON.stringify(out, null, 1));
