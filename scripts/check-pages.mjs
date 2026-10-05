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

// Спільні помічники правил сторінок
const sameText = (a, b) => (a || '').replace(/[\s  ]+/g, ' ').trim() === (b || '').replace(/[\s  ]+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s) => (s || '').replace(/[\s  ]+/g, ' ').trim();
// Контекст dataLayer, який сторінка кладе до GTM (ТЗ §9.3): шукаємо push з event page_context
function pageContextOf(doc) {
  for (const sc of doc.querySelectorAll('script')) {
    const m = sc.text.match(/dataLayer\.push\((\{[^;]*"event":"page_context"[^;]*\})\);/);
    if (m) return JSON.parse(m[1].replace(/\\u003c/g, '<'));
  }
  return null;
}
// Усі суми «N грн» у тексті сторінки мають бути з даних (rooms, cottages, barn, spa, акція, 500 за тварин, меню кафе)
const menuPrices = readJson('menu.json').sections.flatMap((s) => s.items.map((i) => i.price));
const ALLOWED_SUMS = new Set([...rooms.flatMap((r) => [r.price, r.promoPrice]), ...cottages.flatMap((c) => [c.price, c.promoPrice]), ...barn.tariffs.map((x) => x.amount), spa.price.first, spa.price.next, 500, ...menuPrices].filter(Boolean));
function checkSums(url, doc) {
  const text = doc.text.replace(/[  ]/g, ' ');
  for (const m of text.matchAll(/(\d[\d ]*\d|\d)\s*грн/g)) {
    const flat = Number(m[1].replace(/\s/g, ''));
    if (!ALLOWED_SUMS.has(flat)) fail(url, `у тексті сторінки сума «${m[0].trim()}» поза даними`);
  }
}

// Сторінка зі списком об'єктів (номери, котеджі): однакова структура, дані з відповідного JSON і texts/<slug>.json
function listPage(cfg) {
  return (doc, f) => {
    const { slug, list, category } = cfg;
    const t = texts(slug);
    const file = `texts/${slug}.json`;
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', cfg.cardsId, `${cfg.cardsId}-title`, ...cfg.blocks, 'included', 'group', 'gallery', 'booking', ...(promo.enabled ? ['promo'] : [])]) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    // хлібні крихти: Головна > поточний розділ, збігаються з назвою в розмітці
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f(`хлібні крихти мають бути «Головна / ${cfg.crumb}» з aria-current на останньому`);
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (!sameText(doc.querySelector('.text-section .lede')?.text, t.intro.text)) f(`вступ не збігається з ${file}`);
    if (!sameText(doc.querySelector(`[id="${cfg.cardsId}-title"]`)?.text, t.types.heading)) f(`H2 списку не збігається з ${file}`);
    if (cfg.kitchen && !sameText(doc.querySelector('#kitchen .lede')?.text, t.kitchen.text)) f(`текст про кухню не збігається з ${file}`);
    // картки з JSON даних, звичайні ціни, без викресленої ціни акції
    const site = readJson('site.json');
    const cards = doc.querySelectorAll(`#${cfg.cardsId} .card-object`);
    if (cards.length !== list.length) f(`карток ${cards.length}, у даних ${list.length}`);
    list.forEach((r, i) => {
      const c = cards[i];
      if (!c) return;
      if (!sameText(c.querySelector('h3')?.text, r.title)) f(`назва картки ${i + 1} не збігається з даними (${r.title})`);
      const meta = norm(c.querySelector('.card-object__meta')?.text);
      if (!meta.includes(r.capacity) || !meta.includes(r.count)) f(`у картці ${r.title} має бути «${r.capacity}» і «${r.count}» (R4)`);
      if (!norm(c.querySelector('.card-object__price')?.text).includes(`${money(r.price)} грн`)) f(`у картці ${r.title} немає ціни ${money(r.price)} грн`);
      if (norm(c.querySelector('.card-object__price .price')?.text) !== `${money(r.price)} грн / доба`) f(`ціна картки ${r.title} має бути «${money(r.price)} грн / доба»`);
      if (promo.enabled && r.promoPrice && norm(c.querySelector('a[href="#promo"]')?.text) !== promo.shortLabel) f(`підпис акції в картці ${r.title} має бути «${promo.shortLabel}» (promo.json)`);
      if (c.querySelector('a.btn')?.getAttribute('data-value') !== String(r.price)) f(`data-value кнопки броні ${r.title} має бути ${r.price}`);
      if (c.querySelector('a.btn')?.getAttribute('aria-label') !== `Забронювати: ${r.title}`) f(`aria-label кнопки броні ${r.title} має бути «Забронювати: ${r.title}»`);
      if (c.querySelector('s')) f(`у картці ${r.title} є викреслена ціна: ціни акції лише в банері #promo (R9)`);
      if (promo.enabled && r.promoPrice && !c.querySelector('a[href="#promo"]')) f(`у картці ${r.title} немає посилання на #promo`);
      if (!c.querySelector(`a.btn[href="${site.links.booking}"][data-item-name="${r.title}"][data-item-category="${category}"]`)) f(`кнопка броні картки ${r.title} без data-item-name і data-item-category=${category}`);
      if (c.getAttribute('id') !== r.id) f(`у картки ${r.title} має бути id="${r.id}" (якір з розмітки)`);
      if ((r.photo || null) !== (photoIdOf(c.querySelector('img')?.getAttribute('src')) || null)) f(`кадр картки ${r.title} має бути ${r.photo || 'без фото'}`);
      if (!r.photo && !c.querySelector('.photo-placeholder')) f(`у картки ${r.title} без фото має бути сіра заглушка зі знаком питання`);
      if (r.photo && c.querySelector('.photo-placeholder')) f(`у картки ${r.title} є фото, заглушки бути не має`);
      if (cfg.features) {
        const got = c.querySelectorAll('.feature-list li').map((li) => norm(li.text));
        if (!same(got, (r.features || []).map(norm))) f(`особливості картки ${r.title} не збігаються з даними`);
      }
    });
    // банер акції і Direct
    if (promo.enabled && !doc.querySelector('#promo a[href^="https://ig.me/m/tur_house_"]')) f('кнопка акції має вести на Instagram Direct (R9)');
    // що є в котеджі (тільки сторінка котеджів)
    if (cfg.slug === 'kotedzhi') {
      const cot = doc.querySelectorAll('#in-cottage .check-list li').map((li) => norm(li.text));
      if (!same(cot, t.inCottage.items.map(norm))) f(`пункти «Що є в котеджі» не збігаються з ${file}`);
    }
    // що є в номері (тільки сторінка номерів)
    if (cfg.slug === 'nomery') {
      const room = doc.querySelectorAll('#in-room .check-list li').map((li) => norm(li.text));
      if (!same(room, t.inRoom.items.map(norm))) f(`пункти «Що є в кожному номері» не збігаються з ${file}`);
    }
    // що входить, групи, бронь
    const inc = doc.querySelectorAll('#included .check-list li').map((li) => norm(li.text));
    if (!same(inc, t.included.items.map(norm))) f(`пункти «Що входить у вартість» не збігаються з ${file}`);
    for (const u of cfg.includedLinks) if (!doc.querySelector(`#included a[href$="${u}"]`)) f(`у блоці «Що входить» немає посилання на ${u}`);
    for (const u of cfg.groupLinks) if (!doc.querySelector(`#group a[href$="${u}"]`)) f(`у блоці груп немає посилання на ${u}`);
    if (!doc.querySelector(`#booking a[href="${site.links.booking}"][rel~="noopener"]`) || !doc.querySelector(`#booking a[href="tel:${site.phone.tel}"]`) || !doc.querySelector(`#booking a[href="${site.links.instagramDirect}"]`)) f('блок броні: BookmeNow, телефон і Instagram Direct');
    // галерея: стільки кадрів, скільки в texts, кожен з alt
    const gal = doc.querySelectorAll(IMG_OR_PH('#gallery'));
    if (gal.length !== t.gallery.photos.length) f(`у галереї ${gal.length} кадрів, у ${file} ${t.gallery.photos.length}`);
    for (const img of gal) if (!((photoIdOfEl(img) === 'placeholder' ? img.getAttribute('aria-label') : img.getAttribute('alt')) || '').trim()) f('у кадру галереї порожній alt');
    // контекст аналітики з даних
    const ctx = pageContextOf(doc);
    const exp = { event: 'page_context', page_type: 'category', item_category: category, price_range: `${Math.min(...list.map((r) => r.price))}-${Math.max(...list.map((r) => r.price))}`, content_ids: list.map((r) => r.id) };
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify(exp)) f(`dataLayer page_context: очікується ${JSON.stringify(exp)}, є ${JSON.stringify(ctx)}`);
    // перелінковка: на інші розділи
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of cfg.crossLinks) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  };
}

