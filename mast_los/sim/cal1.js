// Analitik döngü ayarı: el DRR(1/8 Hz) = −80 dB, DRR(3 Hz) = −40 dB ; az DRR(1/12 Hz) = −80 dB
const L = require('./engine.js');
const P = L.defaultParams();
function drrDb(ax, J, f) { const lm = L.loopModel(ax, P.dut.ctl, P.dut.gyro, P.dut.cur, J); return L.db(L.cabs(lm.drr(2 * Math.PI * f))); }
function bisect(fn, lo, hi, tgt, inc) { for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); const v = fn(m); if ((v > tgt) === inc) hi = m; else lo = m; } return Math.sqrt(lo * hi); }
const el = P.dut.el;
let fi = el.fi;
for (let it = 0; it < 30; it++) {
  el.fi = fi;
  el.b = bisect(b => { el.b = b; return drrDb(el, el.J, 3); }, 0.01, 20, -40, true);
  const lowDb = drrDb(el, el.J, 0.125);
  // daha büyük fi → daha düşük alçak frekans DRR
  fi = fi * Math.pow(10, (lowDb + 80) / 40);
}
el.fi = fi;
el.b = bisect(b => { el.b = b; return drrDb(el, el.J, 3); }, 0.01, 20, -40, true);
console.log('EL fi', el.fi.toFixed(4), 'b', el.b.toFixed(4), 'DRR .125', drrDb(el, el.J, 0.125).toFixed(3), 'DRR 3', drrDb(el, el.J, 3).toFixed(3));
const lmE = L.loopModel(el, P.dut.ctl, P.dut.gyro, P.dut.cur, el.J); console.log('  K', lmE.K.toFixed(3), 'PM', lmE.pm.toFixed(1), 'GM', lmE.gm.toFixed(1));
const az = P.dut.az; az.fi = el.fi;
const Jaz = az.Ja + az.Jez;
az.b = bisect(b => { az.b = b; return drrDb(az, Jaz, 1 / 12); }, 0.01, 50, -80, true);
console.log('AZ fi', az.fi.toFixed(4), 'b', az.b.toFixed(4), 'DRR 1/12', drrDb(az, Jaz, 1 / 12).toFixed(3), 'DRR 3', drrDb(az, Jaz, 3).toFixed(2));
const lmA = L.loopModel(az, P.dut.ctl, P.dut.gyro, P.dut.cur, Jaz); console.log('  K', lmA.K.toFixed(3), 'PM', lmA.pm.toFixed(1), 'GM', lmA.gm.toFixed(1));
for (const f of [0.05, 0.1, 0.125, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 50, 60, 120, 180]) console.log(f, 'el', drrDb(el, el.J, f).toFixed(2), 'az', drrDb(az, Jaz, f).toFixed(2));
