// seçili ekranlar: node ui_shots2.js <klasör> <genişlik> <tema> <ekran,ekran> [yükseklik] [ölçek]
const { chromium } = require('playwright-core'); const path = require('path');
const [dir, W, theme, list, H, sc] = [process.argv[2], +process.argv[3], process.argv[4], process.argv[5].split(','), +(process.argv[6] || 900), +(process.argv[7] || 1)];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, colorScheme: theme, deviceScaleFactor: sc }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (theme === 'dark') await p.addInitScript(() => { try { localStorage.setItem('mlos2.theme', JSON.stringify('dark')); } catch (e) {} });
  for (const t of list) {
    await p.goto('about:blank'); await p.goto('http://127.0.0.1:8765/test.html#' + t, { waitUntil: 'load' }); await p.waitForTimeout(t === 'duzenek' ? 3500 : 1800);
    const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (ov.sw > ov.cw + 1) errs.push(`${t}: yatay taşma ${ov.sw}/${ov.cw}`);
    await p.screenshot({ path: path.join(__dirname, 'shots', dir, `${t}_${W}_${theme}.png`) });
  }
  console.log('hatalar:', errs.join(' | ') || 'yok'); await b.close(); })();
