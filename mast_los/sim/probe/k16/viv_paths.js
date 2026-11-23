// v13.14 §13: Düzenek "VIV" senaryosunda LOS / taban oranının yolları — tam koşu, öteleme kapalı, mekanik LOS (optik/esnek modlar
// hariç) ve döngü modelinin DRR'ı (f_v'de, LOS'a izdüşen dönme bileşeniyle). Senaryo playScenario'nun 'viv' dalıyla aynı kurulur.
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const sf = (t, y, f) => { let a = 0, b = 0, c = 0, d = 0, e = 0, n = t.length; // en küçük kareler sin + cos + sabit
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  for (let i = 0; i < n; i++) { const s = Math.sin(2 * Math.PI * f * t[i]), co = Math.cos(2 * Math.PI * f * t[i]), r = [s, co, 1]; for (let j = 0; j < 3; j++) { v[j] += r[j] * y[i]; for (let k = 0; k < 3; k++) M[j][k] += r[j] * r[k]; } }
  const x = L.solveLin(M, v); return Math.hypot(x[0], x[1]) / Math.SQRT2; };
const out = {};
for (const plat of ['sub', 'ship']) {
  const P = L.defaultParams(plat), VS = L.vivSpec(P), fv = VS.f, T = 60, seed = 1301;
  const tone = L.windTone(P, VS, fv, 1, null, 3, 1);
  const lp = L.loopModel(P.dut.el, P.dut.ctl, P.dut.gyro, P.dut.cur, P.dut.el.J), drr = L.cabs(lp.drr(2 * Math.PI * fv));
  const res = {};
  for (const [nm, useTr, mech] of [['tam', true, null], ['öteleme yok', false, null], ['modlar yok', true, { flex: false, optics: false }]]) {
    const S = L.labScenario(P, { label: 'viv paths', T, fs: 2000, stab: true, cmd: tone.cmd, trans: useTr ? tone.trans : [], seed, resF: fv,
      rec: { fs: 1000, ch: ['opt_el', 'opt_xel', 'mech_el', 'mech_xel', 'cmd_r', 'cmd_p'] } });
    if (mech) S.mech = Object.assign({}, S.mech || {}, mech);
    const R = L.runSim(P, S), fr = R.meta.fRec, j0 = Math.round(5 * fr), n = R.meta.nRec, t = [], g = (c) => { const y = []; for (let i = j0; i < n; i++) y.push(R.rec[c][i]); return y; };
    for (let i = j0; i < n; i++) t.push(i / fr);
    res[nm] = { opt_el: sf(t, g('opt_el'), fv), opt_xel: sf(t, g('opt_xel'), fv), mech_el: sf(t, g('mech_el'), fv), cmd_r: sf(t, g('cmd_r'), fv), cmd_p: sf(t, g('cmd_p'), fv) };
  }
  const base = res['tam'].cmd_r, db = (x) => 20 * Math.log10(x / base);
  out[plat] = { fv, drrDb: 20 * Math.log10(drr), A_rms: VS.A / Math.SQRT2, roll: VS.roll, pitch: VS.pitch, y: VS.y, lin: VS.lin, res,
    dB: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { opt: db(v.opt_el), mech: db(v.mech_el) }])) };
  console.log(`${plat}: f_v ${fv} Hz, taban roll RMS ${(base * 1e6).toFixed(1)} µrad, öteleme ${(VS.y * 1e3).toFixed(2)} mm; döngü DRR ${out[plat].drrDb.toFixed(2)} dB`);
  for (const [k, v] of Object.entries(res)) console.log(`   ${k}: optik LOS el ${(v.opt_el * 1e6).toFixed(3)} µrad (${db(v.opt_el).toFixed(2)} dB), mekanik ${(v.mech_el * 1e6).toFixed(3)} µrad (${db(v.mech_el).toFixed(2)} dB)`);
}
fs.writeFileSync(path.join(__dirname, 'viv_paths.json'), JSON.stringify(out, null, 1));
