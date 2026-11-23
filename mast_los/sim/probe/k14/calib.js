// §12 İşletme ortamı: ortam düzeylerinin kalibrasyon tabanı. Her ortam satırı (B2-02 dalga çarpması, B2-03 yanal ivme, B2-06 platform
// titreşimi, B3-01 yardımcı makine, B3-03 / B3-04 yüksek frekans) yapılandırılmış DUT'ta ve dar bant kapalıyken (taban döngü) işletme
// benzetimiyle; B2-02 için 6 tohum (olay sayısı az: istatistik). Bütçe tahmini E ile karşılaştırma. Çıktı: calib.json
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const ids = ['B2-02', 'B2-03', 'B2-06', 'B3-01', 'B3-03', 'B3-04'], out = { rows: {} };
const E = Object.fromEntries(L.computeBudget(L.defaultParams('sub'), null).rows.map(r => [r.id, r.E]));
const op = (P, id, seed) => { const row = L.OP_ROWS.find(q => q.id === id), R = L.runSim(P, L.rowScenario(P, row, { T: 600, seed })), M = L.losMetrics(R, P, { skip: 20 }); return { el: M.rms.el, xel: M.rms.xel }; };
for (const id of ids) {
  const r = { E: E[id], cfg: {}, off: {} };
  for (const [nm, fn] of [['cfg', null], ['off', (P) => { P.dut.ctl.res.on = false; }]]) {
    const P = L.defaultParams('sub'); if (fn) fn(P);
    const seeds = id === 'B2-02' ? [11, 12, 13, 14, 15, 16] : [11];
    const v = seeds.map(s => op(P, id, s));
    r[nm] = { el: v.map(x => x.el * 1e6), xel: v.map(x => x.xel * 1e6) };
  }
  out.rows[id] = r;
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m(a)) ** 2, 0) / (a.length - 1)) : 0;
  console.log(`${id} (E ${r.E}): yapılandırılmış el ${m(r.cfg.el).toFixed(3)}${r.cfg.el.length > 1 ? ' ± ' + sd(r.cfg.el).toFixed(3) + ' [' + r.cfg.el.map(x => x.toFixed(2)).join(', ') + ']' : ''} / xel ${m(r.cfg.xel).toFixed(3)} · dar bant kapalı el ${m(r.off.el).toFixed(3)}${r.off.el.length > 1 ? ' ± ' + sd(r.off.el).toFixed(3) : ''} / xel ${m(r.off.xel).toFixed(3)}`);
}
require('fs').writeFileSync(path.join(__dirname, 'calib.json'), JSON.stringify(out, null, 1));
