// Перевірка готової розмітки _site (E4): структура заголовків, id, зображення, внутрішні посилання і якорі, відповідність цін даним.
// Використання: node scripts/check-pages.mjs [preview|production]   (спершу зберіть сайт: ELEVENTY_ENV=... npm run build)
// Код 1, якщо є порушення. Правила сторінок додаються в PAGE_RULES разом із вёрсткою кожної сторінки.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const mode = args.find((a) => !a.startsWith('--')) || 'preview';
const prefix = mode === 'preview' ? '/turhouse-multipage-preview' : '';
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(root, 'src/_data', n), 'utf8'));
const money = (n) => new Intl.NumberFormat('uk-UA').format(n).replace(/[  ]/g, ' ');
const errors = [];
const fail = (page, m) => errors.push(`${page}: ${m}`);
// Сторінки, які ще не зібрані за планом (nav.json + політика): посилання на них поки "відкладені", з --strict вони стають помилками.
const PLANNED = new Set([...readJson('nav.json').map((n) => n.url), '/pryvatnist/', '/404.html']);
const pending = new Set();

if (!fs.existsSync(site)) { console.error('check-pages: немає _site, спершу зберіть сайт'); process.exit(1); }

// усі сторінки: каталог/index.html і 404.html, службові src/dev у перевірку не входять
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets' && e.name !== 'dev') walk(p); }
    else if (e.name === 'index.html' || (dir === site && e.name === '404.html')) pages.push(p);
  }
})(site);

const urlOf = (file) => {
  const rel = path.relative(site, file).split(path.sep).join('/');
  return rel === 'index.html' ? '/' : rel === '404.html' ? '/404.html' : `/${rel.replace(/index\.html$/, '')}`;
};
const docs = new Map(pages.map((f) => [urlOf(f), parse(fs.readFileSync(f, 'utf8'))]));

// Куди веде посилання: повертає { url, hash } для внутрішніх, null для зовнішніх і tel:/mailto:
function internal(href) {
  if (!href || /^(https?:|tel:|mailto:|javascript:)/i.test(href)) return null;
  const [p, hash] = href.split('#');
  if (!p) return { url: null, hash };
  return { url: p, hash };
}
const stripPrefix = (u) => (prefix && u.startsWith(prefix) ? u.slice(prefix.length) || '/' : u);

for (const [url, doc] of docs) {
  const label = url;
  // 1. рівно один H1, заголовки без пропусків рівнів
  const heads = doc.querySelectorAll('h1,h2,h3,h4,h5,h6');
  const h1s = heads.filter((h) => h.tagName === 'H1');
  if (h1s.length !== 1) fail(label, `H1 має бути рівно один, є ${h1s.length}`);
  let prev = 0;
  for (const h of heads) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) fail(label, `пропуск рівня заголовків: після h${prev} іде h${lvl} («${h.text.trim().slice(0, 40)}»)`);
    prev = lvl;
  }
  // 2. унікальні id
  const ids = doc.querySelectorAll('[id]').map((e) => e.getAttribute('id'));
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) fail(label, `повторюються id: ${[...new Set(dup)].join(', ')}`);
  // 3. зображення: width, height, alt
  for (const img of doc.querySelectorAll('img')) {
    const src = (img.getAttribute('src') || '').slice(-40);
    if (!img.getAttribute('width') || !img.getAttribute('height')) fail(label, `img без width/height: …${src}`);
    if (img.getAttribute('alt') === undefined) fail(label, `img без alt: …${src}`);
  }
  // 4. зовнішні посилання з target=_blank мають rel=noopener
  for (const a of doc.querySelectorAll('a[target="_blank"]')) if (!/noopener/.test(a.getAttribute('rel') || '')) fail(label, `a[target=_blank] без rel=noopener: ${a.getAttribute('href')}`);
  // 5. внутрішні посилання і якорі
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    const t = internal(href);
    if (!t) continue;
    if (t.url === null) { if (t.hash && !doc.querySelector(`[id="${t.hash}"]`)) fail(label, `якір #${t.hash} не існує на сторінці`); continue; }
    if (t.url.startsWith('/') && prefix && !t.url.startsWith(`${prefix}/`) && t.url !== prefix) { fail(label, `посилання ${href} без префікса ${prefix} (шаблони мають писати | url)`); continue; }
    const target = stripPrefix(t.url);
    const norm = target.endsWith('/') || target.endsWith('.html') ? target : `${target}/`;
    if (target.startsWith('/') && !target.startsWith('/assets/') && !/\.(png|jpg|jpeg|webp|avif|svg|ico|css|js|json|xml|txt|webmanifest)$/.test(target)) {
      const dest = docs.get(norm);
      if (!dest) { if (PLANNED.has(norm) && !strict) pending.add(norm); else fail(label, `посилання ${href} веде на сторінку, якої немає в збірці`); }
      else if (t.hash && !dest.querySelector(`[id="${t.hash}"]`)) fail(label, `посилання ${href}: на сторінці ${norm} немає якоря #${t.hash}`);
    }
  }
}

