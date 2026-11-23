// §9 Örnek DUT — stabilizasyon döngüsü: test yanıtları (motor). T1.1 (deniz frekansında DRR ↔ f_c, f_i), T2.1 / T2.2 (VIV bandı ↔ dar
// bant kontrol), T1.6 (sürtünme ileri beslemesi), T1.8 (oturma ↔ f_c), T1.4 (elevasyon; sekant), T4.2 (sıcaklık programlı sürtünme),
// T1.5 (türetme kapalı), zaman alanı DRR'ı dar bant ayar hatasıyla (analitik loopModel(resF) ile), işletme B1-07 (ileri besleme).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const TAU = 2 * Math.PI, D2R = Math.PI / 180, f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const pre = require('../../../app/pre.json');
const mk = (kind, fn) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const out = {};
const run = (id, P) => { const t0 = Date.now(); const r = L.runTest(id, P, { IFOVcal: pre.ctx.IFOVcal }, null); r._s = (Date.now() - t0) / 1000; return r; };
const T = (id, list, pick) => { out[id] = []; for (const [nm, P] of list) { const r = run(id, P); const x = pick ? pick(r, P) : ''; out[id].push({ nm, st: r.status, m: r.measured, x, fill: r.fill }); console.log(`${id} ${nm}: ${r.status} — ${r.measured.slice(0, 330)}${x ? ' | ' + x : ''} [${f(r._s, 0)} s]`); } };
const pmOf = (P) => { const d = L.derive(P); return `PM el ${f(d.loopEl.pm, 1)}° / az ${f(d.loopAz.pm, 1)}°, kesim ${f(d.loopEl.fcx, 1)} / ${f(d.loopAz.fcx, 1)} Hz`; };
T('T1.1', [['varsayılan', mk()], ['el f_c 20 Hz', mk(null, P => { P.dut.el.fc = 20; })], ['el f_c 60 Hz', mk(null, P => { P.dut.el.fc = 60; })],
  ['el f_i 2 Hz', mk(null, P => { P.dut.el.fi = 2; })], ['el f_i 8 Hz', mk(null, P => { P.dut.el.fi = 8; })]], (r, P) => pmOf(P));
T('T2.1', [['varsayılan', mk()], ['dar bant kapalı', mk(null, P => { P.dut.ctl.res.on = false; })], ['dar bant 10 dB', mk(null, P => { P.dut.ctl.res.gain_dB = 10; })]]);
T('T2.2', [['varsayılan (dar bant ideal ayarlı)', mk()], ['dar bant kapalı', mk(null, P => { P.dut.ctl.res.on = false; })], ['dar bant 10 dB', mk(null, P => { P.dut.ctl.res.gain_dB = 10; })],
  ['dar bant 30 dB', mk(null, P => { P.dut.ctl.res.gain_dB = 30; })], ['çalışma bandı üst sınırı 2,5 Hz (VIV dışarıda)', mk(null, P => { P.dut.ctl.res.fmax = 2.5; })],
  ['gemi', mk('ship')], ['gemi, dar bant kapalı', mk('ship', P => { P.dut.ctl.res.on = false; })]]);
T('T1.6', [['varsayılan (LuGre ileri besleme, η 0,95)', mk()], ['ileri besleme kapalı', mk(null, P => { P.dut.ctl.ff.on = false; })], ['η 0,5', mk(null, P => { P.dut.ctl.ff.eta = 0.5; })],
  ['η 1,1 (aşırı)', mk(null, P => { P.dut.ctl.ff.eta = 1.1; })], ['hız kestirimi 100 Hz', mk(null, P => { P.dut.ctl.ff.f_est = 100; })], ['hız kestirimi 2000 Hz', mk(null, P => { P.dut.ctl.ff.f_est = 2000; })]]);
