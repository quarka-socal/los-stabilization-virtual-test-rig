const L = require('../engine.js');
const P = L.defaultParams(); const ctx = {}; L.runTest('T0.1', P, ctx, null);
const t0 = Date.now(); const r = L.runTest('T1.1', P, ctx, null); console.log('T1.1', r.status, ((Date.now() - t0) / 1000).toFixed(1), 's');