// Правила окремих сторінок (додаються разом із вёрсткою)
const promo = readJson('promo.json');
const rooms = readJson('rooms.json');
const cottages = readJson('cottages.json');
const barn = readJson('barn.json');
const spa = readJson('spa.json');
const texts = (n) => readJson(`texts/${n}.json`);

const PAGE_RULES = {
  '/'(doc, f) {
    const t = texts('home');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f('H1 має збігатися з texts/home.json');
    for (const id of ['hero-title', 'promo', 'formats', 'rooms', 'cottages', 'barn', 'sauna']) {
      if (id === 'promo' && !promo.enabled) continue;
      if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока/якоря #${id} (зовнішні посилання ТЗ §6)`);
    }
    // hero: перший екран, eager + fetchpriority
    const heroImg = doc.querySelector('.hero img');
    if (!heroImg || heroImg.getAttribute('loading') !== 'eager' || heroImg.getAttribute('fetchpriority') !== 'high') f('картинка hero має бути loading=eager і fetchpriority=high');
    if (doc.querySelectorAll('.hero .btn').length < 2) f('у hero дві кнопки: бронювання і Instagram');
    // три формати проживання: ціни з даних, формат «2 500 грн / доба»
    const cards = doc.querySelectorAll('#formats .format-card');
    if (cards.length !== 3) f(`у блоці форматів має бути 3 картки, є ${cards.length}`);
    const text = (id) => doc.querySelector(`[id="${id}"]`)?.text.replace(/\s+/g, ' ') || '';
    for (const r of rooms) if (!text('rooms').includes(`${money(r.price)} грн / доба`)) f(`у картці номерів немає ціни ${r.title} ${money(r.price)} грн / доба`);
    for (const c of cottages) if (!text('cottages').includes(`${money(c.price)} грн / доба`)) f(`у картці котеджів немає ціни ${money(c.price)} грн / доба`);
    for (const tf of barn.tariffs) if (!text('barn').includes(`${tf.label}`) || !text('barn').includes(`${money(tf.amount)} грн / доба`)) f(`у картці Барн-хауса немає тарифу ${tf.label} ${money(tf.amount)} грн / доба`);
    if (!text('sauna').includes(`${money(spa.price.first)} грн`) || !text('sauna').includes(`${money(spa.price.next)} грн`)) f('у банному блоці немає цін 600 і 200 з spa.json');
    // у картках звичайні ціни, ціни акції тільки в банері #promo
    if (promo.enabled) {
      for (const r of rooms) if (r.promoPrice && text('formats').includes(`${money(r.promoPrice)} грн`)) f(`ціна акції ${money(r.promoPrice)} грн не має стояти в картках форматів (тільки в #promo, R9)`);
      if (!doc.querySelector('#promo a[href^="https://ig.me/m/tur_house_"]')) f('кнопка акції має вести на Instagram Direct (R9)');
      for (const row of [['Стандарт', 2000], ['Напівлюкс', 2240], ['Люкс', 2400], ['Котедж', 4800]]) if (!text('promo').includes(`${money(row[1])} грн`)) f(`у банері акції немає ціни ${row[0]} ${money(row[1])} грн`);
    }
    // посилання на інші розділи: номери, котеджі, Барн-хаус, баня
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
    // друга половина головної (E4-T2): територія, кафе, околиці, відгуки, FAQ, локація
    for (const id of ['territory', 'cafe', 'area', 'reviews', 'faq', 'location']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const sameText = (a, b) => (a || '').replace(/[\s  ]+/g, ' ').trim() === (b || '').replace(/[\s  ]+/g, ' ').trim();
    const terr = doc.querySelectorAll('#territory .feature-grid__item');
    if (terr.length !== t.territory.items.length) f(`у блоці території ${terr.length} пунктів, у texts/home.json ${t.territory.items.length}`);
    t.territory.items.forEach((it, i) => { if (terr[i] && (!sameText(terr[i].querySelector('h3')?.text, it.title) || !sameText(terr[i].querySelector('p')?.text, it.text))) f(`пункт території «${it.title}» не збігається з texts/home.json`); });
    if (!doc.querySelector(`#cafe a[href$="/kafe/"]`)) f('тизер кафе має вести на /kafe/ (R7)');
    if (!sameText(doc.querySelector('#cafe .lede')?.text, t.cafe.text)) f('текст тизера кафе не збігається з texts/home.json');
    if (!doc.querySelector(`#area a[href$="/okolitsi/"]`)) f('блок околиць має вести на /okolitsi/');
    // відгуки: дослівно з reviews.json, підпис «Відгук з Google», без рейтингу
    const revs = readJson('reviews.json');
    const revCards = doc.querySelectorAll('#reviews .review-card');
    if (revCards.length !== revs.items.length) f(`відгуків ${revCards.length}, у reviews.json ${revs.items.length}`);
    revs.items.forEach((r, i) => {
      const c = revCards[i];
      if (!c) return;
      if (!sameText(c.querySelector('.review-card__text')?.text, `«${r.text}»`)) f(`відгук ${r.id} не збігається з reviews.json`);
      if (!sameText(c.querySelector('.review-card__name')?.text, r.author)) f(`автор відгуку ${r.id} не збігається`);
      if (!sameText(c.querySelector('.review-card__src')?.text, revs.label)) f(`підпис відгуку ${r.id}: має бути «${revs.label}»`);
    });
    if (/aggregateRating|ratingValue|reviewCount|4,2 \/ 5|8 600/.test(doc.toString())) f('у сторінці є агрегований рейтинг або непідтверджені цифри (ТЗ §7.2, питання 11)');
    if (!doc.querySelector(`#reviews a[href="${readJson('site.json').links.googleMaps}"][rel~="noopener"]`)) f('посилання на відгуки в Google має вести на картку Google Карт з rel=noopener');
    // FAQ: питання і відповіді дослівно з faq.json
    const faqData = readJson('faq.json');
    const items = doc.querySelectorAll('#faq details.faq-item');
    if (items.length !== faqData.length) f(`у FAQ ${items.length} питань, у faq.json ${faqData.length}`);
    faqData.forEach((q, i) => {
      const it = items[i];
      if (!it) return;
      if (!sameText(it.querySelector('summary')?.text, q.q)) f(`питання FAQ ${q.id} не збігається з faq.json`);
      if (!sameText(it.querySelector('.faq-item__answer > p')?.text, q.a)) f(`відповідь FAQ ${q.id} не збігається з faq.json`);
      for (const l of q.links || []) if (!it.querySelector(`a[href$="${l.url}"]`)) f(`у відповіді FAQ ${q.id} немає посилання ${l.url}`);
    });
    if (items.some((it) => it.getAttribute('open') !== undefined)) f('FAQ має бути згорнутим за замовчуванням');
    // локація: адреса і кнопки маршруту з site.json
    const siteJson = readJson('site.json');
    if (!sameText(doc.querySelector('#location address')?.text, siteJson.address.full)) f('адреса в блоці локації має збігатися з site.json');
    if (!doc.querySelector(`#location a[href="${siteJson.links.googleMapsRoute}"][rel~="noopener"]`)) f('немає кнопки маршруту Google Maps з site.json');
    if (!doc.querySelector(`#location a[href="${siteJson.links.waze}"][rel~="noopener"]`)) f('немає кнопки Waze з site.json');
    if (!doc.querySelector('#location a[href$="/yak-distatysya/"]')) f('локація має вести на /yak-distatysya/');
    // розділи сайту, на які веде головна
    for (const u of ['/kafe/', '/okolitsi/', '/yak-distatysya/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
    // кожен блок головної має свій H2 (акція, формати, баня, територія, кафе, околиці, відгуки, FAQ, локація, фінальний CTA)
    for (const id of [...(promo.enabled ? ['promo-title'] : []), 'formats-title', 'sauna-title', 'territory-title', 'cafe-title', 'area-title', 'reviews-title', 'faq-title', 'location-title', 'cta-title']) {
      const h = doc.querySelector(`h2[id="${id}"]`);
      if (!h || !h.text.trim()) f(`немає H2 #${id}`);
    }
    // у розмітці немає зайвих цифр цін: усі суми в тексті сторінки дозволені (rooms, cottages, barn, spa, акція)
    const allowed = new Set([...rooms.flatMap((r) => [r.price, r.promoPrice]), ...cottages.flatMap((c) => [c.price, c.promoPrice]), ...barn.tariffs.map((x) => x.amount), spa.price.first, spa.price.next, 500 /* тварини, FAQ */].filter(Boolean).map(money));
    for (const m of doc.text.replace(/ /g, ' ').matchAll(/(\d[\d ]*\d|\d)\s*грн/g)) { const n = m[1].replace(/\s+(?=\d{3}$)/, ' ').trim(); const flat = n.replace(/\s/g, ''); if (flat.length >= 3 && !allowed.has(money(Number(flat))) && !allowed.has(n)) f(`у тексті сторінки сума «${m[0].trim()}» поза даними`); }
  },
};

for (const [url, rule] of Object.entries(PAGE_RULES)) {
  const doc = docs.get(url);
  if (!doc) { fail(url, 'сторінки немає в збірці'); continue; }
  rule(doc, (m) => fail(url, m));
}

if (errors.length) {
  console.error(`check-pages (${mode}): порушень ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-pages (${mode}${strict ? ', strict' : ''}): OK, сторінок ${docs.size}, правил сторінок ${Object.keys(PAGE_RULES).length}${pending.size ? `, відкладених посилань на ще не зібрані сторінки: ${[...pending].sort().join(' ')}` : ''}`);
