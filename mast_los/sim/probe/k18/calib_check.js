// §15: "Kalibre düzey" iddiasının güncel motorla denetimi — cal_all.js'in ölçüm adımı, ayar yapmadan: dar bant kapalı taban döngüde
// (bütçenin varsaydığı DUT), her kalibre satırın yalıtılmış işletme koşusu (600 s, satırın varsayılan tohumu) ↔ bütçe hedefi
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const P = L.defaultParams(); P.dut.ctl.res.on = false;
const target = { 'B1-07': 3.00, 'B2-02': 2.00, 'B2-03': 2.00, 'B2-04': 1.50, 'B2-06': 2.00, 'B3-01': 3.00, 'B3-02': 1.50, 'B3-03': 2.00, 'B3-04': 1.50 };
const out = {}; let worst = 0, worstId = '';
for (const id of Object.keys(target)) {
  const row = L.OP_ROWS.find(r => r.id === id), t0 = Date.now();
  const R = L.runSim(P, L.rowScenario(P, row, { T: 600 })), M = L.losMetrics(R, P, { skip: 20 }), v = M.rms.el * 1e6, e = v / target[id] - 1;
  out[id] = { el: v, target: target[id], dev: e }; if (id !== 'B2-02' && Math.abs(e) > Math.abs(worst)) { worst = e; worstId = id; }
  console.log(`${id}: el ${v.toFixed(3)} µrad ↔ hedef ${target[id].toFixed(2)} (${(100 * e).toFixed(2)} %) ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(`dalga çarpması dışında en büyük sapma ${worstId} ${(100 * worst).toFixed(2)} %; B2-02 tek gerçekleşme (beklenen değere kalibre, v13.13)`);
fs.writeFileSync(path.join(__dirname, 'calib_check.json'), JSON.stringify({ rows: out, worst, worstId }, null, 1));
