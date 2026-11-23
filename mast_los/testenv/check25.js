// Düzenek üst görünümü: gemi varsayılanı (dar + h = 15 m) ve denizaltı 6-DOF SS4 — 3B öteleme, dedektör, satır metni
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1500);
  await page.waitForFunction(() => { const p = window.__T.RIG.play; return p && p.platform === 'ship' && !document.querySelector('#prun').disabled; }, null, { timeout: 300000 });
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.mag = 100; RIG.t = 33; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '250_rig_ship_top.png') });
  console.log('[gemi satırı]', await page.evaluate(() => (Array.from(document.querySelectorAll('#pmet tr')).find(r => /Deniz ötelemesi/.test(r.innerText)) || {}).innerText));
  // denizaltı 6-DOF SS4
  await page.click('#platSeg button[data-p="sub"]'); await page.waitForTimeout(800);
  await page.click('#tab-model'); await page.waitForTimeout(500);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /SS4 6-DOF/.test(x.textContent)); b.click(); }); await page.waitForTimeout(500);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.mag = 100; RIG.t = 33; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '251_rig_sub_6dof_top.png') });
  console.log('[6-DOF satırı]', await page.evaluate(() => (Array.from(document.querySelectorAll('#pmet tr')).find(r => /Deniz ötelemesi/.test(r.innerText)) || {}).innerText));
  console.log('[HUD]', await page.evaluate(() => document.querySelector('#hud').innerText.replace(/\n/g, ' | ')));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
