const L = require('../engine.js');
const P = L.defaultParams('ship'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS5));
const t0 = Date.now(); const r = L.runTest('T2.5', P, {}, null);
console.log('T2.5', r.status, ((Date.now() - t0) / 1000).toFixed(1), 's\n ', r.measured);
for (const kv of r.kv.slice(-9)) console.log('  ', kv.join(' = '));
console.log('fill', JSON.stringify(r.fill, (k, v) => typeof v === 'number' ? +(v * 1e6).toFixed(3) : v));
const Pc = L.compatV10(L.defaultParams('ship')); const rc = L.runTest('T2.5', Pc, {}, null); console.log('compat T2.5 kv', rc.kv.length, 'fill', Object.keys(rc.fill).join(','));
