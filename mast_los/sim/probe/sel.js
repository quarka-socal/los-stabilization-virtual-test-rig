// Seçili testleri koşar (T0.1 ile ctx); taban (varsa) ile measured/kv/fill karşılaştırır
const L = require('../engine.js'), fs = require('fs');
const kind = process.argv[2] || 'sub', ids = (process.argv[3] || 'T2.1,T2.2,T2.3,T4.2').split(','), basef = process.argv[4];
const base = basef ? JSON.parse(fs.readFileSync(basef, 'utf8')).tests : null;
const P = L.defaultParams(kind), ctx = {}; L.runTest('T0.1', P, ctx, null);
for (const id of ids) {
  const t0 = Date.now(), r = L.runTest(id, P, ctx, null);
  console.log(`\n== ${kind} ${id} ${r.status} (${((Date.now() - t0) / 1000).toFixed(1)} s) :: ${r.measured}`);
  for (const [k, v] of r.kv) console.log('   -', k, '→', v);
  console.log('   fill', JSON.stringify(r.fill));
  if (base && base[id]) for (const k of ['status', 'measured', 'kv', 'fill', 'notes']) { const a = JSON.stringify(base[id][k]), b = JSON.stringify(r[k]); if (a !== b) console.log('   !! FARK', k); }
}