// id кадру за адресою картинки (ім'я файлу без хеша і ширини -> photos.json), для перевірки порядку кадрів
const photosJson = readJson('photos.json');
const photoIdOf = (src) => {
  const m = path.basename(src || '').match(/^(.+)-[A-Za-z0-9_-]{10}-\d+\.[a-z]+$/);
  const e = m && Object.entries(photosJson).find(([, v]) => path.basename(v.file, path.extname(v.file)) === m[1]);
  return e ? e[0] : null;
};
// Кадр-елемент: або <img>, або сіра заглушка «placeholder» (div.photo-placeholder, кадру ще немає).
const photoIdOfEl = (el) => (!el ? undefined : /(^|\s)photo-placeholder(\s|$)/.test(el.getAttribute('class') || '') ? 'placeholder' : photoIdOf(el.getAttribute('src')));
const IMG_OR_PH = (scope) => `${scope} img, ${scope} .photo-placeholder`;

const PAGE_RULES = {
  '/'(doc, f) {
    const t = texts('home');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f('H1 має збігатися з texts/home.json');
    for (const id of ['hero-title', 'promo', 'formats', 'rooms', 'cottages', 'barn', 'sauna']) {
      if (id === 'promo' && !promo.enabled) continue;
      if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока/якоря #${id} (зовнішні посилання ТЗ §6)`);
    }
    // hero: перший екран, eager + fetchpriority
    const heroImg = doc.querySelector('.hero__media img');
    if (!heroImg || heroImg.getAttribute('loading') !== 'eager' || heroImg.getAttribute('fetchpriority') !== 'high') f('картинка hero має бути loading=eager і fetchpriority=high');
    // бігуча стрічка: прихована від читачів екрана, шість пунктів двічі (для безшовного кола)
    const mq = doc.querySelector('.marquee-band');
    if (!mq || mq.getAttribute('aria-hidden') !== 'true') f('після hero має бути .marquee-band з aria-hidden="true"');
    else if (!same(mq.querySelectorAll('.marquee-track span').map((x) => norm(x.text)), [...t.marquee, ...t.marquee].map(norm))) f('бігуча стрічка: пункти мають бути texts/home.json marquee двічі підряд');
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
    // контекст аналітики головної: page_type home (ТЗ §9.3), не категорія
    const ctxHome = pageContextOf(doc);
    if (!ctxHome || JSON.stringify(ctxHome) !== JSON.stringify({ event: 'page_context', page_type: 'home', item_category: 'general' })) f(`dataLayer page_context головної: очікується {"event":"page_context","page_type":"home","item_category":"general"}, є ${JSON.stringify(ctxHome)}`);
    // посилання на інші розділи: номери, котеджі, Барн-хаус, баня
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
    // друга половина головної (E4-T2): територія, кафе, околиці, відгуки, FAQ, локація
    for (const id of ['territory', 'cafe', 'area', 'reviews', 'faq', 'location']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
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
  },
  '/nomery/': listPage({ slug: 'nomery', list: rooms, category: 'rooms', cardsId: 'rooms', crumb: 'Номери', blocks: ['where'], crossLinks: ['/kotedzhi/', '/barn-house/', '/banya-ta-spa/', '/kafe/'], groupLinks: ['/kotedzhi/', '/barn-house/'], includedLinks: ['/banya-ta-spa/', '/kafe/'] }),
  '/kotedzhi/': listPage({ slug: 'kotedzhi', list: cottages, category: 'cottages', cardsId: 'cottages', crumb: 'Котеджі', blocks: ['kitchen'], crossLinks: ['/nomery/', '/barn-house/', '/banya-ta-spa/', '/kafe/'], groupLinks: ['/nomery/', '/barn-house/'], includedLinks: ['/banya-ta-spa/', '/kafe/'], features: true, kitchen: true }),
  '/barn-house/'(doc, f) {
    const t = texts('barn-house');
    const file = 'texts/barn-house.json';
    const site = readJson('site.json');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'tariffs', 'tariffs-title', barn.id, 'inside', 'inside-title', 'outside', 'outside-title', 'included', 'group', 'gallery', 'booking']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Барн-хаус» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (!sameText(doc.querySelector('.text-section .lede')?.text, t.intro.text)) f(`вступ не збігається з ${file}`);
    // тарифи: один будинок, дві картки з barn.json (R6), звичайні ціни, кнопка броні на кожен тариф
    if (!sameText(doc.querySelector('#tariffs-title')?.text, t.tariffs.heading)) f(`H2 тарифів не збігається з ${file}`);
    if (!sameText(doc.querySelector('#tariffs .lede')?.text, t.tariffs.text)) f(`текст про тарифи не збігається з ${file}`);
    const cards = doc.querySelectorAll('#tariffs .tariff-card');
    if (cards.length !== barn.tariffs.length) f(`карток тарифів ${cards.length}, у barn.json ${barn.tariffs.length}`);
    barn.tariffs.forEach((tf, i) => {
      const c = cards[i];
      if (!c) return;
      if (!sameText(c.querySelector('h3')?.text, `${barn.title}: ${tf.label}`)) f(`заголовок картки тарифу ${i + 1} має бути «${barn.title}: ${tf.label}»`);
      if (!norm(c.querySelector('.card-object__price')?.text).includes(`${money(tf.amount)} грн`)) f(`у картці «${tf.label}» немає ціни ${money(tf.amount)} грн`);
      if (norm(c.querySelector('.card-object__price .price')?.text) !== `${money(tf.amount)} грн / доба`) f(`ціна тарифу «${tf.label}» має бути «${money(tf.amount)} грн / доба»`);
      if (c.querySelector('a.btn')?.getAttribute('aria-label') !== `Забронювати: ${barn.title}, ${tf.label}`) f(`aria-label кнопки тарифу «${tf.label}» має бути «Забронювати: ${barn.title}, ${tf.label}»`);
      if (c.querySelector('s')) f(`у картці «${tf.label}» є викреслена ціна (знижки на Барн-хаус не підтверджені)`);
      if (!c.querySelector(`a.btn[href="${site.links.booking}"][data-item-name="${barn.title}"][data-item-category="barn"][data-item-variant="${tf.label}"][data-value="${tf.amount}"]`)) f(`кнопка броні тарифу «${tf.label}» без data-item-name, data-item-category=barn, data-item-variant і data-value`);
    });
    if (doc.querySelectorAll('#tariffs .tariff-card h3').length !== barn.tariffs.length) f('усі тарифи мають бути H3');
    // всередині і навколо
    if (!sameText(doc.querySelector('#inside-title')?.text, t.inside.heading)) f(`H2 «Що всередині» не збігається з ${file}`);
    const insideP = doc.querySelectorAll('#inside .split__copy:first-child .lede').map((p) => norm(p.text));
    if (!same(insideP, [t.inside.lead, t.inside.note].map(norm))) f(`текст «Що всередині» не збігається з ${file}`);
    if (!sameText(doc.querySelector('#outside-title')?.text, t.outside.heading) || !sameText(doc.querySelector('#outside .lede')?.text, t.outside.text)) f(`блок «Територія навколо» не збігається з ${file}`);
    // що входить, групи, бронь
    const inc = doc.querySelectorAll('#included .check-list li').map((li) => norm(li.text));
    if (!same(inc, t.included.items.map(norm))) f(`пункти «Що входить у вартість» не збігаються з ${file}`);
    for (const u of ['/banya-ta-spa/', '/kafe/']) if (!doc.querySelector(`#included a[href$="${u}"]`)) f(`у блоці «Що входить» немає посилання на ${u}`);
    for (const u of ['/nomery/', '/kotedzhi/']) if (!doc.querySelector(`#group a[href$="${u}"]`)) f(`у блоці груп немає посилання на ${u}`);
    if (!doc.querySelector(`#booking a[href="${site.links.booking}"][rel~="noopener"]`) || !doc.querySelector(`#booking a[href="tel:${site.phone.tel}"]`) || !doc.querySelector(`#booking a[href="${site.links.instagramDirect}"]`)) f('блок броні: BookmeNow, телефон і Instagram Direct');
    // галерея: кадри з barn.json без кадру шапки, кожен з alt
    const galExpect = barn.gallery.filter((id) => id !== barn.photo);
    const gal = doc.querySelectorAll('#gallery img');
    if (gal.length !== galExpect.length) f(`у галереї ${gal.length} кадрів, очікується ${galExpect.length} (barn.json без кадру шапки)`);
    if (!same(gal.map((i) => photoIdOf(i.getAttribute('src'))), galExpect)) f(`галерея Барн-хауса: кадри мають бути ${JSON.stringify(galExpect)} (barn.json без кадру шапки) у цьому порядку`);
    for (const img of gal) if (!(img.getAttribute('alt') || '').trim()) f('у кадру галереї порожній alt');
    // контекст аналітики з даних
    const ctx = pageContextOf(doc);
    const exp = { event: 'page_context', page_type: 'category', item_category: 'barn', price_range: `${Math.min(...barn.tariffs.map((x) => x.amount))}-${Math.max(...barn.tariffs.map((x) => x.amount))}`, content_ids: [barn.id] };
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify(exp)) f(`dataLayer page_context: очікується ${JSON.stringify(exp)}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/banya-ta-spa/', '/kafe/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/banya-ta-spa/'(doc, f) {
    const t = texts('banya-ta-spa');
    const file = 'texts/banya-ta-spa.json';
    const site = readJson('site.json');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'complex', 'complex-title', 'price', 'price-title', 'cards', 'cards-title', 'gallery', 'stay', 'booking']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Баня та спа» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (!sameText(doc.querySelector('.text-section .lede')?.text, t.intro.text)) f(`вступ не збігається з ${file}`);
    // склад комплексу: текст з texts і пункти з spa.json
    if (!sameText(doc.querySelector('#complex-title')?.text, t.complex.heading) || !sameText(doc.querySelector('#complex .lede')?.text, t.complex.lead)) f(`блок «Що входить у банний комплекс» не збігається з ${file}`);
    if (!same(doc.querySelectorAll('#complex .complex-list li').map((li) => norm(li.text)), spa.complex.map(norm))) f('пункти складу комплексу не збігаються зі spa.json');
    // ціна: 600 за першу годину і 200 за кожну наступну, з особи (spa.json), без акції і без знижок
    if (!sameText(doc.querySelector('#price-title')?.text, t.price.heading) || !sameText(doc.querySelector('#price .lede')?.text, t.price.text)) f(`блок ціни не збігається з ${file}`);
    const tiles = doc.querySelectorAll('#price .tariff-card');
    const wantTiles = [[spa.price.firstLabel, spa.price.first], [spa.price.nextLabel, spa.price.next]];
    if (tiles.length !== 2) f(`у блоці ціни ${tiles.length} плиток, має бути 2 (перша година і наступні)`);
    wantTiles.forEach(([label, amount], i) => {
      const c = tiles[i];
      if (!c) return;
      if (norm(c.querySelector('.card-object__meta')?.text).toLowerCase() !== label.toLowerCase()) f(`плитка ціни ${i + 1}: підпис має бути «${label}»`);
      const pr = norm(c.querySelector('.price')?.text);
      if (!pr.includes(`${money(amount)} грн`) || !pr.includes(spa.price.per)) f(`плитка ціни ${i + 1}: має бути «${money(amount)} грн ${spa.price.per}»`);
    });
    if (doc.querySelector('#price s, #price a.btn')) f('у блоці ціни бані немає ні викреслених цін, ні кнопок броні проживання');
    // карточки: баня, чан, басейн з spa.json, без ціни проживання й без кнопки BookmeNow
    const cards = doc.querySelectorAll('#cards .card-object');
    if (cards.length !== spa.cards.length) f(`карточок бані ${cards.length}, у spa.json ${spa.cards.length}`);
    spa.cards.forEach((c, i) => {
      const el = cards[i];
      if (!el) return;
      if (!sameText(el.querySelector('h3')?.text, c.title)) f(`назва карточки ${i + 1} не збігається зі spa.json (${c.title})`);
      if (!sameText(el.querySelector('.card-object__desc')?.text, c.text)) f(`текст карточки «${c.title}» не збігається зі spa.json`);
      if ((c.note || '') !== norm(el.querySelector('.card-object__note')?.text)) f(`примітка карточки «${c.title}» має бути «${c.note || ''}»`);
      if (el.getAttribute('id') !== c.id) f(`у карточки «${c.title}» має бути id="${c.id}"`);
      if (!el.querySelector('img')) f(`у карточки «${c.title}» немає фото`);
      if (el.querySelector('.card-object__price, a.btn')) f(`у карточки «${c.title}» не має бути ціни проживання й кнопки броні`);
    });
    // проживання, бронь без BookmeNow: телефон і Direct
    if (!sameText(doc.querySelector('#stay .lede')?.text, t.stay.text)) f(`текст «Баня і проживання» не збігається з ${file}`);
    for (const l of t.stay.links) if (!doc.querySelector(`#stay a[href$="${l.url}"]`)) f(`у блоці проживання немає посилання на ${l.url}`);
    if (!sameText(doc.querySelector('#booking .lede')?.text, t.booking.text)) f(`текст броні не збігається з ${file}`);
    if (!doc.querySelector(`#booking a[href="tel:${site.phone.tel}"]`) || !doc.querySelector(`#booking a[href="${site.links.instagramDirect}"]`)) f('блок броні: телефон і Instagram Direct');
    if (doc.querySelector(`#booking a[href="${site.links.booking}"]`)) f('баню не бронюють через BookmeNow: у блоці броні немає кнопки BookmeNow');
    // галерея: кадри spa.json без кадру шапки і карточок
    const shown = new Set([spa.photo, ...spa.cards.map((c) => c.photo)]);
    const galExpect = spa.gallery.filter((id) => !shown.has(id));
    const gal = doc.querySelectorAll('#gallery img');
    if (gal.length !== galExpect.length) f(`у галереї ${gal.length} кадрів, очікується ${galExpect.length} (spa.json без кадрів шапки і карточок)`);
    if (!same(gal.map((i) => photoIdOf(i.getAttribute('src'))), galExpect)) f(`галерея бані: кадри мають бути ${JSON.stringify(galExpect)} (spa.json без кадрів шапки і карточок) у цьому порядку`);
    if (!same(doc.querySelectorAll('#cards .card-object img').map((i) => photoIdOf(i.getAttribute('src'))), spa.cards.map((c) => c.photo))) f('кадри карточок бані мають бути з spa.json cards[].photo');
    for (const img of gal) if (!(img.getAttribute('alt') || '').trim()) f('у кадру галереї порожній alt');
    // акції на сторінці бані немає: вона на проживання (R9)
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акція −20% на проживання, на сторінці бані її немає (R9)');
    // контекст аналітики
    const ctx = pageContextOf(doc);
    const exp = { event: 'page_context', page_type: 'category', item_category: 'banya', price_range: `${spa.price.first}-${spa.price.first + spa.price.next}`, content_ids: ['banya-1h'] };
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify(exp)) f(`dataLayer page_context: очікується ${JSON.stringify(exp)}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/kafe/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/kafe/'(doc, f) {
    const t = texts('kafe');
    const file = 'texts/kafe.json';
    const site = readJson('site.json');
    const cafe = readJson('cafe.json');
    const menu = readJson('menu.json');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'cafe', 'pizza', 'pizza-title', 'menu', 'menu-title', 'hours', 'hours-title', 'gallery', 'stay']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Кафе» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (!sameText(doc.querySelector('.text-section .lede')?.text, t.intro.text)) f(`вступ не збігається з ${file}`);
    if (!sameText(doc.querySelector('#pizza-title')?.text, t.pizza.heading) || !sameText(doc.querySelector('#pizza .lede')?.text, t.pizza.text)) f(`блок про піцу не збігається з ${file}`);
    // меню: усі розділи і всі позиції menu.json, ціни, вага, склад, варіанти
    if (!sameText(doc.querySelector('#menu-title')?.text, t.menu.heading) || !sameText(doc.querySelector('#menu > .wrap > .lede')?.text, t.menu.note)) f(`заголовок і примітка меню не збігаються з ${file}`);
    const secs = doc.querySelectorAll('#menu .menu-section');
    if (secs.length !== menu.sections.length) f(`розділів меню ${secs.length}, у menu.json ${menu.sections.length}`);
    menu.sections.forEach((sec, si) => {
      const el = secs[si];
      if (!el) return;
      if (!sameText(el.querySelector('h3')?.text, sec.title)) f(`розділ меню ${si + 1} має бути «${sec.title}»`);
      const items = el.querySelectorAll('.menu-item');
      if (items.length !== sec.items.length) f(`у розділі «${sec.title}» ${items.length} позицій, у menu.json ${sec.items.length}`);
      sec.items.forEach((it, ii) => {
        const li = items[ii];
        if (!li) return;
        if (li.getAttribute('id') !== it.id) f(`позиція «${it.title}»: id має бути ${it.id}`);
        if (!sameText(li.querySelector('.menu-item__name')?.text, it.title)) f(`позиція ${ii + 1} розділу «${sec.title}» має називатися «${it.title}»`);
        if (!sameText(li.querySelector('.menu-item__price')?.text, `${money(it.price)} грн`)) f(`ціна «${it.title}» має бути ${money(it.price)} грн`);
        const meta = [it.details, it.weight].filter(Boolean).join(', ');
        if ((meta || '') !== norm(li.querySelector('.menu-item__meta')?.text)) f(`склад і вага «${it.title}» не збігаються з menu.json (${meta})`);
        const vs = li.querySelectorAll('.menu-item__variants li').map((v) => norm(v.text));
        if (!same(vs, (it.variants || []).map(norm))) f(`варіанти «${it.title}» не збігаються з menu.json`);
      });
    });
    if (doc.querySelectorAll('.menu-item').length !== menu.sections.reduce((n, sec) => n + sec.items.length, 0)) f('число позицій меню на сторінці не збігається з menu.json');
    // години роботи невідомі: тільки відсилання до телефону і Direct (cafe.hours === null)
    if (!sameText(doc.querySelector('#hours-title')?.text, t.hours.heading) || !sameText(doc.querySelector('#hours .lede')?.text, t.hours.text)) f(`блок годин роботи не збігається з ${file}`);
    if (!doc.querySelector(`#hours a[href="tel:${site.phone.tel}"]`) || !doc.querySelector(`#hours a[href="${site.links.instagramDirect}"]`)) f('блок годин роботи: телефон і Instagram Direct');
    if (cafe.hours === null && /\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}|щодня|цілодобов|з \d{1,2}(:\d{2})? до \d{1,2}/i.test(doc.querySelector('main')?.text || '')) f('години роботи невідомі, на сторінці не має бути розкладу');
    // галерея: кадри cafe.json без кадру шапки
    const galExpect = cafe.gallery.filter((id) => id !== cafe.photo);
    const gal = doc.querySelectorAll(IMG_OR_PH('#gallery'));
    if (gal.length !== galExpect.length) f(`у галереї ${gal.length} кадрів, очікується ${galExpect.length} (cafe.json без кадру шапки)`);
    if (!same(gal.map((i) => photoIdOfEl(i)), galExpect)) f(`галерея кафе: кадри мають бути ${JSON.stringify(galExpect)} (cafe.json без кадру шапки) у цьому порядку`);
    if (photoIdOf(doc.querySelector('.page-hero img')?.getAttribute('src')) !== cafe.photo) f(`картинка шапки кафе має бути ${cafe.photo}`);
    for (const img of gal) if (!((photoIdOfEl(img) === 'placeholder' ? img.getAttribute('aria-label') : img.getAttribute('alt')) || '').trim()) f('у кадру галереї порожній alt');
    // проживання, посилання
    if (!sameText(doc.querySelector('#stay .lede')?.text, t.stay.text)) f(`текст «Кафе і проживання» не збігається з ${file}`);
    for (const l of t.stay.links) if (!doc.querySelector(`#stay a[href$="${l.url}"]`)) f(`у блоці проживання немає посилання на ${l.url}`);
    // акції на сторінці кафе немає, вона на проживання (R9)
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акція −20% на проживання, на сторінці кафе її немає (R9)');
    // контекст аналітики
    const ctx = pageContextOf(doc);
    const prices = menu.sections.flatMap((sec) => sec.items.map((i) => i.price));
    const exp = { event: 'page_context', page_type: 'category', item_category: 'cafe', price_range: `${Math.min(...prices)}-${Math.max(...prices)}`, content_ids: [] };
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify(exp)) f(`dataLayer page_context: очікується ${JSON.stringify(exp)}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/okolitsi/'(doc, f) {
    const t = texts('okolitsi');
    const file = 'texts/okolitsi.json';
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'intro', 'park', 'park-title', 'nature', 'desna', 'desna-title', 'family', 'family-title', 'weekend', 'weekend-title', 'gallery', 'stay']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Околиці» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (!sameText(doc.querySelector('#intro .lede')?.text, t.intro.text)) f(`вступ не збігається з ${file}`);
    // парк: текст з джерелом, без посилання на сайт парку (питання 24б: парк конкурент по проживанню), без цін і годин
    if (!sameText(doc.querySelector('#park-title')?.text, t.park.heading) || !sameText(doc.querySelector('#park .lede')?.text, t.park.text)) f(`блок про парк не збігається з ${file}`);
    const parkLinks = doc.querySelectorAll('#park a');
    if (parkLinks.length) f(`у блоці про парк не має бути посилань (питання 24б), є ${parkLinks.length}`);
    // Десна, діти, вихідні
    if (!sameText(doc.querySelector('#desna-title')?.text, t.desna.heading) || !sameText(doc.querySelector('#desna .lede')?.text, t.desna.text)) f(`блок про Десну не збігається з ${file}`);
    if (!sameText(doc.querySelector('#family-title')?.text, t.family.heading) || !sameText(doc.querySelector('#family .lede')?.text, t.family.text)) f(`блок «З дітьми» не збігається з ${file}`);
    if (!sameText(doc.querySelector('#weekend-title')?.text, t.weekend.heading) || !sameText(doc.querySelector('#weekend .lede')?.text, t.weekend.text)) f(`блок «Як провести вихідні» не збігається з ${file}`);
    // де зупинитися: шість посилань
    if (!sameText(doc.querySelector('#stay-title')?.text, t.stay.heading) || !sameText(doc.querySelector('#stay .lede')?.text, t.stay.text)) f(`блок «Де зупинитися поруч» не збігається з ${file}`);
    const stay = doc.querySelectorAll('#stay a').map((a) => ({ t: norm(a.text), h: stripPrefix(a.getAttribute('href')) }));
    if (!same(stay, t.stay.links.map((l) => ({ t: l.label, h: l.url })))) f('посилання в блоці «Де зупинитися поруч» не збігаються з texts (підпис і адреса)');
    // кадри: шапка і галерея з texts, без повторів
    const hero = doc.querySelector(IMG_OR_PH('.page-hero'));
    if (photoIdOfEl(hero) !== t.hero.photo) f(`кадр шапки має бути ${t.hero.photo}`);
    const gal = doc.querySelectorAll(IMG_OR_PH('#gallery')).map((i) => photoIdOfEl(i));
    if (!same(gal, t.gallery.photos)) f(`галерея: кадри мають бути ${JSON.stringify(t.gallery.photos)}, є ${JSON.stringify(gal)}`);
    if (t.hero.photo !== 'placeholder' && gal.includes(t.hero.photo)) f('кадр шапки повторюється в галереї');
    // на сторінці околиць немає ціни, акції і кнопки броні BookmeNow в межах main
    if (doc.querySelectorAll('main a[href^="https://go.bookmenow.pro"]').length !== doc.querySelectorAll('.cta-band a[href^="https://go.bookmenow.pro"]').length) f('на сторінці околиць немає кнопки броні BookmeNow (крім фінального блока CTA)');
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акції на сторінці околиць немає (R9)');
    const ctx = pageContextOf(doc);
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify({ event: 'page_context', page_type: 'info', item_category: 'area' })) f(`dataLayer page_context: очікується {"event":"page_context","page_type":"info","item_category":"area"}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/', '/kafe/', '/yak-distatysya/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/yak-distatysya/'(doc, f) {
    const t = texts('yak-distatysya');
    const file = 'texts/yak-distatysya.json';
    const site = readJson('site.json');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'route', 'route-title', 'address', 'address-title', 'navigator', 'navigator-title', 'map', 'map-title', 'map-box', 'map-load', 'help', 'landmark', 'support', 'stay']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Як дістатися» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    // маршрут дослівно, адреса з site.json (без координат), без км і часу в дорозі (C9)
    if (!sameText(doc.querySelector('#route-title')?.text, t.route.heading) || !sameText(doc.querySelector('#route .lede')?.text, t.route.text)) f(`блок маршруту не збігається з ${file}`);
    if (!sameText(doc.querySelector('#address-title')?.text, t.address.heading) || !sameText(doc.querySelector('#address address')?.text, site.address.full)) f('адреса має збігатися з site.json');
    const mainText = norm(doc.querySelector('main')?.text);
    if (/\d+\s*(км|хв|год)|\b50[.,]\d{3,}|\b30[.,]\d{3,}/i.test(mainText)) f('на сторінці немає кілометрів, часу в дорозі і координат (C9, координати лише в розмітці)');
    // навігатор: дві кнопки, адреси з site.json, rel=noopener
    if (!sameText(doc.querySelector('#navigator-title')?.text, t.navigator.heading) || !sameText(doc.querySelector('#navigator .lede')?.text, t.navigator.text)) f(`блок навігатора не збігається з ${file}`);
    const nav = doc.querySelectorAll('#navigator a.btn').map((a) => ({ t: norm(a.text), h: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }));
    if (!same(nav, [{ t: site.cta.routeGoogle, h: site.links.googleMapsRoute, target: '_blank', rel: 'noopener' }, { t: site.cta.routeWaze, h: site.links.waze, target: '_blank', rel: 'noopener' }])) f('кнопки маршруту: «Відкрити в Google Maps» і «Відкрити у Waze» з адресами site.json, target=_blank, rel=noopener');
    if (doc.querySelector('#navigator')?.getAttribute('data-placement') !== 'route_buttons') f('блок навігатора: data-placement=route_buttons (подія map_route_click)');
    // карта по кліку: ніякого iframe до натискання, адреса вбудови з site.json, кнопка керує контейнером
    if (doc.querySelectorAll('iframe').length) f('до кліку iframe у розмітці бути не повинно');
    const box = doc.querySelector('#map-box');
    if (box?.getAttribute('data-src') !== site.links.mapEmbed) f('data-src карти має бути site.links.mapEmbed');
    if (!/^Мапа проїзду до /.test(box?.getAttribute('data-title') || '')) f('data-title карти (назва для iframe) має починатися з «Мапа проїзду до»');
    const mb = doc.querySelector('#map-load');
    if (mb?.tagName.toLowerCase() !== 'button' || mb?.getAttribute('type') !== 'button' || mb?.getAttribute('aria-controls') !== 'map-box' || mb?.getAttribute('aria-expanded') !== 'false' || !sameText(mb?.text, t.map.button)) f(`кнопка карти: button type=button, aria-controls=map-box, aria-expanded=false, підпис «${t.map.button}»`);
    if (!sameText(doc.querySelector('#map-title')?.text, t.map.heading) || !sameText(doc.querySelector('#map-box .map-box__note')?.text, t.map.note)) f(`заголовок і примітка карти не збігаються з ${file}`);
    // орієнтир, допомога, куди їдете
    if (!sameText(doc.querySelector('#landmark-title')?.text, t.landmark.heading) || !sameText(doc.querySelector('#landmark .lede')?.text, t.landmark.text)) f(`блок «Орієнтир» не збігається з ${file}`);
    if (!doc.querySelector(`#landmark a[href$="${t.landmark.link.url}"]`)) f(`у блоці «Орієнтир» немає посилання на ${t.landmark.link.url}`);
    if (!sameText(doc.querySelector('#support-title')?.text, t.help.heading) || !sameText(doc.querySelector('#support .lede')?.text, t.help.text)) f(`блок допомоги не збігається з ${file}`);
    if (!doc.querySelector(`#support a[href="tel:${site.phone.tel}"]`) || !doc.querySelector(`#support a[href="${site.links.instagramDirect}"]`)) f('блок допомоги: телефон і Instagram Direct');
    if (!sameText(doc.querySelector('#stay-title')?.text, t.stay.heading) || !sameText(doc.querySelector('#stay .lede')?.text, t.stay.text)) f(`блок «Куди їдете» не збігається з ${file}`);
    for (const l of t.stay.links) if (!doc.querySelector(`#stay a[href$="${l.url}"]`)) f(`у блоці «Куди їдете» немає посилання на ${l.url}`);
    if (photoIdOfEl(doc.querySelector(IMG_OR_PH('.page-hero'))) !== t.hero.photo) f(`кадр шапки має бути ${t.hero.photo}`);
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акції на сторінці маршруту немає (R9)');
    const ctx = pageContextOf(doc);
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify({ event: 'page_context', page_type: 'info', item_category: 'route' })) f(`dataLayer page_context: очікується {"event":"page_context","page_type":"info","item_category":"route"}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/okolitsi/', '/kontakty/', '/nomery/', '/kotedzhi/', '/barn-house/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/kontakty/'(doc, f) {
    const t = texts('kontakty');
    const file = 'texts/kontakty.json';
    const site = readJson('site.json');
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'channels', 'phone', 'phone-title', 'instagram', 'instagram-title', 'booking', 'booking-title', 'where', 'address', 'address-title', 'maps', 'maps-title', 'more', 'more-title']) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Контакти» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (photoIdOfEl(doc.querySelector(IMG_OR_PH('.page-hero'))) !== t.hero.photo) f(`кадр шапки має бути ${t.hero.photo}`);
    // три способи зв'язку: телефон, Instagram (Direct і профіль), онлайн-бронювання; усе з site.json
    const card = (id, key, buttons) => {
      const c = doc.querySelector(`[id="${id}"]`);
      if (!c) return;
      if (!sameText(c.querySelector('h2')?.text, t[key].heading) || !sameText(c.querySelector('.card-object__desc')?.text, t[key].text)) f(`картка «${t[key].heading}» не збігається з ${file}`);
      const got = c.querySelectorAll('.card-object__actions a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href'), aria: a.getAttribute('aria-label') }));
      if (!same(got, buttons)) f(`картка «${t[key].heading}»: кнопки мають бути ${JSON.stringify(buttons)}, є ${JSON.stringify(got)}`);
    };
    card('phone', 'phone', [{ t: site.phone.display, h: `tel:${site.phone.tel}`, aria: `Зателефонувати: ${site.phone.display}` }]);
    card('instagram', 'instagram', [{ t: site.cta.instagram, h: site.links.instagramDirect, aria: undefined }, { t: site.cta.instagramProfile, h: site.links.instagram, aria: undefined }]);
    card('booking', 'booking', [{ t: site.cta.booking, h: site.links.booking, aria: undefined }]);
    if (doc.querySelectorAll('#channels .card-object').length !== 3) f('на сторінці контактів має бути три картки: телефон, Instagram, бронювання');
    // адреса з site.json, посилання на «Як дістатися», Google Карти
    if (!sameText(doc.querySelector('#address-title')?.text, t.address.heading) || !sameText(doc.querySelector('#address address')?.text, site.address.full) || !sameText(doc.querySelector('#address .lede')?.text, t.address.text)) f('блок адреси: заголовок, адреса з site.json і текст з texts');
    if (!doc.querySelector(`#address a[href$="${t.address.link.url}"]`)) f(`у блоці адреси немає посилання на ${t.address.link.url}`);
    if (!sameText(doc.querySelector('#maps-title')?.text, t.maps.heading) || !sameText(doc.querySelector('#maps .lede')?.text, t.maps.text)) f(`блок Google Карт не збігається з ${file}`);
    const mp = doc.querySelectorAll('#maps a');
    if (mp.length !== 1 || mp[0].getAttribute('href') !== site.links.googleMaps || mp[0].getAttribute('target') !== '_blank' || !/\bnoopener\b/.test(mp[0].getAttribute('rel') || '')) f('блок Google Карт: одна кнопка на site.links.googleMaps, target=_blank, rel=noopener');
    // перед поїздкою
    if (!sameText(doc.querySelector('#more-title')?.text, t.more.heading) || !sameText(doc.querySelector('#more .lede')?.text, t.more.text)) f(`блок «Перед поїздкою» не збігається з ${file}`);
    if (!same(doc.querySelectorAll('#more a').map((a) => ({ t: norm(a.text), h: stripPrefix(a.getAttribute('href')) })), t.more.links.map((l) => ({ t: l.label, h: l.url })))) f('посилання в блоці «Перед поїздкою» не збігаються з texts (підпис і адреса)');
    // графіка роботи і e-mail у джерелах немає
    const mainText = norm(doc.querySelector('main')?.text);
    if (/\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}|графік|щодня|цілодобов|@[a-z0-9.-]+\.[a-z]{2,}|e-?mail|ФОП|ТОВ/i.test(mainText)) f('години роботи, e-mail і реквізити в джерелах невідомі, на сторінці їх немає');
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акції на сторінці контактів немає (R9)');
    const ctx = pageContextOf(doc);
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify({ event: 'page_context', page_type: 'contact', item_category: 'contacts' })) f(`dataLayer page_context: очікується {"event":"page_context","page_type":"contact","item_category":"contacts"}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/yak-distatysya/', '/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/', '/kafe/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/pryvatnist/'(doc, f) {
    const t = texts('pryvatnist');
    const file = 'texts/pryvatnist.json';
    if (doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    for (const id of ['page-title', 'owner', 'collected', 'cookies', 'purpose', 'yours', 'optout', 'third', 'changes', 'contact', ...t.collected.items.map((i) => i.id)]) if (!doc.querySelector(`[id="${id}"]`)) f(`немає блока #${id}`);
    const crumbs = doc.querySelectorAll('nav.breadcrumbs li');
    if (crumbs.length !== 2 || !sameText(crumbs[0].text, 'Головна') || !sameText(crumbs[1].text, t.meta.breadcrumbTitle) || crumbs[1].getAttribute('aria-current') !== 'page') f('хлібні крихти мають бути «Головна / Політика конфіденційності» з aria-current на останньому');
    if (!sameText(doc.querySelector('.page-hero .lede')?.text, t.hero.lede)) f(`лид шапки не збігається з ${file}`);
    if (doc.querySelector('.page-hero img')) f('у політики конфіденційності немає картинки в шапці');
    // кожен блок: заголовок h2 і текст з texts
    for (const k of ['owner', 'collected', 'cookies', 'purpose', 'yours', 'optout', 'third', 'changes', 'contact']) {
      const b = doc.querySelector(`[id="${k}"]`);
      if (!b) continue;
      if (b.querySelector('h2')?.tagName.toLowerCase() !== 'h2' || !sameText(b.querySelector('h2')?.text, t[k].heading)) f(`блок «${k}»: H2 має бути «${t[k].heading}»`);
      const lede = t[k].text ?? t[k].lead;
      if (!sameText(b.querySelector('.lede')?.text, lede)) f(`блок «${k}»: текст не збігається з ${file}`);
    }
    // які дані збирає сайт: чотири сервіси з назвою (H3) і описом
    const items = doc.querySelectorAll('#collected .legal-list li');
    if (items.length !== t.collected.items.length) f(`у блоці збору даних ${items.length} сервісів, у ${file} ${t.collected.items.length}`);
    t.collected.items.forEach((it, i) => {
      const li = items[i];
      if (!li) return;
      if (li.getAttribute('id') !== it.id || li.querySelector('h3')?.tagName.toLowerCase() !== 'h3' || !sameText(li.querySelector('h3')?.text, it.title) || !sameText(li.querySelector('p')?.text, it.text)) f(`сервіс «${it.title}»: id, H3 і опис з ${file}`);
    });
    // як відмовитися: чотири способи
    if (!same(doc.querySelectorAll('#optout .bullet-list li').map((li) => norm(li.text)), t.optout.items.map(norm))) f('способи відмови від збору не збігаються з texts');
    // посилання: Контакти, Як дістатися
    if (!doc.querySelector(`#owner a[href$="${t.owner.link.url}"]`)) f(`у блоці власника немає посилання на ${t.owner.link.url}`);
    if (!same(doc.querySelectorAll('#contact a').map((a) => ({ t: norm(a.text), h: stripPrefix(a.getAttribute('href')) })), t.contact.links.map((l) => ({ t: l.label, h: l.url })))) f('посилання в блоці «Питання про дані» не збігаються з texts (підпис і адреса)');
    // політика не розходиться з тим, що сайт робить: без форм (check-site), без акції, без цін
    if (doc.querySelector('[id="promo"], .promo-modal')) f('акції на сторінці політики немає (R9)');
    const ctx = pageContextOf(doc);
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify({ event: 'page_context', page_type: 'info', item_category: 'general' })) f(`dataLayer page_context: очікується {"event":"page_context","page_type":"info","item_category":"general"}, є ${JSON.stringify(ctx)}`);
    const hrefs = doc.querySelectorAll('a[href]').map((a) => stripPrefix(a.getAttribute('href').split('#')[0]));
    for (const u of ['/kontakty/', '/yak-distatysya/']) if (!hrefs.includes(u)) f(`немає посилання на ${u}`);
  },
  '/404.html'(doc, f) {
    const t = texts('404');
    const file = 'texts/404.json';
    const site = readJson('site.json');
    const nav = readJson('nav.json');
    if (doc.querySelectorAll('h1').length !== 1 || doc.querySelector('h1')?.text.trim() !== t.hero.h1) f(`H1 має збігатися з ${file}`);
    if (!sameText(doc.querySelector('main .lede')?.text, t.hero.lede)) f(`лид не збігається з ${file}`);
    if (doc.querySelector('link[rel="canonical"]')) f('на 404 canonical не потрібен');
    if (!/noindex/.test(doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '')) f('404 має бути noindex');
    // кнопка на головну і кнопки всіх розділів з nav.json
    const first = doc.querySelectorAll('main .not-found a.btn').map((a) => ({ t: norm(a.text), h: a.getAttribute('href') }));
    if (!same(first, [{ t: nav[0].title, h: `${prefix}/` }])) f('кнопка «Головна» на 404 має вести на головну');
    if (!sameText(doc.querySelector('#sections-title')?.text, t.sections.heading)) f(`H2 «Розділи сайту» не збігається з ${file}`);
    const links = doc.querySelectorAll('#sections .btn-row:first-of-type a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href') }));
    if (!same(links, nav.filter((n) => n.url !== '/').map((n) => ({ t: n.title, h: `${prefix}${n.url}` })))) f('кнопки розділів на 404 мають збігатися з nav.json без головної');
    if (!sameText(doc.querySelector('#sections .lede')?.text, t.booking.text)) f(`текст про бронювання не збігається з ${file}`);
    const bk = doc.querySelectorAll('#sections .btn-row:last-of-type a');
    if (bk.length !== 1 || bk[0].getAttribute('href') !== site.links.booking || !sameText(bk[0].text, site.cta.booking) || !/\bnoopener\b/.test(bk[0].getAttribute('rel') || '')) f('кнопка броні на 404: BookmeNow з site.json, rel=noopener');
    if (doc.querySelector('section.cta-band, [id="promo"], .promo-modal')) f('на 404 немає фінального CTA і акції');
    const ctx = pageContextOf(doc);
    if (!ctx || JSON.stringify(ctx) !== JSON.stringify({ event: 'page_context', page_type: 'error', item_category: 'general' })) f(`dataLayer page_context: очікується {"event":"page_context","page_type":"error","item_category":"general"}, є ${JSON.stringify(ctx)}`);
  },
};

