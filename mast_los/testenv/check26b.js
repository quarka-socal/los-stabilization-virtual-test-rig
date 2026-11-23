// v13.1: kaldıraç kolu tablosunun görünümü (masaüstü gemi r_x = 20 m, koyu tema, mobil denizaltı) — yapışkan başlığın altında
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message)); return page; };
  const toLever = (pg) => pg.evaluate(() => { const t = Array.from(document.querySelectorAll('#mSea6 table')).find(x => /Kol terimleri/.test(x.innerText)); const hd = document.querySelector('header') || document.querySelector('.top');
    const off = (hd ? hd.getBoundingClientRect().height : 140) + 24; window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - off); return { w: t.scrollWidth, cw: t.parentNode.clientWidth }; });
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  await page.click('#tab-model'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /boyuna kolu/.test(x.textContent)); b.click(); }); await page.waitForTimeout(800);
  console.log('[masaüstü tablo genişliği / kap]', await toLever(page)); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '265_model_lever_ship_rx20.png') });
  const dk = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dk.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await dk.waitForTimeout(1500);
  console.log('[koyu tablo genişliği / kap]', await toLever(dk)); await dk.waitForTimeout(300);
  await dk.screenshot({ path: path.join(out, '266_model_lever_dark.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mb.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await mb.waitForTimeout(1300);
  console.log('[mobil tablo genişliği / kap]', await toLever(mb)); await mb.waitForTimeout(300);
  console.log('[mobil taşma]', await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })));
  await mb.screenshot({ path: path.join(out, '267_model_lever_mobile.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
