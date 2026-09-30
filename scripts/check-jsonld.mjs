// Перевірка JSON-LD у зібраному сайті (ТЗ §11 п.10, 11, 27).
// Використання: node scripts/check-jsonld.mjs preview|production [каталог, за замовчуванням _site]
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const dir = path.resolve(process.argv[3] || '_site');
if (mode !== 'preview' && mode !== 'production') {
  console.error('Використання: node scripts/check-jsonld.mjs preview|production [каталог]');
  process.exit(2);
}

const errors = [];
const fail = (m) => errors.push(m);
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(d, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
const htmlFiles = walk(dir).filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(dir, f).split(path.sep).join('/');

const BANNED = new Set(['aggregateRating', 'reviewCount', 'ratingValue', 'ratingCount', 'bestRating', 'worstRating']);
const ORIGIN = mode === 'production' ? 'https://turhouse.com.ua' : 'https://ofmalien.github.io/turhouse-multipage-preview';
const isAbs = (u) => typeof u === 'string' && /^https:\/\//.test(u);

function scanBanned(node, where) {
  if (Array.isArray(node)) return node.forEach((n) => scanBanned(n, where));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (BANNED.has(k)) fail(`${where}: у розмітці є ${k} (заборонено ТЗ §7.2)`);
      scanBanned(v, where);
    }
  }
}

let blocks = 0;
for (const f of htmlFiles) {
  const name = rel(f);
  const html = fs.readFileSync(f, 'utf8');
  const found = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const skip = name === '404.html' || name.startsWith('dev/');
  if (!found.length) {
    if (!skip) fail(`${name}: немає JSON-LD`);
    continue;
  }
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  for (const m of found) {
    blocks++;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      fail(`${name}: JSON-LD не парситься: ${e.message}`);
      continue;
    }
    if (data['@context'] !== 'https://schema.org') fail(`${name}: @context не https://schema.org`);
    const graph = data['@graph'];
    if (!Array.isArray(graph) || !graph.length) {
      fail(`${name}: немає @graph`);
      continue;
    }
    scanBanned(data, name);
    for (const node of graph) if (!node['@type']) fail(`${name}: вузол без @type`);

    const lodging = graph.find((n) => n['@type'] === 'LodgingBusiness');
    if (!lodging) fail(`${name}: немає LodgingBusiness`);
    else {
      for (const k of ['name', 'url', 'telephone', 'address', 'priceRange']) if (!lodging[k]) fail(`${name}: LodgingBusiness без ${k}`);
      if (lodging.priceRange && !/^\d+-\d+ UAH$/.test(lodging.priceRange)) fail(`${name}: priceRange "${lodging.priceRange}" не у форматі "2500-13000 UAH"`);
      const a = lodging.address || {};
      for (const k of ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry']) if (!a[k]) fail(`${name}: address без ${k}`);
      if (lodging.geo) {
        const { latitude: la, longitude: lo } = lodging.geo;
        // Грубі межі України: лише щоб зловити переплутані широту й довготу або опечатку.
        if (!(la > 44 && la < 53 && lo > 22 && lo < 41)) fail(`${name}: geo (${la}, ${lo}) поза межами України`);
      }
      for (const k of ['url', 'image', 'hasMap']) if (lodging[k] && !isAbs(lodging[k])) fail(`${name}: LodgingBusiness.${k} не абсолютна адреса`);
      if (lodging.url && !lodging.url.startsWith(ORIGIN)) fail(`${name}: LodgingBusiness.url не на ${ORIGIN}`);
      if (lodging.image && !lodging.image.startsWith(ORIGIN)) fail(`${name}: LodgingBusiness.image не на ${ORIGIN}`);
    }

    const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList');
    if (!crumbs) fail(`${name}: немає BreadcrumbList`);
    else {
      const items = crumbs.itemListElement || [];
      if (!items.length) fail(`${name}: BreadcrumbList порожній`);
      items.forEach((it, i) => {
        if (it.position !== i + 1) fail(`${name}: position ${it.position} замість ${i + 1}`);
        if (!it.name) fail(`${name}: елемент хлібних крихт без name`);
        if (!isAbs(it.item) || !it.item.startsWith(ORIGIN)) fail(`${name}: item "${it.item}" не на ${ORIGIN}`);
      });
      const last = items[items.length - 1];
      if (last && canonical && last.item !== canonical) fail(`${name}: останній пункт крихт ${last.item} не збігається з canonical ${canonical}`);
    }
  }
}

if (errors.length) {
  console.error(`check-jsonld (${mode}): порушень ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-jsonld (${mode}): OK, сторінок ${htmlFiles.length}, блоків JSON-LD ${blocks}`);
