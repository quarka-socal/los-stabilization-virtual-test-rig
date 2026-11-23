'use strict';
const L = require('../../engine.js');
const run = (nm, P, id) => { P.ana.seeds = 1; const t0 = Date.now(), r = L.runTest(id, P, {}, null); console.log(`[${nm}] ${id} ${r.status} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${r.measured.slice(0, 300)}`); if (r.notes[0] && /GEÇERSİZ/.test(r.notes[0])) console.log('   not: ' + r.notes[0].slice(0, 300)); };
const which = process.argv[2];
if (which === 'a') {
  run('denizaltı varsayılanı', L.defaultParams('sub'), 'T1.1');
  { const P = L.defaultParams('sub'); P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6.SS4)); run('6-DOF SS4', P, 'T1.1'); }
} else {
  { const P = L.defaultParams('sub'); P.wb.sea.roll_A = 20; run('roll 20°', P, 'T1.3'); }
  run('gemi varsayılanı', L.defaultParams('ship'), 'T1.1');
}
