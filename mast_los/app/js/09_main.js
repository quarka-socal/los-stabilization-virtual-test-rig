// ---------------------------------------------------------------- kabuk: gezinme, sekans şeridi, durum satırı, tema (arayüz 14.0)
const UI_VER = '14.0', ENGINE_VER = 'v13.18';
const NAV_ICON = {
  ozet: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="6.5" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="2.5" width="6.5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="12.5" width="6.5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="9.5" width="6.5" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  kampanya: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.2l1.3 1.3L6.8 4M3 10.2l1.3 1.3 2.5-2.5M3 15.2l1.3 1.3 2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 5.5h7.5M9.5 10.5h7.5M9.5 15.5h7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  duzenek: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 9.5h10l2.3 7.5H2.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 9.5l2-3.2M13 9.5l-2-3.2M8 17l1.5-7.5M12 17l-1.5-7.5" stroke="currentColor" stroke-width="1.3"/><rect x="7.5" y="2.5" width="5" height="4" rx=".8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  butce: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17.2h14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="4" y="10" width="2.8" height="5" rx=".5" fill="currentColor"/><rect x="8.6" y="6" width="2.8" height="9" rx=".5" fill="currentColor"/><rect x="13.2" y="3" width="2.8" height="12" rx=".5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  gereksinim: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 1.5v3.4M10 15.1v3.4M1.5 10h3.4M15.1 10h3.4" stroke="currentColor" stroke-width="1.4"/></svg>',
  model: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="5.5" r="1.9" fill="var(--rail)" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="10" r="1.9" fill="var(--rail)" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="14.5" r="1.9" fill="var(--rail)" stroke="currentColor" stroke-width="1.5"/></svg>',
  yontem: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5.2C8.3 3.8 5.6 3.4 3 3.8v11.4c2.6-.4 5.3 0 7 1.4 1.7-1.4 4.4-1.8 7-1.4V3.8c-2.6-.4-5.3 0-7 1.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 5.2v11.4" stroke="currentColor" stroke-width="1.4"/></svg>',
};
const THEME_ICON = {
  toDark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.8 12.6A6.6 6.6 0 0 1 7.4 4.2a6.6 6.6 0 1 0 8.4 8.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  toLight: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M4.2 4.2l1.6 1.6M14.2 14.2l1.6 1.6M4.2 15.8l1.6-1.6M14.2 5.8l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};
