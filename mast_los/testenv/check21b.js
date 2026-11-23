// Mekanik zincir (taban açıları + kodlayıcı açıları, three.js) ↔ kaydedilen optik LOS: kafa yönü ile LOS yönü arasındaki açı
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8765/test.html#duzenek', { waitUntil: 'load' }); await page.waitForTimeout(2000);
  const meas = () => page.evaluate(() => {
    const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay();
    const p = RIG.play, T3 = window.THREE, r3 = RIG.r3, out = [];
    for (const t of [0.5, 5, 10, 20, 30, 40, 50, 59]) {
      RIG.t = t; drawRigFrame(); const i = Math.min(p.n - 1, Math.round(t * p.fs));
      const head = new T3.Vector3(1, 0, 0).transformDirection(r3.el.matrixWorld).applyQuaternion(r3.colG.quaternion.clone().invert());   // kolimatör çerçevesinde
      // kafa yönünün kolimatör eksenine göre el / xel'i (rad): el = asin(y), xel = atan2(−x, −z)
      const elH = Math.asin(head.y), xelH = Math.atan2(-head.x, -head.z);
      out.push(`t ${t}: kafa el/xel ${(elH * 1e6).toFixed(0)}/${(xelH * 1e6).toFixed(0)} µrad · opt ${(p.opt_el[i] * 1e6).toFixed(0)}/${(p.opt_xel[i] * 1e6).toFixed(0)} · taban r/p/y ${(p.base_r[i] * 57.3).toFixed(2)}/${(p.base_p[i] * 57.3).toFixed(2)}/${(p.base_y[i] * 57.3).toFixed(2)}° · enc a/e ${(p.enc_a[i] * 57.3).toFixed(3)}/${(p.enc_e[i] * 57.3).toFixed(3)}°`);
    }
    return out.join('\n');
  });
  console.log('[varsayılan dar, a0 = 90°]\n' + await meas());
  await browser.close();
})();
