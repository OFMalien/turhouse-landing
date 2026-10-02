// Генерує статичні зображення сайту з оригіналів: обкладинку для соцмереж 1200x630, компактний логотип, значки.
// Використання: node scripts/make-static.mjs   (результат лежить у git: src/assets/img/static/ і src/static/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p) => path.join(root, ...p);
fs.mkdirSync(out('src/assets/img/static'), { recursive: true });
fs.mkdirSync(out('src/static'), { recursive: true });

// Обкладинка 1200x630 (og:image, twitter:image) з кадру hero. TEMP: замінити на брендовану.
await sharp(out('src/assets/img/source/home/hero-chan.jpg'))
  .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(out('src/assets/img/static/og-default.jpg'));

// Обкладинки сторінок 1200x630: з кадру hero кожної сторінки (texts/<сторінка>.json -> hero.photo -> photos.json).
// Головна лишається з og-default.jpg; сторінки без кадру hero (політика, 404) теж. Шаблон підхоплює файл сам (pages.11tydata.js).
const photos = JSON.parse(fs.readFileSync(out('src/_data/photos.json'), 'utf8'));
const pageOg = [];
for (const name of fs.readdirSync(out('src/_data/texts')).filter((f) => f.endsWith('.json'))) {
  const slug = name.replace(/\.json$/, '');
  const photo = JSON.parse(fs.readFileSync(out('src/_data/texts', name), 'utf8')).hero?.photo;
  if (slug === 'home' || !photo) continue;
  const file = `src/assets/img/static/og-${slug}.jpg`;
  await sharp(out('src/assets/img/source', photos[photo].file))
    .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out(file));
  pageOg.push(file);
}

// Логотип у шапці показується 32px, беремо 64px (для екранів 2x) замість 180px.
await sharp(out('img/logo.png')).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 }).toFile(out('src/assets/img/static/logo.png'));

// Значки: apple-touch-icon 180x180 (оригінал logo.png), favicon 32 і 192.
fs.copyFileSync(out('img/logo.png'), out('src/static/apple-touch-icon.png'));
fs.copyFileSync(out('img/favicon-32.png'), out('src/static/favicon-32.png'));
fs.copyFileSync(out('img/favicon-192.png'), out('src/static/favicon-192.png'));

for (const f of [...pageOg, 'src/assets/img/static/og-default.jpg', 'src/assets/img/static/logo.png', 'src/static/apple-touch-icon.png', 'src/static/favicon-32.png', 'src/static/favicon-192.png']) {
  const meta = await sharp(out(f)).metadata();
  console.log(`${f}: ${meta.width}x${meta.height}, ${Math.round(fs.statSync(out(f)).size / 1024)} КБ`);
}
