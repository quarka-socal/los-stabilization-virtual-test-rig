// VIV açık/kapalı: düzenek (yalnız VIV senaryosu, anahtar, spektrum, metrik), Model (anahtar, hazır ayar, not), Bütçe; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1300);
  const pause = async () => { if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp'); await page.waitForTimeout(80); };
  const scrub = async (t) => { await page.evaluate((tt) => { const s = document.querySelector('#scrub'); s.value = tt; s.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(150); };
  const waitRun = (re) => page.waitForFunction((r) => new RegExp(r).test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, re, { timeout: 120000 });
  const vivRow = () => page.evaluate(() => (Array.from(document.querySelectorAll('#pmet tr')).find(r => /VIV \(f_v/.test(r.innerText)) || {}).innerText);
  console.log('başlangıç VIV anahtarı:', await page.evaluate(() => Array.from(document.querySelectorAll('#pviv button')).map(b => b.textContent + '=' + b.getAttribute('aria-pressed')).join(' ')));
  await page.selectOption('#pk', 'viv'); await page.click('#prun'); await waitRun('VIV etkisi açık'); await pause();
  await page.click('.seg button[data-m="near"]'); await scrub(30);
  console.log('[VIV açık] durum:', await page.textContent('#pstat'));
  console.log('[VIV açık] metrik:', await vivRow());
  await (await page.$('#fpa')).screenshot({ path: path.join(out, '90_viv_on_fpa.png') });
  await page.evaluate(() => document.querySelector('#rc3').scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await (await page.$('#rc3')).screenshot({ path: path.join(out, '91_viv_on_psd.png') });
  // düzenekten VIV KAPALI → otomatik yeniden koşu
  await page.evaluate(() => document.querySelector('#pviv').scrollIntoView({ block: 'center' }));
  await page.click('#pviv button[data-v="0"]'); await page.waitForTimeout(400); await waitRun('VIV etkisi kapalı'); await pause(); await scrub(30);
  console.log('[VIV kapalı] durum:', await page.textContent('#pstat'));
  console.log('[VIV kapalı] metrik:', await vivRow());
  await (await page.$('#fpa')).screenshot({ path: path.join(out, '92_viv_off_fpa.png') });
  await page.evaluate(() => document.querySelector('#rc3').scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await (await page.$('#rc3')).screenshot({ path: path.join(out, '93_viv_off_psd.png') });
  // Model sekmesi anahtarı ve not
  await page.click('#tab-model'); await page.waitForTimeout(500);
  console.log('[Model] anahtar:', JSON.stringify(await page.evaluate(() => { const i = document.getElementById('p-wb.viv.on'); return { checked: i.checked, label: i.closest('.prow').querySelector('.lb').innerText.replace(/\n/g, ' | ') }; })));
  console.log('[Model] VIV tablo notu:', await page.evaluate(() => (document.querySelector('#mViv p') || {}).innerText));
  await page.evaluate(() => { const d = document.getElementById('p-wb.viv.on').closest('details'); d.open = true; d.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, '94_model_viv.png') });
  // Bütçe
  await page.click('#tab-butce'); await page.waitForTimeout(500);
  console.log('[Bütçe] B2-01:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budTable tr')).find(r => /B2-01/.test(r.innerText)) || {}).innerText.replace(/\t|\n/g, ' : ')));
  console.log('[Bütçe] not:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budNotes li')).find(l => /VIV/.test(l.textContent)) || {}).textContent));
  console.log('[Bütçe] toplamlar:', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('#budTot tr')).map(r => r.innerText.replace(/\t/g, ' | ')).filter(t => /Wander B2|Wander toplamı/.test(t)))));
  // Model: varsayılana dön, sonra hazır ayar
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await (await page.$('xpath=//button[normalize-space(.)="Varsayılan"]')).click(); await page.waitForTimeout(300);
  console.log('[Model] varsayılan sonrası anahtar:', await page.evaluate(() => document.getElementById('p-wb.viv.on').checked), '| düzenek anahtarı:', await page.evaluate(() => document.querySelector('#pviv button[aria-pressed="true"]').textContent));
  await (await page.$('xpath=//button[normalize-space(.)="Gemi üstü direk (VIV yok)"]')).click(); await page.waitForTimeout(300);
  console.log('[Model] gemi üstü hazır ayarı:', await page.evaluate(() => document.getElementById('p-wb.viv.on').checked), '| düzenek anahtarı:', await page.evaluate(() => document.querySelector('#pviv button[aria-pressed="true"]').textContent));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
