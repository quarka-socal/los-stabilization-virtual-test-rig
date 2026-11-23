// v13.17 kontrolü (§14 kararları): K1 (c) uyarlamalı tohum (T1.9: 20) — Kampanya, Gereksinimler, Yöntem; K2 (c) işletme "çarpma hariç"
// satırları (denizaltı var, gemi yok), tanım maddesi, Yöntem bulgusu; V&V 74/74 ve G6; hatalar, mobil
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  const go = async (tab) => { await page.goto('about:blank'); await page.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await page.waitForTimeout(2000); };
  const reqRows = () => page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#rqSum table tr')).map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => /çarpma|^σ_vek|^PPV El|^P99/.test(t)),
    note: Array.from(document.querySelectorAll('#rqSum p')).map(p => p.innerText).join(' | '), def: Array.from(document.querySelectorAll('#rqDef li')).map(l => l.innerText).filter(t => /Dalga çarpması/.test(t)).join(' | ') }));
  await go('gereksinim'); let r = await reqRows();
  console.log('[Gereksinimler, denizaltı]', r.rows.join(' || ')); console.log('[tohum notu]', r.note); console.log('[tanım]', r.def || '—');
  await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#rqSum tr')).find(tr => /çarpma hariç/.test(tr.innerText)); if (t) t.scrollIntoView({ block: 'center' }); }); await page.screenshot({ path: path.join(out, '420_req_noslap_v1317.png') });
  await page.click('button:has-text("Gemi direği")'); await page.waitForTimeout(2200); r = await reqRows();
  console.log('[Gereksinimler, gemi]', r.rows.join(' || '), '· tanım:', r.def || 'yok'); await page.click('button:has-text("Denizaltı mastı")'); await page.waitForTimeout(1500);
  await go('kampanya');
  console.log('[V&V kutucuğu]', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\s+/g, ' ')).filter(t => /V&V/.test(t)).join('')));
  await page.evaluate(() => { const b = document.querySelector('#ti-T1_9'); if (b) b.click(); }); await page.waitForTimeout(500);
  console.log('[Kampanya T1.9 tohum satırı]', await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail div.small')).find(x => /tohumla tekrar/.test(x.innerText)); return d ? d.innerText : '—'; }));
  await page.evaluate(() => { const b = document.querySelector('#ti-T1_3'); if (b) b.click(); }); await page.waitForTimeout(400);
  console.log('[Kampanya T1.3 tohum satırı]', await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail div.small')).find(x => /tohumla tekrar/.test(x.innerText)); return d ? d.innerText.slice(0, 160) : '—'; }));
  await go('yontem');
  const y = await page.evaluate(() => ({ p: Array.from(document.querySelectorAll('p')).map(p => p.innerText).filter(t => /^T1.9: |Kararı tekrarlarda|Uyarlamalı tekrar/.test(t)),
    f: Array.from(document.querySelectorAll('#findings .finding')).map(f => f.innerText.replace(/\s+/g, ' ')).filter(t => /tohumdan bağımsız|dalga çarpması geçişleri belirler/.test(t)), n: document.querySelectorAll('#findings .finding').length,
    g6: Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => /^G6/.test(t)).join(''), tot: Array.from(document.querySelectorAll('.tile')).map(t => t.innerText.replace(/\s+/g, ' ')).filter(t => /TOPLAM/.test(t)).join('') }));
  console.log('[Yöntem tohum]', y.p.join(' | ')); console.log('[Yöntem bulgular]', y.f.join(' | '), '· bulgu sayısı', y.n); console.log('[V&V]', y.tot, '·', y.g6.slice(0, 400));
  const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const tab of ['gereksinim', 'yontem', 'kampanya']) { await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
    const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log(`[mobil ${tab}] ${ov.sw} / ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok'); }
  const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await pd.goto('http://127.0.0.1:8765/test.html#gereksinim', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
  await pd.evaluate(() => { const t = Array.from(document.querySelectorAll('#rqSum tr')).find(tr => /çarpma hariç/.test(tr.innerText)); if (t) t.scrollIntoView({ block: 'center' }); }); await pd.screenshot({ path: path.join(out, '421_req_noslap_dark_v1317.png') });
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
