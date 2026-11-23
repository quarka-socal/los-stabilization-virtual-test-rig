// β = 90° rüzgâr VIV dwell'inde dar bant kontrolün xel artığını büyütmesi: yol ayrımı (dengesizlik ↔ optik montaj) sınaması
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const P0 = L.defaultParams('ship'); P0.wb.wviv.beta = 90;
const VS = L.vivSpec(P0), f = Math.round(VS.f * 100) / 100;
const run = (resOn, mech, lin) => {
  const P = L.cloneParams(P0); P.dut.ctl.res.on = resOn;
  const VSx = lin ? VS : Object.assign({}, VS, { lin: false });
  const ramp = Math.max(1.0, 0.5 / f), core = Math.round(60 * f) / f, t0 = 1, t1 = t0 + 2 * ramp + core, tn = L.windTone(P, VSx, f, t0, t1, ramp);
  const S = L.labScenario(P, { label: 'w1', T: t1 + 2, fs: 2000, cmd: tn.cmd, trans: tn.trans, resF: f, seed: 2201 });
  if (mech) S.mech = Object.assign({}, L.MECH_DEFAULT, mech);
  const R = L.runSim(P, S), fit = L.fitSegments(P, R, [{ axis: 1, f, c0: t0 + ramp + 0.25 / f, c1: t1 - ramp - 0.25 / f }], {})[0];
  return { el: fit.fe.A / Math.SQRT2 * 1e6, xel: fit.fx.A / Math.SQRT2 * 1e6, fx: fit.fx };
};
for (const [nm, mech, lin] of [['tüm mekanizmalar', null, true], ['optik montaj kapalı', { optMode: false }, true], ['dengesizlik kapalı', { imbalance: false }, true], ['öteleme yok (yalnız açısal)', null, false]]) {
  const a = run(false, mech, lin), b = run(true, mech, lin);
  console.log(`${nm}: OFF xel ${a.xel.toFixed(2)} µrad (faz ${(Math.atan2(a.fx.b, a.fx.a) * 180 / Math.PI).toFixed(0)}°) → ON xel ${b.xel.toFixed(2)} µrad (faz ${(Math.atan2(b.fx.b, b.fx.a) * 180 / Math.PI).toFixed(0)}°)`);
}
