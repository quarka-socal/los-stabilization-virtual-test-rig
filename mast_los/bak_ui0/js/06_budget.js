// ---------------------------------------------------------------- bütçe görünümü
const BUD = { useMeas: load('useMeas', true) };
function buildBudget(root) {
  root.append(
    h('div', { class: 'panel' }, h('header', null, h('h2', null, 'Jitter bütçesi: analitik tahmin, işletme simülasyonu ve laboratuvar ölçümü'),
      h('label', { class: 'small', style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('input', { type: 'checkbox', id: 'useMeas', checked: BUD.useMeas ? true : null, onchange: (e) => { BUD.useMeas = e.target.checked; store('useMeas', BUD.useMeas); renderBudget(); } }), 'Toplamlarda ölçülen değerleri kullan')),
      h('div', { class: 'body' }, h('p', { class: 'small', style: { margin: '0 0 10px', color: 'var(--ink-2)', maxWidth: '110ch' } },
        'Üç bağımsız sayı yan yana: analitik bütçenin kapalı biçim tahmini, aynı kalemin işletme senaryosunda yalnız o kaynak ve mekanizmayla koşulan simülasyonu ve kampanya testlerinin bütçeye aktardığı ölçüm. Çevre kaynaklı satırların düzeyleri (dalga çarpması, ivme, titreşim) bilinmediği için taban döngüyle analitik tahmine kalibre edildi; deniz ve VIV genlikleri Model sekmesindeki senaryo değerlerinden (gemide EN 1991-1-4 hesabından) gelir. Tahsisler IFOV cinsindendir: referans kanal ya da optik değişince ölçeklenir.'),
        h('div', { id: 'budReqNote' }),
        h('div', { class: 'tiles', id: 'budTiles' }))),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Kalem kalem karşılaştırma (µrad RMS, logaritmik)'), h('span', { class: 'hint' }, 'Çubuk: tahsis · halka: analitik tahmin · daire: işletme sim. · eşkenar dörtgen: laboratuvar · sağ kenarda ▲: tahsis aşımı (ölçüm varsa ölçüme, yoksa tahmine göre) · sol kenarda ◀: işletme değeri 0,1 µrad\'ın altında')),
      h('div', { class: 'body' }, h('div', { id: 'budPlot', class: 'tscroll' }), h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, 'İşletme simülasyonu el ekseni; B1-03 (yaw) için xel. Sol kenardaki üçgen: < 0,1 µrad. Sağ kenardaki ▲: tahsis aşımı.'))),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Bütçe tablosu')), h('div', { class: 'body' }, h('div', { class: 'tscroll', id: 'budTable' }))),
    h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Toplamlar ve göstergeler')), h('div', { class: 'body' }, h('div', { class: 'tscroll', id: 'budTot' }), h('div', { id: 'budNotes', style: { marginTop: '12px' } }))));
  renderBudget();
}
function budgetData() {
  const P = STATE.P, d = ENG.derive(P), mf = measuredFills();
  const wbB = ENG.computeBudget(P, null);
  const measB = ENG.computeBudget(P, BUD.useMeas ? mf.val : null);
  const op = STATE.op, opOk = op && STATE.opKey === curKey();
  return { P, d, mf, wbB, measB, op, opOk };
}
function renderBudget() {
  if (!$('#budTable')) return;
  const D = budgetData(), { d, mf, wbB, measB, op } = D;
  const reqW = d.req.wander * 1e6, reqS = d.req.smear * 1e6;
  // kutucuklar
  const tb = $('#budTiles'); tb.innerHTML = '';
  tb.append(tileEl('Wander toplamı (analitik)', fmt(wbB.wander, 2), 'µrad', `gereksinim ${fmt(reqW, 1)} · kullanım %${fmt(100 * wbB.wanderUse, 0)}`, wbB.wanderUse));
  tb.append(tileEl(BUD.useMeas ? 'Wander toplamı (ölçümlerle)' : 'Smear toplamı (analitik)', BUD.useMeas ? fmt(measB.wander, 2) : fmt(wbB.smear, 2), 'µrad', BUD.useMeas ? `${Object.keys(mf.val).filter(k => /^B|^R/.test(k)).length} kalem ölçümden · gereksinim ${fmt(reqW, 1)}` : `gereksinim ${fmt(reqS, 1)}`, BUD.useMeas ? measB.wanderUse : wbB.smearUse));
  if (op) {
    const a = op.all, w = Math.max(a.wanderEl, a.wanderXel) * 1e6;
    tb.append(tileEl('İşletme sim. wander (tüm kaynaklar)', fmt(w, 2), 'µrad', `el ${fu(a.wanderEl)} · xel ${fu(a.wanderXel)} · ${D.opOk ? 'güncel' : 'önceki parametrelerle'}`, w / reqW));
    const rowsW = rssRowsWander(op);
    tb.append(tileEl('Doğrusal toplama sınaması', fmt(100 * (a.wanderEl * 1e6 / rowsW - 1), 1), '%', `tüm kaynaklar birlikte ${fu(a.wanderEl)} µrad ↔ satırların RSS'i ${fmt(rowsW, 2)} µrad (el, 120 s pencere)`));
  }
  tb.append(tileEl('Jitter MTF @ Nyquist', fmt(wbB.mtfNyq, 3), '', `analitik (smear ${fmt(wbB.smear, 2)} µrad) · gereksinim karşılığı ${fmt(wbB.mtfReq, 3)}${mf.val.MTF != null ? ' · T3.2 oranı ' + fmt(mf.val.MTF, 3) : ''}`));
  renderBudgetPlot(D);
  renderBudgetTable(D);
  renderBudgetTotals(D);
  renderBudReqNote(d);
}
// v12: proje LOS kalıntı gereksinimleri bu bütçeden farklı tanımlıdır (bant, pencere, metrik) — Gereksinimler sekmesine bağlantı
function renderBudReqNote(d) {
  const box = $('#budReqNote'); if (!box) return; box.innerHTML = '';
  const P = STATE.P, L = P.ana.los; if (!L || L.on === false) return;
  const lim = ENG.losLimits(P);
  box.append(h('div', { class: 'small', style: { margin: '0 0 12px', padding: '8px 10px', borderRadius: '6px', background: 'var(--surface-2, transparent)', border: '1px solid var(--grid)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
    h('span', { style: { flex: '1 1 420px', minWidth: 0 } }, h('b', null, 'Proje LOS kalıntı gereksinimleri farklı tanımlıdır. '),
      `Proje: σ_El ≤ ${fmt(lim.el * 1e6, 2)}, σ_Az ≤ ${fmt(lim.az * 1e6, 2)}, σ_vek ≤ ${fmt(lim.vec * 1e6, 2)} µrad (${L.fHP} Hz üstü, ${L.Tw} s pencere, gerçek LOS) ve pozlama içi ≤ ${fmt(lim.exp * 1e6, 2)} µrad. Bu bütçe: wander ≤ ${fmt(d.req.wander * 1e6, 1)}, smear ≤ ${fmt(d.req.smear * 1e6, 1)} µrad (video kare ortalaması, ${P.ana.Tw} s pencere). Tahsisler bu bütçenin wander/smear tanımına göredir; proje setine göre yeniden dağıtılmadıkça "Durum" sütunu proje uygunluğunu göstermez.`),
    h('button', { class: 'btn sm', onclick: () => showTab('gereksinim') }, 'Gereksinimler sekmesi')));
}
const renderBudgetDeb = debounce(renderBudget, 250);
function rssRowsWander(op) {
  const ids = ['B1-01', 'B1-02', 'B1-03', 'B1-04', 'B1-05', 'B1-06', 'B1-07', 'B1-08', 'B2-01', 'B2-02', 'B2-03', 'B2-04', 'B2-06', 'B3-01', 'B3-02', 'B3-03', 'B3-04'];   // B1-08: v11 deniz ötelemesi (varsa)
  return Math.sqrt(ids.reduce((s, id) => s + sq((op.rows[id] && isFinite(op.rows[id].wEl) ? op.rows[id].wEl : 0) * 1e6), 0));
}
function opVal(op, id, ax) { if (!op || !op.rows[id]) return NaN; const r = op.rows[id]; const v = ax === 'xel' ? r.cmpXel : r.cmp; return v * 1e6; }
function renderBudgetPlot(D) {
  const box = $('#budPlot'); box.innerHTML = '';
  const rows = D.wbB.rows, n = rows.length, W = Math.max(640, box.clientWidth || 900), rowH = 24, padL = 250, padR = 30, padT = 26, H = padT + n * rowH + 30;
  const x0 = 0.1, x1 = 30, X = (v) => padL + (Math.log10(clamp(v, x0, x1)) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) * (W - padL - padR);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Bütçe kalemleri: tahsis, analitik tahmin, işletme simülasyonu ve laboratuvar ölçümü' });
  const col = { grid: cssVar('--grid'), ink: cssVar('--ink'), ink2: cssVar('--ink-2'), muted: cssVar('--muted'), s1: cssVar('--s1'), s2: cssVar('--s2'), surface: cssVar('--surface'), crit: cssVar('--crit') };
  for (const v of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20]) {
    svg.append(s('line', { x1: X(v), x2: X(v), y1: padT - 6, y2: H - 24, stroke: col.grid }));
    svg.append(s('text', { x: X(v), y: H - 8, 'text-anchor': 'middle', fill: col.muted, 'font-size': 11, 'font-family': 'IBM Plex Mono, monospace' }, String(v) + (v === 20 ? ' µrad' : '')));
  }
  const tip = h('div', { class: 'tip', style: { position: 'absolute' } }); tip.hidden = true;
  rows.forEach((r, i) => {
    const y = padT + i * rowH + rowH / 2;
    if (i % 2 === 0) svg.append(s('rect', { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: col.grid, opacity: 0.35 }));
    svg.append(s('text', { x: 8, y: y + 4, fill: col.ink, 'font-size': 12, 'font-family': 'IBM Plex Sans, sans-serif' }, s('tspan', { 'font-family': 'IBM Plex Mono, monospace', fill: col.ink2 }, r.id + '  '), r.name.length > 30 ? r.name.slice(0, 29) + '…' : r.name));
    const ax = r.id === 'B1-03' ? 'xel' : 'el', q = r.Q, est = r.I, opv = opVal(D.op, r.id, ax), lab = D.mf.val[r.id];
    if (q > 0) svg.append(s('rect', { x: X(q) - 1.5, y: y - 8, width: 3, height: 16, fill: col.ink2, rx: 1 }));
    const g = s('g', { style: 'cursor:default' });
    if (isFinite(est)) g.append(s('circle', { cx: X(est), cy: y, r: 5, fill: 'none', stroke: col.ink, 'stroke-width': 1.6 }));
    if (isFinite(opv) && opv >= x0) g.append(s('circle', { cx: X(opv), cy: y, r: 4.5, fill: col.s1, stroke: col.surface, 'stroke-width': 1.5 }));
    else if (isFinite(opv)) g.append(s('path', { d: `M${X(x0) - 2} ${y}L${X(x0) + 6} ${y - 5}L${X(x0) + 6} ${y + 5}Z`, fill: col.s1 }));   // < 0,1 µrad
    if (lab != null && isFinite(lab) && lab > 0) g.append(s('path', { d: `M${X(lab)} ${y - 6}L${X(lab) + 6} ${y}L${X(lab)} ${y + 6}L${X(lab) - 6} ${y}Z`, fill: col.s2, stroke: col.surface, 'stroke-width': 1.5 }));
    const over = q > 0 && ((lab != null && lab > q) || (lab == null && est > q));   // Q = 0: tahsis yok (ek satır)
    if (over) svg.append(s('text', { x: W - 8, y: y + 4, 'text-anchor': 'end', fill: col.crit, 'font-size': 11, 'font-weight': 600 }, '▲'));
    svg.append(g);
    const hit = s('rect', { x: padL - 4, y: y - rowH / 2, width: W - padL, height: rowH, fill: 'transparent' });
    hit.addEventListener('pointermove', (e) => {
      tip.innerHTML = `<div class="h">${esc(r.id)} — ${esc(r.name)}</div><div>Tahsis <b>${fmt(q, 2)}</b> µrad</div><div>Analitik tahmin <b>${fmt(est, 2)}</b></div><div><i style="background:${col.s1}"></i>İşletme sim. (${ax}) <b>${fmt(opv, 3)}</b>${ax === 'el' && isFinite(opVal(D.op, r.id, 'xel')) ? ' · xel ' + fmt(opVal(D.op, r.id, 'xel'), 2) : ''}</div><div><i style="background:${col.s2}"></i>Laboratuvar <b>${lab != null ? fmt(lab, 2) : '—'}</b>${D.mf.src[r.id] ? ' (' + D.mf.src[r.id] + ')' : ''}</div>`;
      tip.hidden = false; const bb = box.getBoundingClientRect(); let tx = e.clientX - bb.left + box.scrollLeft + 14; if (tx + 260 > bb.width + box.scrollLeft) tx -= 290; tip.style.left = tx + 'px'; tip.style.top = (y + 10) + 'px';
    });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    svg.append(hit);
  });
  const wrap = h('div', { class: 'chart', style: { position: 'relative', minWidth: W + 'px' } }); wrap.append(svg, tip);
  box.append(wrap);
}
function renderBudgetTable(D) {
  const { wbB, measB, mf, op } = D;
  const t = h('table', { class: 'dt' });
  t.append(h('thead', null, h('tr', null, ['Kalem', 'Girdi (E · G)', 'DRR', 'Analitik tahmin', 'Tahsis', 'İşletme sim. el / xel', 'Laboratuvar (test)', 'Durum'].map((c, i) => h('th', { class: i >= 2 && i <= 6 ? 'n' : '' }, c)))));
  const tb = h('tbody'); t.append(tb);
  let lastBand = null;
  const bandName = { B1: 'B1 · < 1 Hz', B2: 'B2 · 1–20 Hz', B3: 'B3 · > 20 Hz' };
  wbB.rows.forEach((r, i) => {
    const band = r.id === 'R-01' ? 'R' : r.band;
    if (band !== lastBand) { tb.append(h('tr', { class: 'band' }, h('td', { colspan: 8 }, band === 'R' ? `Görüntü rotasyonu (${D.d.rot.ref === 'corner' ? 'köşe pikseli' : 'alan kenarı'}, ayrı ölçüt)` : bandName[band]))); lastBand = band; }
    const lab = mf.val[r.id], src = mf.src[r.id], opE = opVal(op, r.id), opX = opVal(op, r.id, 'xel');
    const used = lab != null ? lab : (isFinite(opE) ? null : null);
    const judge = lab != null ? lab : r.I, ok = judge <= r.Q, noAlloc = !(r.Q > 0);
    const inp = r.F === '° genlik' ? `${fmt(r.E, 2)}° genlik @ ${fmt(r.G, 3)} Hz` : `${fmt(r.E, 2)} ${r.F} @ ${fmt(r.G, r.G < 1 ? 3 : 0)} Hz`;
    tb.append(h('tr', null,
      h('td', null, h('span', { class: 'mono', style: { color: 'var(--ink-2)' } }, r.id + ' '), r.name, r.M ? h('span', { class: 'sub' }, 'Grup ' + r.M + ' (doğrusal toplanır)') : null, r.L === 'D' ? h('span', { class: 'sub' }, 'Yalnız drift: wander toplamına girmez (doğrusal trendle çıkar)') : null, r.ext ? h('span', { class: 'sub' }, 'Ek satır (v11)') : null, h('span', { class: 'sub' }, 'Test: ' + r.S)),
      h('td', { class: 'small' }, inp),
      h('td', { class: 'n' }, r.H ? fmt(r.H, 0) + ' dB' : '—'),
      h('td', { class: 'n' }, fmt(r.I, 2)),
      h('td', { class: 'n' }, noAlloc ? '—' : fmt(r.Q, 2), noAlloc ? null : h('span', { class: 'sub' }, fmt(r.Q / (D.d.IFOV * 1e6), 3) + ' IFOV')),
      h('td', { class: 'n' }, `${fmt(opE, 2)} / ${fmt(opX, 2)}`),
      h('td', { class: 'n' + (!noAlloc && lab != null && lab > r.Q ? ' over' : '') }, lab != null ? fmt(lab, 2) : '—', src ? h('span', { class: 'sub' }, src) : null),
      h('td', null, noAlloc ? pill('BİLGİ') : pill(ok ? 'OK' : 'AŞIM'), h('span', { class: 'sub' }, noAlloc ? 'tahsis yok (proje kararı)' : (lab != null ? 'ölçüme göre' : 'tahmine göre')))));
  });
  $('#budTable').innerHTML = ''; $('#budTable').append(t);
}
// EIS satırının notu: ayarın ne anlama geldiğini açıkça yazar (f_c = 0 kilit modudur; η = 0 düzeltmeyi kaldırır ama
// bütçe registrasyon artığını η'dan bağımsız ekler)
function eisNote(e) {
  if (e.eta === 0 && !(e.reg_px > 0)) return 'EIS kapalı (η = 0, registrasyon artığı 0): EIS öncesine eşit';
  if (e.eta === 0) return `η = 0: düzeltme yok, ama registrasyon artığı (${e.reg_px} px) yine eklenir — EIS'i tamamen kapatmak için onu da 0 yapın`;
  return `f_c = ${e.fc} Hz${e.fc <= 0 ? ' (referans kareye kilit)' : ''}, η = ${e.eta}, registrasyon artığı ${e.reg_px} px`;
}
function renderBudgetTotals(D) {
  const { d, wbB, measB, op, opOk } = D, a = op ? op.all : null;
  const reqW = d.req.wander * 1e6, reqS = d.req.smear * 1e6, reqD = d.req.drift * 1e6, reqP = d.req.p99 * 1e6;
  const cell = (v, req, dd) => h('td', { class: 'n' + (req != null && isFinite(v) && v > req ? ' over' : '') }, fmt(v, dd == null ? 2 : dd));
  const rows = [
    ['Wander B1 (< 1 Hz)', wbB.bands.B1.wander, measB.bands.B1.wander, a ? a.pw.bands.B1.wander * 1e6 : NaN, null, 'PSD ağırlıklı, el'],
    ['Wander B2 (1–20 Hz)', wbB.bands.B2.wander, measB.bands.B2.wander, a ? a.pw.bands.B2.wander * 1e6 : NaN, null, ''],
    ['Wander B3 (> 20 Hz)', wbB.bands.B3.wander, measB.bands.B3.wander, a ? a.pw.bands.B3.wander * 1e6 : NaN, null, ''],
    ['Wander toplamı', wbB.wander, measB.wander, a ? a.wanderEl * 1e6 : NaN, reqW, 'işletme: video, 120 s pencere, el'],
    ['Smear toplamı', wbB.smear, measB.smear, a ? a.smearEl * 1e6 : NaN, reqS, 'işletme: kare içi, el'],
    ['Tepe (k_conf × wander) / P99', wbB.peak, measB.peak, a ? a.p99El * 1e6 : NaN, reqP, 'işletme: gerçek P99'],
    ['Drift (τ = ' + STATE.P.wb.tau + ' s)', wbB.drift, measB.drift, a ? a.pdeEl * 1e6 : NaN, reqD, 'işletme: PDE RMS'],
    ['EIS sonrası wander', wbB.eisWander, measB.eisWander, a ? a.eis * 1e6 : NaN, reqW, eisNote(STATE.P.wb.eis)],
    ['EIS referans kareye kilit', wbB.eisLock, measB.eisLock, a ? a.eisLock * 1e6 : NaN, reqW, STATE.P.wb.eis.eta === 0 ? 'η = 0: kilit modu da düzeltme yapmaz' : ''],
  ];
  const t = h('table', { class: 'dt' }, h('thead', null, h('tr', null, h('th', null, 'Gösterge (el ekseni, µrad)'), h('th', { class: 'n' }, 'Analitik'), h('th', { class: 'n' }, BUD.useMeas ? 'Ölçümlerle' : 'Analitik (aynı)'), h('th', { class: 'n' }, 'İşletme sim.'), h('th', { class: 'n' }, 'Gereksinim'), h('th', null, 'Not'))),
    h('tbody', null, rows.map(r => h('tr', null, h('td', null, r[0]), cell(r[1], r[4]), cell(r[2], r[4]), cell(r[3], r[4]), h('td', { class: 'n' }, r[4] != null ? fmt(r[4], 1) : '—'), h('td', { class: 'small muted' }, r[5])))),
    h('tbody', null, h('tr', { class: 'tot' }, h('td', null, 'Jitter MTF @ Nyquist'), h('td', { class: 'n' }, fmt(wbB.mtfNyq, 3)), h('td', { class: 'n' }, fmt(measB.mtfNyq, 3)), h('td', { class: 'n' }, a ? fmt(a.mtfEl, 3) : '—'), h('td', { class: 'n' }, '≥ ' + fmt(wbB.mtfReq, 3)), h('td', { class: 'small muted' }, 'işletme: kare içi gerçek LOS dağılımından |OTF|'))));
  $('#budTot').innerHTML = ''; $('#budTot').append(t);
  $('#budTot').append(floorCorrTable(D));
  const nb = $('#budNotes'); nb.innerHTML = '';
  const notes = [], P0 = STATE.P, ship = isShipP(P0);
  if (ship) {
    const w = ENG.windVivCalc(P0), VS = ENG.vivSpec(P0), W = P0.wb.wviv;
    notes.push(`Platform: gemi direği EO direktör. B2-01 rüzgâr kaynaklı girdap kopmasıdır (EN 1991-1-4 Ek E, yaklaşım 1): v_crit = ${fmt(w.vcrit, 1)} m/s, y_F = ${fmt(w.yF * 1e3, 1)} mm → direktör tabanında θ = ${fmt(w.theta * 180 / Math.PI, 3)}° @ ${fmt(W.fn, 2)} Hz` +
      (VS.present ? `. Analitik tahmin yalnız açısal yolu ve ${W.drr_dB} dB DRR varsayımını içerir; direk tepesi ötelemesinin dengesizlik torku ve optik montaj yoluyla katkısı işletme benzetiminde ve T2.2'de (açısal + öteleme dwell) görünür.` : (VS.on ? '; kritik hız işletme zarfının dışında (v_crit > 1,25·U_max), B2-01 = 0.' : '; rüzgâr VIV etkisi kapalı, B2-01 = 0.')));
    notes.push('B2-02 (dalga çarpması) gemi direğinde yoktur: tahmin 0 ve T2.4 ölçümü bütçeye aktarılmaz. Deniz hareketi genlikleri gemi örneğidir (NATO işletilebilirlik sınırları: roll 4°, pitch 1,5° RMS); bütçe tahsisleri denizaltıyla aynıdır (IFOV cinsinden).');
  } else if (P0.wb.viv.on !== false && !ENG.vivSpec(P0).present) {
    notes.push('Hidrodinamik VIV: işletme hız zarfında (Model → Hidrodinamik VIV) K0 tarama bandına girmiyor; mast kilitlenmez, B2-01 = 0 ve T2.2 ölçümü bütçeye aktarılmaz.');
  } else if (P0.wb.viv.on !== false && ENG.vivSpec(P0).lin) {
    const VSb = ENG.vivSpec(P0), fnb = P0.wb.viv.fn;
    notes.push(`Platform: denizaltı mastı. B2-01 analitik tahmini yalnız açısal yolu ve ${String(VSb.H).replace('-', '−')} dB DRR varsayımını içerir; mast başı ötelemesinin (±${fmt(VSb.y * 1e3, 2).replace('.', ',')} mm, ${fmt(sq(2 * Math.PI * fnb) * VSb.y, 2).replace('.', ',')} m/s² @ ${fmt(fnb, 2).replace('.', ',')} Hz) dengesizlik torku ve optik montaj yoluyla katkısı işletme benzetiminde ve T2.2'de (açısal + öteleme dwell) görünür.`);
  } else if (P0.wb.viv.on === false) { const Hv = ENG.vivSpec(P0).H; notes.push(`Hidrodinamik VIV kapalı: B2-01 tahmini 0 ve T2.2 ölçümü bütçeye aktarılmaz. Su içinde ilerleyen mast için analitik bütçe bu satırı ${fmt(P0.wb.viv.amp_deg * Math.PI / 180 * 1e6 / Math.SQRT2 * Math.pow(10, Hv / 20), 2).replace('.', ',')} µrad tahmin eder (${String(P0.wb.viv.amp_deg).replace('.', ',')}° × ${String(Hv).replace('-', '−')} dB).`); }
  // tahsisler IFOV cinsindendir (Q = q·IFOV, R-01 = k_roll·IFOV): kanal ya da optik değişince gereksinimle birlikte ölçeklenir;
  // k_wander / k_smear değişirse tahsislerin toplamı yeni gereksinimle karşılaştırılır
  notes.push(`Tahsisler IFOV cinsindendir: Q = q·IFOV (ör. B1-01 = ${fmt(ENG.BUDGET_ALLOC['B1-01'] / 40, 3)} IFOV = ${fmt(ENG.budgetAlloc(P0)['B1-01'], 2)} µrad bu kanalda). Wander payı RSS ${fmt(wbB.allocW, 2)} µrad (gereksinim ${fmt(reqW, 2)}), smear payı ${fmt(wbB.allocS, 2)} µrad (gereksinim ${fmt(reqS, 2)}).` +
    (wbB.allocW > reqW * (1 + 1e-9) || wbB.allocS > reqS * (1 + 1e-9) ? ' Tahsislerin toplamı gereksinimi aşıyor: satırlar kendi tahsisini sağlasa bile toplam sağlanamaz; k_wander / k_smear tahsis tablosundan sıkı seçilmiş.' : ''));
  // deniz satırlarının analitik tahmini (DRR varsayımı) örnek DUT'un döngü modelinden belirgin iyimserse
  { const I = ENG.seaDrrInfo(P0).filter(q => q.active && q.los !== 'rot' && isFinite(q.wres) && q.wres > 1.2 * q.est);
    if (I.length) notes.push(`Deniz satırlarının analitik tahmini iyimser: ${I.map(q => `${q.row} (${q.key}) bütçe varsayımı ${fmt(q.assume, 0)} dB ile ${fmt(q.est * 1e6, 2)} µrad; örnek DUT'un döngü modeli bu deniz spektrumunda (f_dom ${fmt(q.f, 3)} Hz) ${fmt(q.wres * 1e6, 2)} µrad verir (tahsis ${fmt(q.alloc * 1e6, 2)})`).join('; ')}. DRR deniz bandında frekansla 20–30 dB/dekad kötüleşir; varsayımı Model → Bütçe varsayımları'ndan güncelleyin ya da T1.1 ölçümünü kullanın ("Toplamlarda ölçülen değerleri kullan").`); }
  const dR = d.rot;
  notes.push(dR.ref === 'corner'
    ? `R-01 (görüntü rotasyonu) köşe pikselinde değerlendirilir: r = ½√(Nh² + Nv²) = ${fmt(dR.rCpx, 1)} px, θ = ${fmt(dR.angC * 1e3, 2)} mrad. Alan kenarı ölçütüne (FOVh/2) göre köşe ölçütü ${fmt(dR.angC / dR.angE, 3)} kat sıkıdır. Roll sınırı ψ_lim = ${fmt(dR.lim * 1e6, 0)} µrad RMS (Model → Görüntü rotasyonu).`
    : 'R-01 (görüntü rotasyonu) alan kenarında (FOVh/2) değerlendirilir; köşe pikseli ölçütü Parametreler → Referans kanal\'dan seçilir.');
  { const ER = ENG.epsRotInfo(P0), r4 = wbB.rows.find(r => r.id === 'B1-04'), r5 = wbB.rows.find(r => r.id === 'B1-05'), arwW = P0.wb.H.arw * Math.PI / 180 / 60 * Math.sqrt(P0.ana.Tw / 15) * 1e6;
    notes.push(ER.basis === 'roll'
      ? `B1-04 roll genliğinden hesaplanır (v13.7'ye kadarki tanım, Model → Bütçe varsayımları): ${fmt(r4.I, 2)} µrad. Benzetimde ve T1.1'de kaçıklığı sızdıran LOS ekseni etrafındaki dönmedir.`
      : `B1-04 = ε·σ_rot, LOS ekseni etrafındaki baz dönmesinden (bu geometride ağırlıkla ${ER.dom}; σ_rot = ${fmt(ER.sigma * 1e3, 2)} mrad): ${fmt(r4.I, 2)} µrad. Benzetim, T1.1 ve V&V F3 aynı fiziği kullanır (v13.8; önceden roll genliği).`);
    if (wbB.rwWin) {
      const arwNeed = r5.Q / Math.sqrt(P0.ana.Tw / 15) / (Math.PI / 180 / 60) / 1e6;
      notes.push(`B1-05 (ARW) wander toplamına ${P0.ana.Tw} s wander penceresinin metriğiyle girer: doğrusal trendi çıkarılmış rastgele yürüyüşün RMS'i ARW·√(T_w/15) = ${fmt(r5.I, 2)} µrad${r5.I > r5.Q ? ` (tahsis ${fmt(r5.Q, 2)} aşılıyor; bu pencerede tahsis için ARW ≤ ${fmt(arwNeed, 4)} °/√h gerekir)` : ''}. B1-06 ve B1-09 sabit kaymadır, trendle çıkar: yalnız drift'e girerler (τ = ${P0.wb.tau} s'de ARW·√τ = ${fmt(wbB.E96, 2)}, B·τ = ${fmt(wbB.E99, 3)}, b0 terimi ${fmt(wbB.Eb0, 3)} µrad). Wander toplamı τ'dan bağımsızdır (v13.9, kullanıcı kararı; τ metriği Model → Bütçe varsayımları'ndan seçilir).`);
    } else notes.push(`B1-05, B1-06 ve B1-09 wander toplamına τ = ${P0.wb.tau} s drift penceresinin metriğiyle girer (ARW·√τ = ${fmt(r5.I, 2)} µrad); toplam bu yüzden τ ile değişir. ${P0.ana.Tw} s wander penceresinde (doğrusal trend çıkarılmış) ARW'nin payı ARW·√(T_w/15) = ${fmt(arwW, 2)} µrad olurdu; sabit bias ve kompanzasyon artığı ise trendle çıkar (v13.8'e kadarki tanım).`); }
  if (P0.wb.extRows !== false) notes.push(`B1-08…B1-10 ek satırlardır (v11): deniz ötelemesi ivmesi (6-DOF ötelemeler + kaldıraç kolu ${armTxt(P0)}; B1-08 frekansı ivme terimlerinin varyansla ağırlıklı RMS frekansı, B1-10 her terimi kendi frekansında integre eder), gyro açılış bias'ı artığı + sıcaklık kayması (drift toplamına da eklenir: ${fmt(wbB.Eb0, 3)} µrad / τ) ve gyro g-duyarlılığı. Toplamlara girerler; tahsisleri (Q) proje kararıdır, durum "BİLGİ" gösterilir.`);
  if (op) {
    const r = op.rows;
    notes.push(`G1 grubu (B1-01 + B1-04) analitik bütçede doğrusal toplanır (tam korelasyon; v13.9'da kullanıcı kararıyla korundu). İşletme simülasyonunda iki kalemin zaman serileri arasındaki korelasyon ρ = ${fmt(op.rho, 2)}: yanal bakışta (LOS azimutu ${STATE.P.dut.geom.a0}°) B1-04'ü pitch × ε üretir, B1-01 ise roll'dan gelir. Doğrusal toplama bu geometride muhafazakârdır; gerçek gemide roll ile pitch aynı dalgadan doğar ve kısmen ilişkili olabilir.`);
    if (r['B1-02']) notes.push(`B1-02 (pitch artığı) işletmede el ekseninde ${fu(r['B1-02'].el, 3)} µrad: yanal bakışta pitch LOS ekseni etrafında döner ve görüntü rotasyonuna (R-01) gider. Analitik bütçe bu kalemi el eksenine yazar.`);
    if (r['B1-07'] && r['B2-03'] && r['B2-04']) notes.push(`B1-07 (sürtünme), B2-03 (ivme × dengesizlik) ve B2-04 (vuruntu / kablo torku) düzeyleri dar bant kapalı taban döngüde bütçe tahminine (3 / 2 / 1,5 µrad) kalibre edildi. Yapılandırılmış DUT'ta dar bant kontrol 1–8 Hz'de döngü kazancını artırdığı için işletme değerleri daha küçüktür: el ${fu(r['B1-07'].el, 2)} / ${fu(r['B2-03'].el, 2)} / ${fu(r['B2-04'].el, 2)} µrad. Tork yoluyla gelen bu satırlar gimbal ataletiyle ters orantılıdır (aynı kesim frekansında K ∝ J).`);
    if (r['B3-01']) notes.push(`B3-01 (50 Hz yardımcı makine) işletmede wander ${fu(r['B3-01'].wEl, 2)} µrad, smear ${fu(r['B3-01'].sEl, 2)} µrad: 50 fps videoda 50 Hz ton DC'ye katlanır (stroboskop). Video bu tonu sabit kayma olarak görür; yüksek hızlı kanal (T3.3) gerekir.`);
    if (r['B1-05']) notes.push(wbB.rwWin
      ? `B1-05 (ARW) işletmede ${STATE.P.ana.Tw} s wander penceresinde el ${fu(r['B1-05'].wEl, 2)} / xel ${fu(r['B1-05'].wXel, 2)} µrad (örnek DUT'un ARW'siyle; bütçe satırı spesifikasyon ARW'siyle ${fmt(wbB.rows.find(q => q.id === 'B1-05').I, 2)}), τ = ${STATE.P.wb.tau} s penceresinde ${fu(r['B1-05'].pdeEl, 2)} µrad (drift).`
      : `B1-05 (ARW) τ = 1 s penceresinde ${fu(r['B1-05'].pdeEl, 2)} µrad, ama 120 s wander penceresinde ${fu(r['B1-05'].wEl, 2)} µrad: ARW rastgele yürüyüştür ve pencere uzadıkça büyür. Bütçe satırı kısa pencereyi, wander gereksinimi uzun pencereyi ölçer.`);
    notes.push(`İşletme simülasyonu ${op.T} s, tohum ${op.seed}; satırlar izole kaynak + izole mekanizma ile, toplam ise tüm kaynaklar birlikte koşuldu.${opOk ? '' : ' Sonuçlar önceki parametrelerle — "Kampanyayı koştur" işletme ayrıştırmasını da yeniler.'}`);
  }
  nb.append(h('ul', { class: 'notes' }, notes.map(n => h('li', null, n))));
}
// Ölçülen toplam jitter'ın (T1.3, deniz profili altında wander) taban düzeltmesi: masa mikro-titreşimi karesel düşülür
// Kip Parametreler → Hexapod'dan; zincire özgü pay T1.3'ün yalıtılmış masa koşusundan gelir.
function floorCorrTable(D) {
  const { d } = D, P = STATE.P, reqW = d.req.wander * 1e6, mode = P.wb.hex.mvCorr || 'kapalı', mv = P.wb.hex.microvib;
  const r = STATE.results['T1.3'], n = r && r.res && r.res.num && r.res.num.wander ? r.res.num : null, fresh = r && r.key === curKey();
  const wrap = h('div', { style: { marginTop: '14px' } }, h('h4', { style: { margin: '0 0 6px', fontSize: 'var(--fs-s)' } }, 'Ölçülen toplam wander ve taban düzeltmesi (T1.3)'));
  if (!n) { wrap.append(h('p', { class: 'small muted', style: { margin: 0 } }, mode === 'kapalı' ? 'Taban düzeltmesi kapalı (v13.5 varsayılanı, Parametreler → Hexapod): örnek DUT\'ta masa mikro-titreşimi ölçüme karesel eklenmiyor (sürtünme ditheri), düşüm iyimser olurdu (V&V M7). Açıldığında T1.3 ham ve düzeltilmiş wander burada birlikte raporlanır.' : 'T1.3 sonucu yok: kampanyayı ya da T1.3\'ü koşturun; ham ve düzeltilmiş wander burada birlikte raporlanır.')); return wrap; }
  const W = n.wander, C = n.corr, cv = (v, req) => h('td', { class: 'n' + (req != null && v > req ? ' over' : '') }, fmt(v * 1e6, 2));
  const full = (x) => Math.sqrt(Math.max(0, x * x - sq(mv * 1e-6)));
  const rows = [
    ['Ham ölçüm σ_ölç (en kötü tohum)', W.el, W.xel, reqW, 'kabul kararı ham değerle verilir'],
    [`Masa payı s (${ENG.MV_MODE_TXT[C.mode]})`, C.sEl, C.sXel, null, C.mode === 'zincir' ? 'yalıtılmış koşu: stab ON, video zinciri, aynı pencereli wander metriği' : 'masa mikro-titreşimi (Model → Hexapod)'],
    ['Düzeltilmiş σ_DUT = √(σ_ölç² − s²)', C.el, C.xel, reqW, C.reliable ? 'bütçede kullanılan değer' : 's² ölçülen varyansın yarısını aşıyor: güvenilmez'],
    [`Karşılaştırma: ${fmt(mv, 1)} µrad tam düşülseydi`, full(W.el), full(W.xel), reqW, 'stab ON\'da iyimser: DUT tabla hareketini bastırır'],
  ];
  wrap.append(h('table', { class: 'dt' }, h('thead', null, h('tr', null, ['Gösterge (µrad)', 'el', 'xel', 'Gereksinim', 'Not'].map((c, i) => h('th', { class: i && i < 4 ? 'n' : '' }, c)))),
    h('tbody', null, rows.map(([k, a, b, q, nt], i) => h('tr', { class: i === 2 ? 'tot' : '' }, h('td', null, k), cv(a, q), cv(b, q), h('td', { class: 'n' }, q != null ? fmt(q, 1) : '—'), h('td', { class: 'small muted' }, nt))))));
  if (!fresh) wrap.append(h('p', { class: 'xs muted', style: { margin: '6px 0 0' } }, 'T1.3 önceki parametrelerle koşuldu.'));
  return wrap;
}
