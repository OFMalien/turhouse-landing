// Автопроверка контента (E5-T2, E5-T3; критерии ТЗ п.5-10, правила C2, C7, C9 и решения R4-R7, R9): запрещённое во ВСЕМ тексте собранного сайта
// (видимый текст, alt, aria-label, title, meta, JSON-LD) и в шаблонах src (нет цен, зашитых в шаблон, нет href="/..." без фильтра | url).
// Использование: node scripts/check-content.mjs preview|production   (спершу зберіть сайт)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const mode = process.argv[2] || 'preview';
if (mode !== 'preview' && mode !== 'production') {
  console.error('Использование: node scripts/check-content.mjs preview|production');
  process.exit(2);
}
const errors = [];
const fail = (where, m) => errors.push(`${where}: ${m}`);
const CYR = "А-Яа-яІіЇїЄєҐґ'";
const NB = '\\s\\u00a0\\u202f';

// ---------- запрещённое: [название, регулярка] ----------
const FORBIDDEN = [
  ['«км» или «кілометр» (C9)', new RegExp(`(?<![${CYR}])км(?![${CYR}])|кілометр`, 'i')],
  ['время в пути: «N хвилин/годин» + їзди, дорозі, пішки (C9)', new RegExp(`\\d+\\s*(хв\\.?|хвилин[${CYR}]*|год\\.?|годин[${CYR}]*)\\s*(їзди|в дорозі|у дорозі|дороги|пішки|шляху)`, 'i')],
  ['«хвилин їзди», «годин їзди», «година в дорозі» (C9)', new RegExp(`(хвилин|годин)[${CYR}]*\\s+(їзди|в дорозі|у дорозі|дороги|пішки)`, 'i')],
  ['«в дорозі», «у дорозі» (C9)', new RegExp(`(?<![${CYR}])(в|у)\\s+дорозі`, 'i')],
  ['«райський» (C2)', /райськ/i],
  ['«незабутній» (C2)', /незабутн/i],
  ['«унікальний» (C2)', /унікальн/i],
  ['«ретрит» (D2)', /ретрит/i],
  ['устаревшие цены 4500, 5200, 8200, 15800 (D2, отмена «Теплих вихідних»)', new RegExp(`(?<![\\d.,])(4[${NB}]?500|5[${NB}]?200|8[${NB}]?200|15[${NB}]?800)(?!\\d)`)],
  ['aggregateRating, reviewCount, ratingValue, ratingCount (ТЗ §7.2)', /aggregateRating|reviewCount|ratingValue|ratingCount|bestRating|worstRating/i],
  ['«будинок на 12» как отдельный объект (R6)', new RegExp(`(будинок|дім|дом)\\s+на\\s+12`, 'i')],
  ['«Барн Хаус», «Барнхаус» (пишем «Барн-хаус»)', /Барн\s?Хаус|Барнхаус/],
  ['«TUR HOUSE» капсом', /TUR HOUSE/],
  ['длинное или среднее тире', /[–—]/],
  ['эмодзи (C7)', /\p{Emoji_Presentation}|️|‍/u],
];
// «година» в любой форме допустима только в тарифе бани («першу годину», «наступна година») и в «Години роботи»
const HOURS_WORD = new RegExp(`[${CYR}]*годин[${CYR}]*`, 'gi');
const HOURS_OK = [/першу годину/i, /наступну годину/i, /наступна година/i, /^година$/i, /години роботи/i, /грн\s+за годину/i, /вання 2 години/i];

