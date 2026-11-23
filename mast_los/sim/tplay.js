const L = require('./engine.js');
const P = L.defaultParams();
for (const stab of [true, false]) {
  const t0 = Date.now();
  const r = L.playScenario(P, { kind: 'sea', T: 60, stab });
  const m = r.metrics;
  console.log('stab', stab, 'n', r.n, 'video', r.video.n, 'rms el/xel', (m.rmsEl*1e6).toFixed(2), (m.rmsXel*1e6).toFixed(2), 'p99', (m.p99El*1e6).toFixed(2), 'wander', (m.wanderEl*1e6).toFixed(2), 'mtf', m.mtfEl && m.mtfEl.toFixed(3), 'valid', m.validFrac.toFixed(3), 'base', JSON.stringify(m.base.map(b => [b.th.toFixed(2), b.om.toFixed(2), b.al.toFixed(2)])), ((Date.now()-t0)/1000).toFixed(1)+'s');
  let mx = 0, my = 0; for (let i = 0; i < r.video.n; i++) { mx = Math.max(mx, Math.abs(r.video.x[i])); my = Math.max(my, Math.abs(r.video.y[i])); }
  console.log('  video max |x|,|y| px', mx.toFixed(2), my.toFixed(2), 'enc_a range deg', (Math.max(...r.enc_a)*180/Math.PI).toFixed(2), (Math.min(...r.enc_a)*180/Math.PI).toFixed(2));
}
