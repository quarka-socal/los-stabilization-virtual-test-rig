// §11 Örnek DUT — gyro, modlar, optik: test ve işletme yanıtları (motor). Parça: node tests.js A|B
//  A: gyro (ARW, BI, bant genişliği, ölçek, doğrusalsızlık, menzil, eksen kaçıklığı, g-duyarlılığı)
//  B: modlar ve soğutucu (optik / gimbal modu frekansı, soğutucu genliği ve frekansı: katlanma kenar durumları)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), pre = require('../../../app/pre.json');
const f = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : x.toFixed(d), u = (x, d = 2) => f(x * 1e6, d);
const mk = (fn, kind) => { const P = L.defaultParams(kind || 'sub'); if (fn) fn(P); return P; };
const ctx0 = () => ({ IFOVcal: pre.ctx.IFOVcal });
const run = (id, P) => L.runTest(id, P, ctx0(), null);
const opRow = (P, id) => { const row = L.OP_ROWS.find(q => q.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 });
  return { el: M.rms.el, xel: M.rms.xel, wEl: M.video.wander.el, wXel: M.video.wander.xel, pdeEl: M.pde ? M.pde.el : NaN }; };
const part = process.argv[2] || 'A', out = [];
const rec = (nm, o) => { out.push(Object.assign({ nm }, o)); console.log(nm + ': ' + Object.entries(o).map(([k, v]) => `${k} ${typeof v === 'number' ? f(v, 4) : v}`).join(' | ')); };
const kvv = (r, re) => { const k = r.kv.find(q => re.test(q[0])); return k ? k[1] : '—'; };
if (part === 'A') {
  for (const [nm, P] of [['varsayılan', mk()], ['ARW × 2', mk(P => { P.dut.gyro.arw *= 2; })]]) {
    const t6 = run('T0.6', P), b5 = opRow(P, 'B1-05'), D = L.opDecomposition ? null : null;
    rec(nm + ' — T0.6 / işletme B1-05', { T06: `${t6.status} ${t6.measured}`, B105_wEl: b5.wEl * 1e6, B105_wXel: b5.wXel * 1e6, B105_el: b5.el * 1e6 });
  }
  for (const [nm, P] of [['BI × 2', mk(P => { P.dut.gyro.bi *= 2; })]]) { const t6 = run('T0.6', P); rec(nm + ' — T0.6', { T06: `${t6.status} ${t6.measured}` }); }
  for (const [nm, P] of [['f_bw 300 Hz', mk(P => { P.dut.gyro.fbw = 300; })], ['f_bw 3000 Hz', mk(P => { P.dut.gyro.fbw = 3000; })]]) {
    const d = L.derive(P), t18 = run('T1.8', P), t11 = run('T1.1', P);
    rec(nm, { PMel: d.loopEl.pm, GMel: d.loopEl.gm, PMaz: d.loopAz.pm, GMaz: d.loopAz.gm, fcEl: d.loopEl.fcx, T18: `${t18.status} ${t18.measured}`, T11: `${t11.status} ${t11.measured.slice(0, 120)}` });
  }
  for (const [nm, P] of [['S_f 1000 ppm', mk(P => { P.dut.gyro.sf_ppm = 1000; })], ['S_nl 300 ppm·FS', mk(P => { P.dut.gyro.sfnl_ppm = 300; })], ['menzil ±20 °/s', mk(P => { P.dut.gyro.range_dps = 20; })]]) {
    const t18 = run('T1.8', P), fi = L.fogInfo(P);
    rec(nm, { T18: `${t18.status} ${t18.measured}`, slew: kvv(t18, /Gidiş sonu/), range: kvv(t18, /menzili/), fogEff_ppm: fi.slew.eff, s10_urad: fi.slew.s10 * 1e6 });
  }
  for (const [nm, P] of [['ε_el 0,5 mrad', mk(P => { P.dut.gyro.epsEl = 0.5; })]]) {
    const t11 = run('T1.1', P), b4 = opRow(P, 'B1-04');
    rec(nm, { T11cross: kvv(t11, /çapraz eksen katsayısı/), B104_el: b4.el * 1e6, B104_xel: b4.xel * 1e6 });
  }
  // g-duyarlılığı: bütçe B1-10 (H.kg) ↔ benzetim (DUT kg), deniz açıları + ötelemeleri + kaldıraç kolu, yalnız gyroG mekanizması
  for (const kind of ['sub', 'ship']) {
    const P = mk(P => { P.dut.gyro.kg = 1; P.wb.H.kg = 1; }, kind), B = L.computeBudget(P, null), r10 = B.rows.find(r => r.id === 'B1-10');
    const MECH = Object.fromEntries(Object.keys(L.MECH_DEFAULT).map(k => [k, false])); MECH.gyroG = true;
    const src = { sea_r: true, sea_p: true, sea_y: true, sea_s: true, sea_w: true, sea_h: true, lever: true };
    const S = L.opScenario(P, { T: 600, seed: 11, src, mech: MECH, fs: 2000, label: 'kg' }), R = L.runSim(P, S), M = L.losMetrics(R, P, { skip: 20 });
    const S2 = L.opScenario(P, { T: 600, seed: 11, src, mech: MECH, fs: 2000, label: 'kg', seaAngCmd: false }), R2 = L.runSim(P, S2), M2 = L.losMetrics(R2, P, { skip: 20 });
    rec(`g-duyarlılığı 1 °/h/g (${kind})`, { B110_budget: r10 ? r10.I : NaN, sim_el: M.rms.el * 1e6, sim_xel: M.rms.xel * 1e6, simNoAng_el: M2.rms.el * 1e6, simNoAng_xel: M2.rms.xel * 1e6 });
  }
} else {
  for (const [nm, P] of [['varsayılan', mk()], ['optik modu 80 Hz', mk(P => { P.dut.modes.opt.f = 80; })], ['optik modu 200 Hz', mk(P => { P.dut.modes.opt.f = 200; })],
    ['gimbal modu 120 Hz', mk(P => { P.dut.modes.gim.f = 120; })], ['gimbal modu 300 Hz', mk(P => { P.dut.modes.gim.f = 300; })]]) {
    const t35 = run('T3.5', P), b3 = opRow(P, 'B3-03'), b4 = opRow(P, 'B3-04');
    rec(nm, { T35: `${t35.status} ${t35.measured}`, B303_el: b3.el * 1e6, B303_xel: b3.xel * 1e6, B304_el: b4.el * 1e6, B304_xel: b4.xel * 1e6 });
  }
  for (const [nm, P] of [['soğutucu varsayılan (60 Hz)', mk()], ['soğutucu genliği × 2', mk(P => { P.dut.cooler.A *= 2; })], ['soğutucu 55 Hz', mk(P => { P.dut.cooler.f = 55; })],
    ['soğutucu 50 Hz (kare hızına eşit)', mk(P => { P.dut.cooler.f = 50; })], ['soğutucu 75 Hz (katlanma Nyquist\'te)', mk(P => { P.dut.cooler.f = 75; })], ['soğutucu 100 Hz', mk(P => { P.dut.cooler.f = 100; })]]) {
    const t34 = run('T3.4', P), b2 = opRow(P, 'B3-02');
    rec(nm, { T34: `${t34.status} ${t34.measured}`, kvOn: kvv(t34, /^Stab ON/), tot: kvv(t34, /Gerçek soğutucu/), B302_el: b2.el * 1e6, B302_xel: b2.xel * 1e6, B302_wEl: b2.wEl * 1e6 });
  }
}
require('fs').writeFileSync(path.join(__dirname, `tests_${part}.json`), JSON.stringify(out, null, 1));
