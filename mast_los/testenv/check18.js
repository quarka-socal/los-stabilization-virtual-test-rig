// v11: dizin formatı ve köşe ölçütü, 6-DOF deniz, FOG, taban düzeltmesi — Model, Bütçe, Yöntem; koyu tema ve dar ekran
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = []; const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s*\n\s*/g, ' | ').slice(0, 900) : '(yok)'; }, sel);
  const tile = () => page.evaluate(() => Array.from(document.querySelectorAll('#mTiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || '));
  console.log('[Model] kutucuklar:', await tile());
  console.log('[Model] format seçici:', await page.evaluate(() => { const s = document.getElementById('p-@fmt'); return s ? s.value + ' / ' + Array.from(s.options).map(o => o.value).join(',') : '(yok)'; }));
  console.log('[Model] Nh/Nv:', await page.evaluate(() => ['p-wb.channels.0.Nh', 'p-wb.channels.0.Nv'].map(i => { const e = document.getElementById(i); return e ? e.value : '—'; }).join(' × ')));
  console.log('[Model] rotRef / extRows / mvCorr / sea.mode:', await page.evaluate(() => ['p-wb.rotRef', 'p-wb.extRows', 'p-wb.hex.mvCorr', 'p-wb.sea.mode'].map(i => { const e = document.getElementById(i); return e ? (e.type === 'checkbox' ? e.checked : e.value) : '—'; }).join(' / ')));
  console.log('[Model] mRot:', await txt('#mRot'));
  console.log('[Model] mSea6 (dar):', await txt('#mSea6'));
  console.log('[Model] mFog:', await txt('#mFog'));
  console.log('[Model] mTur taban:', await page.evaluate(() => { const h4 = Array.from(document.querySelectorAll('#mTur h4')).map(e => e.textContent); const tb = Array.from(document.querySelectorAll('#mTur table'))[1]; return h4.join(' ; ') + ' :: ' + (tb ? tb.innerText.replace(/\t/g, ' : ').replace(/\n/g, ' || ') : '(tablo yok)'); }));
  await page.evaluate(() => document.querySelector('#mRot').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '110_model_rot.png') });
  // format 640×512
  await page.selectOption('#p-\\@fmt', '640×512'); await page.waitForTimeout(700);
  console.log('[640×512] kutucuk:', await tile());
  console.log('[640×512] Nh/Nv:', await page.evaluate(() => ['p-wb.channels.0.Nh', 'p-wb.channels.0.Nv'].map(i => document.getElementById(i).value).join(' × ')));
  console.log('[640×512] mRot ilk satırlar:', (await txt('#mRot table.kv')).slice(0, 500));
  // özel format: Nh = 2048, Nv = 2048
  await page.fill('#p-wb\\.channels\\.0\\.Nh', '2048'); await page.dispatchEvent('#p-wb\\.channels\\.0\\.Nh', 'change'); await page.waitForTimeout(500);
  await page.fill('#p-wb\\.channels\\.0\\.Nv', '2048'); await page.dispatchEvent('#p-wb\\.channels\\.0\\.Nv', 'change'); await page.waitForTimeout(700);
  console.log('[2048×2048] seçici:', await page.evaluate(() => document.getElementById('p-@fmt').value), '| kutucuk:', (await tile()).split('||')[2]);
  // varsayılan + SS5
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(b => /^Varsayılan/.test(b.textContent)); b.click(); }); await page.waitForTimeout(600);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(b => /SS5/.test(b.textContent)); b.click(); }); await page.waitForTimeout(900);
  console.log('[SS5] sea.mode:', await page.evaluate(() => document.getElementById('p-wb.sea.mode').value), '| tablo girişleri:', await page.evaluate(() => Array.from(document.querySelectorAll('table.t6 input')).map(i => i.value).join(',')));
  console.log('[SS5] roll_A satırı gizli mi:', await page.evaluate(() => !document.getElementById('p-wb.sea.roll_A')));
  console.log('[SS5] mSea6:', await txt('#mSea6'));
  await page.evaluate(() => document.querySelector('#mSea6').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '111_model_sea6.png') });
  await page.evaluate(() => { const t = document.querySelector('table.t6'); t.closest('details').open = true; t.scrollIntoView({ block: 'center' }); }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '112_model_sea6_params.png') });
  // tablo girişi: heave A = 2
  await page.evaluate(() => { document.querySelector('table.t6').closest('details').open = true; });
  await page.fill('#p-wb\\.sea\\.dof\\.heave\\.A', '2'); await page.dispatchEvent('#p-wb\\.sea\\.dof\\.heave\\.A', 'change'); await page.waitForTimeout(700);
  console.log('[heave 2 m] mSea6 heave satırı:', await page.evaluate(() => (Array.from(document.querySelectorAll('#mSea6 table.dt tr')).find(r => /Heave/.test(r.innerText)) || {}).innerText.replace(/\t/g, ' : ')));
  // FOG ön ayarı
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#presetRow button')).find(b => /FOG: kullanıcı/.test(b.textContent)); b.click(); }); await page.waitForTimeout(800);
  console.log('[FOG örnek] mFog:', await txt('#mFog'));
  console.log('[FOG örnek] kutucuk El:', (await tile()).split('||')[3]);
  await page.evaluate(() => document.querySelector('#mFog').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '113_model_fog.png') });
  // Bütçe
  await page.click('#tab-butce'); await page.waitForTimeout(900);
  for (const id of ['B1-08', 'B1-09', 'B1-10', 'R-01']) console.log('[Bütçe] ' + id + ':', await page.evaluate((i) => (Array.from(document.querySelectorAll('#budTable tr')).find(r => r.innerText.includes(i)) || {}).innerText.replace(/\t|\n/g, ' : '), id));
  console.log('[Bütçe] bant satırı R:', await page.evaluate(() => Array.from(document.querySelectorAll('#budTable tr.band')).map(r => r.innerText).join(' | ')));
  console.log('[Bütçe] taban tablosu:', await page.evaluate(() => { const w = Array.from(document.querySelectorAll('#budTot h4')).map(e => e.textContent); const t = Array.from(document.querySelectorAll('#budTot table'))[1]; return w.join(';') + ' :: ' + (t ? t.innerText.replace(/\t/g, ' : ').replace(/\n/g, ' || ') : Array.from(document.querySelectorAll('#budTot p')).map(p => p.textContent).join(' ')); }));
  console.log('[Bütçe] notlar (v11):', await page.evaluate(() => Array.from(document.querySelectorAll('#budNotes li')).filter(l => /R-01|B1-08/.test(l.textContent)).map(l => l.textContent.slice(0, 260)).join(' || ')));
  await page.screenshot({ path: path.join(out, '114_budget.png'), fullPage: false });
  // Yöntem
  await page.click('#tab-yontem'); await page.waitForTimeout(900);
  console.log('[Yöntem] bulgular:', await page.evaluate(() => Array.from(document.querySelectorAll('#findings .finding .t')).map(e => e.textContent).join(' | ')));
  console.log('[Yöntem] ilk bulgu:', await page.evaluate(() => document.querySelector('#findings .finding .w').textContent.slice(0, 600)));
  console.log('[Yöntem] V&V kutuları:', await page.evaluate(() => Array.from(document.querySelectorAll('.tiles .tile')).map(t => t.innerText.replace(/\n/g, ' ')).join(' || ')));
  await page.evaluate(() => document.querySelector('#findings').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '115_method_findings.png') });
  // koyu tema + dar ekran
  await page.click('#tab-model'); await page.waitForTimeout(500);
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#mSea6').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '116_dark_sea6.png') });
  await page.setViewportSize({ width: 390, height: 860 }); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#mRot').scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '117_mobile_rot.png') });
  console.log('[390 px] yatay taşma:', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  await page.evaluate(() => { const t = document.querySelector('table.t6'); if (t) { t.closest('details').open = true; t.scrollIntoView({ block: 'center' }); } }); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '118_mobile_t6.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
