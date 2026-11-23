const L = require('./engine.js');
const P = L.defaultParams(); P.wb.earth.comp = false;
const ctx = {};
const ids = process.argv[2] ? process.argv[2].split(',') : L.TEST_ORDER;
for (const id of ids) {
  const t0 = Date.now();
  try { const r = L.runTest(id, P, ctx, null); console.log(id, r.status, ((Date.now() - t0) / 1000).toFixed(1) + 's', '|', r.measured.slice(0, 150)); }
  catch (e) { console.log(id, 'HATA', e.message, '\n   ', (e.stack || '').split('\n').slice(1, 4).join(' | ')); }
}
try { const p = L.playScenario(P, { kind: 'sea', T: 60, stab: true }); console.log('play ok, video valid', p.metrics.validFrac.toFixed(3), 'rmsEl', (p.metrics.rmsEl * 1e6).toFixed(1)); } catch (e) { console.log('play HATA', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')); }
