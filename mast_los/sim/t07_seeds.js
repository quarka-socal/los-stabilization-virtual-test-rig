// T0.7 (dünya dönüşü kompanzasyonu, AÇIK) kararının tohum dağılımı: k = argv[2]..argv[3]-1
'use strict';
const L = require('./engine.js');
const k0 = +process.argv[2], k1 = +process.argv[3];
for (let k = k0; k < k1; k++) {
  const P = L.defaultParams(); P.ana.seedOffset = k;
  const r = L.runTest('T0.7', P, {}, null);
  const n = r.num;
  console.log(JSON.stringify({ k, status: r.status, onH: n.onH * 1e6, onV: n.onV * 1e6, lim: n.limOn * 1e6, offH: n.offH * 1e6, offV: n.offV * 1e6 }));
}
