// EIS ayarları: Model alanları, "EIS kapalı" hazır ayarı, Bütçe toplam satırları ve notları; sayfa hataları
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html#model', { waitUntil: 'load' }); await page.waitForTimeout(1200);
  const grp = await page.evaluate(() => { const i = document.getElementById('p-wb.eis.reg_px'); const d = i.closest('details'); d.open = true; d.scrollIntoView({ block: 'start' }); return Array.from(d.querySelectorAll('.prow')).map(r => r.innerText.replace(/\n/g, ' | ')); });
  console.log('Model grubu:\n ' + grp.join('\n '));
  await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, '53_model_eis.png') });
  const totals = async (lab) => { await page.click('#tab-butce'); await page.waitForTimeout(500);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#budTot tr')).map(r => r.innerText.replace(/\t/g, ' | ')).filter(t => /Wander toplamı|EIS/.test(t)));
    console.log(lab + ':\n ' + rows.join('\n ')); };
  await totals('varsayılan');
  // kullanıcının girdiği ayarlar: f_c = 0, η = 0, artık rotasyon = 0
  await page.click('#tab-model'); await page.waitForTimeout(300);
  for (const [id, v] of [['wb.eis.fc', '0'], ['wb.eis.eta', '0'], ['wb.H.roll_res_mrad', '0']]) await page.evaluate(([i, val]) => { const e = document.getElementById('p-' + i); e.value = val; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  await page.waitForTimeout(400); await totals('kullanıcının ayarı (f_c 0, η 0, rotasyon 0)');
  // hazır ayar
  await page.click('#tab-model'); await page.waitForTimeout(300);
  await (await page.$('xpath=//button[normalize-space(.)="Varsayılan"]')).click(); await page.waitForTimeout(300);
  await (await page.$('xpath=//button[normalize-space(.)="EIS kapalı"]')).click(); await page.waitForTimeout(400);
  console.log('hazır ayar sonrası:', JSON.stringify(await page.evaluate(() => ({ fc: document.getElementById('p-wb.eis.fc').value, eta: document.getElementById('p-wb.eis.eta').value, reg: document.getElementById('p-wb.eis.reg_px').value, roll: document.getElementById('p-wb.H.roll_res_mrad').value }))));
  await totals('EIS kapalı hazır ayarı');
  await page.evaluate(() => document.querySelector('#budTot').scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, '54_budget_eisoff.png') });
  await browser.close(); console.log('sayfa hataları:', errs.length ? errs : 'yok');
})();
