// Arayüzde gösterilen sayıların kaydı (eski ↔ yeni arayüz): bütün paneller, sekmeler ve katlanmış bölümler açılarak her görünümün
// metnindeki sayısal belirteçler; Kampanya'da 28 testin ayrıntısı (iki platform); Model giriş değerleri. node ui_numbers2.js <sayfa> <çıktı.json>
const { chromium } = require('playwright-core'); const fs = require('fs');
const page = process.argv[2] || 'test.html', out = process.argv[3] || 'ui_numbers.json';
const NUM = /[-−]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/g;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const R = {};
  const nums = (t) => (t.match(NUM) || []).map(x => x.replace('−', '-').replace(',', '.'));
  const go = async (tab, plat) => { await p.goto('about:blank'); await p.goto(`http://127.0.0.1:8765/${page}#${tab}`, { waitUntil: 'load' }); await p.waitForTimeout(tab === 'duzenek' ? 3000 : 1600);
    const cur = await p.evaluate(() => window.__T.STATE.P && window.__T.STATE.P.platform); if (cur !== (plat === 'ship' ? 'ship' : 'sub')) { await p.evaluate((pl) => { const b = Array.from(document.querySelectorAll('button')).find(x => x.getAttribute('data-p') === pl); if (b) b.click(); }, plat); await p.waitForTimeout(2200); } };
  for (const plat of ['sub', 'ship']) {
    for (const tab of ['ozet', 'kampanya', 'duzenek', 'butce', 'gereksinim', 'model', 'yontem']) {
      const has = await (async () => { await go(tab, plat); return p.evaluate((tab) => !!document.querySelector('#v-' + tab) && !document.querySelector('#v-' + tab).hidden, tab); })();
      if (!has) continue;
      const t = await p.evaluate((tab) => { document.body.classList.add('ui-expand'); for (const d of document.querySelectorAll('#v-' + tab + ' details')) d.open = true;
        const v = document.querySelector('#v-' + tab); const inp = Array.from(v.querySelectorAll('input, select')).filter(e => e.type !== 'search').map(e => e.type === 'checkbox' ? (e.checked ? '1' : '0') : e.value);
        return { text: v.innerText, inputs: inp }; }, tab);
      R[`${plat}/${tab}`] = { nums: nums(t.text), inputs: t.inputs, len: t.text.length };
      if (tab === 'kampanya') {
        const ids = await p.evaluate(() => Object.keys(window.__T.STATE.results));
        for (const id of ids) {
          await p.evaluate((id) => { const el = document.querySelector('#ti-' + id.replace('.', '_')); if (el) el.click(); }, id); await p.waitForTimeout(120);
          const d2 = await p.evaluate(() => { for (const d of document.querySelectorAll('#detail details')) d.open = true; return (document.querySelector('#detail') || {}).innerText || ''; });
          R[`${plat}/test/${id}`] = { nums: nums(d2), len: d2.length };
        }
      }
    }
  }
  fs.writeFileSync(out, JSON.stringify({ errs, R }, null, 0));
  console.log(page, Object.keys(R).length, 'kayıt; hatalar:', errs.join(' | ') || 'yok');
  await b.close();
})();
