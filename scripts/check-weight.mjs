// Вес страниц (E5-T7, п.18 ТЗ): оценка того, что загружает мобильный браузер (ширина 412 px, DPR 1.75, как в Lighthouse mobile).
// Считает: HTML и CSS и JS (в gzip, как отдаёт GitHub Pages), картинки: из каждого <picture> берётся AVIF-кандидат, который выбрал бы браузер по srcset и sizes.
// Шрифты Google Fonts грузятся с чужого домена и здесь не считаются (оценка 70-120 КБ, записана в отчёт).
// Правила: любой вариант hero-картинки не тяжелее 250 КБ; вес страницы «до первой прокрутки» и «целиком» не больше 1,2 МБ (1 258 291 байт).
// Использование: node scripts/check-weight.mjs preview|production [--table]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'preview';
const table = args.includes('--table');
const prefix = mode === 'preview' ? '/turhouse-multipage-preview' : '';
const VIEWPORT = 412;
const DPR = 1.75;
const HERO_MAX = 250 * 1024;
const PAGE_MAX = 1.2 * 1024 * 1024;
const errors = [];
const fail = (page, m) => errors.push(`${page}: ${m}`);
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const local = (u) => path.join(siteDir, decodeURIComponent(u.replace(new RegExp(`^${prefix}`), '')));

// ширина слота картинки при viewport 412 из атрибута sizes
function slotWidth(sizes) {
  const parts = (sizes || '100vw').split(',').map((x) => x.trim());
  for (const part of parts) {
    const m = part.match(/^(?:\(min-width:\s*(\d+)px\)\s+)?([\d.]+)(px|vw)$/);
    if (!m) continue;
    if (m[1] && VIEWPORT < Number(m[1])) continue;
    return m[3] === 'vw' ? (Number(m[2]) * VIEWPORT) / 100 : Number(m[2]);
  }
  return VIEWPORT;
}
function pick(srcset, need) {
  const items = srcset.split(',').map((x) => x.trim().split(/\s+/)).map(([u, w]) => ({ u, w: Number(String(w).replace('w', '')) })).sort((a, b) => a.w - b.w);
  return items.find((i) => i.w >= need) || items[items.length - 1];
}

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

const rows = [];
for (const file of pages) {
  const url = urlOf(file);
  const raw = fs.readFileSync(file);
  const doc = parse(raw.toString('utf8'));
  const htmlGz = gz(raw);
  let cssGz = 0;
  let jsGz = 0;
  for (const l of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const h = (l.getAttribute('href') || '').split('?')[0];
    if (h.startsWith(prefix + '/assets/')) cssGz += gz(fs.readFileSync(local(h)));
  }
  for (const s of doc.querySelectorAll('script[src]')) {
    const h = s.getAttribute('src');
    if (h.startsWith(prefix + '/assets/')) jsGz += gz(fs.readFileSync(local(h)));
  }
  let eager = 0;
  let lazy = 0;
  let heroBytes = 0;
  let heroMax = 0;
  const hero = doc.querySelector('.page-hero img, .hero img');
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src.includes('/assets/img/') || src.includes('/static/')) { if (src.includes('/static/')) { const b = fs.statSync(local(src)).size; (img.getAttribute('loading') === 'lazy' ? (lazy += b) : (eager += b)); } continue; }
    const pic = img.parentNode?.tagName?.toLowerCase() === 'picture' ? img.parentNode : null;
    const avif = pic?.querySelector('source[type="image/avif"]');
    const srcset = avif?.getAttribute('srcset') || img.getAttribute('srcset');
    const need = slotWidth(img.getAttribute('sizes')) * DPR;
    const cand = pick(srcset, need);
    const bytes = fs.statSync(local(cand.u)).size;
    if (img.getAttribute('loading') === 'lazy') lazy += bytes; else eager += bytes;
    if (img === hero) {
      heroBytes = bytes;
      // все варианты hero во всех форматах
      const all = [...(pic?.querySelectorAll('source') || []), img].flatMap((n) => (n.getAttribute('srcset') || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean));
      for (const u of all) heroMax = Math.max(heroMax, fs.statSync(local(u)).size);
    }
  }
  const first = htmlGz + cssGz + jsGz + eager;
  const full = first + lazy;
  rows.push({ url, htmlGz, cssGz, jsGz, eager, lazy, first, full, heroBytes, heroMax });
  if (heroMax > HERO_MAX) fail(url, `вариант hero-картинки ${Math.round(heroMax / 1024)} КБ тяжелее 250 КБ`);
  if (first > PAGE_MAX) fail(url, `вес до первой прокрутки ${Math.round(first / 1024)} КБ больше 1,2 МБ`);
  if (full > PAGE_MAX) fail(url, `вес страницы целиком ${Math.round(full / 1024)} КБ больше 1,2 МБ`);
}

const kb = (n) => `${Math.round(n / 1024)} КБ`;
if (table) {
  console.log('| Страница | HTML gz | CSS gz | JS gz | Картинки сразу | Картинки при прокрутке | До первой прокрутки | Целиком | Hero (выбранный / самый тяжёлый вариант) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.url} | ${kb(r.htmlGz)} | ${kb(r.cssGz)} | ${kb(r.jsGz)} | ${kb(r.eager)} | ${kb(r.lazy)} | ${kb(r.first)} | ${kb(r.full)} | ${r.heroBytes ? `${kb(r.heroBytes)} / ${kb(r.heroMax)}` : 'нет'} |`);
}
if (errors.length) {
  console.error(`check-weight (${mode}): нарушений ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const maxFull = rows.reduce((a, b) => (b.full > a.full ? b : a));
const maxHero = Math.max(...rows.map((r) => r.heroMax));
console.log(`check-weight (${mode}): OK, самая тяжёлая страница ${maxFull.url} ${kb(maxFull.full)} целиком (лимит 1,2 МБ), самый тяжёлый вариант hero ${kb(maxHero)} (лимит 250 КБ)`);
