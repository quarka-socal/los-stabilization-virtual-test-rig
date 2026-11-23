// §12: dalga çarpması (B2-02) için bağımsız analitiğin girdisi — motorun el döngüsü parametreleri (dar bant kapalı / açık @ res.f) → slap_eng.json,
// ve 24 tohumluk işletme dağılımı (dar bant kapalı ve yapılandırılmış). Analitik Campbell hesabı slap_ref.py'de (k11 bağımsız döngü modeliyle).
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const P0 = L.defaultParams('sub'), out = { par: [], env: P0.env.slap, ens: {} };
for (const on of [false, true]) { const P = L.defaultParams('sub'); P.dut.ctl.res.on = on; const ap = P.dut.el;
  out.par.push({ on, par: { J: ap.J, b: ap.b, k: ap.k, fc: ap.fc, fi: ap.fi, ctl: P.dut.ctl, gyro: { fbw: P.dut.gyro.fbw, lat_ms: P.dut.gyro.lat_ms || 0 }, cur: P.dut.cur, resF: P.dut.ctl.res.f } }); }
const op = (P, seed) => { const row = L.OP_ROWS.find(q => q.id === 'B2-02'), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed })), M = L.losMetrics(R, P, { skip: 20 }); return M.rms.el; };
for (const [nm, on] of [['off', false], ['cfg', true]]) { const v = []; for (let s = 0; s < 24; s++) { const P = L.defaultParams('sub'); P.dut.ctl.res.on = on; v.push(op(P, 100 + s) * 1e6); }
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)), ms = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length);
  out.ens[nm] = { v, mean: m, sd, rmsOfRms: ms }; console.log(`${nm}: 24 tohum ort ${m.toFixed(3)} ± ${sd.toFixed(3)} µrad, karesel ortalama ${ms.toFixed(3)} (en küçük ${Math.min(...v).toFixed(2)}, en büyük ${Math.max(...v).toFixed(2)})`); }
require('fs').writeFileSync(path.join(__dirname, 'slap_eng.json'), JSON.stringify(out));
