// Картинки собранного сайта (E4-T15): паспорт кадров (photos.json) совпадает с тем, как кадры реально стоят на страницах.
// Проверяет: у каждого <img> есть width, height и осмысленный alt (из паспорта, не пустой, по-украински, не имя файла); кадр стоит только на тех
// страницах, что записаны в uses; кадры с пометкой verify не показаны там, где их нет в uses. Сообщает (не падает): кадры без места, кадры TEMP,
// кадры с людьми. С флагом --report печатает таблицу использования в формате Markdown (для PHOTO_INVENTORY.md).
// Использование: node scripts/check-images.mjs preview|production [--report]   (спершу зберіть сайт)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith('--')) || 'preview';
const report = args.includes('--report');
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(root, 'src/_data', n), 'utf8'));
const photos = readJson('photos.json');
const promo = readJson('promo.json');
const errors = [];
const fail = (where, m) => errors.push(`${where}: ${m}`);

// адреса сторінки -> ім'я в uses паспорта
const SLUG = { '/': 'home', '/nomery/': 'nomery', '/kotedzhi/': 'kotedzhi', '/barn-house/': 'barn-house', '/banya-ta-spa/': 'banya', '/kafe/': 'kafe', '/okolitsi/': 'okolitsi', '/yak-distatysya/': 'yak-distatysya', '/kontakty/': 'kontakty' };
const PROMO_PAGES = new Set(['/', '/nomery/', '/kotedzhi/']); // тут стоїть банер акції, афіша акції показується на всіх трьох

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
const idOf = (src) => {
  const m = path.basename(src || '').match(/^(.+)-[A-Za-z0-9_-]{10}-\d+\.[a-z]+$/);
  const e = m && Object.entries(photos).find(([, v]) => path.basename(v.file, path.extname(v.file)) === m[1]);
  return e ? e[0] : null;
};

// паспорт: alt осмысленный
for (const [id, p] of Object.entries(photos)) {
  const alt = p.alt || '';
  if (alt.length < 15) fail(`photos.json ${id}`, `alt «${alt}» занадто короткий (менше 15 знаків)`);
  if (!/[А-Яа-яІіЇїЄєҐґ]/.test(alt)) fail(`photos.json ${id}`, `alt «${alt}» має бути українською`);
  if (/\.(jpe?g|png|webp|avif)\b|^(фото|картинка|зображення|image|img)\b|\bIMG_|photo_\d/i.test(alt)) fail(`photos.json ${id}`, `alt «${alt}» схожий на ім'я файлу або порожню формулу`);
  if (!p.uses || !p.uses.length) fail(`photos.json ${id}`, 'у паспорта немає uses (на яких сторінках кадр)');
}

const usage = new Map(); // id -> Set(url)
for (const file of pages) {
  const url = urlOf(file);
  const doc = parse(fs.readFileSync(file, 'utf8'));
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (src.includes('/assets/img/static/')) continue;
    if (!img.getAttribute('width') || !img.getAttribute('height') || !(Number(img.getAttribute('width')) > 0) || !(Number(img.getAttribute('height')) > 0)) fail(url, `<img ${path.basename(src)}> без width і height`);
    const id = idOf(src);
    if (!id) { fail(url, `<img ${path.basename(src)}> немає в паспорті`); continue; }
    if (!img.getAttribute('alt')) fail(url, `<img ${id}> без alt`);
    if (!usage.has(id)) usage.set(id, new Set());
    usage.get(id).add(url);
  }
}

for (const [id, urls] of usage) {
  const p = photos[id];
  for (const url of urls) {
    const slug = SLUG[url];
    const allowed = new Set(p.uses || []);
    const okPromo = id === promo.image && PROMO_PAGES.has(url);
    if (!okPromo && !(slug && allowed.has(slug))) fail(`${url}`, `кадр ${id} стоїть на цій сторінці, а в паспорті uses ${JSON.stringify(p.uses)}`);
  }
  if (p.verify) {
    // кадр з пометкою verify має бути лише на сторінках, де це дозволено правилом check-data (галерея номерів) або де його нема в uses
    const bad = [...urls].filter((u) => !(SLUG[u] && (p.uses || []).includes(SLUG[u])));
    for (const u of bad) fail(u, `кадр ${id} позначений verify і не має бути на цій сторінці`);
  }
}

const unused = Object.keys(photos).filter((id) => !usage.has(id));
const temp = Object.entries(photos).filter(([id, p]) => p.tempFor && usage.has(id));
const verify = Object.entries(photos).filter(([id, p]) => p.verify && usage.has(id));
const people = Object.entries(photos).filter(([id, p]) => p.people && usage.has(id));

if (report) {
  console.log('| Кадр | Файл | Страницы | Отметки |');
  console.log('|---|---|---|---|');
  for (const [id, p] of Object.entries(photos)) {
    const pg = usage.has(id) ? [...usage.get(id)].join(', ') : '(нет на страницах)';
    const flags = [p.tempFor ? `TEMP для ${p.tempFor.join(', ')}` : '', p.verify ? 'verify' : '', p.people ? 'люди' : ''].filter(Boolean).join('; ');
    console.log(`| \`${id}\` | \`${p.source}\` | ${pg} | ${flags || ''} |`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (errors.length) {
  console.error(`check-images (${mode}): порушень ${errors.length}`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-images (${mode}): OK, кадрів на сторінках ${usage.size} з ${Object.keys(photos).length}`);
console.log(`  TEMP: ${temp.map(([id]) => id).join(', ') || 'нема'}`);
console.log(`  verify (на сторінках): ${verify.map(([id]) => id).join(', ') || 'нема'}`);
console.log(`  з людьми: ${people.map(([id]) => id).join(', ') || 'нема'}`);
console.log(`  без місця на сторінках: ${unused.join(', ') || 'нема'}`);
