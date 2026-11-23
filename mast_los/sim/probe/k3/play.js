// Teknik kılavuz §3 (v13.1) — Düzenek oynatması (deniz profili, 60 s): kaldıraç kolu vektörüyle hexapod ötelemesi, q, LOS
'use strict';
const path = require('path'), L = require(path.join(__dirname, '../../engine.js'));
const cases = [['denizaltı varsayılanı (h = 1 m)', L.defaultParams('sub')], ['gemi varsayılanı (h = 15 m)', L.defaultParams('ship')],
  ['gemi, r = (20, 0, 15) m', (() => { const P = L.defaultParams('ship'); P.wb.sea.rx = 20; return P; })()]];
const out = [], rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); }, pk = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
for (const [nm, P] of cases) {
  const t0 = Date.now(), R = L.playScenario(P, { kind: 'sea', T: 60, seed: 1301 });
  const o = { nm, q: R.seaQ && R.seaQ.q, demand: R.seaQ && R.seaQ.demand, tr: R.tr_x ? [R.tr_x, R.tr_y, R.tr_z].map(pk) : null,
    base: ['base_r', 'base_p', 'base_y'].map(c => rms(R[c]) * 180 / Math.PI), los: [R.metrics.rmsEl * 1e6, R.metrics.rmsXel * 1e6], wander: [R.metrics.wanderEl * 1e6, R.metrics.wanderXel * 1e6], valid: R.metrics.validFrac };
  out.push(o);
  console.log(nm, '| q', o.q && o.q.toFixed(4), 'talep', o.demand && o.demand.toFixed(3), 'm | öteleme tepe x/y/z', o.tr ? o.tr.map(v => (v * 1e3).toFixed(1)).join(' / ') + ' mm' : '—',
    '| taban RMS r/p/y', o.base.map(v => v.toFixed(2)).join(' / '), '° | LOS RMS el/xel (trend çıkarılmış)', o.los.map(v => v.toFixed(2)).join(' / '), 'µrad, wander', o.wander.map(v => v.toFixed(2)).join(' / '), 'µrad | FOV', (o.valid * 100).toFixed(1), '% |', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
require('fs').writeFileSync(path.join(__dirname, 'play.json'), JSON.stringify(out, null, 1));
