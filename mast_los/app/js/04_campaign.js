// ---------------------------------------------------------------- durum
const TEST_ORDER = ENG.TEST_ORDER;
const DEF_KEY = pKey(ENG.defaultParams());
const SHIP_KEY = pKey(ENG.defaultParams('ship'));     // gemi direği varsayılanı (önceden hesaplanmış ikinci küme)
const isShipP = (P) => !!(P && P.wb && P.wb.platform === 'ship');
const PLAT_NAME = { sub: 'Denizaltı optronik mastı', ship: 'Gemi direği EO direktör' };
const platOf = (P) => isShipP(P) ? 'ship' : 'sub';
const STATE = {
  P: ENG.defaultParams(),
  results: {}, ctx: { key: DEF_KEY }, op: null, opKey: null, play: null,
  running: false, runIds: new Set(), waitIds: new Set(), prog: {}, errors: {},
  sel: load('sel', 'T1.3'), tab: 'kampanya', lastRun: null,
};
if (PRE.tests) for (const id of Object.keys(PRE.tests)) STATE.results[id] = { res: PRE.tests[id], key: DEF_KEY, src: 'pre' };
if (PRE.ctx) Object.assign(STATE.ctx, PRE.ctx, { key: DEF_KEY });
if (PRE.op) { STATE.op = PRE.op; STATE.opKey = DEF_KEY; }
if (!TEST_ORDER.includes(STATE.sel)) STATE.sel = 'T1.3';
const EST = Object.fromEntries(TEST_ORDER.map(id => [id, (PRE.tests && PRE.tests[id] && PRE.tests[id].elapsed) || 6]));
EST.op = 50;
const curKey = () => pKey(STATE.P);
const isStale = (id) => STATE.results[id] && STATE.results[id].key !== curKey();
// parametreler bir platformun varsayılanına dönünce o platformun önceden hesaplanmış sonuçları geri yüklenir
// (kullanıcının o anahtarla koştuğu sonuçlar varsa onlar korunur)
function preSet(key) {
  if (key === DEF_KEY) return { tests: PRE.tests, ctx: PRE.ctx, op: PRE.op };
  if (key === SHIP_KEY && PRE.ship) return { tests: PRE.ship.tests, ctx: PRE.ship.ctx, op: PRE.ship.op };
  return null;
}
function restorePre() {
  const k = curKey(), S = preSet(k); if (!S) return false;
  let any = false;
  if (S.tests) for (const id of Object.keys(S.tests)) { const r = STATE.results[id]; if (!r || r.key !== k) { STATE.results[id] = { res: S.tests[id], key: k, src: 'pre' }; any = true; } }
  if (S.ctx && STATE.ctx.key !== k) { STATE.ctx = Object.assign({}, S.ctx, { key: k }); any = true; }
  if (S.op && STATE.opKey !== k) { STATE.op = S.op; STATE.opKey = k; any = true; }
  return any;
}
function statusOf(id) {
  if (STATE.runIds.has(id)) return 'RUN';
  if (STATE.waitIds.has(id)) return 'WAIT';
  if (STATE.errors[id]) return 'ERR';
  const r = STATE.results[id]; return r ? r.res.status : 'NONE';
}
function measuredFills() {     // bütçeye aktarılan ölçümler (µrad) — en güncel sonuçlardan
  const out = {}, src = {};
  for (const id of TEST_ORDER) {
    const r = STATE.results[id]; if (!r || !r.res.fill || r.res.status === 'GEÇERSİZ') continue;
    for (const [k, v] of Object.entries(r.res.fill)) { if (!isFinite(v)) continue; out[k] = k === 'MTF' ? v : v * 1e6; src[k] = id; }
  }
  // kaynağı bu platformda/ayarda olmayan satırlara eski ölçüm taşınmaz (VIV kapalı ya da kilitlenme yok; gemide dalga çarpması)
  if (!ENG.sourceActive(STATE.P, 'viv')) { delete out['B2-01']; delete src['B2-01']; }
  if (!ENG.sourceActive(STATE.P, 'slap')) { delete out['B2-02']; delete src['B2-02']; }
  return { val: out, src };
}