// ---------- сборка всех строк страницы ----------
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets' && e.name !== 'dev') walk(p); }
    else if (e.name === 'index.html' || (dir === siteDir && e.name === '404.html')) pages.push(p);
  }
})(siteDir);
const urlOf = (file) => {
  const rel = path.relative(siteDir, file).split(path.sep).join('/');
  return rel === 'index.html' ? '/' : rel === '404.html' ? '/404.html' : `/${rel.replace(/index\.html$/, '')}`;
};
const strings = (node, out = []) => {
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node));
  else if (Array.isArray(node)) node.forEach((x) => strings(x, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((x) => strings(x, out));
  return out;
};

let scanned = 0;
for (const file of pages) {
  const url = urlOf(file);
  const html = fs.readFileSync(file, 'utf8');
  const doc = parse(html);
  const texts = [];
  // JSON-LD целиком (строки и числа), до удаления скриптов
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { texts.push(JSON.stringify(JSON.parse(s.text))); } catch { fail(url, 'JSON-LD не парсится'); }
  }
  for (const m of doc.querySelectorAll('meta[content]')) texts.push(m.getAttribute('content'));
  doc.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
  for (const el of doc.querySelectorAll('[alt], [aria-label], [title], [data-title]')) for (const a of ['alt', 'aria-label', 'title', 'data-title']) if (el.getAttribute(a)) texts.push(el.getAttribute(a));
  texts.push(doc.querySelector('title')?.text || '');
  texts.push(doc.querySelector('body')?.text || '');
  for (const t of texts) {
    const norm = t.replace(/\s+/g, ' ');
    // Макс 05.10.2026: про Десну можна писати «кілька хвилин пішки» (єдиний виняток із C9, без цифр)
    // Макс 05.10.2026: фраза живого лендингу «За кілька хвилин їзди знаходиться парк природи «Беремицьке»» і відповідь FAQ про Барн-хаус «будинок на 12 осіб: 13 000 грн/доба» (один будинок, два тарифи)
    const c9clean = norm.replace(/кілька хвилин пішки/gi, 'кілька…').replace(/кілька хвилин їзди знаходиться парк природи/g, 'кілька… знаходиться парк природи').replace(/будинок на 12 осіб: 13[\s\u00a0]?000 грн\/доба/g, 'на 12 осіб…');
    for (const [name, re] of FORBIDDEN) {
      const m = c9clean.match(re);
      if (m) fail(url, `${name}: «${c9clean.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25)}»`);
    }
    for (const m of norm.matchAll(HOURS_WORD)) {
      const ctx = norm.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12);
      if (!HOURS_OK.some((re) => re.test(ctx) || re.test(m[0]))) fail(url, `слово «${m[0]}» допустимо только в тарифе бани и в «Години роботи»: «${ctx}»`);
    }
  }
  scanned++;
}

// ---------- шаблоны и данные: цены не зашиты в шаблон, href="/..." только через | url ----------
const tpl = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.njk')) tpl.push(p);
  }
})(path.join(root, 'src'));
for (const f of tpl) {
  const rel = path.relative(root, f);
  const raw = fs.readFileSync(f, 'utf8');
  const bare = raw.replace(/\{#[\s\S]*?#\}/g, '').replace(/\{\{[\s\S]*?\}\}/g, '{{}}').replace(/\{%[\s\S]*?%\}/g, '{%%}');
  for (const m of bare.matchAll(new RegExp(`\\d[\\d${NB}]*(?:&nbsp;)?\\s*(?:&nbsp;)?грн`, 'g'))) fail(rel, `цена зашита в шаблон: «${m[0]}» (цены только из src/_data)`);
  // href/src/action="/..." без {{ }} и не якорь: нужен фильтр | url
  for (const m of raw.matchAll(/\b(href|src|action)="(\/[^"{]*)"/g)) fail(rel, `${m[1]}="${m[2]}" без фильтра | url (ТЗ п.5)`);
  for (const m of raw.matchAll(/\b(href|src|action)="\{\{\s*(['"][^'"]*['"]|[^}|]*?)\s*\}\}"/g)) {
    // {{ x }} без | url допустим для внешних ссылок и данных (site.links..., promo.cta.url), но не для литерала '/...'
    if (/^['"]\//.test(m[2])) fail(rel, `${m[1]}="{{ ${m[2]} }}" путь к странице без фильтра | url`);
  }
}

if (errors.length) {
  console.error(`check-content (${mode}): нарушений ${errors.length}`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  ... и ещё ${errors.length - 60}`);
  process.exit(1);
}
console.log(`check-content (${mode}): OK, страниц ${scanned}, шаблонов ${tpl.length}, правил ${FORBIDDEN.length + 3}`);
