// v12 kontrolü: Gereksinimler sekmesi (önceden hesaplanmış T1.9, işletme req, T1.6 PPV), Model parametre grubu ve hazır
// ayarlar, bayatlık uyarısı, Bütçe notu, Kampanya T1.9 ayrıntısı, Yöntem V&V G grubu ve v12 bulguları; koyu tema, mobil
// genişlik (yatay taşma), gemi platformu; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
const T = (s) => (s || '').replace(/\t/g, ' : ').replace(/\n+/g, ' | ');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:8765/test.html#gereksinim', { waitUntil: 'load' }); await page.waitForTimeout(1800);
  console.log('[sekmeler]', await page.evaluate(() => Array.from(document.querySelectorAll('#tabs .tab')).map(b => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join(' ')));
  console.log('[bayat]', T(await page.evaluate(() => document.querySelector('#rqStale').innerText || '(yok)')));
  console.log('[kutucuklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#rqTiles .tile')).map(t => t.innerText).join(' || '))));
  console.log('[özet]', T(await page.evaluate(() => document.querySelector('#rqSum').innerText)));
  await page.screenshot({ path: path.join(out, '200_req_top.png'), fullPage: false });
  await page.evaluate(() => document.querySelector('#rqCum').scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '201_req_charts.png') });
  console.log('[bantlar]', T(await page.evaluate(() => document.querySelector('#rqBands').innerText)).slice(0, 2500));
  console.log('[kaynaklar]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#rqSrc tr')).slice(0, 7).map(r => r.innerText).join('\n'))));
  console.log('[kaynak notu]', T(await page.evaluate(() => (document.querySelector('#rqSrc p') || {}).innerText || '')).slice(0, 300));
  await page.evaluate(() => document.querySelector('#rqBands').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '202_req_bands.png') });
  await page.evaluate(() => document.querySelector('#rqTrk').scrollIntoView({ block: 'start' })); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '203_req_trk.png') });
  console.log('[takip]', T(await page.evaluate(() => document.querySelector('#rqTrkKv').innerText)).slice(0, 1200));
  console.log('[TUR]', T(await page.evaluate(() => document.querySelector('#rqTur').innerText)).slice(0, 1500));
  await page.evaluate(() => document.querySelector('#rqTur').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '204_req_tur_def.png') });
  console.log('[tanımlar]', T(await page.evaluate(() => document.querySelector('#rqDef').innerText)).slice(0, 900));
  // Kampanya T1.9
  await page.click('#tab-kampanya'); await page.waitForTimeout(500);
  console.log('[kampanya] durumlar:', await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.querySelector('.id').textContent + ':' + b.querySelector('.pill span').textContent).join(' ')));
  console.log('[kampanya] kutucuk:', T(await page.evaluate(() => document.querySelector('#campTiles .tile').innerText)));
  await page.click('#ti-T1_9'); await page.waitForTimeout(600);
  console.log('[T1.9]', T(await page.evaluate(() => document.querySelector('#detail .measured').textContent + ' || ' + Array.from(document.querySelectorAll('#detail table.kv tr')).slice(0, 4).map(r => r.innerText).join(' || '))).slice(0, 1800));
  console.log('[T1.9 tohum]', T(await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail div.small')).find(x => /tohumla tekrar/.test(x.innerText)); return d ? d.innerText : '(yok)'; })));
  await page.screenshot({ path: path.join(out, '205_t19_detail.png') });
  await page.click('#ti-T1_6'); await page.waitForTimeout(500);
  console.log('[T1.6 v12]', T(await page.evaluate(() => (Array.from(document.querySelectorAll('#detail table.kv tr')).find(r => /Proje gereksinimi/.test(r.innerText)) || {}).innerText || '(yok)')));
  // Bütçe notu
  await page.click('#tab-butce'); await page.waitForTimeout(700);
  console.log('[bütçe notu]', T(await page.evaluate(() => (document.querySelector('#budReqNote') || {}).innerText || '(yok)')));
  // Model: grup, değişiklik → bayatlık, hazır ayar
  await page.click('#tab-model'); await page.waitForTimeout(800);
  console.log('[model grubu]', T(await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#pg details')).find(x => /Proje LOS kalıntı/.test(x.querySelector('summary').innerText)); return d ? d.querySelector('summary').innerText + ' :: ' + d.querySelectorAll('.prow').length + ' satır' : '(yok)'; })));
  await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#pg details')).find(x => /Proje LOS kalıntı/.test(x.querySelector('summary').innerText)); d.open = true; d.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, '206_model_group.png') });
  await page.fill('#p-ana\\.los\\.trk\\.lat_frames', '1'); await page.press('#p-ana\\.los\\.trk\\.lat_frames', 'Enter'); await page.waitForTimeout(700);
  await page.click('#tab-gereksinim'); await page.waitForTimeout(700);
  console.log('[1 kare gecikme] bayat:', T(await page.evaluate(() => document.querySelector('#rqStale').innerText || '(yok)')));
  console.log('[1 kare gecikme] takip kutucuğu:', T(await page.evaluate(() => Array.from(document.querySelectorAll('#rqTiles .tile')).find(t => /Takip döngüsü/.test(t.textContent)).textContent)));
  await page.click('#tab-model'); await page.waitForTimeout(500);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(800);
  await page.click('#tab-gereksinim'); await page.waitForTimeout(600);
  console.log('[varsayılana dönüş] bayat:', T(await page.evaluate(() => document.querySelector('#rqStale').innerText || '(yok)')));
  // Yöntem
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  console.log('[V&V]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).map(t => t.innerText).join(' || '))));
  console.log('[V&V G]', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^G\d/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0] + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
  console.log('[bulgular v12]', await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding')).filter(f => /v12/.test(f.querySelector('.ref') ? f.querySelector('.ref').textContent : '')).map(f => f.querySelector('.t').textContent).join(' | ')));
  for (const t of ['Dış kamera takip', 'Takip döngüsü videoda', 'Tablodaki PPV', 'Proje PSD', '100 Hz üstü', 'Video kalıntıyı', 'Gereksinimler ölçüm']) console.log('[bulgu] ' + t + ':', T(await page.evaluate((tt) => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => x.querySelector('.t').textContent.startsWith(tt)); return f ? f.querySelector('.w').textContent.slice(0, 900) : '(yok)'; }, t)));
  console.log('[TM T1.9]', T(await page.evaluate(() => (Array.from(document.querySelectorAll('.article table.dt tr')).find(r => /^T1\.9/.test(r.innerText.trim())) || {}).innerText || '(yok)')).slice(0, 600));
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('table.vv tbody tr.band')).find(x => /^G ·/.test(x.innerText)); if (r) r.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '207_vv_g.png') });
  // gemi
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  await page.click('#tab-gereksinim'); await page.waitForTimeout(800);
  console.log('[gemi] bayat:', T(await page.evaluate(() => document.querySelector('#rqStale').innerText || '(yok)')));
  console.log('[gemi] kutucuklar:', T(await page.evaluate(() => Array.from(document.querySelectorAll('#rqTiles .tile')).map(t => t.innerText).join(' || '))));
  console.log('[gemi] özet:', T(await page.evaluate(() => document.querySelector('#rqSum').innerText)).slice(0, 2200));
  await page.screenshot({ path: path.join(out, '208_ship_req.png') });
  // koyu tema ve mobil
  const dk = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dk.goto('http://127.0.0.1:8765/test.html#gereksinim', { waitUntil: 'load' }); await dk.waitForTimeout(1600);
  await dk.screenshot({ path: path.join(out, '209_req_dark.png') });
  await dk.evaluate(() => document.querySelector('#rqCum').scrollIntoView({ block: 'start' })); await dk.waitForTimeout(400);
  await dk.screenshot({ path: path.join(out, '210_req_dark_charts.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mb.goto('http://127.0.0.1:8765/test.html#gereksinim', { waitUntil: 'load' }); await mb.waitForTimeout(1600);
  console.log('[mobil] taşma:', await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, wide: Array.from(document.querySelectorAll('#v-gereksinim *')).filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.tscroll')).slice(0, 6).map(e => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right)) })));
  await mb.screenshot({ path: path.join(out, '211_req_mobile.png') });
  await mb.evaluate(() => document.querySelector('#rqCum').scrollIntoView({ block: 'start' })); await mb.waitForTimeout(400);
  await mb.screenshot({ path: path.join(out, '212_req_mobile_charts.png') });
  await mb.click('#tab-butce').catch(() => {}); await mb.waitForTimeout(600);
  console.log('[mobil bütçe] taşma:', await mb.evaluate(() => document.documentElement.scrollWidth + ' / ' + innerWidth));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
