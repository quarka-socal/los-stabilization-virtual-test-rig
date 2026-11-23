const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__T.setParam('dut.geom.a0', 60));
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  console.log(await page.evaluate(() => {
    const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.mag = 1;
    const T3 = window.THREE, r3 = RIG.r3, out = [];
    for (const t of [5, 20, 40, 59]) { RIG.t = t; drawRigFrame();
      const head = new T3.Vector3(1, 0, 0).transformDirection(r3.el.matrixWorld), bq = new T3.Vector3(0, 1, 0).applyQuaternion(r3.beam.quaternion);
      out.push(`t ${t}: kafa ↔ ışın ${(head.angleTo(bq) * 1e6).toFixed(2)} µrad (×1)`); }
    return out.join('\n');
  }));
  await browser.close();
})();
