// v13.16 kontrolü (§14): T1.9 satır düzeyi tohum duyarlılığı (Kampanya, Gereksinimler, Yöntem), sınıra yakın değerin basamağı,
// σ satırlarında koruma bandı; hatalar, mobil taşma
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  const go = async (tab) => { await page.goto('about:blank'); await page.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await page.waitForTimeout(2000); };
  await go('gereksinim');
  const r = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#rqSum table tr')).map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => /^σ_/.test(t));
    const note = Array.from(document.querySelectorAll('#rqSum p')).map(p => p.innerText).join(' | ');
    return { rows, note };
  });
  console.log('[Gereksinimler σ satırları]', r.rows.join(' || '));
  console.log('[Gereksinimler tohum notu]', r.note);
  await page.evaluate(() => document.querySelector('#rqSum').scrollIntoView()); await page.screenshot({ path: path.join(out, '410_req_v1316.png') });
  await go('kampanya');
  await page.evaluate(() => { const b = document.querySelector('#ti-T1_9'); if (b) b.click(); }); await page.waitForTimeout(500);
  console.log('[Kampanya T1.9 tohum satırı]', await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail div.small')).find(x => /tohumla tekrar/.test(x.innerText)); return d ? d.innerText : '—'; }));
  await go('yontem');
  const y = await page.evaluate(() => ({ p: Array.from(document.querySelectorAll('p')).map(p => p.innerText).filter(t => /^T1.9: |Kararı \d tekrarda/.test(t)),
    f: Array.from(document.querySelectorAll('#findings .finding')).map(f => f.innerText.replace(/\s+/g, ' ')).filter(t => /tohumdan bağımsız/.test(t)), n: document.querySelectorAll('#findings .finding').length }));
  console.log('[Yöntem tohum paragrafları]', y.p.join(' | '));
  console.log('[Yöntem yeni bulgu]', y.f.join(' | ') || '—', '· bulgu sayısı', y.n);
  const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  for (const tab of ['gereksinim', 'yontem', 'kampanya']) { await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
    const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log(`[mobil ${tab}] ${ov.sw} / ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok'); }
  const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await pd.goto('http://127.0.0.1:8765/test.html#gereksinim', { waitUntil: 'load' }); await pd.waitForTimeout(2000); await pd.evaluate(() => document.querySelector('#rqSum').scrollIntoView()); await pd.screenshot({ path: path.join(out, '411_req_dark_v1316.png') });
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
