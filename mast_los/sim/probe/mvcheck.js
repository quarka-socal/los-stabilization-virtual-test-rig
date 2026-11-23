const L = require('../engine.js');
const t0 = Date.now();
const P = L.defaultParams('sub');
const sh = L.tableShare(P);
console.log('tableShare', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify(sh, (k, v) => typeof v === 'number' ? +(v * (k === 'T' ? 1 : 1e6)).toFixed(3) : v));
const t1 = Date.now(); const r = L.runTest('T0.3', P, {}, null); console.log('T0.3', ((Date.now() - t1) / 1000).toFixed(1), 's', r.status, r.measured);
for (const kv of r.kv.slice(-4)) console.log('  ', kv.join(' = '));
