const L = require('../engine.js'), kind = process.argv[2] || 'sub';
const P = L.defaultParams(kind);
if (process.argv[3]) { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[process.argv[3].toUpperCase()])); }
let t0 = Date.now(); const r = L.runTest('T1.9', P, {}, null);
console.log('T1.9', r.status, ((Date.now() - t0) / 1000).toFixed(1) + ' s', r.error || '');
console.log(r.measured);
for (const [k, v] of r.kv) console.log(' -', k, '::', v);
console.log('checks', r.num.checks.map(c => `${c.name} ${(c.v * 1e6).toFixed(2)}/${(c.lim * 1e6).toFixed(2)} ${c.ok ? 'OK' : 'X'}`).join(' | '));
t0 = Date.now(); const r6 = L.runTest('T1.6', P, {}, null); console.log('T1.6', r6.status, ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(r6.num), r6.kv[r6.kv.length - 1]);
