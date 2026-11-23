// İşlevsel sınama: sayfayı yükle, sekmeleri gez, bir testi ve bir oynatmayı koştur, konsol hatalarını topla, ekran görüntüleri al
const { chromium } = require('playwright-core');
const path = require('path');
const out = path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const run = async (opts, name, fn) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await fn(page);
    await ctx.close();
  };
  await run({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }, 'desk', async (page) => {
    await page.screenshot({ path: path.join(out, '1_kampanya.png'), fullPage: false });
    await page.click('#ti-T2_2'); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, '1b_t22.png'), fullPage: true });
    // tek test koştur (hızlı olan)
    await page.click('#ti-T0_4'); await page.waitForTimeout(300);
    await page.click('#runOne');
    await page.waitForFunction(() => !document.querySelector('#runAll').disabled, null, { timeout: 120000 });
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => document.querySelector('#ti-T0_4 .pill').textContent + ' | ' + document.querySelector('#progTxt').textContent);
    console.log('T0.4 after run:', st);
    for (const t of ['duzenek', 'butce', 'model', 'yontem']) {
      await page.click('#tab-' + t); await page.waitForTimeout(t === 'duzenek' ? 1500 : 700);
      if (t === 'duzenek') { await page.click('#pp'); await page.waitForTimeout(1500); await page.click('#pp'); await page.waitForTimeout(200); }
      await page.screenshot({ path: path.join(out, '2_' + t + '.png'), fullPage: t !== 'duzenek' });
    }
    // model: parametre değiştir → bayat uyarısı
    await page.click('#tab-model'); await page.waitForTimeout(300);
    const before = await page.evaluate(() => document.querySelector('#staleBanner').hidden);
    await page.click('text=Dar bant kontrol kapalı'); await page.waitForTimeout(600);
    const after = await page.evaluate(() => [document.querySelector('#staleBanner').hidden, document.querySelector('#staleBanner').textContent.slice(0, 120)]);
    console.log('stale banner before/after:', before, after);
    await page.screenshot({ path: path.join(out, '3_model_changed.png'), fullPage: false });
    // düzenek koşusu (yeni parametrelerle) — worker oynatma
    await page.click('#tab-duzenek'); await page.waitForTimeout(500);
    await page.selectOption('#pk', 'seaviv'); await page.click('#prun');
    await page.waitForFunction(() => /Gösterilen/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
    console.log('play:', await page.evaluate(() => document.querySelector('#pstat').textContent));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, '4_duzenek_run.png'), fullPage: false });
  });
  await run({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }, 'dark', async (page) => {
    await page.screenshot({ path: path.join(out, '5_dark_kampanya.png') });
    await page.click('#tab-duzenek'); await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, '5b_dark_duzenek.png') });
    await page.click('#tab-butce'); await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, '5c_dark_butce.png'), fullPage: true });
  });
  await run({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile', async (page) => {
    await page.screenshot({ path: path.join(out, '6_mobile.png'), fullPage: false });
    const ov = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    console.log('mobile scrollWidth/innerWidth:', ov);
    await page.click('#tab-duzenek'); await page.waitForTimeout(1500);
    const ov2 = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    console.log('mobile duzenek scrollWidth/innerWidth:', ov2);
    await page.screenshot({ path: path.join(out, '6b_mobile_duzenek.png'), fullPage: false });
  });
  await browser.close();
  console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
