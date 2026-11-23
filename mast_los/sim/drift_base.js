// Motor değişikliğinin dinamiği değiştirmediğini doğrulamak için taban özet (karma) üretir
'use strict';
const L = require('./engine.js'), crypto = require('crypto');
const out = {};
const P = L.defaultParams();
for (const [name, o] of [['sea_on', { kind: 'sea', T: 60, stab: true }], ['sine_on', { kind: 'sine', T: 60, stab: true }], ['sea_off', { kind: 'sea', T: 60, stab: false }]]) {
  const r = L.playScenario(P, o, null);
  const h = crypto.createHash('sha256');
  for (const k of ['opt_el', 'opt_xel', 'enc_a', 'enc_e', 'rot', 'rot_res', 'ac_el']) h.update(Buffer.from(r[k].buffer));
  h.update(Buffer.from(r.video.x.buffer)); h.update(Buffer.from(r.video.y.buffer));
  out[name] = { hash: h.digest('hex').slice(0, 16), slopeEl: r.metrics.slopeEl, slopeXel: r.metrics.slopeXel, rmsEl: r.metrics.rmsEl };
}
const t = L.runTest('T0.7', P, {}, null);
out.T07 = t.num;
console.log(JSON.stringify(out));
