// §10: motorun döngü parametreleri (bağımsız b, k çözümü için) ve J ölçeklemesinde K, kesim, PM ve tork yolu → mech_eng.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js')), TAU = 2 * Math.PI;
const P = L.defaultParams('sub'), d = L.derive(P), par = (ax, J, Pp) => ({ J, b: Pp.dut[ax].b, k: Pp.dut[ax].k, fc: Pp.dut[ax].fc, fi: Pp.dut[ax].fi, ctl: Pp.dut.ctl, gyro: { fbw: Pp.dut.gyro.fbw, lat_ms: Pp.dut.gyro.lat_ms || 0 }, cur: Pp.dut.cur, resF: Pp.dut.ctl.res.f });
const out = { par: { el: par('el', P.dut.el.J, P), az: par('az', d.azJ, P) }, J: [] };
for (const s of [0.5, 1, 2]) {
  const Q = L.defaultParams('sub'); Q.dut.el.J *= s; const lp = L.derive(Q).loopEl;
  out.J.push({ s, par: par('el', Q.dut.el.J, Q), K: lp.K, pm: lp.pm, fcx: lp.fcx, torque: [1, 2, 8, 20].map(fq => [fq, 20 * Math.log10(L.cabs(lp.torque(TAU * fq)))]) });
}
require('fs').writeFileSync(path.join(__dirname, 'mech_eng.json'), JSON.stringify(out));
console.log('ok', out.J.map(j => `J×${j.s}: K ${j.K.toFixed(2)} PM ${j.pm.toFixed(2)} |θ/T|@2Hz ${j.torque[1][1].toFixed(2)} dB`).join(' | '));
