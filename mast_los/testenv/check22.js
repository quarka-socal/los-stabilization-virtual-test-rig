// Teknik kılavuz §2 tarayıcı kontrolü: Model "Referans kanal ve gereksinimler" grubu (kanal seçimi → bağlı girdiler, rol etiketleri,
// format seçici, TUR tanımı → k satırı), türetilmiş kutucuklar, Bütçe tahsis notu, Düzenek dedektör paneli ve 3B ölçeği
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const grp = () => page.evaluate(() => { const d = Array.from(document.querySelectorAll('#pg details'))[0]; return Array.from(d.querySelectorAll('.prow')).map(r => { const i = r.querySelector('input,select'); const lb = r.querySelector('.lb'); return `${lb.childNodes[0].textContent.trim()} [${lb.querySelector('.ref').textContent}] = ${i ? (i.type === 'checkbox' ? i.checked : i.value) : '—'}${i && i.classList.contains('changed') ? ' *' : ''}`; }).join('\n   '); });
  const tiles = () => page.evaluate(() => Array.from(document.querySelectorAll('#mTiles .tile')).slice(0, 3).map(t => t.innerText.replace(/\n/g, ' ')).join(' || '));
  console.log('[varsayılan grup]\n   ' + await grp());
  console.log('[varsayılan kutucuklar] ' + await tiles());
  await page.screenshot({ path: path.join(out, '230_model_ref_default.png') });
  // kanal → HDTV-NFOV
  await page.selectOption('#p-wb\\.refChannel', 'HDTV-NFOV'); await page.waitForTimeout(700);
  console.log('[HDTV grup]\n   ' + await grp());
  console.log('[HDTV kutucuklar] ' + await tiles());
  // HDTV seçiliyken piksel aralığını değiştir → HDTV kanalı değişmeli (MWIR değil)
  await page.fill('#p-wb\\.channels\\.2\\.p_um', '5.75'); await page.press('#p-wb\\.channels\\.2\\.p_um', 'Enter'); await page.waitForTimeout(600);
  console.log('[HDTV p = 5,75 µm] kanallar:', await page.evaluate(() => window.__T.STATE.P.wb.channels.map(c => `${c.name} p ${c.p_um}`).join(' · ')), '·', await tiles());
  // TUR tanımı Z540.3 → k satırı görünür
  await page.selectOption('#p-wb\\.TUR_def', 'Z540.3'); await page.waitForTimeout(600);
  console.log('[Z540.3] k satırı:', await page.evaluate(() => !!document.getElementById('p-wb.k_exp')), '· TUR paneli:', await page.evaluate(() => { const r = Array.from(document.querySelectorAll('#mTur tr')).find(x => /TUR \(/.test(x.innerText)); return r ? r.innerText.replace(/\t|\n/g, ' : ') : '(yok)'; }));
  // Bütçe tahsis notu (HDTV)
  await page.click('#tab-butce'); await page.waitForTimeout(800);
  console.log('[Bütçe notu]', await page.evaluate(() => (Array.from(document.querySelectorAll('#budNotes li, #budNotes p')).map(x => x.innerText).find(t => /Tahsisler \(Q/.test(t)) || '(yok)').slice(0, 600)));
  // Düzenek: HDTV ile yeniden koşu; dedektör başlığı, ölçek çubuğu, tam alan çerçevesi, 3B ölçeği
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.t = 30; drawRigFrame(); });
  console.log('[Düzenek HDTV] başlık:', await page.textContent('#fpaTtl'), '· geom:', await page.evaluate(() => { const p = window.__T.RIG.play; return `IFOV ${(p.geom.IFOV * 1e6).toFixed(2)} µrad · ${p.geom.Nh}×${p.geom.Nv} · fps ${p.video.fps}`; }), '· HUD 3B:', await page.evaluate(() => document.querySelector('#hud').innerText.split('\n').filter(x => /3B halka|1 px/.test(x)).join(' ')));
  await page.screenshot({ path: path.join(out, '231_rig_hdtv_auto.png') });
  await page.click('[data-m="full"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '232_rig_hdtv_full.png') });
  await page.click('[data-m="near"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '233_rig_hdtv_pixel.png') });
  console.log('[Düzenek HDTV] dedektör notu:', (await page.textContent('#fpaNote')).slice(0, 300));
  // varsayılana dön
  await page.click('#tab-model'); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(800);
  console.log('[varsayılana dönüş grup]\n   ' + await grp());
  await page.selectOption('#p-\\@fmt', '640×512'); await page.waitForTimeout(700);
  console.log('[640×512] kutucuklar:', await tiles());
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => /koşusu/.test(document.querySelector('#pstat').textContent) && !document.querySelector('#prun').disabled, null, { timeout: 240000 });
  await page.click('[data-m="full"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.t = 30; drawRigFrame(); });
  console.log('[640×512 Düzenek] geom:', await page.evaluate(() => { const p = window.__T.RIG.play; return `${p.geom.Nh}×${p.geom.Nv}`; }));
  await page.screenshot({ path: path.join(out, '234_rig_640_full.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
