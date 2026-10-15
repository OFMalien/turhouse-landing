// Фото сайту: копіювання відібраних кадрів за паспортом src/_data/photos.json і перевірка бюджету (ТЗ §8.2).
// Використання:
//   node scripts/photos.mjs copy --from "<папка клієнта>"   копіює кадри в src/assets/img/source/
//   node scripts/photos.mjs check                          перевіряє паспорт, файли та бюджет
// Джерела у паспорті: "img/..." береться з каталогу img/ цього репозиторію, "photo/..." з <папка клієнта>/photo/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(root, 'src/assets/img/source');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/_data/photos.json'), 'utf8'));

const BUDGET = {
  maxFiles: 70,
  maxFileBytes: 400 * 1024,
  maxTotalBytes: 15 * 1024 * 1024,
  maxLongSide: 1920,
  heroMaxBytes: 250 * 1024,
};
const HERO_IDS = new Set(['home/hero-chan']);

const cmd = process.argv[2];
const fromIdx = process.argv.indexOf('--from');
const from = fromIdx > -1 ? path.resolve(process.argv[fromIdx + 1]) : null;

function walk(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

function copy() {
  if (!from) {
    console.error('Вкажіть --from "<папка клієнта>"');
    process.exit(2);
  }
  let n = 0;
  for (const [id, p] of Object.entries(manifest)) {
    const src = p.source.startsWith('img/') ? path.join(root, p.source) : path.join(from, p.source);
    if (!fs.existsSync(src)) {
      console.error(`Немає джерела для ${id}: ${src}`);
      process.exit(1);
    }
    const dst = path.join(SOURCE_DIR, p.file);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    n++;
  }
  console.log(`Скопійовано файлів: ${n}`);
}

async function check() {
  const errors = [];
  const fail = (m) => errors.push(m);
  const ids = Object.keys(manifest);
  const onDisk = walk(SOURCE_DIR).map((f) => path.relative(SOURCE_DIR, f).split(path.sep).join('/'));
  const manifestFiles = new Set(ids.map((id) => manifest[id].file));

  for (const f of onDisk) if (!manifestFiles.has(f)) fail(`Файл без запису в photos.json: ${f}`);

  let total = 0;
  let biggest = { f: '', b: 0 };
  let maxSide = 0;
  for (const id of ids) {
    const p = manifest[id];
    if (!p.alt || typeof p.alt !== 'string') fail(`${id}: порожній alt`);
    if (p.alt && /\d+\s*(км|км\.|хвилин|годин)/i.test(p.alt)) fail(`${id}: у alt відстань або час у дорозі (C9)`);
    if (p.alt && /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(p.alt)) fail(`${id}: у alt емодзі (C7)`);
    if (p.alt && p.alt.length > 140) fail(`${id}: alt довший за 140 символів`);
    if (p.id !== undefined) fail(`${id}: зайве поле id`);
    const full = path.join(SOURCE_DIR, p.file);
    if (!fs.existsSync(full)) {
      fail(`${id}: немає файлу ${p.file}`);
      continue;
    }
    const bytes = fs.statSync(full).size;
    total += bytes;
    if (bytes > biggest.b) biggest = { f: p.file, b: bytes };
    if (bytes > BUDGET.maxFileBytes) fail(`${id}: ${Math.round(bytes / 1024)} КБ, більше 400 КБ`);
    if (HERO_IDS.has(id) && bytes > BUDGET.heroMaxBytes) fail(`${id}: hero ${Math.round(bytes / 1024)} КБ, більше 250 КБ`);
    const meta = await sharp(full).metadata();
    const side = Math.max(meta.width, meta.height);
    if (side > maxSide) maxSide = side;
    if (side > BUDGET.maxLongSide) fail(`${id}: довга сторона ${side}px, більше 1920`);
  }
  if (onDisk.length > BUDGET.maxFiles) fail(`Файлів ${onDisk.length}, більше ${BUDGET.maxFiles}`);
  if (total > BUDGET.maxTotalBytes) fail(`Сума ${(total / 1048576).toFixed(1)} МБ, більше 15 МБ`);

  const verify = ids.filter((id) => manifest[id].verify);
  const temp = ids.filter((id) => manifest[id].tempFor);
  const people = ids.filter((id) => manifest[id].people);
  console.log(`Кадрів у паспорті: ${ids.length}, файлів у source/: ${onDisk.length}`);
  console.log(`Сума: ${(total / 1048576).toFixed(2)} МБ, найбільший: ${biggest.f} ${Math.round(biggest.b / 1024)} КБ, найдовша сторона: ${maxSide}px`);
  console.log(`Позначено "перевірити": ${verify.length}, TEMP: ${temp.length}, з людьми: ${people.length}`);
  if (errors.length) {
    console.error(`photos check: порушень ${errors.length}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('photos check: OK');
}

if (cmd === 'copy') copy();
else if (cmd === 'check') await check();
else {
  console.error('Використання: node scripts/photos.mjs copy --from "<папка клієнта>" | check');
  process.exit(2);
}
