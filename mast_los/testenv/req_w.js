const { chromium } = require('playwright-core'); const path = require('path');
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  for (const f of ['test.html']) { const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await p.goto('http://127.0.0.1:8765/' + f + '#gereksinim', { waitUntil: 'load' }); await p.waitForTimeout(2000);
    const r = await p.evaluate(() => { const box = document.querySelector('#rqSum'); const tr = Array.from(box.querySelectorAll('tr')).filter(t => /^σ_/.test(t.innerText)); return { sw: box.scrollWidth, cw: box.clientWidth, hs: tr.map(t => Math.round(t.getBoundingClientRect().height)) }; });
    console.log(f, JSON.stringify(r));
    await p.evaluate(() => { const box = document.querySelector('#rqSum'); box.scrollIntoView(); box.scrollLeft = 10000; }); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, 'shots', '412_req_right_v1316.png') }); }
  await b.close(); })();
