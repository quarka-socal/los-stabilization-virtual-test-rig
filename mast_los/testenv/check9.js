// Kayma okları sürümü sınaması: düzenek dedektör paneli (oklar, lejant, metrik satırları; açık/koyu/mobil),
// Model sekmesinde sabit gyro bias ayarı ve hazır ayarı, Yöntem sekmesinde T0.7 notu; konsol hataları
const { chromium } = require('playwright-core');
const path = require('path');
const out = path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const run = async (opts, name, hash, fn) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(`[${name}] ${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await page.goto('http://127.0.0.1:8765/test.html#' + hash, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await fn(page);
    await ctx.close();
  };
  const scrubTo = async (page, t) => { await page.evaluate((tt) => { const s = document.querySelector('#scrub'); s.value = tt; s.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(250); };
  const pixMode = async (page) => { await page.click('.seg button[data-m="near"]'); await page.waitForTimeout(150); };
  const legend = (page) => page.evaluate(() => { const l = document.querySelector('#fpaLeg'); return l && !l.hidden ? l.innerText.replace(/\n/g, ' | ') : '(gizli)'; });
  const note = (page) => page.evaluate(() => document.querySelector('#fpaNote').textContent);
  const metr = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).map(r => r.innerText.replace(/\t|\n/g, ' : ')).filter(t => /kayma|dünya|gyro|kalan/i.test(t)));
  const fpaShot = async (page, file) => { const el = await page.$('#fpa'); const panel = await el.evaluateHandle(e => e.closest('.panel')); await panel.asElement().screenshot({ path: path.join(out, file) }); };
  const pause = async (page) => { const playing = await page.evaluate(() => /Durdur/.test(document.querySelector('#pp').textContent)); if (playing) await page.click('#pp'); await page.waitForTimeout(100); };

  await run({ viewport: { width: 1440, height: 1000 } }, 'desk', 'duzenek', async (page) => {
    await pause(page); await pixMode(page); await scrubTo(page, 42.78);
    console.log('[sea varsayılan] lejant:', await legend(page));
    console.log('[sea varsayılan] not:', await note(page));
    console.log('[sea varsayılan] metrik:', JSON.stringify(await metr(page)));
    await fpaShot(page, '40_sea_fpa.png');
    // sinüs senaryosu (kullanıcının ekran görüntüsü)
    await page.selectOption('#pk', 'sine'); await page.click('#prun');
    await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
    await page.waitForTimeout(300); await pause(page); await scrubTo(page, 42.78);
    console.log('[sine] not:', await note(page));
    console.log('[sine] lejant:', await legend(page));
    console.log('[sine] metrik:', JSON.stringify(await metr(page)));
    await fpaShot(page, '41_sine_fpa_t43.png');
    await scrubTo(page, 59.9); await fpaShot(page, '42_sine_fpa_end.png');
    await page.click('.seg button[data-m="auto"]'); await page.waitForTimeout(150); await fpaShot(page, '43_sine_fpa_auto.png');
    await page.screenshot({ path: path.join(out, '44_duzenek_full.png') });
    // Model: sabit bias alanı ve hazır ayar
    await page.click('#tab-model'); await page.waitForTimeout(500);
    const f = await page.evaluate(() => { const i = document.getElementById('p-dut.gyro.bias0'); return i ? { v: i.value, lab: i.closest('.prow').innerText.replace(/\n/g, ' | ') } : null; });
    console.log('[model] bias0 alanı:', JSON.stringify(f));
    await page.evaluate(() => { const g = document.getElementById('p-dut.gyro.bias0').closest('details'); g.open = true; g.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, '45_model_gyro.png') });
    const btn = await page.$('xpath=//button[contains(., "Gyro bias\'ı yok")]'); await btn.click(); await page.waitForTimeout(600);
    console.log('[model] hazır ayar sonrası:', JSON.stringify(await page.evaluate(() => ({ bias0: document.getElementById('p-dut.gyro.bias0').value, bi: document.getElementById('p-dut.gyro.bi').value, stale: !document.querySelector('#staleBanner').hidden }))));
    await page.click('#tab-duzenek');
    await page.waitForFunction(() => /özel parametreler/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
    await page.waitForTimeout(300); await pause(page); await scrubTo(page, 42.78);
    console.log('[bias yok] lejant:', await legend(page));
    console.log('[bias yok] metrik:', JSON.stringify(await metr(page)));
    await fpaShot(page, '46_nobias_fpa.png');
    // Yöntem: T0.7 notu
    await page.click('#tab-yontem'); await page.waitForTimeout(600);
    const y = await page.evaluate(() => ({
      seedP: (Array.from(document.querySelectorAll('#v-yontem p')).find(p => /Genişletilmiş tekrar/.test(p.textContent)) || {}).textContent,
      flipP: (Array.from(document.querySelectorAll('#v-yontem p')).find(p => /tekrarda değişen testler/.test(p.textContent)) || {}).textContent,
      find: (Array.from(document.querySelectorAll('#findings .finding')).find(f => /T0\.7'nin kabulü/.test(f.textContent)) || {}).innerText,
      tm: (Array.from(document.querySelectorAll('#v-yontem table.dt tr')).find(r => /^T0\.7/.test(r.innerText.trim())) || {}).innerText,
      asm: (Array.from(document.querySelectorAll('#v-yontem li')).find(l => /bias0/.test(l.textContent)) || {}).textContent }));
    console.log('[yöntem]', JSON.stringify(y, null, 1));
    await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(f => /T0\.7'nin kabulü/.test(f.textContent)); f.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, '47_yontem_t07.png') });
  });
  await run({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }, 'dark', 'duzenek', async (page) => {
    await pause(page); await pixMode(page); await scrubTo(page, 42.78);
    await fpaShot(page, '48_dark_fpa.png');
  });
  await run({ viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'mobile', 'duzenek', async (page) => {
    await pause(page); await pixMode(page); await scrubTo(page, 42.78);
    await page.evaluate(() => document.querySelector('#fpa').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(200);
    console.log('mobil scrollWidth/innerWidth:', JSON.stringify(await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])));
    await fpaShot(page, '49_mobile_fpa.png');
  });
  await browser.close();
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
})();
