// ---------------------------------------------------------------- Özet: kampanya, gereksinimler, bütçe ve doğrulama tek ekranda (arayüz 14.0)
// Bu ekran hesap yapmaz: sayılar diğer ekranların kullandığı aynı işlevlerden (statusOf, T1.9 kontrolleri, budgetData, PRE.vv) okunur.
function buildOverview(root) {
  root.append(
    h('div', { class: 'scr-head' }, h('div', { style: { minWidth: 0 } }, h('h1', null, 'Özet'), h('p', { id: 'ovDesc' })),
      h('div', { class: 'scr-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => showTab('kampanya') }, 'Test ayrıntıları'),
        h('button', { class: 'btn', type: 'button', onclick: () => showTab('gereksinim') }, 'Gereksinimler'))),
    h('div', { class: 'tiles', id: 'campTiles' }),
    h('div', { class: 'panel' }, h('header', null, h('h2', null, 'Kampanya sekansı'), h('span', { class: 'hint' }, 'Frekans bloklarına göre 28 test; bir teste tıklayınca kanıtları Kampanya ekranında açılır')),
      h('div', { class: 'board', id: 'ovMatrix' })),
    h('div', { class: 'ov-grid' },
      h('div', { class: 'ov-col' },
        h('div', { class: 'panel' }, h('header', null, h('h2', null, 'Proje LOS gereksinimleri'), h('span', { class: 'hint', id: 'ovReqHint' })), h('div', { class: 'body', id: 'ovReq' }))),
      h('div', { class: 'ov-col' },
        h('div', { class: 'panel' }, h('header', null, h('h2', null, 'Jitter bütçesi'), h('span', { class: 'hint' }, 'el ekseni, µrad')), h('div', { class: 'body', id: 'ovBud' })),
        h('div', { class: 'panel' }, h('header', null, h('h2', null, 'Doğrulama')), h('div', { class: 'body', id: 'ovVv' })))));
  renderCampSummary(); renderOverview();
}
function mxCell(id) {
  const st = statusOf(id), m = STAT[st] || STAT.NONE, stale = isStale(id) && st !== 'RUN' && st !== 'WAIT';
  return h('button', { type: 'button', class: 'mx ' + (ST_CLS[st] || 'wait') + (stale ? ' stale' : ''), title: `${id} · ${testName(id)}: ${m[2]}${stale ? ' (önceki parametrelerle)' : ''}`,
    onclick: () => { selectTest(id); showTab('kampanya'); } },
    h('span', { class: 'i' }, id), h('span', { class: 'n' }, testName(id)), h('span', { class: 'ic', html: m[1], 'aria-label': m[2] }));
}
function renderOverview() {
  if (!$('#ovMatrix')) return;
  const pl = platOf(STATE.P);
  $('#ovDesc').textContent = `${PLAT_NAME[pl]}: test kampanyası, proje LOS gereksinimleri, jitter bütçesi ve doğrulamanın durumu`;
  // kampanya matrisi
  const mx = $('#ovMatrix'); mx.innerHTML = '';
  for (const b of BLOCKS) {
    const ids = TEST_ORDER.filter(id => blockOf(id) === b.id), st = ids.map(statusOf), n = (s) => st.filter(x => x === s).length;
    const parts = [`${n('OK')} OK`]; if (n('AŞIM')) parts.push(`${n('AŞIM')} aşım`); if (n('BİLGİ')) parts.push(`${n('BİLGİ')} bilgi`); if (n('GEÇERSİZ')) parts.push(`${n('GEÇERSİZ')} geçersiz`);
    mx.append(h('div', { class: 'col' }, h('div', { class: 'h' }, h('b', null, b.id), h('span', { class: 'nm' }, b.name), h('span', { class: 'ct' }, parts.join(', '))), h('div', { class: 'rows' }, ids.map(mxCell))));
  }
  renderOvReq(); renderOvBudget(); renderOvVv();
}
const renderOverviewDeb = debounce(renderOverview, 150);
// T1.9 karar satırları (laboratuvar kabulü): Gereksinimler ekranındaki uygunluk özetiyle aynı değerler ve basamaklar
function renderOvReq() {
  const box = $('#ovReq'); if (!box) return; box.innerHTML = '';
  const R = STATE.results['T1.9'], n = R && R.res && R.res.num, ch = n && n.checks;
  if (!ch || !ch.length) { box.append(h('p', { class: 'small muted', style: { margin: 0 } }, 'T1.9 henüz koşulmadı ya da gereksinim tablosu kapalı. Gereksinimler ekranından T1.9\'u koşturun.')); $('#ovReqHint').textContent = ''; return; }
  const nOk = ch.filter(c => c.ok).length, dd = (k) => /^pp|^p99/.test(k) ? 1 : 2;
  const val = (v, l, d) => { let s = fmt(v * 1e6, d); if (v !== l && s === fmt(l * 1e6, d)) s = fmt(v * 1e6, d + 2); return s; };
  $('#ovReqHint').textContent = `laboratuvar kabulü (T1.9), karar tabanı ${n.basis === 'once' ? 'takip öncesi' : 'takip sonrası'}`;
  box.append(h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' } }, pill(R.res.status, isStale('T1.9') ? 'stale' : null),
    h('span', { class: 'small' }, h('b', null, `${nOk}/${ch.length}`), ' ölçüt sağlandı'), isStale('T1.9') ? h('span', { class: 'xs', style: { color: 'var(--warn-ink)' } }, 'önceki parametrelerle') : null));
  const list = h('div', { class: 'ov-list', role: 'table', 'aria-label': 'T1.9 karar satırları' });
  for (const c of ch) list.append(h('div', { class: 'ov-row ' + (c.ok ? 'ok' : 'fail'), role: 'row' }, h('span', { role: 'cell' }, c.name), h('span', { class: 'v', role: 'cell' }, val(c.v, c.lim, dd(c.key)) + ' µrad'), h('span', { class: 'l', role: 'cell' }, '≤ ' + fmt(c.lim * 1e6, dd(c.key))),
    h('span', { role: 'cell', html: c.ok ? ICON.ok : ICON.fail, 'aria-label': c.ok ? 'sağlandı' : 'aşım' })));
  box.append(list, h('div', { class: 'linkrow' }, h('button', { class: 'btn sm', type: 'button', onclick: () => showTab('gereksinim') }, 'Uygunluk özeti ve işletme sütunları'), h('button', { class: 'btn sm', type: 'button', onclick: () => { selectTest('T1.9'); showTab('kampanya'); } }, 'T1.9 ayrıntısı')));
}
// bütçe toplamları: Bütçe ekranındaki "Toplamlar ve göstergeler" tablosunun ilk üç göstergesi (aynı ifadeler)
function renderOvBudget() {
  const box = $('#ovBud'); if (!box) return; box.innerHTML = '';
  const D = budgetData(), { d, wbB, measB, op } = D, a = op ? op.all : null;
  const rows = [
    ['Wander toplamı', 'video, 120 s pencere', wbB.wander, measB.wander, a ? a.wanderEl * 1e6 : NaN, d.req.wander * 1e6],
    ['Smear toplamı', 'kare içi', wbB.smear, measB.smear, a ? a.smearEl * 1e6 : NaN, d.req.smear * 1e6],
    ['Tepe / P99', 'k_conf × wander; işletmede gerçek P99', wbB.peak, measB.peak, a ? a.p99El * 1e6 : NaN, d.req.p99 * 1e6],
  ];
  const wrap = h('div', { class: 'bars' });
  for (const [nm, note, an, me, opv, req] of rows) {
    const mx = Math.max(req, an, me, isFinite(opv) ? opv : 0) * 1.08;
    const tr = (cls, lab, v) => h('div', { class: 'tr ' + cls + (isFinite(v) && v > req ? ' over' : '') }, h('span', null, lab),
      h('span', { class: 't' }, h('i', { style: { width: (isFinite(v) ? 100 * v / mx : 0).toFixed(1) + '%' } }),
        h('i', { style: { left: (100 * req / mx).toFixed(1) + '%', width: '2px', background: 'var(--ink)', borderRadius: 0 }, title: `sınır ${fmt(req, 1)} µrad` })),
      h('span', { class: 'x' }, isFinite(v) ? fmt(v, 2) : '—'));
    wrap.append(h('div', { class: 'bar3' }, h('div', { class: 'h' }, h('b', null, nm), h('span', null, `sınır ${fmt(req, 1)} µrad, ${note}`)),
      tr('a', 'Analitik', an), tr('m', BUD.useMeas ? 'Ölçümlerle' : 'Analitik (aynı)', me), tr('o', 'İşletme sim.', opv)));
  }
  box.append(wrap, h('div', { class: 'linkrow' }, h('button', { class: 'btn sm', type: 'button', onclick: () => showTab('butce') }, 'Kalem kalem bütçe')));
}
function renderOvVv() {
  const box = $('#ovVv'); if (!box) return; box.innerHTML = '';
  const it = (PRE.vv && PRE.vv.items) || [];
  if (it.length) {
    const G = {}; for (const x of it) { const g = x.id.replace(/\d+$/, ''); (G[g] = G[g] || { n: 0, p: 0 }); G[g].n++; if (x.pass) G[g].p++; }
    const nP = it.filter(x => x.pass).length;
    box.append(h('p', { class: 'small', style: { margin: '0 0 8px' } }, h('b', null, `${nP}/${it.length}`), ' V&V kontrolü geçti. Gruplar:'),
      h('div', { class: 'vvgrid' }, Object.entries(G).map(([g, z]) => h('div', { class: 'vvg ' + (z.p === z.n ? 'ok' : 'fail'), title: `${g} grubu: ${z.p}/${z.n} geçti` }, h('b', null, `${g} ${z.p}/${z.n}`), h('span', null, VV_GROUP_NAME[g] || '')))));
  }
  const S = PRE.seeds;
  if (S && S.tests) {
    const flip = Object.entries(S.tests).filter(([, t]) => Object.keys(t.status || {}).length > 1).map(([id]) => id);
    box.append(h('p', { class: 'small', style: { margin: '12px 0 0', color: 'var(--ink-2)' } }, `Tohum tekrarı (denizaltı varsayılanı): kampanya ${S.n} gerçekleşme${adaptTxt(true) ? ', ' + adaptTxt(true) : ''}. Kararı tekrarlarda değişen test: ${flip.length ? flip.join(', ') : 'yok'}.`));
  }
  box.append(h('p', { class: 'small', style: { margin: '8px 0 0', color: 'var(--ink-2)' } }, 'V&V doğrulamadır: kod ve yöntemler bilinen sonuçlara karşı sınandı; gerçek düzenek ölçümüyle karşılaştırma (geçerleme) yoktur.'),
    h('div', { class: 'linkrow' }, h('button', { class: 'btn sm', type: 'button', onclick: () => { showTab('yontem'); setTimeout(() => { const e = $('#sec-vv'); if (e) e.scrollIntoView({ block: 'start' }); }, 60); } }, 'V&V tablosu'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => { showTab('yontem'); setTimeout(() => { const e = $('#sec-acik'); if (e) e.scrollIntoView({ block: 'start' }); }, 60); } }, 'Sınırlar ve açık konular')));
}
const VV_GROUP_NAME = { W: 'ikinci uygulama', N: 'sayısal yöntem', M: 'kalibrasyon', K: 'kinematik', V: 'VIV', D: 'döngü', G: 'LOS metrikleri', S: 'deniz hareketi', F: 'FOG', C: 'yakınsama' };