// Мета-теги кожної зібраної сторінки з texts/<сторінка>.json: title, description, og і twitter збігаються з текстами, canonical і og:url на своїй адресі
const ORIGIN_BY_MODE = mode === 'production' ? 'https://turhouse.com.ua' : 'https://ofmalien.github.io/turhouse-multipage-preview';
const slugOf = (url) => (url === '/' ? 'home' : url === '/404.html' ? '404' : url.replace(/\//g, ''));
for (const [url, doc] of docs) {
  const slug = slugOf(url);
  if (!fs.existsSync(path.join(root, 'src/_data/texts', `${slug}.json`))) continue;
  const meta = texts(slug).meta;
  const attr = (sel, a = 'content') => doc.querySelector(sel)?.getAttribute(a);
  const want = { title: meta.title, description: meta.description };
  const got = {
    'title': doc.querySelector('title')?.text,
    'meta description': attr('meta[name="description"]'),
    'og:title': attr('meta[property="og:title"]'),
    'og:description': attr('meta[property="og:description"]'),
    'twitter:title': attr('meta[name="twitter:title"]'),
    'twitter:description': attr('meta[name="twitter:description"]'),
  };
  for (const [k, v] of Object.entries(got)) {
    const w = k.endsWith('title') ? want.title : want.description;
    if (!sameText(v, w)) fail(url, `${k} не збігається з texts/${slug}.json (${w})`);
  }
  const wantUrl = `${ORIGIN_BY_MODE}${url}`;
  if (url !== '/404.html' && attr('link[rel="canonical"]', 'href') !== wantUrl) fail(url, `canonical має бути ${wantUrl}`);
  if (attr('meta[property="og:url"]') !== wantUrl) fail(url, `og:url має бути ${wantUrl}`);
}

for (const [url, rule] of Object.entries(PAGE_RULES)) {
  const doc = docs.get(url);
  if (!doc) { fail(url, 'сторінки немає в збірці'); continue; }
  rule(doc, (m) => fail(url, m));
}
// усі зібрані сторінки: суми «N грн» у тексті лише з даних
for (const [url, doc] of docs) checkSums(url, doc);

if (errors.length) {
  console.error(`check-pages (${mode}): порушень ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-pages (${mode}${strict ? ', strict' : ''}): OK, сторінок ${docs.size}, правил сторінок ${Object.keys(PAGE_RULES).length}${pending.size ? `, відкладених посилань на ще не зібрані сторінки: ${[...pending].sort().join(' ')}` : ''}`);