// ---------------------------------------------------------------- koşturma
let progTimer = null;
function setProgress(frac, text) {
  const bar = $('#progBar'), tx = $('#progTxt');
  if (bar) bar.style.width = (100 * clamp(frac, 0, 1)).toFixed(1) + '%';
  if (tx) tx.textContent = text;
}
async function runTests(ids, opts) {
  opts = opts || {};
  if (STATE.running) return;
  const P = JSON.parse(JSON.stringify(STATE.P)), key = pKey(P);
  ids = TEST_ORDER.filter(id => ids.includes(id));
  if (!ids.includes('T0.1') && STATE.ctx.key !== key) ids.unshift('T0.1');
  STATE.running = true; STATE.errors = {};
  ids.forEach(id => STATE.waitIds.add(id));
  const t0 = Date.now();
  const total = ids.reduce((s, id) => s + EST[id], 0) + (opts.op ? EST.op : 0);
  const done = new Set();
  const updProg = () => {
    let s = 0; for (const id of ids) s += done.has(id) ? EST[id] : EST[id] * (STATE.prog[id] || 0);
    if (opts.op) s += done.has('op') ? EST.op : EST.op * (STATE.prog.op || 0);
    const nd = ids.filter(id => done.has(id)).length;
    setProgress(s / total, `${nd}/${ids.length} test${opts.op ? (done.has('op') ? ' · işletme ✓' : ' · işletme ' + Math.round(100 * (STATE.prog.op || 0)) + '%') : ''} · ${Math.round((Date.now() - t0) / 1000)} s`);
  };
  progTimer = setInterval(updProg, 400);
  document.body.classList.add('busy'); updateRunButtons();
  renderSeq(); renderCampSummary(); renderShell();
  const ctxBase = { IFOVcal: STATE.ctx.key === key ? STATE.ctx.IFOVcal : undefined, T01: STATE.ctx.key === key ? STATE.ctx.T01 : undefined, floor: STATE.ctx.key === key ? STATE.ctx.floor : undefined, res: STATE.ctx.key === key ? STATE.ctx.res : undefined, bore: STATE.ctx.bore };
  const onEv = (m) => {
    if (m.type === 'prog') { STATE.prog[m.id] = m.p; if (m.id !== 'op' && m.id !== 'play' && STATE.waitIds.has(m.id)) { STATE.waitIds.delete(m.id); STATE.runIds.add(m.id); renderSeqItem(m.id); } updSeqProg(m.id); }
    else if (m.type === 'test') {
      STATE.results[m.id] = { res: m.res, key, src: 'run', at: nowHM() };
      STATE.runIds.delete(m.id); STATE.waitIds.delete(m.id); done.add(m.id);
      if (m.ctxOut) { if (m.ctxOut.IFOVcal != null) ctxBase.IFOVcal = m.ctxOut.IFOVcal; if (m.ctxOut.T01) ctxBase.T01 = m.ctxOut.T01; if (m.ctxOut.floor) ctxBase.floor = m.ctxOut.floor; if (m.ctxOut.res) ctxBase.res = m.ctxOut.res; if (m.ctxOut.bore) ctxBase.bore = m.ctxOut.bore; if (m.ctxOut.psdTable && m.id === 'T3.3') STATE.ctx.psdTable = m.ctxOut.psdTable; }
      onResultsChanged(m.id);
    }
  };
  const fail = (idsF, err) => { for (const id of idsF) { if (!done.has(id)) { STATE.errors[id] = String(err && err.message || err); STATE.runIds.delete(id); STATE.waitIds.delete(id); done.add(id); renderSeqItem(id); } } };
  try {
    if (POOL.broken) { await runLocal(ids, P, key, ctxBase, done); }
    else {
      if (ids[0] === 'T0.1') { try { await POOL.run({ cmd: 'tests', ids: ['T0.1'], P, ctx: {} }, onEv); } catch (e) { fail(['T0.1'], e); } }
      const rest = ids.filter(id => id !== 'T0.1');
      const chains = [['T2.1', 'T2.2'], ['T0.2', 'T3.1', 'T3.2', 'T3.3'], ['T0.5', 'T4.1']];      // v13.12: T3.3'ün ölçüme dayalı denetimi T0.2'nin tabanını kullanır
      const used = new Set(), jobs = [];
      for (const ch of chains) { const inn = ch.filter(id => rest.includes(id)); if (inn.length > 1) { jobs.push(inn); inn.forEach(id => used.add(id)); } }
      for (const id of rest) if (!used.has(id)) jobs.push([id]);
      jobs.sort((a, b) => b.reduce((s, id) => s + EST[id], 0) - a.reduce((s, id) => s + EST[id], 0));
      const proms = jobs.map(j => POOL.run({ cmd: 'tests', ids: j, P, ctx: Object.assign({}, ctxBase) }, onEv).catch(e => fail(j, e)));
      if (opts.op) proms.push(POOL.run({ cmd: 'op', P, T: 600 }, (m) => { if (m.type === 'prog') STATE.prog.op = m.p; else if (m.type === 'done' && m.op) { STATE.op = m.op; STATE.opKey = key; done.add('op'); onOpChanged(); } }).catch(e => { STATE.errors.op = String(e.message || e); done.add('op'); }));
      await Promise.all(proms);
    }
  } finally {
    clearInterval(progTimer); STATE.running = false; STATE.runIds.clear(); STATE.waitIds.clear(); STATE.prog = {};
    Object.assign(STATE.ctx, ctxBase, { key });
    STATE.lastRun = nowHM();
    const nErr = Object.keys(STATE.errors).length;
    setProgress(1, nErr ? `${nErr} iş hata verdi — ayrıntı test panelinde` : `Tamamlandı · ${Math.round((Date.now() - t0) / 1000)} s · ${STATE.lastRun}`);
    document.body.classList.remove('busy'); updateRunButtons();
    renderSeq(); renderCampSummary(); renderDetail(); renderBudget(); renderStale(); renderMethodDyn(); renderReq(); renderShell();
  }
}
async function runLocal(ids, P, key, ctxBase, done) {      // Web Worker yoksa: ana iş parçacığında, testler arasında soluklanarak
  const ctx = Object.assign({}, ctxBase);
  for (const id of ids) {
    STATE.waitIds.delete(id); STATE.runIds.add(id); renderSeqItem(id);
    await new Promise(r => setTimeout(r, 30));
    try { const r = ENG.runTest(id, P, ctx, null); STATE.results[id] = { res: r, key, src: 'run', at: nowHM() }; }
    catch (e) { STATE.errors[id] = String(e && e.message || e); }
    STATE.runIds.delete(id); done.add(id); onResultsChanged(id);
  }
  Object.assign(ctxBase, { IFOVcal: ctx.IFOVcal, T01: ctx.T01, floor: ctx.floor, res: ctx.res, bore: ctx.bore });
}
function onResultsChanged(id) {
  renderSeqItem(id);
  if (id === STATE.sel) renderDetail();
  renderCampSummaryDeb(); renderBudgetDeb(); renderReqDeb();
}
function onOpChanged() { renderCampSummaryDeb(); renderBudgetDeb(); renderReqDeb(); renderShellDeb(); }
function updateRunButtons() {
  const b = $('#runAll'); if (b) { b.disabled = STATE.running; b.querySelector('span').textContent = STATE.running ? 'Koşuyor…' : 'Kampanyayı koştur'; }
  for (const pb of $$('#platSeg button')) pb.disabled = STATE.running;     // koşu sürerken platform değişmez
  const d = $('#runOne'); if (d) d.disabled = STATE.running;
}

