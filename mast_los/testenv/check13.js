// Düzenek: Ham / EIS sonrası video seçimi — varsayılan deniz, darbe senaryosu, EIS kapalı hazır ayarı, mobil; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opts, hash) => { const ctx = await browser.newContext(opts); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto('http://127.0.0.1:8765/test.html#' + hash, { waitUntil: 'load' }); await page.waitForTimeout(1300); return { ctx, page }; };
  const pause = async (page) => { if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp'); await page.waitForTimeout(80); };
  const scrub = async (page, t) => { await page.evaluate((tt) => { const s = document.querySelector('#scrub'); s.value = tt; s.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(200); };
  const view = async (page, m) => { await page.click(`#feis button[data-e="${m}"]`); await page.waitForTimeout(150); };
  const read = (page) => page.evaluate(() => ({ info: document.querySelector('#feisInfo').textContent, leg: document.querySelector('#fpaLeg').hidden ? '(gizli)' : document.querySelector('#fpaLeg').innerText.replace(/\n/g, ' | '), note: document.querySelector('#fpaNote').textContent.slice(0, 200),
    met: Array.from(document.querySelectorAll('#pmet tr')).map(r => r.innerText.replace(/\t|\n/g, ' : ')).filter(t => /EIS|Wander/.test(t)) }));
  const shot = async (page, file) => { const el = await page.$('#fpa'); await (await el.evaluateHandle(e => e.closest('.panel'))).asElement().screenshot({ path: path.join(out, file) }); };

  let { ctx, page } = await mk({ viewport: { width: 1440, height: 1000 } }, 'duzenek');
  await pause(page); await page.click('.seg button[data-m="near"]'); await scrub(page, 42.78);
  await view(page, 'raw'); console.log('[deniz, ham]', JSON.stringify(await read(page), null, 1)); await shot(page, '60_sea_raw.png');
  await view(page, 'eis'); console.log('[deniz, EIS]', JSON.stringify(await read(page), null, 1)); await shot(page, '61_sea_eis.png');
  // darbe senaryosu
  await page.selectOption('#pk', 'slap'); await page.click('#prun');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await pause(page); await page.click('.seg button[data-m="auto"]'); await scrub(page, 45.04);
  await view(page, 'raw'); console.log('[darbe, ham]', JSON.stringify(await read(page), null, 1)); await shot(page, '62_slap_raw.png');
  await view(page, 'eis'); console.log('[darbe, EIS]', JSON.stringify(await read(page), null, 1)); await shot(page, '63_slap_eis.png');
  // EIS kapalı hazır ayarı
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await (await page.$('xpath=//button[normalize-space(.)="EIS kapalı"]')).click(); await page.waitForTimeout(300);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /özel parametreler/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await pause(page); await scrub(page, 45.04);
  console.log('[darbe, EIS kapalı hazır ayarı, EIS görünümü]', JSON.stringify(await read(page), null, 1)); await shot(page, '64_slap_eisoff.png');
  await ctx.close();
  ({ ctx, page } = await mk({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'duzenek'));
  await pause(page); await page.click('.seg button[data-m="near"]'); await scrub(page, 42.78); await view(page, 'eis');
  await page.evaluate(() => document.querySelector('#fpa').scrollIntoView({ block: 'start' })); await page.waitForTimeout(150);
  console.log('mobil scrollWidth/innerWidth:', JSON.stringify(await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])));
  await shot(page, '65_mobile_eis.png'); await ctx.close();
  ({ ctx, page } = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }, 'duzenek'));
  await pause(page); await page.click('.seg button[data-m="near"]'); await scrub(page, 42.78); await view(page, 'eis'); await shot(page, '66_dark_eis.png'); await ctx.close();
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
