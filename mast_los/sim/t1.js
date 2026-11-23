const L = require('./engine.js');
const P = L.defaultParams();
const d = L.derive(P);
console.log('IFOV µrad', d.IFOV*1e6, 'FOVh', d.FOVh.toFixed(4), 'FOVv', d.FOVv.toFixed(4), 'stabOffMax', d.stabOffMax.toFixed(4));
for (const f of [0.2,0.5,1,3,8,10,20]) console.log('reach', f, d.reach(f).toFixed(4), d.reachLim(f));
console.log('earth img µrad/s', {h:d.earthImg.h*1e6, v:d.earthImg.v*1e6, r:d.earthImg.r*1e6});
for (const [nm, lp] of [['el', d.loopEl], ['az', d.loopAz]]) {
  console.log(nm, 'K', lp.K.toFixed(2), 'PM', lp.pm.toFixed(1), 'GM dB', lp.gm.toFixed(1), '@', lp.gmF && lp.gmF.toFixed(0));
  for (const f of [0.05, 0.0833, 0.1, 0.125, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 50, 100, 180]) {
    const w = 2*Math.PI*f; console.log('   f', f, 'DRR dB', L.db(L.cabs(lp.drr(w))).toFixed(2), ' torque µrad/Nm', (L.cabs(lp.torque(w))*1e6).toFixed(3));
  }
}
