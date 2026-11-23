// §10: direk tepesi açısal modu (κ): platform titreşimi (B2-06) satırı ve bütün kaynaklar birlikte wander (işletme, 600 s, tohum 11)
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), out = [];
for (const k of [0, 1e-5, 1e-4]) {
  const P = L.defaultParams('sub'); P.dut.mount.kappa = k;
  const row = L.OP_ROWS.find(q => q.id === 'B2-06'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed: 11 })), M = L.losMetrics(R, P, { skip: 20 });
  const Ra = L.runSim(P, L.opScenario(P, { T: 600, seed: 11, fs: 4000, derot: true })), Ma = L.losMetrics(Ra, P, { skip: 20 });
  out.push({ k, b206: M.rms.el, b206x: M.rms.xel, allW: Ma.video.wander.el, allWx: Ma.video.wander.xel });
  console.log(`κ ${k}: B2-06 el ${(M.rms.el * 1e6).toFixed(2)} / xel ${(M.rms.xel * 1e6).toFixed(2)} µrad; tüm kaynaklar wander el ${(Ma.video.wander.el * 1e6).toFixed(2)} / xel ${(Ma.video.wander.xel * 1e6).toFixed(2)} µrad`);
}
require('fs').writeFileSync(path.join(__dirname, 'mount.json'), JSON.stringify(out, null, 1));
