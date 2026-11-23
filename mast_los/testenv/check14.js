// Oto / Piksel (büyüteç) / Tam alan farkı: varsayılan deniz (ham ve EIS), darbe, stab KAPALI; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1300);
  const pause = async () => { if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp'); await page.waitForTimeout(80); };
  const scrub = async (t) => { await page.evaluate((tt) => { const s = document.querySelector('#scrub'); s.value = tt; s.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(150); };
  const mode = async (m) => { await page.click(`.seg button[data-m="${m}"]`); await page.waitForTimeout(120); };
  const view = async (m) => { await page.click(`#feis button[data-e="${m}"]`); await page.waitForTimeout(120); };
  const canvasShot = async (file) => { const el = await page.$('#fpa'); await el.screenshot({ path: path.join(out, file) }); };
  const note = () => page.evaluate(() => document.querySelector('#fpaNote').textContent.replace(/^.*?µrad\)\./, '…').slice(-230));
  await pause();
  for (const [t, tag] of [[2.32, 't2'], [42.78, 't43']]) for (const v of ['raw', 'eis']) for (const m of ['auto', 'near']) {
    await view(v); await mode(m); await scrub(t); await canvasShot(`70_sea_${tag}_${v}_${m}.png`);
  }
  await mode('near'); await view('raw'); await scrub(42.78); console.log('[deniz, Piksel, ham] not:', await note());
  console.log('[deniz, Piksel, ham] lejant:', await page.evaluate(() => document.querySelector('#fpaLeg').innerText.replace(/\n/g, ' | ').slice(-120)));
  // darbe
  await page.selectOption('#pk', 'slap'); await page.click('#prun');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await pause(); await view('raw');
  for (const m of ['auto', 'near']) { await mode(m); await scrub(45.04); await canvasShot(`71_slap_${m}.png`); }
  // stab KAPALI (deniz): büyüteç hedefi izlemeli
  await page.selectOption('#pk', 'sea'); await page.click('#pstab button[data-v="0"]'); await page.click('#prun');
  await page.waitForFunction(() => /stab KAPALI/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 120000 });
  await pause();
  for (const m of ['auto', 'near', 'full']) { await mode(m); await scrub(30); await canvasShot(`72_staboff_${m}.png`); }
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
