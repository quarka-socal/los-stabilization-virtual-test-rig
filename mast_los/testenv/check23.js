// kare hızı 25 fps → dış takip döngüsü kararsız: Gereksinimler kutucuğu, T1.9 + işletme koşusu (takip sonrası yok), bulgu
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.fill('#p-wb\\.channels\\.0\\.fps', '25'); await page.press('#p-wb\\.channels\\.0\\.fps', 'Enter'); await page.waitForTimeout(700);
  await page.click('#tab-gereksinim'); await page.waitForTimeout(800);
  console.log('[25 fps] takip kutucuğu:', await page.evaluate(() => Array.from(document.querySelectorAll('#rqTiles .tile')).find(t => /Takip döngüsü/.test(t.textContent)).innerText.replace(/\n/g, ' ')));
  console.log('[25 fps] kararlılık satırı:', await page.evaluate(() => (Array.from(document.querySelectorAll('#rqTrkKv tr')).find(r => /Kararlılık/.test(r.innerText)) || {}).innerText));
  await page.click('#rqRun');
  await page.waitForFunction(() => /Tamamlandı|hata/.test(document.querySelector('#progTxt').textContent), null, { timeout: 400000 });
  await page.waitForTimeout(800);
  console.log('[koşu] ilerleme:', await page.textContent('#progTxt'));
  console.log('[koşu] kutucuklar:', await page.evaluate(() => Array.from(document.querySelectorAll('#rqTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  console.log('[koşu] özet (ilk satırlar):', await page.evaluate(() => Array.from(document.querySelectorAll('#rqSum tr')).slice(0, 5).map(r => r.innerText.replace(/\t/g, ' : ')).join(' | ')));
  await page.screenshot({ path: path.join(out, '240_req_25fps.png') });
  await page.click('#tab-yontem'); await page.waitForTimeout(800);
  console.log('[bulgu]', await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /kararsız/.test(x.querySelector('.t').textContent)); return f ? f.innerText.replace(/\n/g, ' ').slice(0, 500) : '(yok)'; }));
  await page.click('#tab-kampanya'); await page.waitForTimeout(400); await page.click('#ti-T1_9'); await page.waitForTimeout(500);
  console.log('[T1.9]', (await page.evaluate(() => document.querySelector('#detail .measured').textContent)).slice(0, 300), '· grafik:', await page.evaluate(() => document.querySelectorAll('#detail .plots .chartbox').length));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
