// ekranın belirli bir öğesine kaydırılmış görüntü: node ui_scroll.js <ekran> <seçici> <çıktı> [genişlik] [tema]
const { chromium } = require('playwright-core'); const path = require('path');
const [tab, sel, outf, W, theme] = [process.argv[2], process.argv[3], process.argv[4], +(process.argv[5] || 1440), process.argv[6] || 'light'];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: W, height: 900 }, colorScheme: theme })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  if (theme === 'dark') await p.addInitScript(() => { try { localStorage.setItem('mlos2.theme', JSON.stringify('dark')); } catch (e) {} });
  await p.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await p.waitForTimeout(tab === 'duzenek' ? 3500 : 1800);
  await p.evaluate((sel) => { const e = document.querySelector(sel); if (e) e.scrollIntoView({ block: 'start' }); }, sel); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'shots', outf) });
  console.log('hatalar:', errs.join(' | ') || 'yok'); await b.close(); })();
