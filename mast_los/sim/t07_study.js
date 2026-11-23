// T0.7 (dünya dönüşü kompanzasyonu) kararının tohum dağılımı — kampanya bağlamıyla (T0.1'in IFOV kalibrasyonu)
// Kullanım: node t07_study.js <base|fresh> <k0> <k1>   → her tohum için bir JSON satırı
'use strict';
const L = require('./engine.js');
const pre = require('../app/pre.json');
const [variant, k0, k1] = [process.argv[2] || 'base', +process.argv[3] || 0, +process.argv[4] || 1];
for (let k = k0; k < k1; k++) {
  const P = L.defaultParams(); P.ana.seedOffset = k;
  if (variant === 'fresh') P.dut.gyro.freshCal = true;
  const t0 = Date.now();
  const r = L.runTest('T0.7', P, { IFOVcal: pre.ctx.IFOVcal }, null);
  const n = r.num;
  console.log(JSON.stringify({ variant, k, status: r.status, onH: n.onH, onV: n.onV, offH: n.offH, offV: n.offV, lim: n.limOn, s: (Date.now() - t0) / 1000 }));
}
