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

    // FAQPage: тільки на головній, питання і відповіді дослівно з faq.json (правило T2: розмітка = видимий текст), без HTML у відповідях
    const faqNode = graph.find((n) => n['@type'] === 'FAQPage');
    if (name === 'index.html' && !faqNode) fail(`${name}: на головній має бути FAQPage`);
    if (name !== 'index.html' && faqNode) fail(`${name}: FAQPage є лише на головній (питання тільки з faq.json)`);
    if (faqNode) {
      const expected = JSON.parse(fs.readFileSync(new URL('../src/_data/faq.json', import.meta.url), 'utf8'));
      const ents = faqNode.mainEntity || [];
      if (ents.length !== expected.length) fail(`${name}: у FAQPage ${ents.length} питань, у faq.json ${expected.length}`);
      expected.forEach((q, i) => {
        const e = ents[i];
        if (!e || e['@type'] !== 'Question') return fail(`${name}: FAQPage[${i}] не Question`);
        if (e.name !== q.q) fail(`${name}: FAQPage[${i}].name не збігається з faq.json (${q.id})`);
        const a = e.acceptedAnswer || {};
        if (a['@type'] !== 'Answer' || !a.text) fail(`${name}: FAQPage[${i}] без acceptedAnswer.text`);
        else if (a.text !== q.a) fail(`${name}: FAQPage[${i}].acceptedAnswer.text не збігається з faq.json (${q.id})`);
        else if (/<[a-z][^>]*>/i.test(a.text)) fail(`${name}: у відповіді FAQPage[${i}] є HTML`);
      });
    }

    // ItemList об'єктів (номери: HotelRoom). Дані з rooms.json: назва, місткість, ціна за добу, валюта UAH; ціни акції в розмітку не йдуть (R9)
    const listNode = graph.find((n) => n['@type'] === 'ItemList');
    const LIST_RULES = {
      'nomery/index.html': { file: 'rooms.json', type: 'HotelRoom', base: '/nomery/#' },
      'kotedzhi/index.html': { file: 'cottages.json', type: 'VacationRental', base: '/kotedzhi/#', amenities: true },
    };
    const rule = LIST_RULES[name];
    if (rule && !listNode) fail(`${name}: має бути ItemList (${rule.type})`);
    if (!rule && listNode) fail(`${name}: ItemList не передбачений для цієї сторінки`);
    if (rule && listNode) {
      const expected = JSON.parse(fs.readFileSync(new URL(`../src/_data/${rule.file}`, import.meta.url), 'utf8'));
      const els = listNode.itemListElement || [];
      if (listNode.numberOfItems !== expected.length || els.length !== expected.length) fail(`${name}: у ItemList ${els.length} елементів, у ${rule.file} ${expected.length}`);
      expected.forEach((x, i) => {
        const el = els[i];
        if (!el || el.position !== i + 1) return fail(`${name}: ItemList[${i}] без правильної position`);
        const it = el.item || {};
        if (it['@type'] !== rule.type) fail(`${name}: ItemList[${i}].item не ${rule.type}`);
        if (it.name !== x.title) fail(`${name}: ItemList[${i}].name не збігається з ${rule.file} (${x.id})`);
        if (it['@id'] !== `${ORIGIN}${rule.base}${x.id}`) fail(`${name}: ItemList[${i}]['@id'] ${it['@id']} не ${ORIGIN}${rule.base}${x.id}`);
        const guests = Number(String(x.capacity).match(/\d+/)[0]);
        const occKey = /^до\s/i.test(x.capacity) ? 'maxValue' : 'value';
        if (!it.occupancy || it.occupancy[occKey] !== guests) fail(`${name}: ItemList[${i}].occupancy.${occKey} має бути ${guests}`);
        if (rule.amenities) {
          const got = (it.amenityFeature || []).map((a) => a.name);
          if (JSON.stringify(got) !== JSON.stringify(x.features)) fail(`${name}: ItemList[${i}].amenityFeature має збігатися з features у ${rule.file}`);
          if ((it.amenityFeature || []).some((a) => a['@type'] !== 'LocationFeatureSpecification' || a.value !== true)) fail(`${name}: ItemList[${i}].amenityFeature: LocationFeatureSpecification з value true`);
        }
        const o = it.offers || {};
        if (o['@type'] !== 'Offer' || o.priceCurrency !== 'UAH') fail(`${name}: ItemList[${i}].offers має бути Offer з priceCurrency UAH`);
        if (o.price !== x.price) fail(`${name}: ItemList[${i}].offers.price ${o.price} не збігається з ${rule.file} (${x.price})`);
        if (x.promoPrice && JSON.stringify(it).includes(String(x.promoPrice))) fail(`${name}: ціна акції ${x.promoPrice} не має бути в розмітці (R9)`);
      });
    }

    // Барн-хаус (R6): один будинок -> один VacationRental з двома Offer (по одному на тариф з barn.json), ціни без акції, ItemList немає
    const rentals = graph.filter((n) => n['@type'] === 'VacationRental');
    if (name === 'barn-house/index.html') {
      const barn = JSON.parse(fs.readFileSync(new URL('../src/_data/barn.json', import.meta.url), 'utf8'));
      const guestsOf = (label) => Number(String(label).match(/\d+/)[0]);
      if (rentals.length !== 1) fail(`${name}: має бути один VacationRental (один будинок, R6), є ${rentals.length}`);
      else {
        const v = rentals[0];
        if (v['@id'] !== `${ORIGIN}/barn-house/#${barn.id}`) fail(`${name}: VacationRental['@id'] ${v['@id']} не ${ORIGIN}/barn-house/#${barn.id}`);
        if (v.name !== barn.title) fail(`${name}: VacationRental.name не збігається з barn.json`);
        const maxGuests = Math.max(...barn.tariffs.map((t) => guestsOf(t.label)));
        if (!v.occupancy || v.occupancy.maxValue !== maxGuests) fail(`${name}: VacationRental.occupancy.maxValue має бути ${maxGuests}`);
        const got = (v.amenityFeature || []).map((a) => a.name);
        if (JSON.stringify(got) !== JSON.stringify(barn.features)) fail(`${name}: VacationRental.amenityFeature має збігатися з features у barn.json`);
        if ((v.amenityFeature || []).some((a) => a['@type'] !== 'LocationFeatureSpecification' || a.value !== true)) fail(`${name}: VacationRental.amenityFeature: LocationFeatureSpecification з value true`);
        // лише відомі поля: жодних lowPrice, highPrice, priceSpecification з невідомою ціною (знижки на Барн-хаус не підтверджені)
        const okKeys = new Set(['@type', '@id', 'url', 'name', 'description', 'occupancy', 'containedInPlace', 'amenityFeature', 'offers']);
        for (const k of Object.keys(v)) if (!okKeys.has(k)) fail(`${name}: у VacationRental невідоме поле «${k}»`);
        const offers = Array.isArray(v.offers) ? v.offers : [];
        if (offers.length !== barn.tariffs.length) fail(`${name}: у VacationRental ${offers.length} Offer, у barn.json ${barn.tariffs.length} тарифи`);
        barn.tariffs.forEach((t, i) => {
          const o = offers[i] || {};
          if (o['@type'] !== 'Offer' || o.priceCurrency !== 'UAH') fail(`${name}: Offer[${i}] має бути Offer з priceCurrency UAH`);
          if (o.price !== t.amount) fail(`${name}: Offer[${i}].price ${o.price} не збігається з barn.json (${t.amount})`);
          if (!String(o.name || '').includes(t.label)) fail(`${name}: Offer[${i}].name без підпису тарифу «${t.label}»`);
          if (!o.eligibleQuantity || o.eligibleQuantity.maxValue !== guestsOf(t.label)) fail(`${name}: Offer[${i}].eligibleQuantity.maxValue має бути ${guestsOf(t.label)}`);
          const okOffer = new Set(['@type', 'name', 'price', 'priceCurrency', 'eligibleQuantity', 'url']);
          for (const k of Object.keys(o)) if (!okOffer.has(k)) fail(`${name}: в Offer[${i}] невідоме поле «${k}» (lowPrice і подібні заборонені: знижки на Барн-хаус не підтверджені)`);
        });
      }
    } else if (rentals.length) fail(`${name}: окремий VacationRental лише на /barn-house/ (у списках номерів і котеджів вони всередині ItemList)`);

    // Баня та спа: DaySpa + Service з двома цінами за годину (spa.json): 600 перша година з особи, 200 кожна наступна; інших цін немає
    const daySpa = graph.filter((n) => n['@type'] === 'DaySpa');
    const services = graph.filter((n) => n['@type'] === 'Service');
    if (name === 'banya-ta-spa/index.html') {
      const spa = JSON.parse(fs.readFileSync(new URL('../src/_data/spa.json', import.meta.url), 'utf8'));
      if (daySpa.length !== 1 || services.length !== 1) fail(`${name}: має бути один DaySpa і один Service, є ${daySpa.length} і ${services.length}`);
      else {
        const [d] = daySpa;
        const [sv] = services;
        if (d['@id'] !== `${ORIGIN}/banya-ta-spa/#spa`) fail(`${name}: DaySpa['@id'] ${d['@id']}`);
        for (const k of ['name', 'url', 'telephone', 'address']) if (!d[k]) fail(`${name}: DaySpa без ${k}`);
        if (d.url && !d.url.startsWith(ORIGIN)) fail(`${name}: DaySpa.url не на ${ORIGIN}`);
        if (JSON.stringify((d.amenityFeature || []).map((a) => a.name)) !== JSON.stringify(spa.complex)) fail(`${name}: DaySpa.amenityFeature має збігатися зі складом комплексу spa.json`);
        if ((d.amenityFeature || []).some((a) => a['@type'] !== 'LocationFeatureSpecification' || a.value !== true)) fail(`${name}: DaySpa.amenityFeature: LocationFeatureSpecification з value true`);
        for (const k of Object.keys(d)) if (!['@type', '@id', 'name', 'description', 'url', 'telephone', 'address', 'parentOrganization', 'amenityFeature', 'makesOffer'].includes(k)) fail(`${name}: у DaySpa невідоме поле «${k}» (годин роботи в джерелах немає: openingHours, priceRange не пишемо)`);
        if (!sv['@id'] || sv['@id'] !== `${ORIGIN}/banya-ta-spa/#service`) fail(`${name}: Service['@id'] ${sv['@id']}`);
        if (!sv.provider || sv.provider['@id'] !== d['@id']) fail(`${name}: Service.provider має вести на DaySpa`);
        if (!d.makesOffer || d.makesOffer['@id'] !== sv['@id']) fail(`${name}: DaySpa.makesOffer має вести на Service`);
        for (const k of Object.keys(sv)) if (!['@type', '@id', 'name', 'serviceType', 'provider', 'url', 'offers'].includes(k)) fail(`${name}: у Service невідоме поле «${k}»`);
        const o = sv.offers || {};
        if (o['@type'] !== 'Offer' || o.priceCurrency !== 'UAH') fail(`${name}: Service.offers має бути Offer з priceCurrency UAH`);
        const specs = Array.isArray(o.priceSpecification) ? o.priceSpecification : [];
        const want = [[spa.price.first, spa.price.firstLabel], [spa.price.next, spa.price.nextLabel]];
        if (specs.length !== 2) fail(`${name}: у Service.offers.priceSpecification ${specs.length} цін, має бути 2`);
        want.forEach(([amount, label], i) => {
          const sp = specs[i] || {};
          if (sp['@type'] !== 'UnitPriceSpecification' || sp.priceCurrency !== 'UAH') fail(`${name}: priceSpecification[${i}] має бути UnitPriceSpecification з UAH`);
          if (sp.price !== amount) fail(`${name}: priceSpecification[${i}].price ${sp.price} не збігається зі spa.json (${amount})`);
          if (!String(sp.name || '').toLowerCase().includes(label.toLowerCase()) || !String(sp.name || '').includes(spa.price.per)) fail(`${name}: priceSpecification[${i}].name має містити «${label}» і «${spa.price.per}»`);
          if (sp.unitText !== 'година') fail(`${name}: priceSpecification[${i}].unitText має бути «година»`);
          for (const k of Object.keys(sp)) if (!['@type', 'name', 'price', 'priceCurrency', 'unitText'].includes(k)) fail(`${name}: у priceSpecification[${i}] невідоме поле «${k}»`);
        });
        for (const k of Object.keys(o)) if (!['@type', 'priceCurrency', 'priceSpecification', 'url'].includes(k)) fail(`${name}: у Service.offers невідоме поле «${k}» (ціни чана і банщика в джерелах немає)`);
      }
    } else if (daySpa.length || services.length) fail(`${name}: DaySpa і Service лише на /banya-ta-spa/`);

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
