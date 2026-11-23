// v13 kontrolü: dış referans izi kalmadı mı (tüm sekmelerin metni), rol etiketleri, IFOV tahsisleri, deniz DRR tablosu ve
// bütçe uyarısı (6-DOF SS4, roll periyodu 4 s), T1.1 test tanımı paneli, Düzenek gemi oynatması (öteleme q), koyu tema, mobil
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
  // 1) dış referans izi: bütün sekmeler açılıp metin taranır (detay panelleri ve <details> açık)
  // v13.8: elektronik tablo hücre başvurusu biçimi de aranır (B37, E31 gibi: tek harf A–H ya da AA–AH + iki/üç hane, tire yok;
  // V&V kimlikleri M/N/W/F/G/K/D/S/C/V harfleri ve tek haneli G1, H7 gibi adlar bu biçime girmez)
  const RX = /Girdiler|Jitter_Butcesi|Test_Matrisi|çalışma kitab|Çalışma kitab|kılavuz §|Kılavuz §|kılavuz 7|VIV_Hesap|Hexapod_Erisim|PSD_Agirlik|Olcum_Belirsizligi|Dunya_Donusu|Kaynak_Izlenebilirlik|v1\.2|(?<![\w.\-/])(?:[A-H]|A[A-H])\d{2,3}(?![\w\-.,])/;
  const hits = [];
  for (const tab of ['model', 'butce', 'kampanya', 'gereksinim', 'yontem', 'duzenek']) {
    await page.click('#tab-' + tab); await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    const txt = await page.evaluate(() => document.body.innerText);
    for (const line of txt.split('\n')) if (RX.test(line)) hits.push(tab + ': ' + line.slice(0, 160));
  }
  // test ayrıntıları (her test)
  await page.click('#tab-kampanya'); await page.waitForTimeout(400);
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('.titem')).map(b => b.id));
  for (const id of ids) { await page.click('#' + id); await page.waitForTimeout(120); await page.evaluate(() => document.querySelectorAll('#detail details').forEach(d => { d.open = true; }));
    const txt = await page.evaluate(() => document.querySelector('#detail').innerText); for (const line of txt.split('\n')) if (RX.test(line)) hits.push(id + ': ' + line.slice(0, 160)); }
  console.log('[dış referans izi]', hits.length ? hits.slice(0, 30) : 'yok');
  await page.click('#ti-T1_1'); await page.waitForTimeout(400);
  console.log('[T1.1 tanım paneli]', T(await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail details')).find(x => /Test tanımı ve uygulama/.test(x.querySelector('summary').textContent)); if (!d) return '(yok)'; d.open = true; return d.innerText.slice(0, 1400); })));
  console.log('[T1.1 sonucu]', T((await page.evaluate(() => (document.querySelector('#detail .measured') || {}).textContent || '')).slice(0, 300)));
  // 2) Model: rol etiketleri ve deniz tablosu
  await page.click('#tab-model'); await page.waitForTimeout(500);
  console.log('[rol etiketleri]', await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('#pg .ref')).map(e => e.textContent))).join(' | ')));
  const seaTab = () => page.evaluate(() => Array.from(document.querySelectorAll('#mSea6 table')).pop().innerText.replace(/\t/g, ' · ').replace(/\n/g, ' || '));
  console.log('[deniz DRR tablosu, varsayılan]', await seaTab());
  await page.fill('#p-wb\\.sea\\.roll_T', '4'); await page.press('#p-wb\\.sea\\.roll_T', 'Enter'); await page.waitForTimeout(700);
  console.log('[deniz DRR tablosu, roll 4 s]', await seaTab());
  await page.evaluate(() => document.querySelector('#mSea6').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '240_model_sea_drr_T4.png') });
  await page.click('#tab-butce'); await page.waitForTimeout(700);
  console.log('[bütçe notları, roll 4 s]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes li')).filter(li => /iyimser|IFOV cinsinden/.test(li.textContent)).map(li => li.textContent).join(' || '))));
  console.log('[bütçe tablo başlığı + B1-01]', T(await page.evaluate(() => { const t = document.querySelector('#budTable table'); return t.querySelector('thead').innerText + ' || ' + Array.from(t.querySelectorAll('tbody tr')).find(r => /B1-01/.test(r.innerText)).innerText; })));
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(600);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => /SS4 6-DOF/.test(x.textContent)); b.click(); }); await page.waitForTimeout(800);
  console.log('[deniz DRR tablosu, 6-DOF SS4]', await seaTab());
  await page.click('#tab-butce'); await page.waitForTimeout(700);
  console.log('[bütçe notu, 6-DOF SS4]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes li')).filter(li => /iyimser/.test(li.textContent)).map(li => li.textContent).join(' || ') || '(yok)')));
  // HDTV kanalı: tahsis IFOV ölçeği
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(600);
  await page.selectOption('#p-wb\\.refChannel', 'HDTV-NFOV'); await page.waitForTimeout(800);
  await page.click('#tab-butce'); await page.waitForTimeout(700);
  console.log('[HDTV B1-01 satırı]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budTable tbody tr')).find(r => /B1-01/.test(r.innerText)).innerText)));
  console.log('[HDTV tahsis notu]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes li')).filter(li => /IFOV cinsinden/.test(li.textContent)).map(li => li.textContent).join(' || '))));
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(x => x.textContent === 'Varsayılan'); b.click(); }); await page.waitForTimeout(600);
  // 3) Yöntem: V&V W grubu
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  console.log('[V&V kutucukları]', T(await page.evaluate(() => Array.from(document.querySelectorAll('.article .tiles .tile')).slice(0, 3).map(t => t.innerText).join(' || '))));
  console.log('[V&V W]', await page.evaluate(() => Array.from(document.querySelectorAll('table.vv tbody tr')).filter(r => /^W\d/.test(r.innerText.trim())).map(r => r.innerText.split('\n')[0] + ' ' + (r.querySelector('.pill span') || {}).textContent).join(' | ')));
  // 4) Düzenek: gemi platformu, deniz profili oynatması (kaldıraç kolu ötelemesi)
  await page.click('#platSeg button[data-p="ship"]'); await page.waitForTimeout(1200);
  await page.click('#tab-duzenek');
  await page.waitForFunction(() => { const p = window.__T.RIG.play; return p && p.platform === 'ship' && !document.querySelector('#prun').disabled; }, null, { timeout: 300000 });
  console.log('[düzenek durum]', await page.evaluate(() => document.querySelector('#pstat').textContent));
  await page.waitForTimeout(500);
  console.log('[düzenek gemi]', T(await page.evaluate(() => Array.from(document.querySelectorAll('#pmet tr')).filter(r => /ötelemesi|Hexapod tepe|LOS RMS|FOV/.test(r.innerText)).map(r => r.innerText).join(' || '))));
  const samp = await page.evaluate(() => { const { RIG, drawRigFrame, togglePlay } = window.__T; if (RIG.playing) togglePlay(); RIG.mag = 100; const p = RIG.play, r3 = RIG.r3, T3 = window.THREE; let worst = 0, maxTr = 0;
    for (const t of [12, 20, 31, 44, 55]) { RIG.t = t; drawRigFrame(); const i = Math.min(p.n - 1, Math.round(t * p.fs)), m = p.stab ? 100 : 1;
      const pu = new T3.Vector3(0.12, 0, 0).applyMatrix4(r3.el.matrixWorld), pl = r3.colG.worldToLocal(pu.clone()), D = Math.abs(r3.zl - pl.z), hl = r3.hitLocal;
      const thX = Math.atan(-hl.x / D) / m, thY = Math.atan(hl.y / D) / m; worst = Math.max(worst, Math.max(Math.abs(thX - p.opt_xel[i]), Math.abs(thY - p.opt_el[i])) / Math.max(1e-7, Math.hypot(p.opt_xel[i], p.opt_el[i])));
      if (p.tr_x) maxTr = Math.max(maxTr, Math.hypot(p.tr_x[i], p.tr_y[i], p.tr_z[i])); }
    RIG.t = 30; drawRigFrame(); return { worst, maxTrMm: maxTr * 1e3 }; });
  console.log('[düzenek gemi] halka ↔ LOS en büyük göreli fark', samp.worst.toExponential(2), '· öteleme en büyük', samp.maxTrMm.toFixed(1), 'mm');
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, '241_rig_ship_sea.png') });
  // 5) koyu tema ve mobil (Model deniz paneli, Bütçe)
  const dk = await mk({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  await dk.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await dk.waitForTimeout(1500);
  await dk.evaluate(() => document.querySelector('#mSea6').scrollIntoView({ block: 'start' })); await dk.waitForTimeout(300);
  await dk.screenshot({ path: path.join(out, '242_model_sea_dark.png') });
  const mb = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const tab of ['model', 'butce', 'yontem']) { await mb.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await mb.waitForTimeout(1300);
    console.log(`[mobil ${tab}] taşma:`, await mb.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))); }
  await mb.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await mb.waitForTimeout(1300);
  await mb.evaluate(() => document.querySelector('#mSea6').scrollIntoView({ block: 'start' })); await mb.waitForTimeout(300);
  await mb.screenshot({ path: path.join(out, '243_model_sea_mobile.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
