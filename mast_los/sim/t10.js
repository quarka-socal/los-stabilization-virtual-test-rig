const L = require('./engine.js');
const P = L.defaultParams();
const ctx = {};
const ids = process.argv[2] ? process.argv[2].split(',') : L.TEST_ORDER;
for (const id of ids) {
  try {
    const r = L.runTest(id, P, ctx, null);
    console.log(`\n=== ${id} [${r.status}] (${r.elapsed.toFixed(1)} s)\n  ${r.measured}`);
    for (const [k, v] of r.kv) console.log('   · ' + k + ': ' + v);
    if (Object.keys(r.fill || {}).length) console.log('   fill:', JSON.stringify(Object.fromEntries(Object.entries(r.fill).map(([k, v]) => [k, +(v * (k === 'MTF' ? 1 : 1e6)).toFixed(3)]))));
  } catch (e) { console.log(`\n=== ${id} HATA: ${e.stack}`); }
}
