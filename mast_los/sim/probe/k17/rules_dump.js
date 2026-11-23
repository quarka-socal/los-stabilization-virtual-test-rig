// v13.15 §14: karar yardımcılarının motor değerleri (t95, normCdf, decisionGuard, winStats) → rules_ref.py ile karşılaştırma
'use strict';
const path = require('path'), fs = require('fs'), L = require(path.join(__dirname, '../../engine.js'));
const out = { t95: [], ncdf: [], guard: [], win: [] };
for (let df = 1; df <= 200; df++) out.t95.push([df, L.t95(df)]);
for (let z = -9; z <= 9.001; z += 0.05) out.ncdf.push([z, L.normCdf(z)]);
const P = L.defaultParams('sub');
for (const [x, R, us, rel] of [[1, 1.2, 0.05, [0.02]], [1, 1.1, 0.05, [0.02]], [1.3, 1.2, 0.02, []], [1.25, 1.2, 0.02, []], [1, 1, 0.1, []], [0.5, 1, 0, []]])
  out.guard.push({ x, R, uStat: us, rel, g: L.decisionGuard(P, { label: 'q', x, R, uStat: us, rel }) });
for (const v of [[3, 3.2, 2.9, 3.1, 3.0, 3.3, 2.8, 3.05, 3.15], [2.5], [1, 2]]) out.win.push({ v, s: L.winStats(v) });
fs.writeFileSync(path.join(__dirname, 'rules_dump.json'), JSON.stringify(out));
console.log('t95', out.t95.length, 'ncdf', out.ncdf.length, 'guard', out.guard.length);
