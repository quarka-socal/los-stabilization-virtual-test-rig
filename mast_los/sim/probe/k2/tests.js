// Teknik kılavuz §3 — deniz hareketi değişimlerinde test yanıtları (T1.1, T1.3), seçili durumlar. Kullanım: node tests.js <grup>
'use strict';
const L = require('../../engine.js'), fs = require('fs'), path = require('path');
const grp = process.argv[2] || 'a';
const S = (k) => L.defaultParams(k || 'sub');
const six = (P, tbl) => { P.wb.sea.mode = '6dof'; P.wb.sea.dof = JSON.parse(JSON.stringify(L.SEA6[tbl || 'SS4'])); return P; };
const cases = {
  a: [['Roll periyodu 4 s', (() => { const P = S(); P.wb.sea.roll_T = 4; return P; })(), ['T1.1']],
      ['6-DOF SS4 (denizaltı)', six(S()), ['T1.1', 'T1.3']],
      ['Roll genliği 6°', (() => { const P = S(); P.wb.sea.roll_A = 6; return P; })(), ['T1.1']]],
  b: [['Gemi varsayılanı (dar, h = 15 m)', S('ship'), ['T1.3']],
      ['Roll 20° (hexapod sınırı)', (() => { const P = S(); P.wb.sea.roll_A = 20; return P; })(), ['T1.3']],
      ['Roll genliği 6°', (() => { const P = S(); P.wb.sea.roll_A = 6; return P; })(), ['T1.3']],
      ['Kaldıraç kolu h = 10 m (denizaltı, dar)', (() => { const P = S(); P.wb.sea.h = 10; return P; })(), ['T1.3']]],
};
const out = [];
for (const [name, P, ids] of cases[grp]) {
  P.ana.seeds = 1;                       // tarama: tek tohum (kampanya varsayılanı 3)
  const ctx = {}, I = L.seaDrrInfo(P);
  for (const id of ids) {
    const t0 = Date.now(), r = L.runTest(id, P, ctx, null);
    const pick = (re) => (r.kv.find(([k]) => re.test(k)) || [, '—'])[1];
    const rec = { name, id, status: r.status, measured: r.measured, sec: (Date.now() - t0) / 1000, fill: r.fill };
    if (id === 'T1.1') Object.assign(rec, { domRoll: pick(/^roll → el: ölçülen DRR/), twoAmp: pick(/^roll: iki genlikten/), wres: pick(/^roll: deniz spektrumu/), wresYaw: pick(/^yaw: deniz spektrumu/), analytic: I.map(q => ({ k: q.key, los: q.los, req: q.req, dom: q.dom, wres: q.wres * 1e6 })) });
    if (id === 'T1.3') Object.assign(rec, { q: pick(/^Deniz ötelemesi/), hex: pick(/^Hexapod tepe/), note: r.notes.find(n => /q = /.test(n)) || null });
    out.push(rec);
    console.log(`\n[${name}] ${id} ${r.status} (${rec.sec.toFixed(0)} s)\n  ${r.measured.slice(0, 420)}`);
    for (const k of ['domRoll', 'twoAmp', 'wres', 'wresYaw', 'q', 'hex']) if (rec[k]) console.log(`  ${k}: ${rec[k]}`);
    if (rec.analytic) console.log('  analitik: ' + rec.analytic.map(q => `${q.k}→${q.los} gerekli ${q.req.toFixed(1)} · DUT ${isFinite(q.dom) ? q.dom.toFixed(1) : '—'} dB · artık ${isFinite(q.wres) ? q.wres.toFixed(2) : '—'} µrad`).join(' | '));
  }
}
fs.writeFileSync(path.join(__dirname, `tests_${grp}.json`), JSON.stringify(out, null, 1));
