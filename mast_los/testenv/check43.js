// v13.18 kontrolü (§15 Sınırlar, bilinen sorunlar ve doğrulama günlüğü): Yöntem'in "Varsayımlar ve sınırlar" listesi (yinelenen hexapod
// cümlesi yok, darbe ve geçerleme maddeleri), "Bilinen açık konular", kalibre düzey satırı, V&V tanıtımı; hatalar, koyu tema, mobil
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await page.waitForTimeout(2200);
  const r = await page.evaluate(() => {
    const panel = (t) => Array.from(document.querySelectorAll('.panel')).find(p => (p.querySelector('h3') || {}).textContent === t);
    const lim = panel('Varsayımlar ve sınırlar'), open = panel('Bilinen açık konular'), vv = panel('Doğrulama ve geçerleme (V&V)');
    const li = (p) => p ? Array.from(p.querySelectorAll('ul.notes > li')).map(l => l.innerText.replace(/\s+/g, ' ')) : [];
    const all = document.body.innerText;
    return { nLim: li(lim).length, hexDup: (all.match(/öteleme hız ve ivme sınırları/g) || []).length, gyro: li(lim)[0].slice(0, 260), hex: li(lim)[2].slice(0, 420),
      seeds: li(lim).find(t => /^Rastgele süreçler/.test(t)), val: li(lim).find(t => /^Geçerleme/.test(t)), open: li(open), vvIntro: vv ? vv.querySelector('p').innerText : '—',
      calib: Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText.replace(/\s+/g, ' ')).find(t => /^Kalibre düzey/.test(t)), kil: /kılavuz/i.test(all) };
  });
  console.log(`[sınırlar] ${r.nLim} madde; "öteleme hız ve ivme sınırları" sayfada ${r.hexDup} kez; kılavuz sözcüğü: ${r.kil ? 'VAR' : 'yok'}`);
  console.log('[1. madde]', r.gyro); console.log('[3. madde]', r.hex); console.log('[tohum]', r.seeds); console.log('[geçerleme]', r.val);
  console.log(`[açık konular] ${r.open.length}:`, r.open.map(t => t.slice(0, 90)).join(' || '));
  console.log('[ölçek maddesi]', (r.open.find(t => /Ölçek belirsizliği/.test(t)) || '').slice(0, 300));
  console.log('[kalibre düzey]', r.calib); console.log('[V&V tanıtımı]', r.vvIntro.slice(-330));
  await page.evaluate(() => { const p = Array.from(document.querySelectorAll('.panel h3')).find(h => h.textContent === 'Bilinen açık konular'); if (p) p.scrollIntoView(); }); await page.screenshot({ path: path.join(out, '430_yontem_acik_v1318.png') });
  const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await pd.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await pd.waitForTimeout(2200);
  await pd.evaluate(() => { const p = Array.from(document.querySelectorAll('.panel h3')).find(h => h.textContent === 'Bilinen açık konular'); if (p) p.scrollIntoView(); }); await pd.screenshot({ path: path.join(out, '431_yontem_acik_dark_v1318.png') });
  const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await pm.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await pm.waitForTimeout(1800);
  const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); console.log(`[mobil yöntem] ${ov.sw} / ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
