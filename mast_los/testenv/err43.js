const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' }); const p = await (await b.newContext()).newPage(); const e = [];
  p.on('pageerror', x => e.push(x.message)); p.on('console', m => { if (m.type() === 'error') e.push(m.text()); });
  await p.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await p.waitForTimeout(2000);
  console.log(await p.evaluate(() => Array.from(document.querySelectorAll('.panel h3')).map(h => h.textContent).join(' | ')));
  console.log(await p.evaluate(() => { const h = Array.from(document.querySelectorAll('h3')).find(x => x.textContent === 'Varsayımlar ve sınırlar'); return h ? h.closest('.panel').querySelectorAll('li').length + ' li; parent ' + h.parentElement.className : 'yok'; }));
  console.log('hatalar', e.join(' || ') || 'yok'); await b.close(); })();
