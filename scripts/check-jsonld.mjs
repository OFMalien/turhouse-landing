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
const readData = (n) => JSON.parse(fs.readFileSync(new URL(`../src/_data/${n}`, import.meta.url), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
  if (found.length !== 1) fail(`${name}: має бути один блок JSON-LD, є ${found.length}`);
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

    // ---- загальні правила розмітки: типи, id, посилання, склад графа ----
    const site = readData('site.json');
    const pageUrl = name === 'index.html' ? '/' : `/${name.replace(/index\.html$/, '')}`;
    const slug = name === 'index.html' ? 'home' : name.replace(/\/index\.html$/, '');
    const textsOf = (s) => readData(`texts/${s}.json`);
    const ALLOWED_TYPES = new Set(['LodgingBusiness', 'PostalAddress', 'GeoCoordinates', 'BreadcrumbList', 'ListItem', 'FAQPage', 'Question', 'Answer', 'ItemList', 'HotelRoom', 'VacationRental', 'QuantitativeValue', 'Offer', 'LocationFeatureSpecification', 'DaySpa', 'Service', 'UnitPriceSpecification', 'CafeOrCoffeeShop', 'Menu', 'MenuSection', 'MenuItem', 'Article', 'TouristAttraction', 'WebPage', 'Place', 'ContactPage', 'WebSite']);
    const defined = [];
    const referenced = [];
    (function walkLd(node) {
      if (Array.isArray(node)) return node.forEach(walkLd);
      if (!node || typeof node !== 'object') return;
      if (node['@type'] !== undefined) {
        if (typeof node['@type'] !== 'string' || !ALLOWED_TYPES.has(node['@type'])) fail(`${name}: невідомий @type «${JSON.stringify(node['@type'])}» (опечатка?)`);
        if (node['@id']) defined.push(node['@id']);
      } else if (node['@id'] && Object.keys(node).length === 1) referenced.push(node['@id']);
      for (const v of Object.values(node)) walkLd(v);
    })(graph);
    const dupIds = defined.filter((x, i) => defined.indexOf(x) !== i);
    if (dupIds.length) fail(`${name}: повторні @id: ${[...new Set(dupIds)].join(', ')}`);
    for (const r of referenced) if (!defined.includes(r)) fail(`${name}: посилання на неіснуючий вузол @id ${r}`);
    const EXPECT_TOP = { '/': ['FAQPage'], '/nomery/': ['ItemList'], '/kotedzhi/': ['ItemList'], '/barn-house/': ['VacationRental'], '/banya-ta-spa/': ['DaySpa', 'Service'], '/kafe/': ['CafeOrCoffeeShop'], '/okolitsi/': ['Article', 'TouristAttraction'], '/yak-distatysya/': ['WebPage', 'Place'], '/kontakty/': ['ContactPage'] };
    // Внутрішні сторінки з блоком «Питання та відповіді» (texts/<сторінка>.json -> faq.items) мають ще FAQPage з тими самими питаннями
    const pageFaqItems = slug !== 'home' && fs.existsSync(new URL(`../src/_data/texts/${slug}.json`, import.meta.url)) ? textsOf(slug).faq?.items : null;
    if (pageFaqItems?.length) {
      const fp = graph.find((n) => n['@type'] === 'FAQPage');
      const want = { '@type': 'FAQPage', '@id': `${ORIGIN}${pageUrl}#faq`, mainEntity: pageFaqItems.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
      if (!same(fp, want)) fail(`${name}: FAQPage має збігатися з texts/${slug}.json -> faq.items`);
    }
    if (!same(graph.map((n) => n['@type']).sort(), ['LodgingBusiness', 'WebSite', 'BreadcrumbList', ...(EXPECT_TOP[pageUrl] || []), ...(pageFaqItems?.length ? ['FAQPage'] : [])].sort())) fail(`${name}: склад графа ${JSON.stringify(graph.map((n) => n['@type']))} не збігається з очікуваним для сторінки`);

    // LodgingBusiness: усе з site.json, даних цін і видимого тексту головної (опис, «Що є на території», FAQ про тварин), без сторонніх полів (openingHours, priceValidUntil тощо)
    const lb = graph.find((n) => n['@type'] === 'LodgingBusiness');
    if (lb) {
      const rooms = readData('rooms.json');
      const cottages = readData('cottages.json');
      const barnD = readData('barn.json');
      const nums = [...rooms, ...cottages].flatMap((i) => [i.price, ...(i.tariffs || []).map((t) => t.amount)]).concat(barnD.tariffs.map((t) => t.amount)).filter((x) => typeof x === 'number');
      const want = {
        '@type': 'LodgingBusiness',
        '@id': `${ORIGIN}/#lodging`,
        name: site.name,
        description: readData('texts/home.json').hero.lede,
        url: `${ORIGIN}/`,
        telephone: site.phone.tel,
        image: `${ORIGIN}/assets/img/static/${site.ogImage.file}`,
        logo: `${ORIGIN}/apple-touch-icon.png`,
        priceRange: `${Math.min(...nums)}-${Math.max(...nums)} UAH`,
        address: { '@type': 'PostalAddress', streetAddress: site.address.street, addressLocality: site.address.locality, addressRegion: site.address.region, postalCode: site.address.postalCode, addressCountry: site.address.country },
        hasMap: site.links.googleMaps,
        sameAs: [site.links.instagram, site.links.googleMaps],
        geo: { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude },
        amenityFeature: readData('texts/home.json').territory.items.map((t) => ({ '@type': 'LocationFeatureSpecification', name: t.title, value: true })),
        ...(readData('faq.json').some((f) => f.id === 'pets') ? { petsAllowed: true } : {}),
      };
      for (const k of Object.keys(lb)) if (!(k in want)) fail(`${name}: у LodgingBusiness невідоме поле «${k}»`);
      for (const [k, v] of Object.entries(want)) if (!same(lb[k], v)) fail(`${name}: LodgingBusiness.${k} має бути ${JSON.stringify(v)}, є ${JSON.stringify(lb[k])}`);
      const imgFile = path.join(dir, String(lb.image || '').replace(`${ORIGIN}/`, ''));
      if (!fs.existsSync(imgFile)) fail(`${name}: LodgingBusiness.image: файлу ${lb.image} немає в збірці`);
      const logoFile = path.join(dir, String(lb.logo || '').replace(`${ORIGIN}/`, ''));
      if (!fs.existsSync(logoFile)) fail(`${name}: LodgingBusiness.logo: файлу ${lb.logo} немає в збірці`);
    }
    // WebSite: назва сайту і publisher -> LodgingBusiness
    const ws = graph.find((n) => n['@type'] === 'WebSite');
    if (ws) {
      const want = { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: site.name, inLanguage: 'uk', publisher: { '@id': `${ORIGIN}/#lodging` } };
      if (!same(ws, want)) fail(`${name}: WebSite має бути ${JSON.stringify(want)}, є ${JSON.stringify(ws)}`);
    }
    // Адреса і телефон інших вузлів (DaySpa, CafeOrCoffeeShop) теж із site.json
    for (const n of graph.filter((x) => ['DaySpa', 'CafeOrCoffeeShop'].includes(x['@type']))) {
      if (n.telephone !== site.phone.tel) fail(`${name}: ${n['@type']}.telephone має бути ${site.phone.tel}`);
      if (!same(n.address, { '@type': 'PostalAddress', streetAddress: site.address.street, addressLocality: site.address.locality, addressRegion: site.address.region, postalCode: site.address.postalCode, addressCountry: site.address.country })) fail(`${name}: ${n['@type']}.address не збігається з site.json`);
      if (!n.parentOrganization || n.parentOrganization['@id'] !== `${ORIGIN}/#lodging`) fail(`${name}: ${n['@type']}.parentOrganization має вести на ${ORIGIN}/#lodging`);
    }
    // Хлібні крихти: Головна > поточна сторінка, назви з nav.json і texts/<сторінка>.json
    const bc = graph.find((n) => n['@type'] === 'BreadcrumbList');
    if (bc) {
      const items = bc.itemListElement || [];
      const navJson = readData('nav.json');
      const want = [{ '@type': 'ListItem', position: 1, name: navJson.find((n) => n.url === '/').title, item: `${ORIGIN}/` }];
      if (pageUrl !== '/') {
        const crumbName = fs.existsSync(new URL(`../src/_data/texts/${slug}.json`, import.meta.url)) ? textsOf(slug).meta.breadcrumbTitle : null;
        want.push({ '@type': 'ListItem', position: 2, name: crumbName, item: `${ORIGIN}${pageUrl}` });
      }
      if (!same(items, want)) fail(`${name}: BreadcrumbList має бути ${JSON.stringify(want)}, є ${JSON.stringify(items)}`);
    }
    // Текстові поля вузлів страниць дослівно з texts і даних
    const tx = fs.existsSync(new URL(`../src/_data/texts/${slug}.json`, import.meta.url)) ? textsOf(slug) : null;
    const vr = graph.find((n) => n['@type'] === 'VacationRental');
    if (vr && tx && vr.description !== tx.hero.lede) fail(`${name}: VacationRental.description має збігатися з hero.lede у texts/${slug}.json`);
    const ds = graph.find((n) => n['@type'] === 'DaySpa');
    if (ds && tx) {
      if (ds.description !== tx.hero.lede) fail(`${name}: DaySpa.description має збігатися з hero.lede у texts/${slug}.json`);
      if (ds.name !== `${tx.meta.breadcrumbTitle} ${site.name}`) fail(`${name}: DaySpa.name має бути «${tx.meta.breadcrumbTitle} ${site.name}»`);
      if (ds.url !== `${ORIGIN}/banya-ta-spa/`) fail(`${name}: DaySpa.url має бути ${ORIGIN}/banya-ta-spa/`);
    }
    const svc = graph.find((n) => n['@type'] === 'Service');
    if (svc) {
      if (svc.url !== `${ORIGIN}/banya-ta-spa/`) fail(`${name}: Service.url має бути ${ORIGIN}/banya-ta-spa/`);
      if (svc.offers?.url !== site.links.instagramDirect) fail(`${name}: Service.offers.url має вести в Instagram Direct з site.json`);
      if (svc.serviceType !== 'Баня') fail(`${name}: Service.serviceType має бути «Баня»`);
    }
    const cf = graph.find((n) => n['@type'] === 'CafeOrCoffeeShop');
    if (cf && tx) {
      const cafeD = readData('cafe.json');
      if (cf.description !== tx.hero.lede) fail(`${name}: CafeOrCoffeeShop.description має збігатися з hero.lede у texts/${slug}.json`);
      if (cf.name !== `${cafeD.title} ${site.name}`) fail(`${name}: CafeOrCoffeeShop.name має бути «${cafeD.title} ${site.name}»`);
      if (cf.url !== `${ORIGIN}/kafe/`) fail(`${name}: CafeOrCoffeeShop.url має бути ${ORIGIN}/kafe/`);
      if (cf.hasMenu?.inLanguage !== 'uk' || cf.hasMenu?.name !== tx.menu.heading || cf.hasMenu?.['@id'] !== `${ORIGIN}/kafe/#menu`) fail(`${name}: Menu: inLanguage uk, name з texts і @id ${ORIGIN}/kafe/#menu`);
    }

    const lodging = graph.find((n) => n['@type'] === 'LodgingBusiness');
    if (!lodging) fail(`${name}: немає LodgingBusiness`);
    else {
      for (const k of ['name', 'url', 'telephone', 'address', 'priceRange']) if (!lodging[k]) fail(`${name}: LodgingBusiness без ${k}`);
      if (lodging.priceRange && !/^\d+-\d+ UAH$/.test(lodging.priceRange)) fail(`${name}: priceRange "${lodging.priceRange}" не у форматі "2500-13000 UAH"`);
      const a = lodging.address || {};
      for (const k of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']) if (!a[k]) fail(`${name}: address без ${k}`);
      if (lodging.geo) {
        const { latitude: la, longitude: lo } = lodging.geo;
        // Грубі межі України: лише щоб зловити переплутані широту й довготу або опечатку.
        if (!(la > 44 && la < 53 && lo > 22 && lo < 41)) fail(`${name}: geo (${la}, ${lo}) поза межами України`);
      }
      for (const k of ['url', 'image', 'hasMap']) if (lodging[k] && !isAbs(lodging[k])) fail(`${name}: LodgingBusiness.${k} не абсолютна адреса`);
      if (lodging.url && !lodging.url.startsWith(ORIGIN)) fail(`${name}: LodgingBusiness.url не на ${ORIGIN}`);
      if (lodging.image && !lodging.image.startsWith(ORIGIN)) fail(`${name}: LodgingBusiness.image не на ${ORIGIN}`);
    }

    // FAQPage головної: питання і відповіді дослівно з faq.json (правило T2: розмітка = видимий текст), без HTML у відповідях.
    // Інші сторінки мають FAQPage лише тоді, коли в texts/<сторінка>.json є faq.items (перевірка вище, біля складу графа).
    const faqNode = graph.find((n) => n['@type'] === 'FAQPage');
    if (name === 'index.html' && !faqNode) fail(`${name}: на головній має бути FAQPage`);
    if (name !== 'index.html' && faqNode && !pageFaqItems?.length) fail(`${name}: FAQPage без блоку faq.items у texts/${slug}.json`);
    if (faqNode && pageFaqItems?.length) for (const [i, e] of (faqNode.mainEntity || []).entries()) if (/<[a-z][^>]*>/i.test(e.acceptedAnswer?.text || '')) fail(`${name}: у відповіді FAQPage[${i}] є HTML`);
    if (faqNode && name === 'index.html') {
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
      const listTx = readData(`texts/${name.replace(/\/index\.html$/, '')}.json`);
      if (listNode.name !== listTx.types.heading) fail(`${name}: ItemList.name має бути «${listTx.types.heading}» (texts)`);
      if (listNode['@id'] !== `${ORIGIN}${rule.base.replace(/#$/, '')}#list`) fail(`${name}: ItemList['@id'] має бути ${ORIGIN}${rule.base.replace(/#$/, '')}#list`);
      for (const k of Object.keys(listNode)) if (!['@type', '@id', 'name', 'numberOfItems', 'itemListElement'].includes(k)) fail(`${name}: у ItemList невідоме поле «${k}»`);
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
        if (it.url !== it['@id']) fail(`${name}: ItemList[${i}].url має збігатися з @id (${it['@id']})`);
        if (o.url !== readData('site.json').links.booking) fail(`${name}: ItemList[${i}].offers.url має вести на BookmeNow з site.json`);
        for (const k of Object.keys(it)) if (!['@type', '@id', 'url', 'name', 'occupancy', 'containedInPlace', 'amenityFeature', 'offers'].includes(k)) fail(`${name}: у ItemList[${i}] невідоме поле «${k}»`);
        for (const k of Object.keys(o)) if (!['@type', 'price', 'priceCurrency', 'url'].includes(k)) fail(`${name}: в ItemList[${i}].offers невідоме поле «${k}»`);
        if (!it.containedInPlace || it.containedInPlace['@id'] !== `${ORIGIN}/#lodging`) fail(`${name}: ItemList[${i}].containedInPlace має вести на ${ORIGIN}/#lodging`);
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
        if (v.url !== v['@id']) fail(`${name}: VacationRental.url має збігатися з @id`);
        if (!v.containedInPlace || v.containedInPlace['@id'] !== `${ORIGIN}/#lodging`) fail(`${name}: VacationRental.containedInPlace має вести на ${ORIGIN}/#lodging`);
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
          if (o.url !== readData('site.json').links.booking) fail(`${name}: Offer[${i}].url має вести на BookmeNow з site.json`);
          if (o.eligibleQuantity?.unitText !== 'гостей') fail(`${name}: Offer[${i}].eligibleQuantity.unitText має бути «гостей»`);
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

    // Кафе: CafeOrCoffeeShop з hasMenu із menu.json (розділи, позиції, ціни), без годин роботи і priceRange (в джерелах їх немає)
    const cafes = graph.filter((n) => n['@type'] === 'CafeOrCoffeeShop');
    if (name === 'kafe/index.html') {
      const cafe = JSON.parse(fs.readFileSync(new URL('../src/_data/cafe.json', import.meta.url), 'utf8'));
      const menu = JSON.parse(fs.readFileSync(new URL('../src/_data/menu.json', import.meta.url), 'utf8'));
      if (cafes.length !== 1) fail(`${name}: має бути один CafeOrCoffeeShop, є ${cafes.length}`);
      else {
        const [c] = cafes;
        if (c['@id'] !== `${ORIGIN}/kafe/#cafe`) fail(`${name}: CafeOrCoffeeShop['@id'] ${c['@id']}`);
        for (const k of ['name', 'url', 'telephone', 'address', 'hasMenu']) if (!c[k]) fail(`${name}: CafeOrCoffeeShop без ${k}`);
        if (c.url && !c.url.startsWith(ORIGIN)) fail(`${name}: CafeOrCoffeeShop.url не на ${ORIGIN}`);
        if (JSON.stringify(c.servesCuisine) !== JSON.stringify(cafe.cuisine)) fail(`${name}: servesCuisine має збігатися з cafe.json`);
        for (const k of Object.keys(c)) if (!['@type', '@id', 'name', 'description', 'url', 'telephone', 'address', 'servesCuisine', 'parentOrganization', 'hasMenu'].includes(k)) fail(`${name}: у CafeOrCoffeeShop невідоме поле «${k}» (годин роботи в джерелах немає: openingHours, priceRange, acceptsReservations не пишемо)`);
        const m = c.hasMenu || {};
        if (m['@type'] !== 'Menu') fail(`${name}: hasMenu має бути Menu`);
        if (m.dateModified !== cafe.menuUpdated) fail(`${name}: Menu.dateModified ${m.dateModified} не збігається з cafe.menuUpdated ${cafe.menuUpdated}`);
        for (const k of Object.keys(m)) if (!['@type', '@id', 'name', 'inLanguage', 'dateModified', 'hasMenuSection'].includes(k)) fail(`${name}: у Menu невідоме поле «${k}»`);
        const secs = m.hasMenuSection || [];
        if (secs.length !== menu.sections.length) fail(`${name}: у Menu ${secs.length} розділів, у menu.json ${menu.sections.length}`);
        menu.sections.forEach((sec, si) => {
          const el = secs[si] || {};
          if (el['@type'] !== 'MenuSection' || el.name !== sec.title) fail(`${name}: MenuSection[${si}] має бути «${sec.title}»`);
          const items = el.hasMenuItem || [];
          if (items.length !== sec.items.length) fail(`${name}: у MenuSection «${sec.title}» ${items.length} позицій, у menu.json ${sec.items.length}`);
          sec.items.forEach((it, ii) => {
            const x = items[ii] || {};
            if (x['@type'] !== 'MenuItem' || x.name !== it.title) fail(`${name}: MenuItem «${sec.title}»[${ii}] має бути «${it.title}»`);
            const o = x.offers || {};
            if (o['@type'] !== 'Offer' || o.priceCurrency !== menu.currency || o.price !== it.price) fail(`${name}: MenuItem «${it.title}»: Offer має бути ${it.price} ${menu.currency}`);
            const base = [it.details, it.weight].filter(Boolean).join(', ');
            const want = [base, it.variants?.length ? `Варіанти: ${it.variants.join('; ')}` : ''].filter(Boolean).join('. ') || undefined;
            if (x.description !== want) fail(`${name}: MenuItem «${it.title}».description має бути ${JSON.stringify(want)}, є ${JSON.stringify(x.description)}`);
            for (const k of Object.keys(x)) if (!['@type', 'name', 'description', 'offers'].includes(k)) fail(`${name}: у MenuItem «${it.title}» невідоме поле «${k}»`);
            for (const k of Object.keys(o)) if (!['@type', 'price', 'priceCurrency'].includes(k)) fail(`${name}: в Offer «${it.title}» невідоме поле «${k}»`);
          });
        });
      }
    } else if (cafes.length) fail(`${name}: CafeOrCoffeeShop лише на /kafe/`);

    // Околиці: Article з about -> TouristAttraction (парк природи), без Tur House як частини парку, без адреси, гео, годин і квитків парку
    const articles = graph.filter((n) => n['@type'] === 'Article');
    const attractions = graph.filter((n) => n['@type'] === 'TouristAttraction');
    if (name === 'okolitsi/index.html') {
      const ok = readData('texts/okolitsi.json');
      if (articles.length !== 1 || attractions.length !== 1) fail(`${name}: має бути один Article і один TouristAttraction, є ${articles.length} і ${attractions.length}`);
      else {
        const [a] = articles;
        const [p] = attractions;
        const wantA = { '@type': 'Article', '@id': `${ORIGIN}/okolitsi/#article`, headline: ok.hero.h1, description: ok.meta.description, url: `${ORIGIN}/okolitsi/`, mainEntityOfPage: `${ORIGIN}/okolitsi/`, inLanguage: 'uk', about: { '@id': `${ORIGIN}/okolitsi/#park` }, publisher: { '@id': `${ORIGIN}/#lodging` } };
        const wantP = { '@type': 'TouristAttraction', '@id': `${ORIGIN}/okolitsi/#park`, name: ok.park.heading, description: ok.park.text };
        for (const [label, got, want] of [['Article', a, wantA], ['TouristAttraction', p, wantP]]) {
          for (const k of Object.keys(got)) if (!(k in want)) fail(`${name}: у ${label} невідоме поле «${k}» (адреси, координат, годин і квитків парку в джерелах немає)`);
          for (const [k, v] of Object.entries(want)) if (!same(got[k], v)) fail(`${name}: ${label}.${k} має бути ${JSON.stringify(v)}, є ${JSON.stringify(got[k])}`);
        }
        if (/Tur House/.test(`${p.name} ${p.description}`)) fail(`${name}: TouristAttraction описує парк, а не Tur House (ТЗ §6: не називати себе частиною парку)`);
      }
    } else if (articles.length || attractions.length) fail(`${name}: Article і TouristAttraction лише на /okolitsi/`);

    // Як дістатися: WebPage про розташування і Place з адресою і координатами з site.json; нічого про км, час і трасу
    const webpages = graph.filter((n) => n['@type'] === 'WebPage');
    const places = graph.filter((n) => n['@type'] === 'Place');
    if (name === 'yak-distatysya/index.html') {
      const rp = readData('texts/yak-distatysya.json');
      if (webpages.length !== 1 || places.length !== 1) fail(`${name}: має бути один WebPage і один Place, є ${webpages.length} і ${places.length}`);
      else {
        const wantW = { '@type': 'WebPage', '@id': `${ORIGIN}/yak-distatysya/#webpage`, url: `${ORIGIN}/yak-distatysya/`, name: rp.hero.h1, description: rp.meta.description, inLanguage: 'uk', about: { '@id': `${ORIGIN}/yak-distatysya/#place` } };
        const wantP = {
          '@type': 'Place',
          '@id': `${ORIGIN}/yak-distatysya/#place`,
          name: site.name,
          description: rp.hero.lede,
          address: { '@type': 'PostalAddress', streetAddress: site.address.street, addressLocality: site.address.locality, addressRegion: site.address.region, postalCode: site.address.postalCode, addressCountry: site.address.country },
          geo: { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude },
          hasMap: site.links.googleMaps,
        };
        for (const [label, got, want] of [['WebPage', webpages[0], wantW], ['Place', places[0], wantP]]) {
          for (const k of Object.keys(got)) if (!(k in want)) fail(`${name}: у ${label} невідоме поле «${k}»`);
          for (const [k, v] of Object.entries(want)) if (!same(got[k], v)) fail(`${name}: ${label}.${k} має бути ${JSON.stringify(v)}, є ${JSON.stringify(got[k])}`);
        }
        if (/\d+\s*(км|хв|год)/i.test(JSON.stringify(graph))) fail(`${name}: у розмітці є кілометри або час у дорозі (C9)`);
      }
    } else if (webpages.length || places.length) fail(`${name}: WebPage і Place лише на /yak-distatysya/`);

    // Контакти: ContactPage з about і mainEntity -> LodgingBusiness; графіка роботи, e-mail, contactPoint із часом у джерелах немає
    const contactPages = graph.filter((n) => n['@type'] === 'ContactPage');
    if (name === 'kontakty/index.html') {
      const kt = readData('texts/kontakty.json');
      if (contactPages.length !== 1) fail(`${name}: має бути один ContactPage, є ${contactPages.length}`);
      else {
        const want = { '@type': 'ContactPage', '@id': `${ORIGIN}/kontakty/#contact`, url: `${ORIGIN}/kontakty/`, name: kt.hero.h1, description: kt.meta.description, inLanguage: 'uk', about: { '@id': `${ORIGIN}/#lodging` }, mainEntity: { '@id': `${ORIGIN}/#lodging` } };
        for (const k of Object.keys(contactPages[0])) if (!(k in want)) fail(`${name}: у ContactPage невідоме поле «${k}» (годин роботи і e-mail у джерелах немає)`);
        for (const [k, v] of Object.entries(want)) if (!same(contactPages[0][k], v)) fail(`${name}: ContactPage.${k} має бути ${JSON.stringify(v)}, є ${JSON.stringify(contactPages[0][k])}`);
      }
    } else if (contactPages.length) fail(`${name}: ContactPage лише на /kontakty/`);

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