// ---------------------------------------------------------------- kampanya görünümü
function buildCampaign(root) {
  const flt = STATE.tflt || 'all';
  root.append(
    scrHead('Kampanya', '28 test: durum, ölçülen değerler, grafikler ve test tanımları. Soldan bir test seçin.', null),
    h('div', { class: 'camp' },
      h('div', { class: 'panel navi' },
        h('div', { class: 'tools' },
          h('input', { type: 'search', id: 'tsearch', placeholder: 'Test ara: kimlik ya da ad', 'aria-label': 'Test ara', autocomplete: 'off', oninput: (e) => { STATE.tq = e.target.value; applySeqFilter(); } }),
          h('div', { class: 'seg', id: 'tfilter', role: 'group', 'aria-label': 'Duruma göre süz' },
            [['all', 'Tümü'], ['AŞIM', 'Aşım'], ['BİLGİ', 'Bilgi'], ['GEÇERSİZ', 'Geçersiz']].map(([k, lab]) => h('button', { type: 'button', 'data-f': k, 'aria-pressed': k === flt ? 'true' : 'false',
              onclick: (e) => { STATE.tflt = k; for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); applySeqFilter(); } }, lab)))),
        h('nav', { class: 'seq', id: 'seq', 'aria-label': 'Test sırası' })),
      h('div', { class: 'detail', id: 'detail' })));
  renderSeq(); renderCampSummary(); renderDetail();
}
// gezgin süzgeci: metin (kimlik ya da ad) ve durum; boş kalan blok başlıkları gizlenir
function applySeqFilter() {
  const q = (STATE.tq || '').trim().toLocaleLowerCase('tr'), f = STATE.tflt || 'all';
  let any = false;
  for (const b of BLOCKS) {
    let vis = 0;
    for (const id of TEST_ORDER.filter(x => blockOf(x) === b.id)) {
      const el = $('#ti-' + id.replace('.', '_')); if (!el) continue;
      const okQ = !q || id.toLocaleLowerCase('tr').includes(q) || testName(id).toLocaleLowerCase('tr').includes(q), okF = f === 'all' || statusOf(id) === f;
      el.classList.toggle('hide', !(okQ && okF)); if (okQ && okF) vis++;
    }
    const hd = $('#blk-' + b.id); if (hd) hd.classList.toggle('hide', !vis); any = any || vis > 0;
  }
  const none = $('#seqNone'); if (none) none.hidden = any;
}
function renderSeq() {
  const nav = $('#seq'); if (!nav) return; nav.innerHTML = '';
  for (const b of BLOCKS) {
    const ids = TEST_ORDER.filter(id => blockOf(id) === b.id);
    const nOk = ids.filter(id => statusOf(id) === 'OK').length, nF = ids.filter(id => statusOf(id) === 'AŞIM').length;
    nav.append(h('div', { class: 'blk', id: 'blk-' + b.id }, h('span', { class: 'eyebrow' }, b.id + ' · ' + b.name), h('span', { class: 'xs muted' }, `${nOk} OK${nF ? ' · ' + nF + ' aşım' : ''}`)));
    for (const id of ids) nav.append(seqItem(id));
  }
  nav.append(h('div', { class: 'none', id: 'seqNone', hidden: true }, 'Süzgece uyan test yok.'));
  applySeqFilter();
  renderShellDeb();
}
function seqItem(id) {
  const st = statusOf(id);
  const b = h('button', { class: 'titem', id: 'ti-' + id.replace('.', '_'), 'aria-current': STATE.sel === id ? 'true' : 'false', title: testName(id), onclick: () => selectTest(id) },
    h('span', { class: 'id' }, id), h('span', { class: 'nm' }, testName(id)), pill(st, isStale(id) && st !== 'RUN' && st !== 'WAIT' ? 'stale' : null),
    st === 'RUN' ? h('span', { class: 'rp' }, h('i', { style: { width: (100 * (STATE.prog[id] || 0)).toFixed(0) + '%' } })) : null);
  return b;
}
function renderSeqItem(id) { const old = $('#ti-' + id.replace('.', '_')); if (old) { const hid = old.classList.contains('hide'); const nw = seqItem(id); if (hid) nw.classList.add('hide'); old.replaceWith(nw); } updStripCell(id); renderShellDeb(); }
function updSeqProg(id) { const el = $('#ti-' + String(id).replace('.', '_') + ' .rp > i'); if (el) el.style.width = (100 * (STATE.prog[id] || 0)).toFixed(0) + '%'; }
function selectTest(id) {
  STATE.sel = id; store('sel', id);
  for (const b of $$('.titem')) b.setAttribute('aria-current', b.id === 'ti-' + id.replace('.', '_') ? 'true' : 'false');
  for (const c of $$('#strip .cell')) c.setAttribute('aria-current', c.id === 'sc-' + id.replace('.', '_') ? 'true' : 'false');
  renderDetail();
  const m = $('#main'); if (m && STATE.tab === 'kampanya' && window.innerWidth >= 860) { const d = $('#detail'); if (d && d.getBoundingClientRect().top < m.getBoundingClientRect().top) m.scrollTop = 0; }
  if (window.innerWidth < 860 && STATE.tab === 'kampanya') $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function tileEl(k, v, unit, d, meter) {
  return h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, unit ? h('small', null, unit) : null), d ? h('div', { class: 'd' }, d) : null,
    meter ? h('div', { class: 'meter' + (meter > 1 ? ' over' : '') }, h('i', { style: { width: (100 * clamp(meter, 0, 1)).toFixed(1) + '%' } })) : null);
}
function renderCampSummary() {
  const box = $('#campTiles'); if (!box) return; box.innerHTML = '';
  const st = TEST_ORDER.map(statusOf), n = (s) => st.filter(x => x === s).length;
  const nStale = TEST_ORDER.filter(isStale).length;
  const anyRun = TEST_ORDER.some(id => STATE.results[id] && STATE.results[id].src === 'run');
  box.append(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'Kampanya durumu'),
    h('div', { class: 'counts' }, h('span', null, h('b', { class: 'okc' }, String(n('OK'))), ' OK'), h('span', null, h('b', { class: n('AŞIM') ? 'over' : '' }, String(n('AŞIM'))), ' aşım'), h('span', null, h('b', null, String(n('BİLGİ'))), ' bilgi'),
      n('GEÇERSİZ') ? h('span', null, h('b', { style: { color: 'var(--warn-ink)' } }, String(n('GEÇERSİZ'))), ' geçersiz') : null),
    h('div', { class: 'd' }, `${PLAT_NAME[platOf(STATE.P)]} · ` + (nStale ? `${nStale} sonuç önceki parametrelerle — yeniden koşturun` : (anyRun ? `Son koşu ${STATE.lastRun || ''}` : `${TEST_ORDER.length} test · varsayılan parametrelerle önceden hesaplandı`)))));
  const d = ENG.derive(STATE.P), op = STATE.op, opOk = op && STATE.opKey === curKey();
  const reqW = d.req.wander * 1e6, reqS = d.req.smear * 1e6;
  if (op) {
    const a = op.all, w = Math.max(a.wanderEl, a.wanderXel) * 1e6, sm = Math.max(a.smearEl, a.smearXel) * 1e6;
    box.append(tileEl('İşletme wander (sim.)', fmt(w, 1), 'µrad', `el ${fu(a.wanderEl, 1)} · xel ${fu(a.wanderXel, 1)} — gereksinim ${fmt(reqW, 1)}${opOk ? '' : ' · eski'}`, w / reqW));
    box.append(tileEl('İşletme smear (sim.)', fmt(sm, 2), 'µrad', `el ${fu(a.smearEl, 2)} · xel ${fu(a.smearXel, 2)} — gereksinim ${fmt(reqS, 1)}`, sm / reqS));
    const B = ENG.computeBudget(STATE.P, null);
    box.append(tileEl('Jitter MTF @ Nyquist (sim.)', fmt(Math.min(a.mtfEl, a.mtfXel), 3), '', `gereksinim karşılığı ≥ ${fmt(B.mtfReq, 3)} · analitik tahmin ${fmt(B.mtfNyq, 3)}`));
  }
  const ti = ENG.turInfo(STATE.P), r02 = STATE.results['T0.2'];
  box.append(tileEl('Ölçüm zinciri (B0)', fmt(ti.turW, 1), 'TUR', `video tabanı ${fmt(ti.uv, 2)} µrad · ${r02 ? 'T0.2 ' + r02.res.status : 'T0.2 koşulmadı'} · hedef TUR ${STATE.P.wb.TUR_target}`));
  if (PRE.vv && PRE.vv.items) {
    const it = PRE.vv.items, nP = it.filter(x => x.pass).length;
    const t = tileEl('Doğrulama (V&V)', `${nP}/${it.length}`, 'kontrol', `${PRE.seeds ? PRE.seeds.n + ' tohumla tekrarlandı' + adaptTxt() + (isShipP(STATE.P) ? ' (denizaltı varsayılanı)' : '') + ' · ' : ''}ayrıntı Yöntem ekranında`);
    t.style.cursor = 'pointer'; t.title = 'Yöntem ekranındaki doğrulama tablosuna git'; t.addEventListener('click', () => showTab('yontem'));
    box.append(t);
  }
}
// tohum tekrarlarından bu testin değişkenliği (varsayılan parametrelerle önceden hesaplanmış)
function seedLine(id) {
  const S = PRE.seeds, t = S && S.tests && S.tests[id]; if (!t) return null;
  const fl = Object.entries(t.fill || {}).filter(([, z]) => z).map(([k, z]) => k === 'MTF' ? `MTF ${fmt(z.mean, 4)} ± ${fmt(z.sd, 4)}` : `${k} ${fu(z.mean, 2)} ± ${fu(z.sd, 2)} µrad (${fmt(z.min * 1e6, 2)}–${fmt(z.max * 1e6, 2)})`);
  const st = Object.entries(t.status || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(' · ');
  const rw = seedRowsTxt(id);
  const nT = t.n || S.n;
  return h('div', { class: 'small', style: { color: 'var(--ink-2)' } }, h('b', null, `${nT} tohumla tekrar (varsayılan parametreler${nT > S.n ? `; uyarlamalı: kampanya ${S.n}, sınıra %${fmt(100 * S.adaptive.near, 0)}'den yakın satır olduğu için ${nT}` : ''}): `), `karar ${st}` + (fl.length ? '; ' + fl.join('; ') : '') + (rw ? '; ' + rw : ''));
}
// v13.16: T1.9 satır düzeyi — test kararı değişmese de tek tek satırlar tohuma göre değişebilir; sınıra %2'den yakın satırlar
function seedRowsTxt(id) {
  const S = PRE.seeds, q = S && S.tests && S.tests[id] && S.tests[id].req; if (!q || !q.rows || !q.rows.length) return '';
  const nb = q.nBad, flip = q.rows.filter(r => r.nBad > 0 && r.nBad < r.n), near = q.rows.filter(r => r.r && r.r.min <= 1.02 && r.r.max >= 0.98);
  const ci = (r) => { const [a, b] = cpInt(r.nBad, r.n); return `%95 GA %${fmt(100 * a, 0)}–${fmt(100 * b, 0)}`; };      // v13.17: Clopper–Pearson
  return `${q.nRows} karar satırından (${q.basis === 'once' ? 'takip öncesi' : 'takip sonrası'}) aşan ${nb ? (nb.min === nb.max ? fmt(nb.min, 0) : `${fmt(nb.min, 0)}–${fmt(nb.max, 0)}`) : '—'}` +
    `; tohuma göre değişen ${flip.length ? flip.map(r => `${r.name} (${r.nBad}/${r.n} AŞIM, ${ci(r)})`).join(', ') : 'yok'}` +
    (near.length ? `; sınıra %2'den yakın: ${near.map(r => `${r.name} (değer / sınır ${fmt(r.r.min, 4)}–${fmt(r.r.max, 4)}${r.nBad === 0 ? `; ${r.n} tohumun hiçbirinde aşmadı, tek koşuda aşma olasılığı ≤ %${fmt(100 * (1 - Math.pow(0.05, 1 / r.n)), 0)} (tek taraflı %95)` : ''})`).join(', ')}` : '');
}
// v13.17: uyarlamalı tekrar notu ("(T1.9: 20)") ve iki terimli oran için Clopper–Pearson %95 güven aralığı (ikiye bölme)
function adaptTxt(bare) { const A = PRE.seeds && PRE.seeds.adaptive; if (!(A && A.ids && A.ids.length)) return ''; const t = A.ids.map(id => `${id}: ${A.nDone[id]}`).join(', '); return bare ? t : ` (${t})`; }
function cpInt(k, n, a) {
  a = a == null ? 0.05 : a;
  const cdf = (kk, p) => { let s = 0, t = Math.pow(1 - p, n); for (let i = 0; i <= kk; i++) { s += t; t *= (n - i) / (i + 1) * p / (1 - p); } return Math.min(1, s); };
  const bis = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (f(m)) lo = m; else hi = m; } return 0.5 * (lo + hi); };
  const lo = k === 0 ? 0 : bis((p) => 1 - cdf(k - 1, p) < a / 2), hi = k === n ? 1 : bis((p) => cdf(k, p) > a / 2);
  return [lo, hi];
}
const renderCampSummaryDeb = debounce(renderCampSummary, 200);

function renderDetail() {
  const box = $('#detail'); if (!box) return;
  const id = STATE.sel, tm = tmRow(id), R = STATE.results[id], st = statusOf(id);
  box.innerHTML = '';
  const head = h('div', { class: 'panel dpanel' }, h('div', { class: 'body' },
    h('div', { class: 'dhead' },
      h('div', { style: { minWidth: 0, flex: '1 1 380px' } }, h('div', { class: 'eyebrow' }, `${id} · ${tm.band || blockOf(id)} · ${(BLOCKS.find(b => b.id === blockOf(id)) || {}).name || ''}`), h('h2', null, testName(id)),
        h('div', { class: 'meta' }, pill(st, isStale(id) ? 'stale' : null), R ? h('span', { class: 'xs muted' }, R.src === 'pre' ? `önceden hesaplandı (${R.key === SHIP_KEY ? 'gemi direği' : 'denizaltı mastı'} varsayılanı)` : `koşuldu ${R.at || ''}`, R.res.elapsed != null ? ` · ${fmt(R.res.elapsed, 1)} s hesap` : '') : null,
          isStale(id) ? h('span', { class: 'xs', style: { color: 'var(--warn-ink)' } }, 'parametreler değişti') : null)),
      h('button', { class: 'btn', id: 'runOne', disabled: STATE.running, onclick: () => runTests([id], {}), html: ICON.bolt + '<span>Bu testi koştur</span>' })),
    tm.purpose ? h('p', { class: 'small', style: { margin: '10px 0 0', color: 'var(--ink-2)', maxWidth: '100ch' } }, h('b', null, 'Amaç: '), tm.purpose) : null));
  box.append(head);
  if (STATE.errors[id]) box.append(h('div', { class: 'banner' }, h('b', null, 'Hata: '), STATE.errors[id].split('\n')[0]));
  if (!R) { box.append(h('div', { class: 'panel' }, h('div', { class: 'body muted' }, 'Bu test henüz koşulmadı. “Bu testi koştur” ile başlatın.'))); box.append(wbDefPanel(id, true)); return; }
  const res = R.res;
  const res_cls = res.status === 'AŞIM' ? 'measured fail' : (res.status === 'OK' ? 'measured ok' : (res.status === 'GEÇERSİZ' ? 'measured warn' : 'measured'));
  const main = h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Ölçülen'), h('span', { class: 'hint', style: { maxWidth: '110ch' } }, 'Kabul: ' + (tm.accept || '—'))),
    h('div', { class: 'body', style: { display: 'grid', gap: '12px' } },
      h('div', { class: res_cls }, res.measured),
      res.kv && res.kv.length ? h('div', { class: 'tscroll' }, h('table', { class: 'kv' }, h('tbody', null, res.kv.map(([k, v]) => h('tr', null, h('th', null, k), h('td', null, v)))))) : null,
      Object.keys(res.fill || {}).length ? h('div', null, h('div', { class: 'secttl' }, 'Bütçeye aktarılan'),
        h('div', { class: 'fills' }, Object.entries(res.fill).map(([k, v]) => h('span', { class: 'mono' }, k === 'MTF' ? `MTF = ${fmt(v, 3)}` : `${k} = ${fu(v, 2)} µrad`)))) : null,
      curKey() === DEF_KEY ? seedLine(id) : null,
      id === 'T3.3' && STATE.ctx.psdTable ? h('div', null, h('button', { class: 'btn sm', onclick: copyPsd, html: ICON.copy + '<span>PSD tablosunu kopyala (f, µrad²/Hz)</span>' }), h('div', { id: 'psdCopy' })) : null));
  box.append(main);
  if (res.plots && res.plots.length) {
    const pl = h('div', { class: 'plots' }); box.append(h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Grafikler'), h('span', { class: 'hint' }, `${res.plots.length} grafik; üzerine gelince değerler`)), h('div', { class: 'body' }, pl)));
    for (const p of res.plots) {
      const c = h('div', { class: 'chartbox plotbox' }); pl.append(c);
      if (p.kind === 'quiver') { c.append(quiverPlot(p)); continue; }
      if (!p.series) continue;
      new Chart(c, { title: p.title, xLabel: p.xLabel, yLabel: p.yLabel, yUnit: p.yLabel, xLog: p.xLog, yLog: p.yLog, series: p.series, refLines: (p.refLines || []).map(r => Object.assign({ kind: /tahsis|sınır|gerekli|eşik|limit/i.test(r.label || '') ? 'limit' : 'ref' }, r)), height: 250 });
    }
  }
  if (res.notes && res.notes.length) box.append(h('div', { class: 'panel' }, h('header', null, h('h3', null, 'Yöntem notları')), h('div', { class: 'body' }, h('ul', { class: 'notes' }, res.notes.map(n => h('li', null, n))))));
  box.append(wbDefPanel(id, false));
}
// Test tanımı (simülasyonun kendi test planı) ve simülasyondaki uygulaması (Yöntem → Test tanımları ve uygulama)
function wbDefPanel(id, open) {
  const tm = tmRow(id), hd = TM.header || {};
  const keys = ['excitation', 'duration', 'dut', 'setup', 'chain', 'metrics', 'accept', 'prereq', 'risks', 'basis'];
  const im = (typeof TM_MAP !== 'undefined' ? TM_MAP : []).find(r => r[0].split(' · ').includes(id));
  const extra = im ? [[h('dt', null, 'Simülasyonda'), h('dd', null, im[2])], im[3] && im[3] !== '—' ? [h('dt', null, 'Uygulama notu'), h('dd', null, im[3])] : []] : [];
  return h('div', { class: 'panel' }, h('div', { class: 'body' }, h('details', { class: 'fold', open: open || null },
    h('summary', null, 'Test tanımı ve uygulama'),
    h('dl', { class: 'wbdef', style: { marginTop: '10px' } }, keys.filter(k => tm[k]).map(k => [h('dt', null, hd[k] || k), h('dd', null, String(tm[k]))]), extra))));
}

function quiverPlot(p) {
  const pts = p.pts || [], sc = p.scale || 100;
  let mx = 1; for (const q of pts) mx = Math.max(mx, Math.abs(q.x), Math.abs(q.y));
  const W = 460, H = 360, pad = 34, R = mx * 1.15, X = (x) => W / 2 + x / R * (W / 2 - pad), Y = (y) => H / 2 - y / R * (H / 2 - pad) * (W / H);
  const col = { grid: cssVar('--grid'), muted: cssVar('--muted'), s1: cssVar('--s1'), ink: cssVar('--ink') };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': p.title, style: 'max-width:100%;height:auto' });
  svg.append(s('line', { x1: pad / 2, x2: W - pad / 2, y1: H / 2, y2: H / 2, stroke: col.grid }), s('line', { x1: W / 2, x2: W / 2, y1: pad / 2, y2: H - pad / 2, stroke: col.grid }));
  let rms = 0;
  for (const q of pts) {
    const x0 = X(q.x), y0 = Y(q.y), x1 = X(q.x + q.dx * sc), y1 = Y(q.y + q.dy * sc); rms += q.dx * q.dx + q.dy * q.dy;
    svg.append(s('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: col.s1, 'stroke-width': 1.6, 'stroke-linecap': 'round' }), s('circle', { cx: x0, cy: y0, r: 2.6, fill: col.ink }));
  }
  rms = Math.sqrt(rms / Math.max(1, pts.length));
  svg.append(s('text', { x: W - 6, y: H - 6, 'text-anchor': 'end', fill: col.muted, 'font-size': 11, 'font-family': 'IBM Plex Sans, sans-serif' }, `±${Math.round(R)} px · oklar ×${sc} · artık ${rms.toFixed(3)} px RMS`));
  return h('div', null, h('div', { class: 'ttl', style: { fontFamily: 'var(--f-display)', fontSize: '14.5px', fontWeight: 600, marginBottom: '6px' } }, p.title), svg);
}

function copyPsd(e) {
  const T = STATE.ctx.psdTable, arr = (v) => Array.isArray(v) ? v : (ArrayBuffer.isView(v) ? Array.from(v) : Object.values(v || {}));
  const f = arr(T.f), P = arr(T.P);
  const txt = 'f (Hz)\tPSD (µrad²/Hz)\n' + f.map((x, i) => `${(+x).toPrecision(5)}\t${(+P[i]).toPrecision(5)}`).join('\n');
  const btn = e.currentTarget, lab = btn.querySelector('span');
  const fallback = () => { const box = $('#psdCopy'); box.innerHTML = ''; const ta = h('textarea', { rows: 6, style: { width: '100%', marginTop: '8px', fontFamily: 'var(--f-mono)', fontSize: '12px' }, readonly: true }); ta.value = txt; box.append(h('div', { class: 'xs muted', style: { marginTop: '6px' } }, 'Pano erişimi yok: metni seçip kopyalayın.'), ta); ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(txt).then(() => { lab.textContent = `Kopyalandı: ${f.length} satır`; }, fallback); } catch (err) { fallback(); }
}
