// §15: "Varsayımlar ve sınırlar" listesindeki sayısal iddiaların güncel varsayılanlarla denetimi
'use strict';
const L = require('../../engine.js'), P = L.defaultParams('sub'), S = L.defaultParams('ship'), D2R = Math.PI / 180;
const g = P.dut, out = {};
const pr = (k, v) => { out[k] = v; console.log(k + ':', typeof v === 'object' ? JSON.stringify(v) : v); };
pr('dut anahtarları', Object.keys(g));
pr('mech', JSON.stringify(g.mech || g.gimbal || {}).slice(0, 600));
pr('fric', JSON.stringify(g.fric || (g.mech && g.mech.fric) || {}).slice(0, 400));
pr('gyro', JSON.stringify(g.gyro || {}).slice(0, 700));
pr('env.sea', JSON.stringify(P.env.sea).slice(0, 400));
pr('wb.hex', JSON.stringify(P.wb.hex).slice(0, 400));
pr('ana.los.trk', JSON.stringify(P.ana.los.trk));
