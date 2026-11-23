// v13.9 kontrolü (§8 kararları K2(b) ve §9 stabilizasyon döngüsü): Model → döngü kutucukları (dar bant bandında en düşük PM), DRR grafiği
// (dar bant çalışma frekansında), Bütçe varsayımları (rwMetric seçimi); Bütçe sekmesi (B1-05 wander penceresinde, B1-06/B1-09 yalnız drift,
// toplamlar, notlar; τ metriğine dönüş; gemi); Yöntem (v13.9 bulguları, V&V W14); koyu tema, mobil
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
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 170) + ' = ' + ((x.querySelector('input, select') || {}).value || '')).join(' || '), re);
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1200); };
  const budRows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#budTable tr')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 300)).join(' || '), re);
  const budTot = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#budTot tr')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 200)).join(' || '), re);
  const budNotes = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#budNotes li')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.slice(0, 520)).join(' || '), re);
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#mTiles .tile')).filter(t => /döngüsü/i.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    console.log('[Model: DRR serileri]', T(await page.evaluate(() => { const c = document.querySelector('#mDrr'); return c ? Array.from(c.querySelectorAll('.legend span, .leg span, text')).map(e => e.textContent).filter(t => /dar bant|taban/.test(t)).join(' | ') : '(yok)'; })));
    console.log('[Model: bütçe varsayımları]', T(await rows('wander toplamındaki metrik|B1-04 tabanı|Gyro ARW')));
    console.log('[Model: döngü grubu]', T(await rows('kesim frekansı|integratör köşesi|dar bant|Rezonans kazancı|ileri besleme|Bağıl hız|Sıcaklık programlı|türetme')));
    await page.evaluate(() => { const b = document.querySelector('#mTiles'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '340_model_loop_v139.png') });
    await page.evaluate(() => { const b = document.querySelector('#mDrr'); if (b) { b.scrollIntoView({ block: 'center' }); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '341_model_drr_v139.png') });
    await page.evaluate(() => { const b = document.querySelector('#gemiBtn'); }); 
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Gemi direği'); if (b) b.click(); }); await page.waitForTimeout(2500);
    console.log('[Model gemi: DRR serileri]', T(await page.evaluate(() => { const c = document.querySelector('#mDrr'); return c ? Array.from(c.querySelectorAll('.legend span, .leg span, text')).map(e => e.textContent).filter(t => /dar bant/.test(t)).join(' | ') : '(yok)'; })));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Denizaltı mastı'); if (b) b.click(); }); await page.waitForTimeout(2500);
  }
  if (part === 'all' || part === 'budget') {
    await page.click('#tab-butce'); await page.waitForTimeout(900);
    console.log('[Bütçe denizaltı: satırlar]', T(await budRows('^B1-05|^B1-06|^B1-09')));
    console.log('[Bütçe denizaltı: toplamlar]', T(await budTot('Wander toplamı|EIS|Drift')));
    console.log('[Bütçe notları]', T(await budNotes('B1-05|G1 grubu')));
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#budTable tr')).find(x => /^B1-01/.test(x.innerText.trim())); if (r) { r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '342_budget_b1_v139.png') });
    await setP('wb.H.rwMetric', 'tau'); await page.click('#tab-butce'); await page.waitForTimeout(700);
    console.log('[Bütçe, τ metriği: B1-05 ve toplam]', T(await budRows('^B1-05|^B1-06')), '||', T(await budTot('Wander toplamı')));
    await setP('wb.H.rwMetric', 'window');
    await page.click('#tab-model'); await page.waitForTimeout(400);
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Gemi direği'); if (b) b.click(); }); await page.waitForTimeout(2500);
    await page.click('#tab-butce'); await page.waitForTimeout(900);
    console.log('[Bütçe gemi: satırlar]', T(await budRows('^B1-05|^R-01')));
    console.log('[Bütçe gemi: toplamlar]', T(await budTot('Wander toplamı|EIS sonrası')));
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim() === 'Denizaltı mastı'); if (b) b.click(); }); await page.waitForTimeout(2500);
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.8]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /ikinci uygulamayla birebir|üst ucunda faz payı|ideal bilir|%5 doğruluğuna|soğukta yetmez|wander penceresinde \(v13.9\)|B1-04 LOS|R-01 varsayımı/.test(f.innerText)).map(f => f.innerText.slice(0, 900)).join(' || '))));
    console.log('[V&V W1, W14]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*W1(4)?\b/.test(r.innerText)).map(r => r.innerText.slice(0, 500)).join(' || '))));
    console.log('[V&V kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.tile')).filter(t => /TOPLAM|ANALİTİK/.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /ikinci uygulamayla birebir/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '343_yontem_v139.png') });
  }
  if (part === 'all' || part === 'rig') {
    await page.click('#tab-duzenek'); await page.waitForTimeout(1500);
    await page.evaluate(() => { const { RIG } = window.__T; RIG.t = RIG.play ? RIG.play.T * 0.5 : 30; window.__T.drawRigFrame(); }); await page.waitForTimeout(400);
    for (const lab of ['EIS sonrası', 'Ham']) { for (const b of await page.$$('button')) { if ((await b.innerText()).trim() === lab) { await b.click(); break; } } await page.waitForTimeout(400);
      console.log(`[Düzenek ${lab}]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('span.k')).filter(e => /konum|EIS düzeltmesi/.test(e.innerText)).map(e => e.innerText.replace(/\s+/g, ' ')).join(' | '))));
      await (await page.$('#fpa')).screenshot({ path: path.join(out, `333_rig_${lab === 'Ham' ? 'ham' : 'eis'}.png`) }); }
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#butce', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const r = Array.from(document.querySelectorAll('#budTable tr')).find(x => /^B1-01/.test(x.innerText.trim())); if (r) { r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '344_budget_dark_v139.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'butce', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
