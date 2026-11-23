// arayüz ekran görüntüleri: node ui_shots.js <klasör> [genişlik] [tema]
const { chromium } = require('playwright-core'); const path = require('path');
const dir = process.argv[2] || 'ui0', W = +(process.argv[3] || 1440), theme = process.argv[4] || 'light';
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: W, height: 900 }, colorScheme: theme })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  for (const t of ['ozet', 'kampanya', 'duzenek', 'butce', 'gereksinim', 'model', 'yontem']) {
    await p.goto('about:blank'); await p.goto('http://127.0.0.1:8765/test.html#' + t, { waitUntil: 'load' }); await p.waitForTimeout(t === 'duzenek' ? 3500 : 1800);
    await p.screenshot({ path: path.join(__dirname, 'shots', dir, `${t}_${W}_${theme}.png`) });
  }
  console.log('hatalar:', errs.join(' | ') || 'yok'); await b.close(); })();
