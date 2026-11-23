// İki platform: başlık seçicisi, önceden hesaplanmış gemi sonuçları, Model (rüzgâr VIV grubu ve paneli), Bütçe, Düzenek
// (rüzgâr VIV senaryosu: metrik, öteleme, spektrum), Yöntem (bulgular, V&V); geri dönüş; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#kampanya', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const seg = () => page.evaluate(() => Array.from(document.querySelectorAll('#platSeg button')).map(b => b.textContent + '=' + b.getAttribute('aria-pressed')).join(' '));
  const t22 = () => page.evaluate(() => { const b = document.querySelector('#ti-T2_2'); return b ? b.innerText.replace(/\n/g, ' | ') : null; });
  console.log('[başlangıç] seçici:', await seg(), '| T2.2:', await t22());
  console.log('[başlangıç] kutucuk:', await page.evaluate(() => document.querySelector('#campTiles .tile .d').textContent));
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(900);
  console.log('[gemi] seçici:', await seg(), '| T2.2:', await t22());
  console.log('[gemi] kutucuk:', await page.evaluate(() => document.querySelector('#campTiles .tile .d').textContent));
  console.log('[gemi] durumlar:', await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.querySelector('.id').textContent + ':' + b.querySelector('.pill span').textContent).join(' ')));
  console.log('[gemi] bayat afişi gizli mi:', await page.evaluate(() => document.querySelector('#staleBanner').hidden));
  await page.click('#ti-T2_2'); await page.waitForTimeout(500);
  console.log('[gemi] T2.2 ölçülen:', await page.evaluate(() => document.querySelector('#detail .measured').textContent));
  await page.screenshot({ path: path.join(out, '100_ship_campaign.png') });
  // Model
  await page.click('#tab-model'); await page.waitForTimeout(700);
  console.log('[Model] deniz:', await page.evaluate(() => ['roll_A', 'roll_T', 'pitch_A', 'pitch_T'].map(k => k + '=' + document.getElementById('p-wb.sea.' + k).value).join(' ')));
  console.log('[Model] grup başlıkları:', await page.evaluate(() => Array.from(document.querySelectorAll('.pgroup')).map(d => (d.open ? '▾' : '▸') + d.querySelector('h3').textContent + ' (' + d.querySelector('.src').textContent + ')').join(' · ')));
  console.log('[Model] VIV paneli:', await page.evaluate(() => document.querySelector('#mVivTtl').textContent + ' :: ' + Array.from(document.querySelectorAll('#mViv table.kv tr')).slice(0, 8).map(r => r.innerText.replace(/\t|\n/g, ' : ')).join(' || ')));
  console.log('[Model] hazır ayarlar:', await page.evaluate(() => Array.from(document.querySelectorAll('#presetRow button')).map(b => b.textContent).join(' | ')));
  await page.evaluate(() => document.querySelector('#mViv').scrollIntoView({ block: 'start' })); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, '101_ship_model_viv.png') });
  await page.evaluate(() => { const d = document.getElementById('p-wb.wviv.D').closest('details'); d.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, '102_ship_model_params.png') });
  // Bütçe
  await page.click('#tab-butce'); await page.waitForTimeout(700);
  console.log('[Bütçe] B2-01:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budTable tr')).find(r => /B2-01/.test(r.innerText)) || {}).innerText.replace(/\t|\n/g, ' : ')));
  console.log('[Bütçe] B2-02:', await page.evaluate(() => (Array.from(document.querySelectorAll('#budTable tr')).find(r => /B2-02/.test(r.innerText)) || {}).innerText.replace(/\t|\n/g, ' : ')));
  console.log('[Bütçe] notlar:', await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes li')).slice(0, 2).map(l => l.textContent.slice(0, 220)).join(' || ')));
  // Düzenek
  await page.click('#tab-duzenek'); await page.waitForTimeout(1200);
  console.log('[Düzenek] durum:', await page.textContent('#pstat'), '| VIV etiketi:', await page.evaluate(() => document.querySelector('#pvivLbl').firstChild.textContent));
  const waitRun = (re) => page.waitForFunction((r) => new RegExp(r).test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, re, { timeout: 180000 });
  const pause = async () => { if (/Durdur/.test(await page.textContent('#pp'))) await page.click('#pp'); await page.waitForTimeout(80); };
  const scrub = async (t) => { await page.evaluate((tt) => { const s = document.querySelector('#scrub'); s.value = tt; s.dispatchEvent(new Event('input', { bubbles: true })); }, t); await page.waitForTimeout(200); };
  await page.selectOption('#pk', 'viv'); await page.click('#prun'); await waitRun('koşusu'); await pause(); await scrub(20.13);
  console.log('[Düzenek viv] durum:', await page.textContent('#pstat'));
  console.log('[Düzenek viv] metrik:', await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /Rüzgâr VIV|Direk tepesi|LOS RMS/.test(r.innerText)).map(r => r.innerText.replace(/\t|\n/g, ' : ')).join(' || ')));
  console.log('[Düzenek viv] HUD:', await page.evaluate(() => document.querySelector('#hud').innerText.replace(/\n/g, ' | ')));
  await page.screenshot({ path: path.join(out, '103_ship_rig_viv.png') });
  await page.evaluate(() => document.querySelector('#rc3').scrollIntoView({ block: 'center' })); await page.waitForTimeout(250);
  await (await page.$('#rc3')).screenshot({ path: path.join(out, '104_ship_rig_psd.png') });
  // Yöntem
  await page.click('#tab-yontem'); await page.waitForTimeout(800);
  console.log('[Yöntem] bulgular:', await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding .t')).map(e => e.textContent).join(' | ')));
  console.log('[Yöntem] V&V:', await page.evaluate(() => Array.from(document.querySelectorAll('.tiles .tile')).filter(t => /Toplam|Rüzgâr/.test(t.innerText)).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  // geri: denizaltı
  await page.click('#platSeg button[data-p="sub"]'); await page.waitForTimeout(900);
  await page.click('#tab-kampanya'); await page.waitForTimeout(400);
  console.log('[geri denizaltı] seçici:', await seg(), '| T2.2:', await t22(), '| afiş gizli:', await page.evaluate(() => document.querySelector('#staleBanner').hidden));
  console.log('[geri denizaltı] deniz roll_A:', await page.evaluate(() => { const i = document.getElementById('p-wb.sea.roll_A'); return i ? i.value : '(model kurulmamış)'; }));
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