const TABS = [['ozet', 'Özet'], ['kampanya', 'Kampanya'], ['duzenek', 'Düzenek'], ['butce', 'Bütçe'], ['gereksinim', 'Gereksinimler'], ['model', 'Model'], ['yontem', 'Yöntem']];
const BUILT = {};
const BUILDERS = { ozet: buildOverview, kampanya: buildCampaign, duzenek: buildRig, butce: buildBudget, gereksinim: buildReq, model: buildModel, yontem: buildMethod };
const SCROLL = {};
function showTab(t) {
  if (!TABS.some(x => x[0] === t)) t = 'ozet';
  const main = $('#main');
  if (STATE.tab && main) SCROLL[STATE.tab] = main.scrollTop;
  STATE.tab = t;
  for (const [id] of TABS) { $('#v-' + id).hidden = id !== t; const b = $('#tab-' + id); b.setAttribute('aria-selected', id === t ? 'true' : 'false'); b.tabIndex = id === t ? 0 : -1; }
  if (!BUILT[t]) { BUILDERS[t]($('#v-' + t)); BUILT[t] = true; }
  if (main) main.scrollTop = SCROLL[t] || 0;
  if (t === 'duzenek' && RIG.r3) { RIG.r3.resize(); drawRigFrame(); }
  if (t === 'duzenek' && (RIG.needsRun || (RIG.play && RIG.playKey !== curKey()))) runPlay(true);
  if (t === 'ozet') renderOverview();
  if (t === 'butce') renderBudget();
  if (t === 'gereksinim') renderReq();
  if (t === 'yontem') renderMethodDyn();
  Chart.redrawAll();
  store('tab', t);
  try { if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); } catch (e) { /* çerçeve izin vermeyebilir */ }
}
function onTheme() {
  Chart.redrawAll();
  if (RIG.r3) RIG.r3.theme();
  drawFPA();
  if (STATE.tab === 'butce') renderBudget();
  if (STATE.tab === 'gereksinim') renderReq();
  syncThemeBtn();
}
// ---------------------------------------------------------------- tema: açık iş istasyonu varsayılan; düğme koyu temaya geçirir
const isDark = () => { const a = document.documentElement.getAttribute('data-theme'); if (a) return a === 'dark'; try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } };
function syncThemeBtn() {
  const b = $('#themeBtn'); if (!b) return; const d = isDark();
  b.innerHTML = d ? THEME_ICON.toLight : THEME_ICON.toDark;
  const t = d ? 'Açık temaya geç' : 'Koyu temaya geç'; b.title = t; b.setAttribute('aria-label', t);
}
function initTheme() {
  const t = load('theme', null);
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  else if (!document.documentElement.hasAttribute('data-theme')) document.documentElement.setAttribute('data-theme', 'light');
  $('#themeBtn').addEventListener('click', () => { const v = isDark() ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', v); store('theme', v); syncThemeBtn(); });
  syncThemeBtn();
}
// ---------------------------------------------------------------- yardımcı bileşenler
function scrHead(title, desc, actions) {
  return h('div', { class: 'scr-head' }, h('div', { style: { minWidth: 0 } }, h('h1', null, title), desc ? h('p', null, desc) : null),
    actions && actions.length ? h('div', { class: 'scr-actions' }, actions) : null);
}
// panel içi sekmeler: seçili sekme tarayıcıda hatırlanır; gizli bölmelerdeki grafikler görünür olunca yeniden çizilir
function tabset(id, defs, initial) {
  const cur0 = load('ts.' + id, initial || defs[0][0]), cur = defs.some(d => d[0] === cur0) ? cur0 : defs[0][0];
  const bar = h('div', { class: 'tabbar', role: 'tablist' });
  const panes = defs.map(([k, , node]) => h('div', { class: 'tabpane' + (k === cur ? '' : ' off'), role: 'tabpanel', id: `${id}-${k}`, 'data-k': k }, node));
  const pick = (k, focus) => {
    for (const b of bar.children) { const on = b.getAttribute('data-k') === k; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
    for (const p of panes) p.classList.toggle('off', p.getAttribute('data-k') !== k);
    store('ts.' + id, k); Chart.redrawAll();
  };
  defs.forEach(([k, lab]) => bar.append(h('button', { type: 'button', role: 'tab', 'data-k': k, 'aria-controls': `${id}-${k}`, 'aria-selected': k === cur ? 'true' : 'false', tabIndex: k === cur ? 0 : -1, onclick: () => pick(k) }, lab)));
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ks = defs.map(d => d[0]), i = ks.indexOf((bar.querySelector('[aria-selected="true"]') || {}).getAttribute ? bar.querySelector('[aria-selected="true"]').getAttribute('data-k') : ks[0]);
    pick(ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length], true); e.preventDefault();
  });
  return h('div', { class: 'tabset', id }, bar, panes);
}
// ---------------------------------------------------------------- sekans şeridi, sayaçlar, gezinme rozetleri, durum satırı
const ST_CLS = { 'OK': 'ok', 'AŞIM': 'fail', 'BİLGİ': 'info', 'GEÇERSİZ': 'warn', 'RUN': 'run', 'WAIT': 'wait', 'ERR': 'fail', 'NONE': 'wait' };
function stripCell(id) {
  const st = statusOf(id), m = STAT[st] || STAT.NONE;
  return h('button', { type: 'button', class: 'cell ' + (ST_CLS[st] || 'wait') + (isStale(id) && st !== 'RUN' && st !== 'WAIT' ? ' stale' : ''), id: 'sc-' + id.replace('.', '_'),
    'aria-current': STATE.sel === id ? 'true' : 'false', title: `${id} · ${testName(id)}: ${m[2]}${isStale(id) ? ' (önceki parametrelerle)' : ''}`, 'aria-label': `${id} ${testName(id)}: ${m[2]}`,
    onclick: () => { selectTest(id); if (STATE.tab !== 'kampanya') showTab('kampanya'); } });
}
function renderStrip() {
  const nav = $('#strip'); if (!nav) return; nav.innerHTML = '';
  for (const b of BLOCKS) {
    const ids = TEST_ORDER.filter(id => blockOf(id) === b.id);
    nav.append(h('div', { class: 'grp', title: `${b.id} · ${b.name}` }, h('span', null, b.id), h('div', { class: 'cells' }, ids.map(stripCell))));
  }
}
function updStripCell(id) { const o = $('#sc-' + id.replace('.', '_')); if (o) o.replaceWith(stripCell(id)); }
function renderCounts() {
  const box = $('#abCounts'); if (!box) return; box.innerHTML = '';
  const st = TEST_ORDER.map(statusOf), n = (s) => st.filter(x => x === s).length;
  const c = (cls, icon, k, lab) => h('span', { class: 'cnt ' + cls, title: `${k} ${lab}`, html: icon + `<span>${k}</span>` });
  box.append(c('ok', ICON.ok, n('OK'), 'test OK'));
  if (n('AŞIM')) box.append(c('fail', ICON.fail, n('AŞIM'), 'test aşım'));
  box.append(c('info', ICON.info, n('BİLGİ'), 'test bilgi (kabul ölçütü yok)'));
  if (n('GEÇERSİZ')) box.append(c('warn', ICON.invalid, n('GEÇERSİZ'), 'test geçersiz'));
  if (n('RUN') + n('WAIT')) box.append(c('run', ICON.run, n('RUN') + n('WAIT'), 'test koşuyor ya da sırada'));
}
// varsayılandan farklı parametre sayısı (yaprak düzeyinde)
function countChanged(a, b) {
  if (a === b) return 0;
  if (a && b && typeof a === 'object' && typeof b === 'object') { let n = 0; const ks = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of ks) n += countChanged(a[k], b[k]); return n; }
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
}
function renderNavBadges() {
  const nF = TEST_ORDER.filter(id => statusOf(id) === 'AŞIM').length, nC = countChanged(STATE.P, ENG.defaultParams(platOf(STATE.P)));
  const set = (id, txt, cls, title) => { const b = $('#tab-' + id + ' .badge'); if (!b) return; b.textContent = txt; b.className = 'badge' + (cls ? ' ' + cls : ''); b.title = title || ''; };
  set('kampanya', nF ? String(nF) : '', 'fail', nF ? `${nF} test aşım` : '');
  set('model', nC ? String(nC) : '', 'chg', nC ? `${nC} parametre varsayılandan farklı` : '');
}
function renderStatusBar() {
  const sb = $('#statusbar'); if (!sb) return; sb.innerHTML = '';
  const nSt = TEST_ORDER.filter(isStale).length, opSt = STATE.op && STATE.opKey !== curKey(), k = curKey();
  const anyRun = TEST_ORDER.some(id => STATE.results[id] && STATE.results[id].src === 'run');
  const nC = countChanged(STATE.P, ENG.defaultParams(platOf(STATE.P)));
  const src = nSt || opSt ? h('span', null, h('i', { class: 'dot warn' }), h('b', null, `${nSt} test sonucu${opSt ? ' ve işletme ayrıştırması' : ''}`), ' önceki parametrelerle')
    : h('span', null, h('i', { class: 'dot' }), anyRun ? h('b', null, `Son koşu ${STATE.lastRun || ''}`) : h('b', null, 'Önceden hesaplanmış sonuçlar'), k === DEF_KEY ? ', denizaltı mastı varsayılanı' : (k === SHIP_KEY ? ', gemi direği varsayılanı' : ''));
  sb.append(src, h('span', null, nC ? `${nC} parametre varsayılandan farklı` : 'Parametreler varsayılan'));
  if (PRE.vv && PRE.vv.items) { const it = PRE.vv.items; sb.append(h('span', null, `V&V ${it.filter(x => x.pass).length}/${it.length} geçti`)); }
  if (PRE.seeds) sb.append(h('span', null, `Tohum tekrarı: kampanya ${PRE.seeds.n}${adaptTxt(true) ? ', ' + adaptTxt(true) : ''}`));

}
// sonuçlar, parametreler ya da koşu durumu değişince kabuğun bütün göstergeleri
function renderShell() { renderStrip(); renderCounts(); renderNavBadges(); renderStatusBar(); if (STATE.tab === 'ozet') renderOverviewDeb(); }
const renderShellDeb = debounce(renderShell, 120);

