// ---------------------------------------------------------------- sekmeler ve başlatma
const TABS = [['kampanya', 'Kampanya'], ['duzenek', 'Düzenek'], ['butce', 'Bütçe'], ['gereksinim', 'Gereksinimler'], ['model', 'Model'], ['yontem', 'Yöntem']];
const BUILT = {};
const BUILDERS = { kampanya: buildCampaign, duzenek: buildRig, butce: buildBudget, gereksinim: buildReq, model: buildModel, yontem: buildMethod };
function showTab(t) {
  if (!TABS.some(x => x[0] === t)) t = 'kampanya';
  STATE.tab = t;
  for (const [id] of TABS) { $('#v-' + id).hidden = id !== t; const b = $('#tab-' + id); b.setAttribute('aria-selected', id === t ? 'true' : 'false'); b.tabIndex = id === t ? 0 : -1; }
  if (!BUILT[t]) { BUILDERS[t]($('#v-' + t)); BUILT[t] = true; }
  if (t === 'duzenek' && RIG.r3) { RIG.r3.resize(); drawRigFrame(); }
  if (t === 'duzenek' && (RIG.needsRun || (RIG.play && RIG.playKey !== curKey()))) runPlay(true);
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
}
function init() {
  try { document.documentElement.lang = 'tr'; } catch (e) { /* yok */ }
  const nav = $('#tabs');
  for (const [id, name] of TABS) nav.append(h('button', { class: 'tab', role: 'tab', id: 'tab-' + id, 'aria-controls': 'v-' + id, 'aria-selected': 'false', onclick: () => showTab(id) }, name));
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex(x => x[0] === STATE.tab), j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    showTab(TABS[j][0]); $('#tab-' + TABS[j][0]).focus();
  });
  $('#runAll').addEventListener('click', () => runTests(TEST_ORDER, { op: true }));
  for (const b of $$('#platSeg button')) b.addEventListener('click', () => { if (!STATE.running) setPlatform(b.getAttribute('data-p')); });
  syncPlatformUI();
  const tot = TEST_ORDER.reduce((s, id) => s + EST[id], 0) + EST.op;
  setProgress(0, `${TEST_ORDER.length} test + işletme · ≈ ${Math.max(1, Math.round(tot / Math.min(NW, 4) / 60))} dk (${NW} çekirdek)`);
  if (!WORKER_URL) setProgress(0, 'Web Worker yok: testler ana iş parçacığında koşar');
  const h0 = (location.hash || '').slice(1);
  showTab(TABS.some(x => x[0] === h0) ? h0 : load('tab', 'kampanya'));
  renderStale();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme); } catch (e) { /* eski tarayıcı */ }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
}
init();
