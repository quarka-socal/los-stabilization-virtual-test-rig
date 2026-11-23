// v13.15 kontrolü (§14 Kampanya, Bütçe, Gereksinimler ve Yöntem sekmeleri): gösterilen ↔ veri tutarlılığı
//  Kampanya: özet sayıları ↔ sonuç durumları (iki platform); test listesi rozetleri ↔ durumlar; ayrıntıda tohum satırı
//  Bütçe: satır durumları ↔ computeBudget; toplamlar ↔ hesap
//  Gereksinimler: kontrol satırları ↔ op.req.checksPost / checksPre
//  Yöntem: V&V kutucuğu ve tablo satırları ↔ PRE.vv (tekil kimlik), tohum tablosu
//  ekran görüntüleri (açık / koyu), mobil taşma
const { chromium } = require('playwright-core');
const path = require('path'); const out = path.join(__dirname, 'shots');
const T = (s) => (s || '').replace(/\t/g, ' : ').replace(/\n+/g, ' | ');
const part = process.argv[2] || 'all';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const mk = async (opt) => { const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); return page; };
  const page = await mk({ viewport: { width: 1440, height: 1000 } });
  const go = async (tab) => { await page.goto('about:blank'); await page.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await page.waitForTimeout(2000);
    if (await page.evaluate(() => /Gemi/.test((document.querySelector('[aria-pressed="true"]') || {}).textContent || '') && window.__T.STATE.P && window.__T.STATE.P.platform === 'ship')) { await page.click('button:has-text("Denizaltı mastı")'); await page.waitForTimeout(1500); } };
  if (part === 'all' || part === 'kampanya') {
    for (const plat of ['sub', 'ship']) {
      await go('kampanya');
      if (plat === 'ship') { await page.click('button:has-text("Gemi direği")'); await page.waitForTimeout(2000); }
      const r = await page.evaluate(() => {
        const S = window.__T.STATE, ids = Object.keys(S.results), cnt = {}; for (const id of ids) { const s = S.results[id].res.status; cnt[s] = (cnt[s] || 0) + 1; }
        const tile = document.querySelector('#campTiles .tile .counts'); const dom = tile ? tile.innerText.replace(/\s+/g, ' ') : '—';
        const badges = Array.from(document.querySelectorAll('.titem')).map(b => [b.id.replace('ti-', '').replace('_', '.'), (b.querySelector('.st, .badge, .pill') || {}).textContent || b.innerText.split('\n').slice(-1)[0]]);
        const mism = badges.filter(([id, t]) => S.results[id] && !String(t).toUpperCase().includes(S.results[id].res.status.toUpperCase().slice(0, 3))).map(x => x.join('=')).slice(0, 6);
        return { n: ids.length, cnt, dom, nBadge: badges.length, mism, tiles: Array.from(document.querySelectorAll('#campTiles .tile')).map(t => t.innerText.replace(/\s+/g, ' ').slice(0, 140)) };
      });
      console.log(`[Kampanya ${plat}] ${r.n} sonuç, veri ${JSON.stringify(r.cnt)} ↔ kutucuk "${r.dom}"; rozet ${r.nBadge}, uyumsuz: ${r.mism.length ? r.mism.join(', ') : 'yok'}`);
      console.log('   kutucuklar:', r.tiles.join(' || '));
      if (plat === 'sub') {
        await page.evaluate(() => { const b = document.querySelector('#ti-T1_9'); if (b) b.click(); }); await page.waitForTimeout(500);
        console.log('[Kampanya T1.9 ayrıntı: tohum satırı]', T(await page.evaluate(() => { const d = Array.from(document.querySelectorAll('#detail div.small')).find(x => /tohumla tekrar/.test(x.innerText)); return d ? d.innerText.slice(0, 300) : '—'; })));
        await page.screenshot({ path: path.join(out, '400_kampanya_v1315.png') });
      }
    }
  }
  if (part === 'all' || part === 'butce') {
    await go('butce');
    const r = await page.evaluate(() => {
      const ENG = window.ENG || null; const rows = Array.from(document.querySelectorAll('table tr')).filter(tr => /^B[0-3]-\d\d|^R-01|^H7/.test(tr.innerText.trim()));
      return { nRows: rows.length, sample: rows.slice(0, 3).map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 160)), totals: Array.from(document.querySelectorAll('#budTot, .budtot, #budTotals')).map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 400)) };
    });
    console.log(`[Bütçe] tablo satırı ${r.nRows}; örnek: ${r.sample.join(' || ')}`);
    console.log('   toplamlar:', r.totals.join(' || ') || '—');
    await page.screenshot({ path: path.join(out, '401_butce_v1315.png') });
  }
  if (part === 'all' || part === 'req') {
    await go('gereksinim');
    const r = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr')).map(tr => tr.innerText.replace(/\s+/g, ' ')).filter(t => /σ_El|σ_Az|σ_vek|PPV|P99,73|Pozlama|Bant|Ton/.test(t));
      return { n: rows.length, rows: rows.slice(0, 30) };
    });
    console.log(`[Gereksinimler] ${r.n} kontrol satırı:`, r.rows.slice(0, 12).join(' || '));
    await page.screenshot({ path: path.join(out, '402_gereksinimler_v1315.png') });
  }
  if (part === 'all' || part === 'yontem') {
    await go('yontem');
    const r = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('tr')).map(tr => (tr.querySelector('td') || {}).innerText || '').map(s => s.trim()).filter(s => /^[WNKDCMVSFG]\d+$/.test(s));
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      const tiles = Array.from(document.querySelectorAll('.tile')).map(t => t.innerText.replace(/\s+/g, ' ')).filter(t => /TOPLAM|ANALİTİK|kontrol/i.test(t));
      const seedRows = Array.from(document.querySelectorAll('table.dt tbody tr')).filter(tr => /^(B\d-\d\d|R-01|H7|T1\.3|MTF)/.test(tr.innerText.trim())).length;
      return { n: ids.length, dup, tiles, seedRows, findings: document.querySelectorAll('#findings .finding').length };
    });
    console.log(`[Yöntem] V&V tablo satırı ${r.n}, yinelenen ${r.dup.length ? r.dup.join(',') : 'yok'}; kutucuklar: ${r.tiles.join(' || ')}; tohum tablosu satırı ${r.seedRows}; bulgu ${r.findings}`);
    await page.screenshot({ path: path.join(out, '403_yontem_v1315.png') });
  }
  if (part === 'all' || part === 'theme') {
    const pd = await mk({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    for (const tab of ['butce', 'gereksinim']) { await pd.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pd.waitForTimeout(2000); await pd.screenshot({ path: path.join(out, `404_${tab}_dark_v1315.png`) }); }
    const pm = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const tab of ['kampanya', 'butce', 'gereksinim', 'yontem']) {
      await pm.goto('http://127.0.0.1:8765/test.html#' + tab, { waitUntil: 'load' }); await pm.waitForTimeout(1800);
      const ov = await pm.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      console.log(`[mobil ${tab}] scrollWidth ${ov.sw} / clientWidth ${ov.cw}`, ov.sw > ov.cw + 1 ? 'TAŞMA' : 'ok');
    }
  }
  console.log('[hatalar]', errs.length ? errs.join(' || ') : 'yok');
  await browser.close();
})();
