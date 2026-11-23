'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
for (const kind of ['sub', 'ship']) {
  const P = L.defaultParams(kind), d = L.derive(P), b = L.computeBudget(P, null), SD = L.seaDOF(P);
  console.log(`== ${kind}: ch ${d.ch.name} IFOV ${(d.IFOV*1e6).toFixed(2)} fps ${d.fps} Tint ${(d.Tint*1e3).toFixed(1)} ms; a0 ${P.dut.geom.a0}; eis ${JSON.stringify(P.wb.eis)}; H ${JSON.stringify(P.wb.H)}`);
  console.log('  sea ang:', SD.ang.map((q, i) => `${q.key} Aeq ${q.Aeq.toFixed(3)}° σ ${(q.sigma*1e3).toFixed(3)} mrad fdom ${q.fdom.toFixed(3)} → ${L.axisMap(P, i).los}`).join(' | '));
  for (const r of b.rows) console.log(`  ${r.id.padEnd(6)} E ${(+r.E).toFixed(4).padStart(9)} ${r.F.padEnd(10)} G ${(+r.G).toFixed(3).padStart(7)} H ${String(r.H).padStart(6)} I ${r.I.toFixed(3).padStart(7)} K ${r.K.toFixed(3).padStart(7)} O ${r.O.toFixed(3).padStart(7)} Pp ${r.Pp.toFixed(3).padStart(6)} Q ${(+r.Q).toFixed(2).padStart(6)} L ${r.L} M ${r.M||'-'} AC ${r.AC.toFixed(3)} AD ${r.AD.toFixed(3)} AE ${r.AE.toFixed(3)} AH ${r.AH.toFixed(3)} ${r.status}`);
  console.log(`  tot wander ${b.wander.toFixed(3)} smear ${b.smear.toFixed(3)} los ${b.los.toFixed(3)} req ${b.reqW.toFixed(2)}/${b.reqS.toFixed(2)}; eisWander ${b.eisWander.toFixed(3)} eisLock ${b.eisLock.toFixed(3)} eisTop ${b.eisTop} ${(100*b.eisTopShare).toFixed(1)}%; drift ${b.drift.toFixed(3)}; mtfNyq ${b.mtfNyq.toFixed(4)} peak ${b.peak.toFixed(2)}`);
  console.log('  rot', JSON.stringify(d.rot, (k, v) => typeof v === 'number' ? +v.toPrecision(6) : v));
}