function init() {
  try { document.documentElement.lang = 'tr'; } catch (e) { /* yok */ }
  initTheme();
  const nav = $('#tabs');
  for (const [id, name] of TABS) nav.append(h('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'v-' + id, 'aria-selected': 'false', title: name, onclick: () => showTab(id), html: NAV_ICON[id] + `<span class="lab">${esc(name)}</span><span class="badge"></span>` }));
  nav.append(h('span', { class: 'gap' }), h('div', { class: 'foot' }, h('b', null, 'Fiziksel sayısal ikiz'), h('br'), `Motor ${ENGINE_VER} · arayüz ${UI_VER}`));
  nav.addEventListener('keydown', (e) => {
    const fw = e.key === 'ArrowDown' || e.key === 'ArrowRight', bw = e.key === 'ArrowUp' || e.key === 'ArrowLeft'; if (!fw && !bw) return;
    const i = TABS.findIndex(x => x[0] === STATE.tab), j = (i + (fw ? 1 : TABS.length - 1)) % TABS.length;
    showTab(TABS[j][0]); $('#tab-' + TABS[j][0]).focus(); e.preventDefault();
  });
  $('#runAll').addEventListener('click', () => runTests(TEST_ORDER, { op: true }));
  for (const b of $$('#platSeg button')) b.addEventListener('click', () => { if (!STATE.running) setPlatform(b.getAttribute('data-p')); });
  syncPlatformUI();
  const tot = TEST_ORDER.reduce((s, id) => s + EST[id], 0) + EST.op;
  setProgress(0, `${TEST_ORDER.length} test + işletme · ≈ ${Math.max(1, Math.round(tot / Math.min(NW, 4) / 60))} dk (${NW} çekirdek)`);
  if (!WORKER_URL) setProgress(0, 'Web Worker yok: testler ana iş parçacığında koşar');
  renderShell();
  const h0 = (location.hash || '').slice(1);
  showTab(TABS.some(x => x[0] === h0) ? h0 : load('tab', 'ozet'));
  window.addEventListener('hashchange', () => { const t = (location.hash || '').slice(1); if (TABS.some(x => x[0] === t) && t !== STATE.tab) showTab(t); });
  renderStale();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme); } catch (e) { /* eski tarayıcı */ }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Chart.redrawAll(); drawFPA(); }); } catch (e) { /* yok */ }
}
init();
