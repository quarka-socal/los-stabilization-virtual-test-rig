// v13.3 kontrolü (§4 VIV kullanıcı kararları): denizaltı mast başı ötelemesi (L, κ), kütle oranı m* (K0 üst, alt dal ve
// zarfta erişim), işletme hız zarfı (VIV yok → B2-01 = 0), deniz–ton strok paylaşımı. Model satırları ve VIV paneli
// (varsayılan, f_n = 8 / 12 Hz, hazır ayarlar), Kampanya T2.1–T2.3 + T4.2 (denizaltı), Düzenek (denizaltı tonu, deniz + VIV;
// gemi deniz + VIV stroku), Yöntem bulgusu ve V&V (W6, V6, V7), Bütçe notu, dış referans izi, koyu tema ve mobil taşma
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
  const vivLines = (re) => page.evaluate((r) => { const b = document.querySelector('#mViv'); return b ? b.innerText.split('\n').filter(l => new RegExp(r).test(l)).join(' | ') : '(panel yok)'; }, re);
  const rows = (re) => page.evaluate((r) => Array.from(document.querySelectorAll('#pg .prow')).filter(x => new RegExp(r).test(x.innerText)).map(x => x.innerText.slice(0, 170)).join(' || '), re);
  const preset = (n) => page.evaluate((nm) => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === nm); if (!b) return false; b.click(); return true; }, n);
  const PRE = 'Mast başı|Kütle oranı|İşletme hız zarfı|Dwell adayları|Hexapod @|kilitlenme yok|Su içinde';
  console.log('[Model satırları, denizaltı VIV v13.3]', T(await rows('Mast başı|κ|Kütle oranı|m\\*|zarf|kn')));
  console.log('[VIV paneli, varsayılan]', T(await vivLines(PRE)));
  await page.evaluate(() => { const b = document.querySelector('#mViv'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '280_model_viv_sub.png') });
  // f_n = 8 Hz: alt dal zarfta erişilmez; f_n = 12 Hz: zarfta kilitlenme yok
  await page.evaluate(() => window.__T.setParam('wb.viv.fn', 8, true)); await page.waitForTimeout(900);
  console.log('[VIV paneli, f_n = 8 Hz]', T(await vivLines('Kütle oranı|Dwell adayları|İşletme hız zarfı')));
  await page.evaluate(() => window.__T.setParam('wb.viv.fn', 12, true)); await page.waitForTimeout(900);
  console.log('[VIV paneli, f_n = 12 Hz]', T(await vivLines('kilitlenme yok|Kütle oranı|İşletme hız zarfı')));
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[Bütçe B2-01, f_n = 12 Hz]', T(await page.evaluate(() => Array.from(document.querySelectorAll('tr')).filter(r => /B2-01/.test(r.innerText)).map(r => r.innerText.slice(0, 200)).join(' || '))));
  console.log('[Bütçe notu, f_n = 12 Hz]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes p, #budNotes li, #budNotes div')).filter(x => /hız zarfında|kilitlenme/.test(x.textContent)).map(x => x.textContent.slice(0, 260)).join(' || ') || '(yok)')));
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await preset('Varsayılan'); await page.waitForTimeout(800);
  console.log('[hazır ayar: Ağır mast]', await preset('Ağır mast (m* = 10)')); await page.waitForTimeout(900);
  console.log('[VIV paneli, m* = 10]', T(await vivLines('Kütle oranı|Dwell adayları')));
  await preset('Varsayılan'); await page.waitForTimeout(800);
  console.log('[hazır ayar: öteleme kapalı]', await preset('Mast başı ötelemesi kapalı (yalnız açısal)')); await page.waitForTimeout(900);
  console.log('[VIV paneli, öteleme kapalı]', T(await vivLines('Mast başı|Su içinde|Hexapod @')));
  await preset('Varsayılan'); await page.waitForTimeout(800);
  // denizaltı: Kampanya T2.1–T2.3, T4.2 (ön hesap)
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  for (const id of ['T2_1', 'T2_2', 'T2_3', 'T4_2']) {
    await page.click('#ti-' + id); await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
    console.log(`[denizaltı ${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 320)));
    console.log(`[denizaltı ${id} v13.3 satırları]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /Uyarımın kaynağı|Eksenler|\(f_n\)|alt dal|ötelemesi|strok|f\*·f_n/.test(e.textContent)).map(e => e.textContent.slice(0, 300)).join(' || '))));
  }
  await page.click('#ti-T2_2'); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '281_kampanya_t22_sub.png') });
  // Düzenek: denizaltı yalnız VIV tonu, deniz + VIV
  await page.click('#tab-duzenek'); await page.waitForTimeout(800);
  for (const k of ['viv', 'seaviv']) {
    await page.selectOption('#pk', k); await page.click('#prun');
    await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
    await page.waitForTimeout(500);
    console.log(`[Düzenek, denizaltı ${k}]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /VIV|Hexapod tepe|ötelemesi|LOS RMS/.test(r.innerText)).map(r => r.innerText).join(' || '))));
    if (k === 'viv') { await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.t = 30; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, '282_rig_viv_sub.png') }); }
  }
  // Yöntem: bulgular ve V&V
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  console.log('[Yöntem bulgusu, hafif mast]', T(await page.evaluate(() => { const f = Array.from(document.querySelectorAll('.finding')).find(x => /hafif mast/.test(x.innerText)); return f ? f.innerText.slice(0, 700) : '(yok)'; })));
  console.log('[Yöntem bulgusu, sürtünme]', T(await page.evaluate(() => { const f = Array.from(document.querySelectorAll('.finding')).find(x => /Sürtünme DRR/.test(x.innerText)); return f ? f.innerText.slice(0, 300) : '(yok)'; })));
  console.log('[V&V W6, V6, V7]', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^(W6|V6|V7)/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0].slice(0, 90) + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
  console.log('[V&V kutucukları]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).slice(0, 4).map(t => t.innerText).join(' || '))));
  // gemi: T2.3 strok notu, Düzenek deniz + VIV ötelemesi (strok içinde)
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1500);
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  await page.click('#ti-T2_3'); await page.waitForTimeout(400);
  console.log('[gemi T2_3]', T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 300)));
  console.log('[gemi T2_3 strok]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /strok|ölçeği/.test(e.textContent)).map(e => e.textContent.slice(0, 300)).join(' || '))));
  await page.click('#tab-duzenek'); await page.waitForTimeout(800);
  await page.selectOption('#pk', 'seaviv'); await page.click('#prun');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
  await page.waitForTimeout(500);
  console.log('[Düzenek, gemi deniz + VIV]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /VIV|Hexapod tepe|ötelemesi/.test(r.innerText)).map(r => r.innerText).join(' || '))));
  // denizaltına dön
  await page.click('#platSeg button[data-p="sub"]'); await page.waitForTimeout(1200);
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[Bütçe notu, denizaltı öteleme]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes p, #budNotes li, #budNotes div')).filter(x => /ötelemesi/.test(x.textContent)).map(x => x.textContent.slice(0, 300)).join(' || ') || '(yok)')));
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
  await dk.screenshot({ path: path.join(out, '285_model_viv_dark.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const tab of ['model', 'kampanya', 'duzenek', 'yontem']) { await mb.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await mb.waitForTimeout(1300);
    console.log(`[mobil ${tab}] taşma:`, await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))); }
  await mb.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await mb.waitForTimeout(1300);
  await mb.evaluate(() => { const b = document.querySelector('#mViv'); if (b) { b.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } }); await mb.waitForTimeout(300);
  console.log('[mobil VIV tablo genişliği / kap]', await mb.evaluate(() => Array.from(document.querySelectorAll('#mViv table')).map(t => ({ w: t.scrollWidth, cw: t.parentNode.clientWidth }))));
  await mb.screenshot({ path: path.join(out, '286_model_viv_mobile.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
