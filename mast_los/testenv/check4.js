// Kullanıcı senaryosu: Model → dünya dönüşü kompanzasyonu kapat → hata var mı; Düzenek'te etki görünüyor mu
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  // Dünya dönüşü grubunu aç ve kompanzasyonu kapat
  await page.evaluate(() => { for (const d of document.querySelectorAll('details.pgroup')) if (d.textContent.includes('Dünya dönüşü')) d.open = true; });
  await page.click('[id="p-wb.earth.comp"]');
  await page.waitForTimeout(800);
  console.log('after toggle errors:', errs.length ? errs : 'none');
  console.log('banner:', await page.evaluate(() => document.querySelector('#staleBanner').hidden ? 'hidden' : document.querySelector('#staleBanner').textContent.slice(0, 100)));
  await page.click('#tab-duzenek'); await page.waitForTimeout(1200);
  console.log('pstat before run:', await page.evaluate(() => document.querySelector('#pstat').textContent));
  await page.click('#prun');
  await page.waitForFunction(() => !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  console.log('pstat after run:', await page.evaluate(() => document.querySelector('#pstat').textContent));
  console.log('metrics:', await page.evaluate(() => document.querySelector('#pmet').innerText.replace(/\n/g, ' | ').slice(0, 400)));
  await page.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 50; s.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: __dirname + '/shots/9_comp_off.png' });
  // tek test: T1.1 ve T1.3
  await page.click('#tab-kampanya'); await page.waitForTimeout(300);
  for (const id of ['T0_2', 'T1_2']) {
    await page.click('#ti-' + id); await page.waitForTimeout(200); await page.click('#runOne');
    await page.waitForFunction(() => !document.querySelector('#runAll').disabled, null, { timeout: 300000 });
    await page.waitForTimeout(300);
    console.log(id, await page.evaluate(() => (document.querySelector('.banner:not(#staleBanner)') || {}).textContent || document.querySelector('.measured') && document.querySelector('.measured').textContent));
  }
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
