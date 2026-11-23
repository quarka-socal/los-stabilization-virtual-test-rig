// v13.12 kontrolü (§12 işletme ortamı ve proje gereksinimleri): Model → ortam ve gereksinim satırları, Kampanya sonuçlarında
// T1.9 (PPV/σ satırında aynı tayfın Gauss beklentisi), T1.7 (gereksinimsiz not), T2.4 (oturmayan darbe metni), Yöntem (v13.12 bulguları;
// dalga çarpması genliği değişince canlı Campbell metni), V&V (G5, toplam); koyu tema, mobil
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
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.textContent)).map(x => x.textContent.replace(/\s+/g, ' ').slice(0, 150) + ' = ' + ((x.querySelector('input, select') || {}).value || '')).join(' || '), re);
  const setP = async (k, v) => { await page.evaluate(([a, b]) => window.__T.setParam(a, b, true), [k, v]); await page.waitForTimeout(1200); };
  const finds = (re, n) => page.evaluate(([r, n]) => Array.from(document.querySelectorAll('#findings .finding')).filter(f => new RegExp(r).test(f.innerText)).map(f => f.innerText.slice(0, n)).join(' || '), [re, n || 1600]);
  const RE = 'taban döngüye kalibre|darbe × sürtünme|PPV sınırı, Gauss|P99,73 ve σ_vek|İki ayrı pencere|T1.7 gereksinim';
  if (part === 'all' || part === 'model') {
    await page.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
    console.log('[Model: ortam ve gereksinim satırları]', T(await rows('Dalga çarpması|Yanal ivme|Platform titreşimi|Yardımcı makine|Geniş bant 60|İzleme hatası|Dönüş sonrası|Darbe tepe|Darbe oturma|Boresight kayması|Wander penceresi|RMS / PPV penceresi|Kayıt PPV')));
    const R = await page.evaluate(() => { const S = window.__T.STATE.results; const g = (id, re) => { const r = S[id] && S[id].res; const k = r && r.kv ? r.kv.filter(q => new RegExp(re).test(q[0])).map(q => q.join(': ')) : []; return k.length ? k.join(' ¦ ') : '—'; };
      const st = (id) => S[id] ? S[id].res.status + ' ' + (S[id].res.measured || '').slice(0, 240) : '—';
      const nt = (id, re) => S[id] && S[id].res.notes ? S[id].res.notes.filter(q => new RegExp(re).test(q)).join(' ¦ ') : '—';
      return [st('T1.9'), g('T1.9', 'PPV El / Az'), st('T1.7'), nt('T1.7', 'Hata eşiği'), st('T2.4')].join(' || '); });
    console.log('[Kampanya sonuçları: T1.9, T1.7, T2.4]', T(R));
    await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#pg .prow')).find(x => /Darbe oturma süresi/.test(x.textContent)); if (r) { r.scrollIntoView({ block: 'center' }); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '370_model_req_v1312.png') });
    await setP('env.slap.A', 2101);
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem, çarpma genliği 2101 µrad: kalibrasyon bulgusu]', T(await finds('taban döngüye kalibre', 1400)));
    await page.click('#tab-model'); await page.waitForTimeout(400); await setP('env.slap.A', 2458);
  }
  if (part === 'all' || part === 'run') {      // v13.12: tarayıcıda tek test koşusu T0.1 bağlamını (ölçek belirsizliği, piksel fazı) ve T0.2 tabanını taşır
    const kv = (id, re) => page.evaluate(([i, r]) => { const S = window.__T.STATE.results[i]; return S ? S.src + ' ' + S.res.status + ' | ' + S.res.kv.filter(q => new RegExp(r).test(q[0])).map(q => q[1].slice(0, 160)).join(' ¦ ') : '—'; }, [id, re]);
    console.log('[önhesap T1.9]', T(await kv('T1.9', 'Piksel fazı|Karar belirsizliği')));
    let t0 = Date.now(); await page.evaluate(() => window.__T.runTests(['T1.9'])); console.log(`[tarayıcı T1.9 tek başına, ${((Date.now() - t0) / 1000).toFixed(0)} s]`, T(await kv('T1.9', 'Piksel fazı|Karar belirsizliği')));
    console.log('[önhesap T3.3]', T(await kv('T3.3', 'Ölçüme dayalı')));
    t0 = Date.now(); await page.evaluate(() => window.__T.runTests(['T3.3'])); console.log(`[tarayıcı T3.3 tek başına, ${((Date.now() - t0) / 1000).toFixed(0)} s]`, T(await kv('T3.3', 'Ölçüme dayalı')));
    await setP('ana.seeds', 4);
    t0 = Date.now(); await page.evaluate(() => window.__T.runTests(['T3.3'])); console.log(`[parametre değişti, T3.3 tek başına (T0.1 önce), ${((Date.now() - t0) / 1000).toFixed(0)} s]`, T(await kv('T3.3', 'Ölçüme dayalı')));
    t0 = Date.now(); await page.evaluate(() => window.__T.runTests(['T0.2', 'T3.3', 'T1.9'])); console.log(`[parametre değişti, T0.2 + T3.3 + T1.9, ${((Date.now() - t0) / 1000).toFixed(0)} s]`, T(await kv('T3.3', 'Ölçüme dayalı')), '||', T(await kv('T1.9', 'Piksel fazı')));
    await setP('ana.seeds', 3);
  }
  if (part === 'all' || part === 'yontem') {
    await page.click('#tab-yontem'); await page.waitForTimeout(900);
    console.log('[Yöntem bulguları v13.12]', T(await finds(RE)));
    console.log('[V&V G5]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /^\s*G5\b/.test(r.innerText)).map(r => r.innerText.slice(0, 700)).join(' || '))));
    console.log('[V&V kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.tile')).filter(t => /TOPLAM|ANALİTİK/i.test(t.innerText)).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))));
    await page.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /taban döngüye kalibre/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, '371_yontem_v1312.png') });
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await pd.goto('http://127.0.0.1:8765/test.html#yontem', { waitUntil: 'load' }); await pd.waitForTimeout(2000);
    await pd.evaluate(() => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => /PPV sınırı, Gauss/.test(x.innerText)); if (f) { f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await pd.waitForTimeout(300);
    await pd.screenshot({ path: path.join(out, '372_yontem_dark_v1312.png') });
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['model', 'kampanya', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      if (tab === 'model') await pm.evaluate(() => document.querySelectorAll('#pg details').forEach(d => { d.open = true; }));
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
