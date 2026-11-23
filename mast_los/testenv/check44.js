// arayüz 14.0 kabuk denetimi: gezinme, sekans şeridi, sayaçlar, rozetler, tema, süzgeçler, panel sekmeleri, hash, tek test koşusu,
// "kılavuz" taraması ve yatay taşma (1440 / 390, açık / koyu). Kullanım: node check44.js [sayfa=test.html]
const { chromium } = require('playwright-core');
const PAGE = 'http://127.0.0.1:8765/' + (process.argv[2] || 'test.html');
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const TABS = ['ozet', 'kampanya', 'duzenek', 'butce', 'gereksinim', 'model', 'yontem'];
let nOk = 0, nBad = 0;
const ok = (c, m) => { if (c) { nOk++; console.log('  ✓ ' + m); } else { nBad++; console.log('  ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  // ---------------------------------------------------------------- 1) kabuk ve etkileşimler (1440, açık)
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(PAGE, { waitUntil: 'load' }); await p.waitForTimeout(1800);
    console.log('1) kabuk');
    const s0 = await p.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'), tab: location.hash, tabs: document.querySelectorAll('#tabs .tab').length,
      cells: document.querySelectorAll('#strip .cell').length, fail: document.querySelectorAll('#strip .cell.fail').length,
      okc: document.querySelectorAll('#strip .cell.ok').length, info: document.querySelectorAll('#strip .cell.info').length, warn: document.querySelectorAll('#strip .cell.warn').length,
      cnt: [...document.querySelectorAll('#abCounts .cnt')].map(c => [c.className.replace('cnt ', ''), +c.textContent.trim()]),
      badge: document.querySelector('#tab-kampanya .badge').textContent, mbadge: document.querySelector('#tab-model .badge').textContent,
      sb: document.querySelector('#statusbar').innerText, mx: document.querySelectorAll('#ovMatrix .mx').length,
      foot: document.querySelector('#tabs .foot').innerText }));
    ok(s0.theme === 'light', `varsayılan tema açık (data-theme=${s0.theme})`);
    ok(s0.tab === '#ozet', `açılış ekranı Özet (${s0.tab})`);
    ok(s0.tabs === 7, `gezinmede 7 ekran (${s0.tabs})`);
    ok(s0.cells === 28, `şeritte 28 hücre (${s0.cells})`);
    ok(s0.okc + s0.fail + s0.info + s0.warn === 28, `hücre durumları toplamı 28 (OK ${s0.okc}, aşım ${s0.fail}, bilgi ${s0.info}, geçersiz ${s0.warn})`);
    const C = Object.fromEntries(s0.cnt);
    ok(C.ok === s0.okc && (C.fail || 0) === s0.fail && C.info === s0.info && (C.warn || 0) === s0.warn, `sayaçlar şeritle aynı (${JSON.stringify(C)})`);
    ok(s0.badge === String(s0.fail), `Kampanya rozeti = aşım sayısı (${s0.badge})`);
    ok(s0.mbadge === '', 'Model rozeti boş (parametreler varsayılan)');
    ok(/Önceden hesaplanmış sonuçlar/.test(s0.sb) && /Parametreler varsayılan/.test(s0.sb) && /V&V 74\/74/.test(s0.sb), 'durum satırı: kaynak, parametre durumu, V&V');
    ok(s0.mx === 28, `Özet matrisinde 28 test (${s0.mx})`);
    ok(/v13\.18/.test(s0.foot) && /14\.0/.test(s0.foot), `sürüm künyesi (${s0.foot.replace(/\n/g, ' ')})`);
    // tema düğmesi
    await p.click('#themeBtn'); await p.waitForTimeout(300);
    const t1 = await p.evaluate(() => [document.documentElement.getAttribute('data-theme'), localStorage.getItem('mlos2.theme'), getComputedStyle(document.body).backgroundColor, document.querySelector('#themeBtn').getAttribute('aria-label')]);
    ok(t1[0] === 'dark' && t1[1] === '"dark"', `tema düğmesi koyuya geçirir ve saklar (${t1[0]}, ${t1[1]}, gövde ${t1[2]}, etiket "${t1[3]}")`);
    await p.click('#themeBtn'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'ikinci tıklama açık temaya döner');
    // şerit hücresi -> Kampanya ekranında o test
    await p.click('#sc-T1_9'); await p.waitForTimeout(700);
    const s1 = await p.evaluate(() => ({ hash: location.hash, cur: document.querySelector('#sc-T1_9').getAttribute('aria-current'), li: document.querySelector('#ti-T1_9').getAttribute('aria-current'), det: document.querySelector('#detail').innerText.slice(0, 200) }));
    ok(s1.hash === '#kampanya' && s1.cur === 'true' && s1.li === 'true' && /T1\.9/.test(s1.det), `şerit hücresi T1.9'u açar (${s1.hash}, şerit ${s1.cur}, liste ${s1.li})`);
    // gezgin süzgeçleri
    await p.click('#tfilter button[data-f="AŞIM"]'); await p.waitForTimeout(200);
    const f1 = await p.evaluate(() => [...document.querySelectorAll('#seq .titem:not(.hide)')].map(x => x.id));
    ok(f1.length === s0.fail, `"Aşım" süzgeci ${s0.fail} test gösterir (${f1.join(', ')})`);
    await p.click('#tfilter button[data-f="all"]'); await p.fill('#tsearch', 'T2'); await p.waitForTimeout(250);
    const f2 = await p.evaluate(() => [...document.querySelectorAll('#seq .titem:not(.hide)')].map(x => x.id));
    ok(f2.length > 0 && f2.every(x => /^ti-T2/.test(x) || true) && f2.length === await p.evaluate(() => [...document.querySelectorAll('#seq .titem')].filter(x => /T2/i.test(x.textContent)).length), `metin süzgeci "T2" (${f2.length} test)`);
    await p.fill('#tsearch', 'zzzz'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.querySelector('#seqNone').hidden), 'eşleşme yoksa "Süzgece uyan test yok."');
    await p.fill('#tsearch', ''); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.querySelectorAll('#seq .titem:not(.hide)').length) === 28, 'süzgeç temizlenince 28 test');
    // klavye ile ekran gezinmesi
    await p.focus('#tab-kampanya'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => location.hash) === '#duzenek', 'gezinmede ↓ tuşu sonraki ekrana geçer');
    // hash ile gezinme
    await p.evaluate(() => { location.hash = '#butce'; }); await p.waitForTimeout(600);
    ok(await p.evaluate(() => !document.querySelector('#v-butce').hidden), 'adres çubuğundaki #butce Bütçe ekranını açar');
    // panel sekmeleri
    await p.click('#budTabs .tabbar button[data-k="top"]'); await p.waitForTimeout(250);
    const ts = await p.evaluate(() => [document.querySelector('#budTabs-top').classList.contains('off'), document.querySelector('#budTabs-tablo').classList.contains('off'), localStorage.getItem('mlos2.ts.budTabs')]);
    ok(!ts[0] && ts[1] && ts[2] === '"top"', `Bütçe panel sekmesi değişir ve hatırlanır (${ts[2]})`);
    await p.focus('#budTabs .tabbar button[data-k="top"]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !document.querySelector('#budTabs-tablo').classList.contains('off')), 'panel sekmelerinde ← tuşu');
    // Model: arama, değişiklik rozeti, bayatlama, varsayılana dönüş
    await p.click('#tab-model'); await p.waitForTimeout(800);
    await p.fill('#psearch', 'VIV'); await p.waitForTimeout(300);
    const ps = await p.evaluate(() => { const r = [...document.querySelectorAll('#pg .prow')]; const v = r.filter(x => x.offsetParent !== null); return [r.length, v.length, v.every(x => /viv/i.test(x.textContent) || /viv/i.test(x.closest('details') ? x.closest('details').querySelector('summary').textContent : ''))]; });
    ok(ps[1] > 0 && ps[1] < ps[0] && ps[2], `parametre araması "VIV": ${ps[1]}/${ps[0]} satır, hepsi eşleşiyor`);
    await p.fill('#psearch', ''); await p.waitForTimeout(200);
    await p.evaluate(() => window.__T.setParam('wb.tau', window.__T.STATE.P.wb.tau * 2)); await p.waitForTimeout(700);
    const s2 = await p.evaluate(() => ({ mb: document.querySelector('#tab-model .badge').textContent, sb: document.querySelector('#statusbar').innerText, stale: document.querySelectorAll('#strip .cell.stale').length, ban: !document.querySelector('#staleBanner').hidden }));
    ok(s2.mb === '1' && /1 parametre varsayılandan farklı/.test(s2.sb), `parametre değişince Model rozeti ve durum satırı (${s2.mb})`);
    ok(s2.stale > 0 && s2.ban && /önceki parametrelerle/.test(s2.sb), `sonuçlar bayat işaretlenir (${s2.stale} hücre, uyarı şeridi ${s2.ban})`);
    await p.click('text=Varsayılana dön'); await p.waitForTimeout(800);
    const s3 = await p.evaluate(() => ({ mb: document.querySelector('#tab-model .badge').textContent, stale: document.querySelectorAll('#strip .cell.stale').length, sb: document.querySelector('#statusbar').innerText }));
    ok(s3.mb === '' && s3.stale === 0 && /Parametreler varsayılan/.test(s3.sb), 'Varsayılana dön: rozet ve bayatlık kalkar');
    // Özet matrisinden teste
    await p.click('#tab-ozet'); await p.waitForTimeout(500);
    await p.click('#ovMatrix .mx:has-text("T2.3")'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => location.hash === '#kampanya' && document.querySelector('#ti-T2_3').getAttribute('aria-current') === 'true'), 'Özet matrisindeki hücre testi Kampanya ekranında açar');
    // tek test koşusu: şerit, sayaç ve durum satırı canlı güncellenir
    console.log('   T0.1 koşuluyor…');
    await p.evaluate(() => { window.__runP = window.__T.runTests(['T0.1']); });
    await p.waitForTimeout(300);
    const r0 = await p.evaluate(() => document.querySelector('#sc-T0_1').className);
    await p.waitForFunction(() => { const c = document.querySelector('#sc-T0_1'); return c && !/\b(run|wait)\b/.test(c.className); }, null, { timeout: 240000 });
    await p.waitForTimeout(500);
    const r1 = await p.evaluate(() => ({ cls: document.querySelector('#sc-T0_1').className, sb: document.querySelector('#statusbar').innerText, src: window.__T.STATE.results['T0.1'].src, st: window.__T.STATE.results['T0.1'].res.status }));
    ok(/run|wait/.test(r0), `koşu sırasında hücre "koşuyor" (${r0})`);
    ok(r1.src === 'run' && /Son koşu/.test(r1.sb) && r1.cls.includes({ OK: 'ok', 'AŞIM': 'fail', 'BİLGİ': 'info', 'GEÇERSİZ': 'warn' }[r1.st]), `koşu bitince hücre ${r1.cls}, durum satırı "${r1.sb.split('\n')[0]}"`);
    ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  // ---------------------------------------------------------------- 2) metin taraması ve taşma: 2 genişlik × 2 tema × 7 ekran
  for (const [W, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark'], [1920, 'light'], [1024, 'light']]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 900 }, colorScheme: theme }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    if (theme === 'dark') await p.addInitScript(() => { try { localStorage.setItem('mlos2.theme', JSON.stringify('dark')); } catch (e) {} });
    await p.goto(PAGE + '#ozet', { waitUntil: 'load' }); await p.waitForTimeout(1500);
    console.log(`2) ${W} px, ${theme}`);
    const over = [], kil = [], thm = [];
    for (const t of TABS) {
      await p.evaluate((t) => { location.hash = '#' + t; }, t); await p.waitForTimeout(t === 'duzenek' ? 2500 : 700);
      const r = await p.evaluate(() => {
        const de = document.documentElement, ow = de.scrollWidth - de.clientWidth;
        document.body.classList.add('ui-expand'); for (const d of document.querySelectorAll('details')) d.open = true;
        const txt = document.body.innerText;
        const m = txt.match(/kılavuz|kilavuz|KILAVUZ/gi);
        document.body.classList.remove('ui-expand');
        return { ow, kil: m ? m.length : 0, theme: de.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor };
      });
      if (r.ow > 0) over.push(`${t}:${r.ow}px`); if (r.kil) kil.push(`${t}:${r.kil}`); thm.push(r.theme);
    }
    ok(over.length === 0, 'yatay taşma yok' + (over.length ? ' — ' + over.join(', ') : ''));
    ok(kil.length === 0, '"kılavuz" geçmiyor' + (kil.length ? ' — ' + kil.join(', ') : ''));
    ok(thm.every(x => x === theme), `tema ${theme} korunur`);
    ok(errs.length === 0, 'sayfa hatası yok' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  console.log(`\nSONUÇ: ${nOk} geçti, ${nBad} kaldı`);
  await b.close(); process.exit(nBad ? 1 : 0);
})();
