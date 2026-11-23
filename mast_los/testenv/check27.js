// v13.2 kontrolü (§4 VIV): Model → VIV paneli (denizaltı: gerekli DRR, tahmin, doğrusal DRR, erişim, aday kapsamı, Re, U_r;
// gemi: ε0 satırı), Model satırları (drr_dB, tarama payı, f_n etiketi), Kampanya T2.1–T2.3 (iki platform: yeni kv satırları,
// yol ayrımı), Düzenek VIV oynatması (denizaltı tonu; gemi β = 90° → hexapod tepe satırı pitch), Yöntem bulgusu ve V&V (W6, V6),
// Bütçe notu, dış referans izi, koyu tema ve mobil taşma
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
const T = (s) => (s || '').replace(/\t/g, ' : ').replace(/\n+/g, ' | ');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1800);
  const vivPanel = () => page.evaluate(() => { const b = document.querySelector('#mViv'); return b ? b.innerText : '(panel yok)'; });
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.slice(0, 170)).join(' || '), re);
  console.log('[Model satırları, denizaltı VIV]', T(await rows('f_n|tarama|DRR \\(B2-01|açısal genliği')));
  console.log('[VIV paneli, denizaltı]', T((await vivPanel()).slice(0, 2400)));
  await page.evaluate(() => { const b = document.querySelector('#mViv'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '270_model_viv_sub.png') });
  // denizaltı: Kampanya T2.1–T2.3 (ön hesap)
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  for (const id of ['T2_1', 'T2_2', 'T2_3']) {
    await page.click('#ti-' + id); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
    console.log(`[denizaltı ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 300)));
    console.log(`[denizaltı ${id} yeni satırlar]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /Dar bant kontrol çalışma bandı|Doğrusal model|f_n'yi kapsar|Yalnız VIV tonu|erişim/.test(e.textContent)).map(e => e.textContent.slice(0, 300)).join(' || '))));
  }
  await page.click('#ti-T2_2'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '271_kampanya_t22_sub.png') });
  // Düzenek: denizaltı yalnız VIV tonu
  await page.click('#tab-duzenek'); await page.waitForTimeout(800);
  await page.selectOption('#pk', 'viv'); await page.click('#prun');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
  await page.waitForTimeout(500);
  console.log('[Düzenek, denizaltı VIV tonu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /VIV|Hexapod tepe|LOS RMS/.test(r.innerText)).map(r => r.innerText).join(' || '))));
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.t = 30; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '272_rig_viv_sub.png') });
  // Yöntem: bulgu ve V&V
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  console.log('[Yöntem bulgusu]', T(await page.evaluate(() => { const f = Array.from(document.querySelectorAll('.finding')).find(x => /Sürtünme DRR/.test(x.innerText)); return f ? f.innerText.slice(0, 420) : '(yok)'; })));
  console.log('[V&V W6, V6]', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^(W6|V6)/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0].slice(0, 90) + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
  console.log('[V&V kutucukları]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).slice(0, 4).map(t => t.innerText).join(' || '))));
  // gemi
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1500);
  await page.click('#tab-model'); await page.waitForTimeout(500);
  console.log('[Model satırları, gemi ε0]', T(await rows('ε0')));
  console.log('[VIV paneli, gemi: kilitlenme satırı]', T((await vivPanel()).split('\n').filter(l => /Kilitlenme bandı/.test(l)).join(' | ')));
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  for (const id of ['T2_2', 'T2_3']) {
    await page.click('#ti-' + id); await page.waitForTimeout(400);
    console.log(`[gemi ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 300)));
    console.log(`[gemi ${id} yeni satırlar]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /yol ayrımı|Yol ayrımı|Dar bant kontrol çalışma bandı/.test(e.textContent)).map(e => e.textContent.slice(0, 320)).join(' || '))));
  }
  await page.click('#ti-T2_2'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '273_kampanya_t22_ship.png') });
  // gemi β = 90° Düzenek VIV tonu: hexapod tepe satırı sınıra en yakın ekseni (pitch) göstermeli
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /Yandan rüzgâr/.test(x.textContent)); b.click(); }); await page.waitForTimeout(800);
  await page.click('#tab-duzenek'); await page.waitForTimeout(800);
  await page.selectOption('#pk', 'viv'); await page.click('#prun');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
  await page.waitForTimeout(500);
  console.log('[Düzenek, gemi β = 90° VIV tonu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /VIV|Hexapod tepe|ötelemesi/.test(r.innerText)).map(r => r.innerText).join(' || '))));
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.t = 30; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '274_rig_viv_ship_b90.png') });
  // denizaltına dön, Bütçe: VIV kapalı notu (DRR parametresi)
  await page.click('#platSeg button[data-p="sub"]'); await page.waitForTimeout(1200);
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'VIV kapalı'); b.click(); }); await page.waitForTimeout(800);
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[Bütçe notu, VIV kapalı]', T(await page.evaluate(() => { const n = Array.from(document.querySelectorAll('#budNotes p, #budNotes li, #budNotes div')).find(x => /Hidrodinamik VIV kapalı/.test(x.textContent)); return n ? n.textContent.slice(0, 260) : '(yok)'; })));
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(800);
  // dış referans izi (bütün sekmeler + test ayrıntıları)
  const RX = /Girdiler|Jitter_Butcesi|Test_Matrisi|çalışma kitab|Çalışma kitab|kılavuz §|Kılavuz §|kılavuz 7|VIV_Hesap|Hexapod_Erisim|PSD_Agirlik|Olcum_Belirsizligi|Dunya_Donusu|Kaynak_Izlenebilirlik|v1\.2/;
  const hits = [];
  for (const tab of ['model', 'butce', 'kampanya', 'gereksinim', 'yontem', 'duzenek']) {
    await page.click('#tab-' + tab); await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    for (const line of (await page.evaluate(() => document.body.innerText)).split('\n')) if (RX.test(line)) hits.push(tab + ': ' + line.slice(0, 160));
  }
  await page.click('#tab-kampanya'); await page.waitForTimeout(300);
  for (const id of await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.id))) {
    await page.click('#' + id); await page.waitForTimeout(100); await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
    for (const line of (await page.evaluate(() => document.querySelector('#detail').innerText)).split('\n')) if (RX.test(line)) hits.push(id + ': ' + line.slice(0, 160));
  }
  console.log('[dış referans izi]', hits.length ? hits.slice(0, 20) : 'yok');
  // koyu tema ve mobil
  const dk = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dk.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await dk.waitForTimeout(1500);
  await dk.evaluate(() => { const b = document.querySelector('#mViv'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await dk.waitForTimeout(300);
  await dk.screenshot({ path: path.join(out, '275_model_viv_dark.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const tab of ['model', 'kampanya', 'duzenek']) { await mb.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await mb.waitForTimeout(1300);
    console.log(`[mobil ${tab}] taşma:`, await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))); }
  await mb.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await mb.waitForTimeout(1300);
  await mb.evaluate(() => { const b = document.querySelector('#mViv'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await mb.waitForTimeout(300);
  console.log('[mobil VIV tablo genişliği / kap]', await mb.evaluate(() => { const t = document.querySelector('#mViv table.dt'); return t ? { w: t.scrollWidth, cw: t.parentNode.clientWidth } : null; }));
  await mb.screenshot({ path: path.join(out, '276_model_viv_mobile.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
