const { chromium } = require('playwright-core'); const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  for (const w of [1680, 1440, 1100, 760, 390]) {
    const page = await browser.newPage({ viewport: { width: w, height: 700 } });
    await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' }); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { brand: q('.brand'), tabs: q('#tabs'), runbox: q('.runbox'), plat: q('.platsel'), sw: document.documentElement.scrollWidth }; });
    console.log(w, JSON.stringify(r));
    await page.screenshot({ path: path.join(__dirname, 'shots', `hdr_${w}.png`), clip: { x: 0, y: 0, width: w, height: 170 } });
    await page.close();
  }
  await browser.close();
})();
