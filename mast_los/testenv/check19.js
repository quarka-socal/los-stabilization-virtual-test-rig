// v11 son kontrol: önceden hesaplanmış sonuçlar (T1.5 köşe, T1.3 taban düzeltmesi, T1.8 FOG, T2.5), Bütçe taban tablosu,
// gemi platformu (kaldıraç kolu, B1-08), Düzenek deniz koşusu (q), Yöntem V&V (S, F) ve bulgular; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const det = async (id) => { await page.click('#ti-' + id.replace('.', '_')); await page.waitForTimeout(400); return page.evaluate(() => document.querySelector('#detail .measured').textContent + ' || ' + Array.from(document.querySelectorAll('#detail table.kv tr')).map(r => r.innerText.replace(/\t|\n/g, ' : ')).filter(t => /payı|Taban düzeltmeli|köşe|Roll sınırı|ölçek|menzil|Öteleme|B1-08|Bilgi:/.test(t)).join(' || ')); };
  console.log('[durumlar]', await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.querySelector('.id').textContent + ':' + b.querySelector('.pill span').textContent).join(' ')));
  console.log('[kutucuklar]', await page.evaluate(() => Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  for (const id of ['T1.5', 'T1.3', 'T0.3', 'T1.8']) console.log('[' + id + ']', (await det(id)).slice(0, 900));
  await page.click('#ti-T1_3'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, '120_t13_detail.png') });
  await page.click('#tab-model'); await page.waitForTimeout(800);
  console.log('[Model] taban adımları:', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#mTur table'))[1]; return t ? t.innerText.replace(/\t/g, ' : ').replace(/\n/g, ' || ') : '(yok)'; }));
  await page.evaluate(() => document.querySelector('#mTur h4').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '121_model_floor.png') });
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[Bütçe] taban tablosu:', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#budTot table'))[1]; return t ? t.innerText.replace(/\t/g, ' : ').replace(/\n/g, ' || ') : '(yok)'; }));
  console.log('[Bütçe] R-01:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budTable tr')).find(r => r.innerText.includes('R-01')) || {}).innerText.replace(/\t|\n/g, ' : ')));
  await page.evaluate(() => document.querySelector('#budTot').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '122_budget_floor.png') });
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  console.log('[Yöntem] V&V:', await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  console.log('[Yöntem] S ve F satırları:', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^[SF]\d|^K6|^M7/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0] + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
  for (const t of ['Köşe pikseli', 'Masa titreşiminin', 'Doğrudan stabilizasyonda']) console.log('[bulgu] ' + t + ':', await page.evaluate((tt) => { const f = Array.from(document.querySelectorAll('#findings .finding')).find(x => x.querySelector('.t').textContent.startsWith(tt)); return f ? f.querySelector('.w').textContent.slice(0, 700) : '(yok)'; }, t));
  console.log('[Yöntem] tohum R-01:', await page.evaluate(() => (Array.from(document.querySelectorAll('.article table.dt tr')).find(r => /^R-01/.test(r.innerText.trim())) || {}).innerText.replace(/\t|\n/g, ' : ')));
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('table.vv tbody tr.band')).find(x => /^S ·/.test(x.innerText)); if (r) r.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '123_vv_sf.png') });
  // gemi
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1000);
  await page.click('#tab-kampanya'); await page.waitForTimeout(400);
  console.log('[gemi] durumlar:', await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.querySelector('.id').textContent + ':' + b.querySelector('.pill span').textContent).join(' ')));
  console.log('[gemi T2.5]', (await det('T2.5')).slice(0, 900));
  await page.click('#tab-model'); await page.waitForTimeout(800);
  console.log('[gemi Model] mSea6 kv:', await page.evaluate(() => Array.from(document.querySelectorAll('#mSea6 table.kv tr')).slice(0, 8).map(r => r.innerText.replace(/\t|\n/g, ' : ')).join(' || ')));
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[gemi Bütçe] B1-08:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budTable tr')).find(r => r.innerText.includes('B1-08')) || {}).innerText.replace(/\t|\n/g, ' : ')));
  await page.click('#tab-duzenek'); await page.waitForTimeout(1200);
  const waitRun = (re) => page.waitForFunction((r) => new RegExp(r).test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, re, { timeout: 180000 });
  await page.selectOption('#pk', 'sea'); await page.click('#prun'); await page.waitForTimeout(2500);   // varsayılan: önceden hesaplanmış koşu
  if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp');
  await page.evaluate(() => { const s = document.querySelector('#scrub'); s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); }); await page.waitForTimeout(300);
  console.log('[gemi Düzenek deniz] metrik:', await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Deniz ötelemesi|LOS RMS/.test(r.innerText)).map(r => r.innerText.replace(/\t|\n/g, ' : ')).join(' || ')));
  console.log('[gemi Düzenek deniz] HUD:', await page.evaluate(() => document.querySelector('#hud').innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: path.join(out, '124_ship_rig_sea.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
