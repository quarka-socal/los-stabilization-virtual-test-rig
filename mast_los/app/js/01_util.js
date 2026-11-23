// ---------------------------------------------------------------- yardımcılar
const ENG = LOSSIM_FACTORY();
const PRE = window.__PRE__ || {};
const TM = window.__TM__ || { rows: {} };
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const svgNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(svgNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : Number(x).toFixed(d);
const fu = (x, d = 2) => (x == null || !isFinite(x)) ? '—' : (x * 1e6).toFixed(d);   // rad → µrad
// kaldıraç kolu metni: yalnız düşey bileşen varsa 'h = … m', değilse 'r = (r_x, r_y, h) m'
const armTxt = (P) => { const r = ENG.seaArm(P), g = (x) => (Number.isInteger(x) ? String(x) : fmt(x, 2)); return r[0] === 0 && r[1] === 0 ? `h = ${g(r[2])} m` : `r = (${r.map(g).join(', ')}) m`; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sq = (x) => x * x;
function b64bytes(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
const F32 = (v) => v == null ? null : (typeof v === 'string' ? new Float32Array(b64bytes(v).buffer) : (v instanceof Float32Array ? v : Float32Array.from(v)));
const U8 = (v) => v == null ? null : (typeof v === 'string' ? b64bytes(v) : (v instanceof Uint8Array ? v : Uint8Array.from(v)));
function store(k, v) { try { localStorage.setItem('mlos2.' + k, JSON.stringify(v)); } catch (e) { /* depolama yok */ } }
function load(k, d) { try { const v = localStorage.getItem('mlos2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function getPath(o, p) { return p.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const debounce = (fn, ms) => { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const pKey = (P) => JSON.stringify(P);

const ICON = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l7 12.6H1z" fill="currentColor"/><path d="M8 6v3.6" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="11.8" r="1" fill="#fff"/></svg>',
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".95" fill="currentColor"/></svg>',
  run: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="26 12"/></svg>',
  wait: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6V8l2.3 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.8" width="3.2" height="10.4" rx=".6" fill="currentColor"/><rect x="9.3" y="2.8" width="3.2" height="10.4" rx=".6" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1.5L3.5 9h3.8l-.9 5.5L12.5 7H8.6z" fill="currentColor"/></svg>',
  reset: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 2.5v3.3h3.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  invalid: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.6 12.4l8.8-8.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h7" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};
const STAT = {
  'OK': ['ok', ICON.ok, 'OK'], 'AŞIM': ['fail', ICON.fail, 'AŞIM'], 'BİLGİ': ['info', ICON.info, 'BİLGİ'],
  'GEÇERSİZ': ['warn', ICON.invalid, 'GEÇERSİZ'],
  'RUN': ['run', ICON.run, 'koşuyor'], 'WAIT': ['wait', ICON.wait, 'sırada'], 'ERR': ['fail', ICON.fail, 'HATA'], 'NONE': ['wait', ICON.wait, 'koşulmadı'],
};
function pill(st, extra) {
  const m = STAT[st] || STAT.NONE;
  return h('span', { class: 'pill ' + m[0] + (extra ? ' ' + extra : ''), html: m[1] + '<span>' + esc(m[2]) + '</span>' });
}
// test kimliği → blok
const BLOCKS = [
  { id: 'B0', name: 'Kalibrasyon ve ölçüm zinciri', d: 'TUR kapısı: B0 sağlanmadan dinamik testlere geçilmez' },
  { id: 'B1', name: '< 1 Hz — deniz hareketi', d: 'DRR, deniz profili, sürtünme, izleme' },
  { id: 'B2', name: '1–20 Hz — VIV, darbe, ivme', d: 'Süpürme, dwell, doğrusallık' },
  { id: 'B3', name: '> 20 Hz — titreşim', d: 'Shaker, MTF, yüksek hızlı kanal' },
  { id: 'B4', name: 'Kalıcı etkiler', d: 'Boresight, sıcaklık' },
];
const blockOf = (id) => 'B' + id.charAt(1);
const tmRow = (id) => (TM.rows && TM.rows[id]) || {};
const testName = (id) => tmRow(id).name || id;
