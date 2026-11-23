const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  console.log('options:', await page.evaluate(() => Array.from(document.querySelectorAll('#pk option')).map(o => o.value + '=' + o.textContent).join(' | ')));
  console.log('pstat0:', await page.textContent('#pstat'));
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  console.log('pstat ship:', await page.textContent('#pstat'));
  await page.selectOption('#pk', 'sea'); await page.waitForTimeout(300);
  console.log('prun disabled?', await page.evaluate(() => document.querySelector('#prun').disabled), '| text', await page.textContent('#prun'));
  await page.click('#prun');
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(3000); const st = await page.textContent('#pstat'); const dis = await page.evaluate(() => document.querySelector('#prun').disabled); console.log(i, st, dis); if (!dis && i > 1) break; }
  console.log('metrik:', await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Deniz ötelemesi|LOS RMS/.test(r.innerText)).map(r => r.innerText.replace(/\t|\n/g, ' : ')).join(' || ')));
  await page.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(300);
  console.log('HUD:', await page.evaluate(() => document.querySelector('#hud').innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: path.join(out, '124_ship_rig_sea.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
