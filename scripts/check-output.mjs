// Перевірка зібраного сайту перед публікацією.
// Використання: node scripts/check-output.mjs preview|production [каталог, за замовчуванням _site]
// Код виходу 0 - все гаразд, 1 - є порушення (список у виводі).
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const dir = path.resolve(process.argv[3] || '_site');

if (mode !== 'preview' && mode !== 'production') {
  console.error('Використання: node scripts/check-output.mjs preview|production [каталог]');
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`Каталог не знайдено: ${dir}`);
  process.exit(2);
}

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dir);
const rel = (f) => path.relative(dir, f).split(path.sep).join('/');

// 1. Тільки файли сайту: дозволені розширення (і службові .nojekyll, CNAME).
const ALLOWED_EXT = new Set([
  '.html', '.css', '.js', '.json', '.xml', '.txt', '.webmanifest',
  '.ico', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.woff', '.woff2',
]);
const ALLOWED_NAMES = new Set(['.nojekyll', 'CNAME']);
// 2. Заборонені імена: внутрішні документи, відео, секрети, службові каталоги.
const FORBIDDEN = /(^|\/)(\.git|node_modules|\.env|\.DS_Store)(\/|$)|\.(md|mov|mp4|local|log|zip)$|(^|\/)(loop_|handoff_|analytics_audit|photo_inventory|facts_sources|tz_eleventy|plan_site)/i;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

for (const f of files) {
  const r = rel(f);
  const name = path.basename(f);
  const ext = path.extname(f).toLowerCase();
  if (FORBIDDEN.test(r)) fail(`Заборонений файл у збірці: ${r}`);
  if (!ALLOWED_NAMES.has(name) && !ALLOWED_EXT.has(ext)) fail(`Недозволений тип файлу: ${r}`);
  if (fs.statSync(f).size > MAX_FILE_BYTES) fail(`Файл більше 3 МБ: ${r}`);
}

// 3. CNAME і robots.
const cnamePath = path.join(dir, 'CNAME');
const robotsPath = path.join(dir, 'robots.txt');
const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : null;
if (robots === null) fail('Немає robots.txt');

const textFiles = files.filter((f) => /\.(html|xml|txt|json|webmanifest|css|js)$/i.test(f));
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const read = (f) => fs.readFileSync(f, 'utf8');

if (mode === 'preview') {
  if (fs.existsSync(cnamePath)) fail('У превью є файл CNAME (його там не має бути ніколи)');
  if (robots !== null && !/^Disallow:\s*\/\s*$/m.test(robots)) fail('robots.txt превью без "Disallow: /"');
  for (const f of htmlFiles) {
    if (!/<meta name="robots" content="noindex">/.test(read(f))) fail(`Немає <meta robots noindex>: ${rel(f)}`);
  }
  for (const f of htmlFiles) {
    const h = read(f);
    if (/googletagmanager\.com|connect\.facebook\.net|fbevents\.js/.test(h)) fail(`У превью підключена аналітика: ${rel(f)}`);
  }
} else {
  if (!fs.existsSync(cnamePath)) fail('У бойовій збірці немає CNAME');
  else if (read(cnamePath).trim() !== 'turhouse.com.ua') fail(`CNAME має вміст "${read(cnamePath).trim()}", очікується turhouse.com.ua`);
  if (robots !== null) {
    if (/^Disallow:\s*\/\s*$/m.test(robots)) fail('robots.txt бойової збірки закриває сайт (Disallow: /)');
    if (!/^Sitemap:\s*https:\/\/turhouse\.com\.ua\/sitemap\.xml/m.test(robots)) fail('robots.txt без Sitemap на turhouse.com.ua');
  }
  for (const f of htmlFiles) {
    // Сторінка 404 закрита від індексації в будь-якій збірці, це не помилка.
    if (rel(f) === '404.html') continue;
    if (/<meta name="robots" content="[^"]*noindex/.test(read(f))) fail(`У бойовій збірці є noindex: ${rel(f)}`);
  }
  for (const f of textFiles) {
    const t = read(f);
    if (/localhost|127\.0\.0\.1|ofmalien\.github\.io|turhouse-multipage-preview/.test(t)) fail(`Адреса розробки або превью у бойовій збірці: ${rel(f)}`);
  }
}

if (errors.length) {
  console.error(`check-output (${mode}): знайдено порушень: ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-output (${mode}): OK, файлів: ${files.length}, html: ${htmlFiles.length}`);