T('T1.8', [['varsayılan', mk()], ['az f_c 15 Hz', mk(null, P => { P.dut.az.fc = 15; })], ['az f_c 45 Hz', mk(null, P => { P.dut.az.fc = 45; })], ['az f_i 8 Hz', mk(null, P => { P.dut.az.fi = 8; })]], (r, P) => pmOf(P));
T('T1.4', [['varsayılan (sekant AÇIK)', mk()], ['sekant kapalı', mk(null, P => { P.dut.ctl.secant = false; })]]);
T('T4.2', [['varsayılan (sabit sürtünme modeli)', mk()], ['sıcaklık programlı sürtünme modeli', mk(null, P => { P.dut.ctl.ff.tempSched = true; })]]);
T('T1.5', [['türetme kapalı', mk(null, P => { P.dut.derot.on = false; })]]);
// zaman alanı DRR: el ekseni, 0,05° sinüs, yalnız kuplaj (V&V D1 düzeni); dar bant ton frekansına göre kaydırılmış
const MECH_OFF = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false])), MEAS_OFF = { video: false, ac: false, imu: false, air: false, microvib: false, noise: false };
const drrRun = (P, fq, resF) => {
  const nper = Math.max(6, Math.round(4 * fq)), ramp = Math.max(1, 1 / fq), core = nper / fq, Tt = 1 + 2 * ramp + core + 1;
  const S = { T: Tt, fs: 4000, world: 'lab', stab: true, seed: 3, mech: Object.assign({}, MECH_OFF, { coupling: true, earth: true }), meas: MEAS_OFF, hexActive: false, cooler: false, hexF: 1500, resF,
    cmd: [{ type: 'sine', axis: 0, A: 0.05 * D2R, f: fq, t0: 1, t1: Tt - 1, ramp }], rec: { fs: 4000, ch: ['mech_el', 'base_r'] } };
  const R = L.runSim(P, S), n = R.meta.nRec, t = Float64Array.from({ length: n }, (_, i) => i / R.meta.fRec);
  let i0 = 0; while (t[i0] < 1 + ramp + 0.25 / fq) i0++; let i1 = i0; while (i1 < n && t[i1] <= Tt - 1 - ramp - 0.25 / fq) i1++;
  return L.sineFit(t, R.rec.mech_el, fq, { i0, i1 }).A / L.sineFit(t, R.rec.base_r, fq, { i0, i1 }).A;
};
out.mistune = [];
{ const P = mk(), f0 = 3.0;
  for (const e of [0, 0.05, 0.1, 0.2]) { const t0 = Date.now(), g = drrRun(P, f0, f0 * (1 + e)), lp = L.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J, f0 * (1 + e)), m = L.cabs(lp.drr(TAU * f0));
    out.mistune.push({ e, sim: 20 * Math.log10(g), mdl: 20 * Math.log10(m) });
    console.log(`zaman alanı DRR @ 3 Hz, dar bant ${f(f0 * (1 + e), 2)} Hz (hata %${f(e * 100, 0)}): benzetim ${f(20 * Math.log10(g), 2)} dB ↔ analitik ${f(20 * Math.log10(m), 2)} dB [${f((Date.now() - t0) / 1000, 0)} s]`); } }
// işletme B1-07 (sürtünme): ileri besleme açık / kapalı
out.op = [];
for (const [nm, P] of [['ileri besleme AÇIK', mk()], ['ileri besleme kapalı', mk(null, P => { P.dut.ctl.ff.on = false; })]]) {
  const t0 = Date.now(), row = L.OP_ROWS.find(r => r.id === 'B1-07'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 });
  out.op.push({ nm, el: M.rms.el, xel: M.rms.xel, wEl: M.video.wander.el });
  console.log(`işletme B1-07 ${nm}: el ${u(M.rms.el)} / xel ${u(M.rms.xel)} µrad, wander el ${u(M.video.wander.el)} [${f((Date.now() - t0) / 1000, 0)} s]`);
}
require('fs').writeFileSync(path.join(__dirname, 'tests.json'), JSON.stringify(out, null, 1));
