// v13.10 kontrolü (§9 kararları K1(b), K2(b) ve §10 mekanik ve sürtünme): Model → kestirim hatası ve gözlemci oranları satırları, b / k / F_c /
// vuruntu / κ etiketleri, kestirim hatasıyla DRR grafiğinin etiketi; Bütçe (kalibrasyon notu); Yöntem (v13.10 bulguları, ön hesap taramalarıyla
// v13.9 bulguları, V&V D6 ve W14, toplam); koyu tema, mobil
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
const T = (s) => (s || '').replace(/\t/g, ' : ').replace(/\n+/g, ' | ');
const part = process.argv[2] || 'all';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1800);
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 190) + ' = ' + ((x.querySelector('input, select') || {}).value || '')).join(' || '), re);
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1200); };
  const budNotes = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#budNotes li')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.slice(0, 700)).join(' || '), re);
  const budRows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#budTable tr')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 300)).join(' || '), re);
  const drrLeg = () => page.evaluate(() => { const c = document.querySelector('#mDrr'); return c ? Array.from(c.querySelectorAll('.legend span, .leg span, text')).map(e => e.textContent).filter(t => /dar bant|taban/i.test(t)).join(' | ') : '(yok)'; });
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: §9 kararları satırları]', T(await rows('kestirim hatası|Gözlemcinin')));
    console.log('[Model: mekanik etiketleri]', T(await rows('viskoz kuplaj|yay kuplajı|Coulomb|kıl rijitliği|vuruntu|Direk tepesi|ataleti|kütlesi')));
    console.log('[Model: kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#mTiles .tile')).filter(t => /döngüsü/i.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    console.log('[Model: DRR serileri, kestirim 0]', T(await drrLeg()));
    await setP('dut.ctl.res.estErr', 0.1);
    console.log('[Model: DRR serileri, kestirim +%10]', T(await drrLeg()));
    await page.evaluate(() => { const b = document.querySelector('#mDrr'); if (b) b.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '350_model_drr_esterr_v1310.png') });
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem, kestirim +%10: dar bant bulgusu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /hatayla kestiriyor|ideal bilir/.test(f.innerText)).map(f => f.innerText.slice(0, 700)).join(' || '))));
    await page.click('#tab-model'); await page.waitForTimeout(400);
    await setP('dut.ctl.res.estErr', 0);
    await setP('dut.ctl.ff.obs.s0', 2);
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem, gözlemci σ0 × 2: FF bulgusu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /%5 doğruluğuna/.test(f.innerText)).map(f => f.innerText.slice(0, 420)).join(' || '))));
    await page.click('#tab-model'); await page.waitForTimeout(400);
    await setP('dut.ctl.ff.obs.s0', 1);
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#pg .prow')).find(x => /viskoz kuplaj/.test(x.textContent)); if (r) { r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '351_model_mech_v1310.png') });
  }
  if (part === 'all' || part === 'budget') {
    await page.click('#tab-butce'); await page.waitForTimeout(900);
    console.log('[Bütçe: tork yolu satırları]', T(await budRows('^B1-07|^B2-03|^B2-04|^B2-06')));
    console.log('[Bütçe: kalibrasyon notu]', T(await budNotes('kalibre|taban döngü')));
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#budNotes li')).find(x => /taban döngü/.test(x.innerText)); if (r) { r.scrollIntoView({ block: 'center' }); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '352_budget_calib_v1310.png') });
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.10]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /Kuplajın rolleri|ataletle ters orantılı|Ön-kayma rijitliği|Direk tepesi açısal|ideal bilir|%5 doğruluğuna|soğukta yetmez/.test(f.innerText)).map(f => f.innerText.slice(0, 1400)).join(' || '))));
    console.log('[V&V D6, W14]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*(D6|W14)\b/.test(r.innerText)).map(r => r.innerText.slice(0, 500)).join(' || '))));
    console.log('[V&V kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.tile')).filter(t => /TOPLAM|ANALİTİK|ZAMAN/i.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /Kuplajın rolleri/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '353_yontem_v1310.png') });
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /Ön-kayma rijitliği/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '354_yontem_dark_v1310.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'butce', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      if (tab === 'model') await pm.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
