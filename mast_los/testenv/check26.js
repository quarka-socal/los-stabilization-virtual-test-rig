// v13.1 kontrolü: kaldıraç kolu vektörü — Model satırları (h, r_x, r_y), deniz panelindeki ivme terimleri tablosu ve
// bağımsızlık bilgi notu (denizaltı varsayılanı; gemi r_x = 20 m), Düzenek satır metni, Kampanya T1.3/T2.5 metinleri, Yöntem
// bulguları ve V&V (W10, S2–S4), dış referans izi, koyu tema ve mobil taşma
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
  const val = (id) => page.evaluate((i) => { const e = document.getElementById(i); return e ? e.value : '(yok)'; }, id);
  console.log('[Model kaldıraç kolu girdileri, denizaltı] h', await val('p-wb.sea.h'), '· r_x', await val('p-wb.sea.rx'), '· r_y', await val('p-wb.sea.ry'));
  console.log('[Model satır etiketleri]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pg .prow')).filter(r => /Kaldıraç kolu/.test(r.innerText)).map(r => r.innerText.slice(0, 160)).join(' || '))));
  const leverTab = () => page.evaluate(() => { const t = Array.from(document.querySelectorAll('#mSea6 table')).find(x => /Kaldıraç kolu terimleri/.test(x.innerText)); return t ? t.innerText.replace(/\t/g, ' · ').replace(/\n/g, ' || ') : '(tablo yok)'; });
  const info = () => page.evaluate(() => { const p = Array.from(document.querySelectorAll('#mSea6 p')).find(x => /serbestlik dereceleri bağımsız/.test(x.textContent)); return p ? p.textContent.slice(0, 220) : '(not yok)'; });
  const toLever = (pg) => pg.evaluate(() => { const t = Array.from(document.querySelectorAll('#mSea6 table')).find(x => /Kaldıraç kolu terimleri/.test(x.innerText)); if (t) { t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } });
  console.log('[ivme terimleri, denizaltı]', await leverTab());
  console.log('[bilgi notu]', await info());
  await toLever(page); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '260_model_lever_sub.png') });
  // gemi + r_x = 20 m hazır ayarı
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  await page.click('#tab-model'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /boyuna kolu/.test(x.textContent)); b.click(); }); await page.waitForTimeout(800);
  console.log('[Model kaldıraç kolu girdileri, gemi + hazır ayar] h', await val('p-wb.sea.h'), '· r_x', await val('p-wb.sea.rx'), '· r_y', await val('p-wb.sea.ry'));
  console.log('[ivme terimleri, gemi r_x = 20]', await leverTab());
  console.log('[kv: kol, merkezcil, B1-08, q]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#mSea6 table.kv tr')).filter(r => /Kaldıraç kolu r|merkezcil|B1-08|ölçek q/.test(r.innerText)).map(r => r.innerText.slice(0, 230)).join(' || '))));
  await toLever(page); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '261_model_lever_ship_rx20.png') });
  // Düzenek: gemi + r_x = 20 oynatması
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 300000 });
  await page.waitForTimeout(500);
  console.log('[Düzenek, gemi r_x = 20]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /ötelemesi|LOS RMS|FOV/.test(r.innerText)).map(r => r.innerText).join(' || '))));
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.mag = 100; RIG.t = 33; drawRigFrame(); window.scrollTo(0, 0); }); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, '262_rig_ship_rx20.png') });
  // denizaltı varsayılanına dön
  await page.click('#platSeg button[data-p="sub"]'); await page.waitForTimeout(1200);
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(800);
  // Kampanya: T1.3 ve T2.5 (ön hesap, denizaltı h = 1 m)
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  for (const id of ['T1_3', 'T2_5']) {
    await page.click('#ti-' + id); await page.waitForTimeout(400);
    console.log(`[${id}]`, T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 260)));
    console.log(`[${id} kol satırları]`, T(await page.evaluate(() => Array.from(document.querySelectorAll('#detail tr, #detail li, #detail p')).filter(e => /kaldıraç kolu|Deniz ötelemesi|deniz ivmesi|tam ilişkili/.test(e.textContent)).map(e => e.textContent.slice(0, 260)).join(' || '))));
  }
  // Yöntem: bulgular ve V&V
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
  const ytxt = await page.evaluate(() => document.body.innerText);
  console.log('[Yöntem bulguları]', ['Boyuna kolda küçük açılı ivme ifadesi', 'Serbestlik dereceleri bağımsız: korelasyon', 'Deniz profili (dar kip ve 6-DOF) bağımsız'].map(k => k + ': ' + (ytxt.includes(k) ? 'var' : 'YOK')).join(' · '));
  console.log('[V&V kutucukları]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).slice(0, 4).map(t => t.innerText).join(' || '))));
  console.log('[V&V W10, S]', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^(W10|S\d)/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0].slice(0, 90) + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
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
  await toLever(dk); await dk.waitForTimeout(300);
  await dk.screenshot({ path: path.join(out, '263_model_lever_dark.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const tab of ['model', 'butce', 'yontem', 'duzenek']) { await mb.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await mb.waitForTimeout(1300);
    console.log(`[mobil ${tab}] taşma:`, await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))); }
  await mb.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await mb.waitForTimeout(1300);
  await toLever(mb); await mb.waitForTimeout(300);
  await mb.screenshot({ path: path.join(out, '264_model_lever_mobile.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
