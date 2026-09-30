// Перевірка файлів даних src/_data (ТЗ §11 п.6, рішення R4-R9 з промпта). Код 1, якщо є порушення.
// Використання: node scripts/check-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src/_data');
const errors = [];
const fail = (m) => errors.push(m);
const readJson = (name) => {
  const f = path.join(dataDir, name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Дозволені ціни на сайті (п.6 промпта): 2500/2800/3000, 6000/7000, 11000 і 13000 (Барн-хаус), 600+200, 500, ціни акції.
const ALLOWED_PRICES = new Set([2500, 2800, 3000, 6000, 7000, 11000, 13000, 600, 200, 500, 2000, 2240, 2400, 4800]);
const PRICE_KEYS = new Set(['price', 'amount', 'promoPrice', 'was', 'now', 'first', 'next', 'petFee', 'fee']);
// C9: відстань і час у дорозі не вказувати взагалі (км, "N хвилин їзди", "година в дорозі"). Слово "хвилин" саме по собі дозволене (відгук гостя: "з перших хвилин").
const CYR_CLASS = 'А-Яа-яІіЇїЄєҐґ';
const C9_RE = new RegExp(`(^|[^${CYR_CLASS}])км([^${CYR_CLASS}]|$)|кілометр|хвилин[${CYR_CLASS}']*\\s+(їзди|в дорозі|дороги|пішки|на машині)|годин[${CYR_CLASS}']*\\s+(їзди|в дорозі)|\\d+\\s*(хв|год)([^${CYR_CLASS}]|$)`, 'i');
const FORBIDDEN_TEXT = [C9_RE, /(будинок|дім|дом)\s+на\s+12/i, /Барн\s?Хаус|Барнхаус/i, /ретрит/i, /райськ/i, /незабутн/i, /унікальна атмосфера/i, /\b4500\b/, /\b5200\b/, /\b8200\b/, /\b15800\b/, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u];

// Ціни страв меню не входять у список цін проживання: menu.json перевіряється окремо, по таблиці з 28 позицій (нижче).
const PRICE_SCAN_SKIP = new Set(['menu.json']);

function scan(node, where, checkPrices = true) {
  if (Array.isArray(node)) return node.forEach((n, i) => scan(n, `${where}[${i}]`, checkPrices));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (checkPrices && PRICE_KEYS.has(k) && typeof v === 'number' && !ALLOWED_PRICES.has(v)) fail(`${where}.${k}: ціна ${v} поза дозволеним списком`);
      scan(v, `${where}.${k}`, checkPrices);
    }
  } else if (typeof node === 'string') {
    for (const re of FORBIDDEN_TEXT) if (re.test(node)) fail(`${where}: ${re === C9_RE ? 'відстань або час у дорозі (C9)' : `заборонений вміст ${re}`}`);
    // Будь-яка сума з "грн" у тексті має бути з дозволеного списку цін (правило C6: цін не вигадувати).
    if (checkPrices) for (const m of node.matchAll(/(\d[\d\s\u00a0]*)\s*грн/g)) {
      const n = Number(m[1].replace(/[\s\u00a0]/g, ''));
      if (!ALLOWED_PRICES.has(n)) fail(`${where}: сума "${m[0].trim()}" у тексті поза дозволеним списком цін`);
    }
  }
}

// Усі JSON у _data: ціни і заборонені слова
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith('.json'))) scan(readJson(f), f, !PRICE_SCAN_SKIP.has(f));

// nav: 9 розділів у заданому порядку
const nav = readJson('nav.json');
const NAV_URLS = ['/', '/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/', '/kafe/', '/okolitsi/', '/yak-distatysya/', '/kontakty/'];
if (!nav || !same(nav.map((n) => n.url), NAV_URLS)) fail(`nav.json: адреси мають бути ${NAV_URLS.join(' ')}`);
else for (const n of nav) if (!n.title || !n.key) fail(`nav.json: пункт ${n.url} без title або key`);

// rooms: 3 види по 2, ціни і акція (R4, R9)
const rooms = readJson('rooms.json');
if (!rooms || rooms.length !== 3) fail('rooms.json: має бути 3 види номерів');
else {
  if (!same(rooms.map((r) => r.price), [2500, 2800, 3000])) fail('rooms.json: ціни мають бути 2500, 2800, 3000');
  if (!same(rooms.map((r) => r.promoPrice), [2000, 2240, 2400])) fail('rooms.json: ціни акції мають бути 2000, 2240, 2400');
  if (!same(rooms.map((r) => r.title), ['Стандарт', 'Напівлюкс', 'Люкс'])) fail('rooms.json: назви Стандарт, Напівлюкс, Люкс');
  for (const r of rooms) {
    if (r.count !== '2 номери цього типу') fail(`rooms.json ${r.id}: count має бути "2 номери цього типу" (R4)`);
    if (!/^2 гості$/.test(r.capacity)) fail(`rooms.json ${r.id}: місткість має бути "2 гості" (R4)`);
    if (r.category !== 'rooms') fail(`rooms.json ${r.id}: category rooms`);
  }
  if (new Set(rooms.map((r) => r.id)).size !== 3) fail('rooms.json: id не унікальні');
}

// cottages: 2 види по 2, 6000 і 7000, акція тільки у котеджа на 4 (R5, R9), без "будинку на 12"
const cottages = readJson('cottages.json');
if (!cottages || cottages.length !== 2) fail('cottages.json: має бути 2 види котеджів');
else {
  if (!same(cottages.map((c) => c.price), [6000, 7000])) fail('cottages.json: ціни мають бути 6000 і 7000');
  if (cottages[0].promoPrice !== 4800 || cottages[1].promoPrice !== undefined) fail('cottages.json: ціна акції 4800 тільки у котеджа на 4 гості (R9)');
  for (const c of cottages) {
    if (c.count !== '2 котеджі цього типу') fail(`cottages.json ${c.id}: count має бути "2 котеджі цього типу" (R5)`);
    if (/12/.test(`${c.title} ${c.capacity}`)) fail(`cottages.json ${c.id}: "на 12" не має бути на сторінці котеджів (R5)`);
    if (c.category !== 'cottages') fail(`cottages.json ${c.id}: category cottages`);
  }
}

// photos.json: паспорт фото, на нього посилаються дані
const photos = readJson('photos.json') || {};

// barn: один дім, два тарифи (R6), без "дім на 12" як окремої позиції
const barn = readJson('barn.json');
if (!barn || Array.isArray(barn)) fail('barn.json: має бути один об\'єкт (один дім, R6)');
else {
  if (barn.title !== 'Барн-хаус') fail('barn.json: назва "Барн-хаус" (через дефіс)');
  if (barn.category !== 'barn') fail('barn.json: category barn');
  if (barn.price !== undefined) fail('barn.json: замість price мають бути tariffs (R6)');
  if (!same(barn.tariffs, [{ label: 'до 8 гостей', amount: 11000 }, { label: 'до 12 гостей', amount: 13000 }])) fail('barn.json: tariffs мають бути "до 8 гостей" 11000 і "до 12 гостей" 13000 (R6)');
  if (!barn.included || !barn.included.some((t) => /Starlink/.test(t)) || !barn.included.some((t) => /BBQ/.test(t)) || !barn.included.some((t) => /басейн/i.test(t))) fail('barn.json: included має містити BBQ, басейн і Starlink (як на живому лендингу)');
  if (!Array.isArray(barn.highlights) || barn.highlights.length < 5) fail('barn.json: мало пунктів highlights');
  for (const id of [barn.photo, ...(barn.gallery || [])]) {
    if (!photos[id]) fail(`barn.json: фото "${id}" немає в photos.json`);
    else if (photos[id].verify) fail(`barn.json: фото "${id}" позначене verify, у галерею йдуть тільки підтверджені кадри`);
  }
  if (new Set(barn.gallery).size !== (barn.gallery || []).length) fail('barn.json: у gallery є повтори');
}
for (const [name, list] of [['rooms', rooms], ['cottages', cottages]]) {
  for (const item of list || []) {
    if (item.photo && !photos[item.photo]) fail(`${name}.json ${item.id}: фото "${item.photo}" немає в photos.json`);
  }
}

// spa: 600 + 200, склад комплексу, картки, фото
const spa = readJson('spa.json');
if (!spa) fail('spa.json: немає файлу');
else {
  if (spa.price.first !== 600 || spa.price.next !== 200) fail('spa.json: тариф має бути 600 за першу годину і 200 за кожну наступну');
  const need = ['Дві парні', 'Зал відпочинку до 20 осіб', 'Басейн', 'Купіль', 'Водоспади', 'Кімната-сіновал', 'Чан просто неба'];
  if (!same(spa.complex, need)) fail(`spa.json: склад комплексу має бути ${need.join(', ')}`);
  if (!/банщик/i.test(spa.bathAttendant || '') || /\d/.test(spa.bathAttendant || '')) fail('spa.json: банщик за доплату, без суми (суми в джерелах немає)');
  if (!spa.cards || !same(spa.cards.map((c) => c.id), ['banya', 'chan', 'pool'])) fail('spa.json: картки banya, chan, pool');
  for (const id of [spa.photo, ...(spa.gallery || []), ...((spa.cards || []).map((c) => c.photo))]) {
    if (!photos[id]) fail(`spa.json: фото "${id}" немає в photos.json`);
    else if (photos[id].verify) fail(`spa.json: фото "${id}" позначене verify (ялинка на кадрі тощо), у галерею йдуть підтверджені кадри`);
  }
  if (new Set(spa.gallery).size !== (spa.gallery || []).length) fail('spa.json: у gallery є повтори');
}

// menu: 28 позицій з фото меню від 28.08.2026 (секція, id, ціна, вага). Десертів і алкоголю немає (у джерелі порожньо).
const MENU_EXPECTED = {
  breakfasts: [['oatmeal', 180, '200 г'], ['fried-eggs', 350, null], ['omelette', 350, '250-280 г'], ['syrnyky', 350, '210/50 г'], ['varenyky-cherry', 280, '240 г']],
  'first-courses': [['broth-noodles', 200, '300 мл'], ['borscht', 250, '300 мл']],
  'hot-and-salads': [['teriyaki-noodles', 340, '320 г'], ['french-fries', 150, '150 г'], ['potato-pan-mushrooms', 320, '280 г'], ['potato-pan-brisket', 330, '280 г'], ['grilled-vegetables', 250, '200 г'], ['caesar', 350, '250 г'], ['deruny', 270, '450 г'], ['chicken-breast-fries', 370, '200/150 г'], ['chicken-nuggets', 220, '200 г'], ['burger', 380, null], ['carbonara', 360, '320 г']],
  pizza: [['pizza-meat', 450, '550-600 г'], ['pizza-pepperoni', 400, '450-520 г'], ['pizza-margherita', 350, '450-520 г'], ['pizza-four-cheese', 410, '450-520 г']],
  drinks: [['tea', 80, null], ['americano', 120, null], ['latte', 150, null], ['cappuccino', 120, null], ['uzvar', 80, '250 мл'], ['juice', 100, null]],
};
const menu = readJson('menu.json');
if (!menu || !Array.isArray(menu.sections)) fail('menu.json: немає sections');
else {
  if (menu.currency !== 'UAH') fail('menu.json: currency має бути UAH');
  if (!same(menu.sections.map((s) => s.id), Object.keys(MENU_EXPECTED))) fail(`menu.json: розділи мають бути ${Object.keys(MENU_EXPECTED).join(', ')} (без десертів: позицій у джерелі немає)`);
  let total = 0;
  const seen = new Set();
  for (const s of menu.sections) {
    const exp = MENU_EXPECTED[s.id] || [];
    if (!s.title) fail(`menu.json ${s.id}: немає title`);
    if (!same(s.items.map((i) => [i.id, i.price, i.weight ?? null]), exp)) fail(`menu.json ${s.id}: позиції, ціни чи вага не збігаються з меню від 28.08.2026 (фото "меню тур.jpg")`);
    for (const i of s.items) {
      total += 1;
      if (seen.has(i.id)) fail(`menu.json: id "${i.id}" повторюється`);
      seen.add(i.id);
      if (!i.title) fail(`menu.json ${i.id}: немає title`);
      if (!Number.isInteger(i.price) || i.price <= 0) fail(`menu.json ${i.id}: ціна має бути цілим додатним числом`);
      if (i.variants && (!Array.isArray(i.variants) || i.variants.some((v) => typeof v !== 'string' || !v))) fail(`menu.json ${i.id}: variants має бути списком рядків`);
    }
  }
  if (total !== 28) fail(`menu.json: має бути 28 позицій, є ${total}`);
  if (!same((menu.sections.find((s) => s.id === 'breakfasts')?.items.find((i) => i.id === 'omelette')?.variants), ['з сиром та шинкою (у вершках)', 'з беконом та помідором', 'з помідорами чері та базиліком'])) fail('menu.json: у омлету мають бути три варіанти з меню');
  if (/десерт/i.test(JSON.stringify(menu))) fail('menu.json: десертів у джерелі немає, позиції не вигадувати');
  if (/алкогол|вино|пиво|коктейл|віскі|горілк|шампанськ|лікер|самогон|настоянк/i.test(JSON.stringify(menu))) fail('menu.json: алкоголю в меню немає');
}

// cafe: факти про кафе, години роботи невідомі (null), фото з паспорта без verify
const cafe = readJson('cafe.json');
if (!cafe) fail('cafe.json: немає файлу');
else {
  if (cafe.title !== 'Кафе та піца-бар') fail('cafe.json: title "Кафе та піца-бар"');
  if (cafe.hours !== null) fail('cafe.json: годин роботи в джерелах немає, hours має бути null (R7)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cafe.menuUpdated || '')) fail('cafe.json: menuUpdated має бути датою YYYY-MM-DD');
  else if (cafe.menuUpdated !== '2026-08-28') fail('cafe.json: меню від 2026-08-28 (змінювати дату тільки після нового меню)');
  for (const k of ['serves', 'cuisine']) if (!Array.isArray(cafe[k]) || !cafe[k].length) fail(`cafe.json: ${k} має бути непустим списком`);
  for (const id of [cafe.photo, ...(cafe.gallery || [])]) {
    if (!photos[id]) fail(`cafe.json: фото "${id}" немає в photos.json`);
    else if (photos[id].verify) fail(`cafe.json: фото "${id}" позначене verify`);
  }
  if (new Set(cafe.gallery).size !== (cafe.gallery || []).length) fail('cafe.json: у gallery є повтори');
  if (!(cafe.gallery || []).includes(cafe.photo)) fail('cafe.json: головне фото має бути і в gallery');
}

// faq: 8 питань з живого FAQ і нових підтверджених фактів; суми, телефон і тарифи в відповідях збігаються з даними (T2, C6, R6)
const site = readJson('site.json');
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const plain = (s) => String(s || '').replace(/ /g, ' ');
const FAQ_IDS = ['stay-prices', 'barn-price', 'banya', 'pool', 'internet', 'pets', 'cafe', 'booking'];
const faq = readJson('faq.json');
if (!Array.isArray(faq)) fail('faq.json: має бути масив питань');
else {
  if (!same(faq.map((f) => f.id), FAQ_IDS)) fail(`faq.json: питання мають бути ${FAQ_IDS.join(', ')}`);
  const answer = Object.fromEntries(faq.map((f) => [f.id, plain(f.a)]));
  for (const f of faq) {
    if (!f.q || !f.q.trim().endsWith('?')) fail(`faq.json ${f.id}: питання має закінчуватись на "?"`);
    if (!f.a || f.a.length < 20) fail(`faq.json ${f.id}: відповідь порожня або надто коротка`);
    if (/[–—]/.test(`${f.q} ${f.a}`)) fail(`faq.json ${f.id}: у тексті довге тире, пишемо двокрапку, кому або крапку`);
    if (!Array.isArray(f.links)) fail(`faq.json ${f.id}: links має бути масивом (може бути порожнім)`);
    for (const l of f.links || []) if (!NAV_URLS.includes(l.url) || !l.label) fail(`faq.json ${f.id}: посилання ${l.url} не з nav.json або без підпису`);
  }
  const need = (id, parts) => { for (const p of parts) if (!(answer[id] || '').toLowerCase().includes(p.toLowerCase())) fail(`faq.json ${id}: у відповіді немає "${p}"`); };
  if (rooms && cottages) need('stay-prices', [...rooms.map((r) => `${money(r.price)} грн`), ...cottages.map((c) => `${money(c.price)} грн`)]);
  if (barn && barn.tariffs) need('barn-price', ['один окремий будинок', ...barn.tariffs.map((t) => `${t.label} `), ...barn.tariffs.map((t) => `${money(t.amount)} грн`), 'BBQ']);
  if (spa) need('banya', [`${spa.price.first} грн з особи за першу годину`, `${spa.price.next} грн`, 'банщика']);
  need('pool', ['весняно-осінній']);
  need('internet', ['Starlink']);
  need('pets', ['10 кг', '500 грн']);
  need('booking', [site.phone.display, 'BookmeNow']);
  if (!(faq.find((f) => f.id === 'cafe')?.links || []).some((l) => l.url === '/kafe/')) fail('faq.json cafe: потрібне посилання на /kafe/');
}

// reviews: реальні відгуки дослівно, з підписом "Відгук з Google", без агрегованого рейтингу (ТЗ §7.2)
const REVIEW_TEXTS = {
  obrucheva: 'Давно не отримувала такого задоволення від відпочинку! Це місце закохує в себе з перших хвилин. Неймовірна природа, спокій, свіже повітря та краєвиди, від яких просто неможливо відвести погляд.',
  andy: 'Чудовий вибір відпочинку неподалік від Києва за прийнятні кошти з можливістю поплавати в басейні та позасмагати.',
};
const reviews = readJson('reviews.json');
if (!reviews) fail('reviews.json: немає файлу');
else {
  if (reviews.label !== 'Відгук з Google') fail('reviews.json: підпис має бути "Відгук з Google" (ТЗ §6)');
  if (reviews.source !== 'Google') fail('reviews.json: source Google');
  if (!same((reviews.items || []).map((i) => i.id), Object.keys(REVIEW_TEXTS))) fail(`reviews.json: відгуки мають бути ${Object.keys(REVIEW_TEXTS).join(', ')}`);
  for (const i of reviews.items || []) {
    if (!i.author) fail(`reviews.json ${i.id}: немає автора`);
    if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) fail(`reviews.json ${i.id}: rating 1-5`);
    if (REVIEW_TEXTS[i.id] !== undefined && i.text !== REVIEW_TEXTS[i.id]) fail(`reviews.json ${i.id}: текст відгуку змінено, відгуки цитуємо дослівно`);
  }
  if (/aggregateRating|ratingValue|reviewCount|ratingCount|bestRating|worstRating/i.test(JSON.stringify(reviews))) fail('reviews.json: агрегованого рейтингу на сайті немає (ТЗ §7.2, питання 11)');
}

// texts/*.json: тексти сторінок. Цін у текстах немає (вони беруться з _data, ТЗ §6), діють правила C1-C9
const contentDir = path.join(dataDir, 'texts');
const contentFiles = fs.existsSync(contentDir) ? fs.readdirSync(contentDir).filter((n) => n.endsWith('.json')) : [];
const readContent = (n) => JSON.parse(fs.readFileSync(path.join(contentDir, n), 'utf8'));
const collectLinks = (node, acc = []) => {
  if (Array.isArray(node)) node.forEach((n) => collectLinks(n, acc));
  else if (node && typeof node === 'object') {
    if (typeof node.url === 'string') acc.push(node.url);
    Object.values(node).forEach((v) => collectLinks(v, acc));
  }
  return acc;
};
// усі текстові рядки дерева (для правил, що мають діяти в межах одного рядка, а не через сусідні поля JSON)
const collectStrings = (node, acc = []) => {
  if (typeof node === 'string') acc.push(node);
  else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, acc));
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => collectStrings(v, acc));
  return acc;
};
for (const f of contentFiles) {
  const data = readContent(f);
  const all = JSON.stringify(data);
  scan(data, `texts/${f}`, true);
  if (/грн/i.test(all)) fail(`texts/${f}: у текстах сторінок цін немає, вони беруться з _data (ТЗ §6)`);
  if (/[–—]/.test(all)) fail(`texts/${f}: у тексті довге тире, пишемо двокрапку, кому або крапку`);
  if (/TUR HOUSE|Tur house|tur house|TurHouse|Tur-House/.test(all)) fail(`texts/${f}: назва пишеться "Tur House", капс тільки через CSS (C8)`);
  for (const u of collectLinks(data)) if (!NAV_URLS.includes(u) && u !== '/pryvatnist/') fail(`texts/${f}: посилання ${u} не веде на сторінку сайту`);
}

// texts/home.json: головна (E3-T7). SEO-кластер, блоки ТЗ §6, R4-R7
const home = contentFiles.includes('home.json') ? readContent('home.json') : null;
if (!home) fail('texts/home.json: немає файлу');
else {
  const m = home.meta || {};
  if (!m.title || m.title.length < 30 || m.title.length > 65 || !/Tur House/.test(m.title) || !/Беремицьке/.test(m.title)) fail('texts/home.json: meta.title 30-65 знаків, з "Tur House" і "Беремицьке"');
  if (!m.description || m.description.length < 70 || m.description.length > 160) fail(`texts/home.json: meta.description 70-160 знаків, є ${(m.description || '').length}`);
  if (!home.hero?.h1 || !/Беремицьке/.test(home.hero.h1)) fail('texts/home.json: hero.h1 порожній або без "Беремицьке"');
  if (!same(home.hero?.tags, ['Котеджі', 'Басейн з підігрівом', 'Чан', 'Баня на дровах', 'Starlink'])) fail('texts/home.json: hero.tags як на живому лендингу (C5)');
  if (!Array.isArray(home.intro?.points) || home.intro.points.length !== 3) fail('texts/home.json: intro.points має бути 3 пункти');
  const introText = (home.intro?.points || []).join(' ');
  if (!/відпочинок під Києвом/i.test(introText) || !/Чернігівщин/.test(introText)) fail('texts/home.json: у вступі має бути кластер "відпочинок під Києвом" (ТЗ §6) і чесне "Чернігівщина"');
  const fmt = home.formats?.items || [];
  if (!same(fmt.map((i) => i.id), ['rooms', 'cottages', 'barn']) || !same(fmt.map((i) => i.link?.url), ['/nomery/', '/kotedzhi/', '/barn-house/'])) fail('texts/home.json: formats.items rooms, cottages, barn з посиланнями на свої сторінки (R4-R6: три формати)');
  else {
    if (!/по два номери/.test(fmt[0].desc)) fail('texts/home.json: rooms.desc має говорити "по два номери кожного виду" (R4)');
    if (!/Два котеджі на 4 гості й два на 6 гостей/.test(fmt[1].desc)) fail('texts/home.json: cottages.desc має говорити "два котеджі на 4 гості й два на 6 гостей" (R5)');
    if (!/до 8 або до 12 гостей/.test(fmt[2].desc) || !/Окремий будинок/.test(fmt[2].desc)) fail('texts/home.json: barn.desc "Окремий будинок ... до 8 або до 12 гостей" (R6: один дім, два тарифи)');
  }
  if (!/BBQ/.test(home.formats?.included || '') || !/басейн/.test(home.formats?.included || '')) fail('texts/home.json: formats.included має говорити про BBQ і басейн');
  if (home.spa?.link?.url !== '/banya-ta-spa/' || home.cafe?.link?.url !== '/kafe/' || home.area?.link?.url !== '/okolitsi/' || home.location?.link?.url !== '/yak-distatysya/') fail('texts/home.json: посилання spa, cafe, area, location на свої сторінки');
  if (!same((home.territory?.items || []).map((i) => i.id), ['pool', 'bbq', 'starlink'])) fail('texts/home.json: territory.items pool, bbq, starlink');
  // тизер кафе: усе, що названо, є в menu.json (C6), "чотири види піци" = 4 позиції піци
  const menuItems = (menu?.sections || []).flatMap((s) => s.items);
  const hasItem = (id) => menuItems.some((i) => i.id === id);
  const cafeText = home.cafe?.text || '';
  for (const [word, id] of [['сирники', 'syrnyky'], ['вареники з вишнями', 'varenyky-cherry'], ['омлет', 'omelette'], ['борщ', 'borscht'], ['дируни', 'deruny'], ['карбонара', 'carbonara']]) {
    if (new RegExp(word, 'i').test(cafeText) && !hasItem(id)) fail(`texts/home.json: у тизері кафе "${word}", а в menu.json немає позиції ${id}`);
  }
  if (/чотири види піци/.test(cafeText) && (menu?.sections.find((s) => s.id === 'pizza')?.items.length !== 4)) fail('texts/home.json: "чотири види піци", а в menu.json їх не чотири');
  if (/десерт|алкогол|вино|пиво|коктейл/i.test(cafeText)) fail('texts/home.json: у тизері кафе десертів і алкоголю немає в джерелі');
  // фото з паспорта, без verify
  const homePhotos = [home.hero?.photo, home.spa?.photo, home.cafe?.photo, home.area?.photo, ...fmt.map((i) => i.photo)].filter(Boolean);
  for (const id of homePhotos) {
    if (!photos[id]) fail(`texts/home.json: фото "${id}" немає в photos.json`);
    else if (photos[id].verify) fail(`texts/home.json: фото "${id}" позначене verify`);
  }
  // перелінковка: головна веде мінімум на 6 інших розділів
  const linked = new Set(collectLinks(home));
  if (linked.size < 6) fail(`texts/home.json: головна посилається лише на ${linked.size} розділів, потрібно не менше 6 (перелінковка)`);
}

// Спільна перевірка meta сторінок: title 30-65, description 70-160, breadcrumbTitle
const checkMeta = (file, m, { titleHas = [], descHas = [] } = {}) => {
  if (!m?.title || m.title.length < 30 || m.title.length > 65) fail(`texts/${file}: meta.title 30-65 знаків, є ${(m?.title || '').length}`);
  for (const w of titleHas) if (!(m?.title || '').includes(w)) fail(`texts/${file}: meta.title має містити "${w}"`);
  if (!m?.description || m.description.length < 70 || m.description.length > 160) fail(`texts/${file}: meta.description 70-160 знаків, є ${(m?.description || '').length}`);
  for (const w of descHas) if (!(m?.description || '').toLowerCase().includes(w.toLowerCase())) fail(`texts/${file}: meta.description має містити "${w}"`);
  if (!m?.breadcrumbTitle) fail(`texts/${file}: немає meta.breadcrumbTitle`);
};
// Фото сторінки: є в паспорті, без verify (окрім явно дозволених id)
const checkPagePhotos = (file, ids, verifyOk = []) => {
  for (const id of ids.filter(Boolean)) {
    if (!photos[id]) fail(`texts/${file}: фото "${id}" немає в photos.json`);
    else if (photos[id].verify && !verifyOk.includes(id)) fail(`texts/${file}: фото "${id}" позначене verify і не дозволене на цій сторінці`);
  }
};

// texts/nomery.json: сторінка номерів (E3-T8). У джерелах немає нічого про відмінності між видами номерів, тому зручності не вигадуємо (C6)
const nomery = contentFiles.includes('nomery.json') ? readContent('nomery.json') : null;
if (!nomery) fail('texts/nomery.json: немає файлу');
else {
  checkMeta('nomery.json', nomery.meta, { titleHas: ['Номери', 'Tur House', 'Беремицьке'], descHas: ['під Києвом', 'номер'] });
  if (!/Номери/.test(nomery.hero?.h1 || '') || !/готел/.test(nomery.hero?.h1 || '')) fail('texts/nomery.json: hero.h1 має містити "Номери" і "готелі"');
  if (!/Шість номерів/.test(nomery.hero?.lede || '') || !/по два/.test(nomery.hero?.lede || '')) fail('texts/nomery.json: hero.lede "Шість номерів ... по два" (R4)');
  const introT = nomery.intro?.text || '';
  for (const w of ['готель', 'біля Десни', 'під Києвом', 'Чернігівщин']) if (!new RegExp(w, 'i').test(introT)) fail(`texts/nomery.json: у вступі немає "${w}" (кластер ТЗ §6 і чесне місце)`);
  if (rooms && rooms.length === 3) {
    const t = rooms.map((r) => r.title);
    const names = `${t.slice(0, -1).join(', ')} і ${t[t.length - 1]}`;
    if (!(nomery.types?.lead || '').includes(names) || !/по два номери/.test(nomery.types.lead) || !/двоє гостей/.test(nomery.types.lead)) fail(`texts/nomery.json: types.lead "${names}", "по два номери", "двоє гостей" (R4)`);
  }
  if (!/головному корпусі/.test(nomery.where?.text || '')) fail('texts/nomery.json: where.text має говорити про головний корпус');
  const incl = (nomery.included?.items || []).join(' ');
  for (const w of ['BBQ', 'басейн', 'Starlink']) if (!new RegExp(w, 'i').test(incl)) fail(`texts/nomery.json: included.items без "${w}"`);
  if (!/до 8 або до 12 гостей/.test(nomery.group?.text || '') || !/чотирьох і шести гостей/.test(nomery.group?.text || '')) fail('texts/nomery.json: group.text про котеджі на 4 і 6 гостей і Барн-хаус до 8 або до 12 гостей (R5, R6)');
  if (!/BookmeNow/.test(nomery.booking?.text || '') || !/Direct/.test(nomery.booking?.text || '')) fail('texts/nomery.json: booking.text має згадувати BookmeNow і Instagram Direct');
  // зручності, яких немає в джерелах: площа, санвузол, кондиціонер, чайник, телевізор, сніданок, балкон, вид з вікна
  if (new RegExp(`(?<![${CYR_CLASS}])(кв\\.?\\s?м|м²|санвуз|ванн|душ|кондиціонер|чайник|телевізор|снідан|холодильник|балкон|вид на|вид з)`, 'i').test(JSON.stringify(nomery))) fail('texts/nomery.json: у тексті є зручності, яких немає в джерелах (площа, санвузол, кондиціонер, сніданок тощо), C6');
  // фото: hero і where без verify; галерея номерів 4 кадри, verify дозволений лише для них (тип номера не підтверджено, питання 8)
  const ROOM_GALLERY_OK = ['rooms/room-burgundy', 'rooms/room-white-brown', 'rooms/room-blue', 'rooms/room-panorama-window'];
  checkPagePhotos('nomery.json', [nomery.hero?.photo, nomery.where?.photo]);
  checkPagePhotos('nomery.json', nomery.gallery?.photos || [], ROOM_GALLERY_OK);
  if (!same(nomery.gallery?.photos, ROOM_GALLERY_OK)) fail('texts/nomery.json: у галереї номерів мають бути 4 кадри без room-wood-wall (схожий на спальню Барн-хауса, питання 8)');
  const linkedN = new Set(collectLinks(nomery));
  for (const u of ['/kotedzhi/', '/barn-house/', '/banya-ta-spa/', '/kafe/']) if (!linkedN.has(u)) fail(`texts/nomery.json: немає посилання на ${u} (перелінковка)`);
}

// texts/kotedzhi.json: сторінка котеджів (E3-T9). Підтверджено лише: двокімнатні, кухня, зона BBQ, власна тераса, мангал, 2+2 котеджі (R5)
const kotedzhi = contentFiles.includes('kotedzhi.json') ? readContent('kotedzhi.json') : null;
if (!kotedzhi) fail('texts/kotedzhi.json: немає файлу');
else {
  checkMeta('kotedzhi.json', kotedzhi.meta, { titleHas: ['Котеджі', 'Tur House'], descHas: ['під Києвом', 'котедж'] });
  if (!/Котеджі/.test(kotedzhi.hero?.h1 || '')) fail('texts/kotedzhi.json: hero.h1 має містити "Котеджі"');
  const capN = (cottages || []).map((c) => Number((c.capacity.match(/\d+/) || [])[0]));
  if (!same(capN, [4, 6])) fail('texts/kotedzhi.json: у cottages.json місткість має бути 4 і 6 гостей (R5)');
  for (const [where, t] of [['hero.lede', kotedzhi.hero?.lede], ['types.lead', kotedzhi.types?.lead]]) {
    if (!/(два котеджі|два) на 4 гості й два на 6 гостей/i.test(t || '')) fail(`texts/kotedzhi.json: ${where} "два на 4 гості й два на 6 гостей" (R5)`);
  }
  if (!/Чотири котеджі/.test(kotedzhi.hero?.lede || '') || !/двокімнатні/i.test(kotedzhi.hero?.lede || '')) fail('texts/kotedzhi.json: hero.lede "Чотири котеджі ... двокімнатні" (R5, джерело LIVE)');
  const introK = kotedzhi.intro?.text || '';
  for (const w of ['під Києвом', 'Чернігівщин', 'кухня', "сім.ї"]) if (!new RegExp(w, 'i').test(introK)) fail(`texts/kotedzhi.json: у вступі немає "${w}" (кластер ТЗ §6 «котедж під Києвом з кухнею», «котедж для сім'ї»)`);
  const kit = kotedzhi.kitchen?.text || '';
  for (const w of ['кухня', 'тераса', 'мангал', 'BBQ']) if (!new RegExp(w, 'i').test(kit)) fail(`texts/kotedzhi.json: у kitchen.text немає "${w}"`);
  const inclK = (kotedzhi.included?.items || []).join(' ');
  for (const w of ['BBQ', 'басейн', 'Starlink']) if (!new RegExp(w, 'i').test(inclK)) fail(`texts/kotedzhi.json: included.items без "${w}"`);
  if (!/до 8 або до 12 гостей/.test(kotedzhi.group?.text || '') || !/двох гостей/.test(kotedzhi.group?.text || '')) fail('texts/kotedzhi.json: group.text про номери для двох гостей і Барн-хаус до 8 або до 12 гостей (R4, R6)');
  if (!/BookmeNow/.test(kotedzhi.booking?.text || '') || !/Direct/.test(kotedzhi.booking?.text || '')) fail('texts/kotedzhi.json: booking.text має згадувати BookmeNow і Instagram Direct');
  // комплектація, якої немає в джерелах (у ТЗ є посуд, опалення, постіль, але живий лендинг їх не підтверджує), Wi-Fi у котеджах (тільки "на території"), спальні, площа, вечірній вигляд
  if (new RegExp(`(?<![${CYR_CLASS}])(посуд|опален|постіль|постільн|білизн|рушник|кондиціонер|камін|телевізор|санвуз|ванн|душ|спальн|спален|снідан|кв\\.?\\s?м|м²|паркін|парковк|дитяч|холодильник|балкон)|wi-?fi|вайфай`, 'i').test(JSON.stringify(kotedzhi))) fail('texts/kotedzhi.json: у тексті є комплектація або зручності, яких немає в джерелах (посуд, опалення, спальні, Wi-Fi тощо), C6');
  // фото: інтер'єри з фіолетовими стінами (verify, питання 9) на сторінку не ставимо; у галереї два підтверджені фасадні кадри
  checkPagePhotos('kotedzhi.json', [kotedzhi.hero?.photo, ...(kotedzhi.gallery?.photos || [])]);
  if (!same(kotedzhi.gallery?.photos, ['cottages/cottage-orange', 'cottages/cottages-sunset'])) fail('texts/kotedzhi.json: у галереї два підтверджені фасадні кадри (інтер\'єри з verify чекають відповіді на питання 9)');
  const linkedK = new Set(collectLinks(kotedzhi));
  for (const u of ['/nomery/', '/barn-house/', '/banya-ta-spa/', '/kafe/']) if (!linkedK.has(u)) fail(`texts/kotedzhi.json: немає посилання на ${u} (перелінковка)`);
}

// texts/barn-house.json: сторінка Барн-хауса (E3-T10). R6: один дім, два тарифи; факти тільки з barn.json (живий лендинг), планування невідоме
const barnPage = contentFiles.includes('barn-house.json') ? readContent('barn-house.json') : null;
if (!barnPage) fail('texts/barn-house.json: немає файлу');
else {
  checkMeta('barn-house.json', barnPage.meta, { titleHas: ['Барн-хаус', 'Tur House'], descHas: ['під Києвом', 'Барн-хаус', 'до 8 або до 12 гостей'] });
  if (!/Барн-хаус/.test(barnPage.hero?.h1 || '') || !/окремий будинок/i.test(barnPage.hero?.h1 || '')) fail('texts/barn-house.json: hero.h1 "Барн-хаус: окремий будинок ..."');
  if (!/Один будинок/.test(barnPage.hero?.lede || '') || !/До 8 або до 12 гостей/.test(barnPage.hero?.lede || '')) fail('texts/barn-house.json: hero.lede "Один будинок ... До 8 або до 12 гостей" (R6)');
  const introB = barnPage.intro?.text || '';
  if (!/будинок для компанії під Києвом/i.test(introB) || !/Чернігівщин/.test(introB)) fail('texts/barn-house.json: у вступі кластер ТЗ «будинок для компанії під Києвом» і «Чернігівщина»');
  if (!/Будинок один/.test(barnPage.tariffs?.text || '') || !/до 8 або до 12/.test(barnPage.tariffs?.text || '') || !/за добу/.test(barnPage.tariffs?.text || '')) fail('texts/barn-house.json: tariffs.text "Будинок один ... до 8 або до 12 ... за добу" (R6)');
  // inside і outside збігаються з підтвердженими пунктами barn.json
  const hl = barn?.highlights || [];
  const inside = `${barnPage.inside?.lead || ''}`;
  for (const w of ['Панорамне скління на два поверхи', 'вітальня з каміном і великим диваном', 'кухня з технікою та обіднім столом', 'Спальні розташовані на двох поверхах', 'на другому поверсі є зона з телевізором']) if (!inside.includes(w)) fail(`texts/barn-house.json: inside.lead без "${w}" (пункт із barn.json)`);
  for (const w of ['Панорамне скління на два поверхи', 'Вітальня з каміном і великим диваном', 'Кухня з технікою та обіднім столом', 'Спальні на двох поверхах', 'На другому поверсі зона з телевізором']) if (!hl.includes(w)) fail(`barn.json: у highlights немає "${w}", на який спирається texts/barn-house.json`);
  const outside = barnPage.outside?.text || '';
  if (!/власна ділянка з газоном/.test(outside) || !/З вікон видно басейн і дитячий майданчик/.test(outside) || !hl.includes('Власна ділянка з газоном') || !hl.includes('З вікон видно басейн і дитячий майданчик')) fail('texts/barn-house.json: outside.text "власна ділянка з газоном" і "З вікон видно басейн і дитячий майданчик" (є в barn.json)');
  const inclB = (barnPage.included?.items || []).join(' ');
  for (const w of ['BBQ', 'басейн', 'Starlink']) if (!new RegExp(w, 'i').test(inclB)) fail(`texts/barn-house.json: included.items без "${w}"`);
  if (!/двох гостей/.test(barnPage.group?.text || '') || !/чотирьох і шести гостей/.test(barnPage.group?.text || '')) fail('texts/barn-house.json: group.text про номери для двох гостей і котеджі для чотирьох і шести (R4, R5)');
  if (!/BookmeNow/.test(barnPage.booking?.text || '') || !/Direct/.test(barnPage.booking?.text || '')) fail('texts/barn-house.json: booking.text має згадувати BookmeNow і Instagram Direct');
  // чого в джерелах немає: число спалень і ліжок, огороджена територія, мангал, джакузі, паркінг, заходи (корпоратив, весілля, банкет, музика), Wi-Fi, сніданок, кондиціонер
  const barnJson = JSON.stringify(barnPage);
  if (new RegExp(`(?<![${CYR_CLASS}])(мангал|джакузі|огороджен|паркін|парковк|кондиціонер|корпоратив|весілл|банкет|вечірк|музик|караоке|фотосесі|снідан|сауна)|wi-?fi|вайфай`, 'i').test(barnJson)) fail('texts/barn-house.json: у тексті є умови або зручності, яких немає в джерелах (огороджена територія, мангал, корпоративи, Wi-Fi тощо), C6');
  if (/(\d+|одна|одне|два|дві|три|чотири|п'ять|шість|сім|вісім|дев'ять|десять)\s+(спальн|спален|ліжк|ліжок|ліжко|кімнат)/i.test(barnJson)) fail('texts/barn-house.json: кількість спалень і ліжок невідома (питання 2), не вказувати');
  // фото: hero без verify; галерея береться з barn.json, де verify заборонений
  checkPagePhotos('barn-house.json', [barnPage.hero?.photo]);
  if (barnPage.hero?.photo !== barn?.photo) fail('texts/barn-house.json: hero.photo має збігатися з barn.photo');
  const linkedB = new Set(collectLinks(barnPage));
  for (const u of ['/nomery/', '/kotedzhi/', '/banya-ta-spa/', '/kafe/']) if (!linkedB.has(u)) fail(`texts/barn-house.json: немає посилання на ${u} (перелінковка)`);
}

// texts/banya-ta-spa.json: сторінка бані та спа (E3-T11). Ціна 600+200 і склад комплексу беруться з spa.json; цін у тексті немає.
// Невідомо з джерел: ціна чана і банщика, скільки людей у чані, години роботи, порядок бронювання бані, чи можна без проживання.
const spaPage = contentFiles.includes('banya-ta-spa.json') ? readContent('banya-ta-spa.json') : null;
if (!spaPage) fail('texts/banya-ta-spa.json: немає файлу');
else {
  checkMeta('banya-ta-spa.json', spaPage.meta, { titleHas: ['Баня', 'чаном', 'під Києвом', 'Tur House'], descHas: ['під Києвом', 'чан'] });
  if (!/Баня/.test(spaPage.hero?.h1 || '') || !/чан/i.test(spaPage.hero?.h1 || '')) fail('texts/banya-ta-spa.json: hero.h1 має містити "Баня" і "чан"');
  if (!/весняно-осінній/.test(spaPage.hero?.lede || '')) fail('texts/banya-ta-spa.json: hero.lede про басейн має казати "весняно-осінній сезон"');
  const introS = spaPage.intro?.text || '';
  if (!/Банний комплекс/.test(introS) || !/Чернігівська область/.test(introS) || !/баня з чаном під Києвом/i.test(introS)) fail('texts/banya-ta-spa.json: у вступі кластери ТЗ «баня з чаном під Києвом», «банний комплекс Чернігівська область»');
  // склад комплексу в тексті = spa.complex (7 пунктів у тому ж порядку)
  const lead = (spaPage.complex?.lead || '').toLowerCase();
  const cplx = (spa?.complex || []).map((c) => c.toLowerCase());
  let pos = -1;
  for (const c of cplx) { const p = lead.indexOf(c, pos + 1); if (p < 0) { fail(`texts/banya-ta-spa.json: у complex.lead немає "${c}" (spa.json)`); break; } pos = p; }
  const priceT = spaPage.price?.text || '';
  for (const w of ['з особи', 'першу годину', 'наступну', 'попереднім бронюванням', 'банщика']) if (!priceT.includes(w)) fail(`texts/banya-ta-spa.json: у price.text немає "${w}"`);
  if (!/Direct/.test(spaPage.booking?.text || '') || !/зателефонуйте/.test(spaPage.booking?.text || '')) fail('texts/banya-ta-spa.json: booking.text має пропонувати телефон і Instagram Direct');
  if (/BookmeNow/.test(JSON.stringify(spaPage))) fail('texts/banya-ta-spa.json: що баню бронюють через BookmeNow, в джерелах немає (BookmeNow для проживання)');
  // не вигадувати: хамам, масаж, сауна, процедури, ретрит, абстрактний велнес, віник, температуру, вартість чана, скільки людей у чані, години, "без проживання"
  const spaJson = JSON.stringify(spaPage);
  if (new RegExp(`(?<![${CYR_CLASS}])(хамам|масаж|сауна|джакузі|скраб|процедур|ретрит|велнес|wellness|спа-відпочин|детокс|віник|температур|цілодобов|щодня|вихідн|без проживання|без ночівлі|на день)`, 'i').test(spaJson)) fail('texts/banya-ta-spa.json: у тексті є послуги, години чи умови, яких немає в джерелах (хамам, масаж, спа-процедури, години роботи, візит без проживання тощо), C2, C6');
  const W = `[${CYR_CLASS}']*`; // \w у JS не знає кирилиці, тому закінчення слів беремо класом літер
  const chanCap = new RegExp(`(чан${W})(\\s+просто\\s+неба)?\\s+(на|для|до|вміщ${W}|розрахован${W}\\s+на)\\s+\\d+|\\d+\\s*(осіб|гостей|людей|чол${W})\\s+(у|в)\\s+чан`, 'i');
  if (collectStrings(spaPage).some((s) => chanCap.test(s))) fail('texts/banya-ta-spa.json: скільки людей у чані, в джерелах немає');
  checkPagePhotos('banya-ta-spa.json', [spaPage.hero?.photo]);
  if (spaPage.hero?.photo !== spa?.photo) fail('texts/banya-ta-spa.json: hero.photo має збігатися з spa.photo');
  const linkedS = new Set(collectLinks(spaPage));
  for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/kafe/']) if (!linkedS.has(u)) fail(`texts/banya-ta-spa.json: немає посилання на ${u} (перелінковка)`);
}

// texts/kafe.json: сторінка кафе та піца-бару (E3-T12, R7). Страви в тексті є в menu.json; годин, доставки, столиків, десертів, алкоголю в джерелах немає.
const kafePage = contentFiles.includes('kafe.json') ? readContent('kafe.json') : null;
if (!kafePage) fail('texts/kafe.json: немає файлу');
else {
  checkMeta('kafe.json', kafePage.meta, { titleHas: ['Кафе', 'Беремицьке', 'Tur House'], descHas: ['піца', 'біля парку «Беремицьке»'] });
  if (!/Кафе та піца-бар/.test(kafePage.hero?.h1 || '')) fail('texts/kafe.json: hero.h1 "Кафе та піца-бар ..." (R7)');
  if (!/на території/.test(kafePage.hero?.lede || '') || !/парком «Беремицьке»/.test(kafePage.hero?.lede || '')) fail('texts/kafe.json: hero.lede про територію і парк «Беремицьке»');
  const introF = kafePage.intro?.text || '';
  if (!/Кафе в Беремицькому/.test(introF)) fail('texts/kafe.json: у вступі кластер ТЗ «кафе Беремицьке» («Кафе в Беремицькому»)');
  // усе, що названо в тексті, є в menu.json; «чотири види піци» = 4 позиції піци; назви піц збігаються з меню
  const kItems = (menu?.sections || []).flatMap((s) => s.items);
  const kHas = (id) => kItems.some((i) => i.id === id);
  const kText = `${kafePage.hero?.lede || ''} ${introF} ${kafePage.pizza?.text || ''} ${kafePage.meta?.description || ''}`;
  for (const [word, id] of [['сирники', 'syrnyky'], ['вареники з вишнями', 'varenyky-cherry'], ['омлет', 'omelette'], ['борщ', 'borscht'], ['бульйон', 'broth-noodles'], ['дируни', 'deruny'], ['карбонара', 'carbonara'], ['бургер', 'burger'], ['паста', 'carbonara'], ['пепероні', 'pizza-pepperoni'], ['маргарита', 'pizza-margherita']]) {
    if (new RegExp(word, 'i').test(kText) && !kHas(id)) fail(`texts/kafe.json: у тексті "${word}", а в menu.json немає позиції ${id}`);
  }
  const pizzaItems = (menu?.sections || []).find((s) => s.id === 'pizza')?.items || [];
  if (pizzaItems.length !== 4) fail('texts/kafe.json: у menu.json має бути 4 піци');
  if (!/чотири види піци/.test(kafePage.intro?.text || '') && !/чотири види піци/.test(kafePage.meta?.description || '')) fail('texts/kafe.json: «чотири види піци» (4 позиції піци в menu.json)');
  const pizzaT = (kafePage.pizza?.text || '').toLowerCase();
  for (const p of pizzaItems) { const name = p.title.toLowerCase().replace(/^4 /, 'чотири '); if (!pizzaT.includes(name)) fail(`texts/kafe.json: у pizza.text немає піци "${name}" з menu.json`); }
  if (!/Свіжа піца просто з печі/.test(kafePage.pizza?.text || '')) fail('texts/kafe.json: pizza.text «Свіжа піца просто з печі» (формулювання живого лендингу, C5)');
  // дата меню = cafe.menuUpdated
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const [yy, mm, dd] = (cafe?.menuUpdated || '').split('-').map(Number);
  const menuDate = `${dd} ${MONTHS[mm - 1]} ${yy} року`;
  if (!(kafePage.menu?.note || '').includes(`станом на ${menuDate}`)) fail(`texts/kafe.json: menu.note має містити "станом на ${menuDate}" (cafe.menuUpdated)`);
  if (!/Direct/.test(kafePage.menu?.note || '') || !/телефоном/.test(kafePage.menu?.note || '')) fail('texts/kafe.json: menu.note має відсилати до телефону та Instagram Direct');
  // години роботи невідомі: текст тільки відсилає до телефону / Direct (cafe.hours === null)
  if (cafe?.hours !== null || !/Години роботи/.test(kafePage.hours?.heading || '') || !/телефоном/.test(kafePage.hours?.text || '') || !/Direct/.test(kafePage.hours?.text || '')) fail('texts/kafe.json: hours.heading "Години роботи", hours.text відсилає до телефону та Direct; cafe.hours має бути null (питання 1)');
  // чого в джерелах немає
  const kafeJson = JSON.stringify(kafePage);
  if (new RegExp(`\\d{1,2}[:.]\\d{2}|з\\s+\\d{1,2}\\s+до\\s+\\d{1,2}|(?<![${CYR_CLASS}])(щодня|цілодобов|пізн|зранку|вихідн|будн|доставк|навинос|з собою|столик|резерв|десерт|алкогол|вино|пиво|коктейл|віскі|дитяч|вегетар|веган|безглютен|шеф|кухар|пекарн|дров)`, 'i').test(kafeJson)) fail('texts/kafe.json: у тексті є години, доставка, столики, десерти, алкоголь чи інші умови, яких немає в джерелах (R7, C6)');
  // страви, яких немає в menu.json (типові, які можуть "прийти" з власних знань): суші, стейк, шашлик, риба, торти тощо
  const NOT_ON_MENU = new RegExp(`(?<![${CYR_CLASS}])(суші|ролл?и?|стейк[${CYR_CLASS}]*|шашлик[${CYR_CLASS}]*|шаурм[${CYR_CLASS}]*|хінкал[${CYR_CLASS}]*|плов|пельмен[${CYR_CLASS}]*|млинц[${CYR_CLASS}]*|торт[${CYR_CLASS}]*|морозив[${CYR_CLASS}]*|тірамісу|чізкейк[${CYR_CLASS}]*|лимонад[${CYR_CLASS}]*|смузі|фреш[${CYR_CLASS}]*|риб[аиуі]|лосос[${CYR_CLASS}]*|креветк[${CYR_CLASS}]*|устриц[${CYR_CLASS}]*|гриль-бар|сет[${CYR_CLASS}]*)(?![${CYR_CLASS}])`, 'i');
  for (const s of collectStrings(kafePage)) if (NOT_ON_MENU.test(s)) fail(`texts/kafe.json: у тексті "${s.slice(0, 70)}" назва страви, якої немає в menu.json`);
  checkPagePhotos('kafe.json', [kafePage.hero?.photo]);
  if (kafePage.hero?.photo !== cafe?.photo) fail('texts/kafe.json: hero.photo має збігатися з cafe.photo');
  const linkedF = new Set(collectLinks(kafePage));
  for (const u of ['/nomery/', '/kotedzhi/', '/barn-house/', '/banya-ta-spa/']) if (!linkedF.has(u)) fail(`texts/kafe.json: немає посилання на ${u} (перелінковка)`);
}

// promoItems (похідні від rooms і cottages): рівно ціни Олі
const promoItemsModule = await import(new URL('../src/_data/promoItems.js', import.meta.url));
const promoItems = promoItemsModule.default.map((p) => [p.label, p.was, p.now]);
const expectedPromo = [['Стандарт', 2500, 2000], ['Напівлюкс', 2800, 2240], ['Люкс', 3000, 2400], ['Котедж', 6000, 4800]];
if (!same(promoItems, expectedPromo)) fail(`promoItems: очікується ${JSON.stringify(expectedPromo)}, є ${JSON.stringify(promoItems)}`);

// promo.json: Direct, без дат і днів тижня (R9)
const promo = readJson('promo.json');
if (!promo) fail('promo.json: немає файлу');
else {
  if (promo.cta.url !== 'https://ig.me/m/tur_house_') fail('promo.json: кнопка акції має вести на https://ig.me/m/tur_house_ (R9)');
  if (promo.cta.label !== 'Забронювати зі знижкою') fail('promo.json: текст кнопки "Забронювати зі знижкою"');
  if (typeof promo.enabled !== 'boolean') fail('promo.json: enabled має бути true/false');
  const all = JSON.stringify(promo);
  const CYR = 'А-Яа-яІіЇїЄєҐґ';
  const dayAbbr = new RegExp(`(^|[^${CYR}])(пн|вт|ср|чт|пт|сб|нд)([^${CYR}]|$)`, 'i');
  if (/\d{1,2}\.\d{1,2}\.\d{2,4}|до\s+\d{1,2}\s+(жовтня|листопада|грудня|січня)|понеділ|вівтор|середа|четвер|п'ятниц/i.test(all) || dayAbbr.test(all)) fail('promo.json: у тексті акції є дата або дні тижня (R9: не писати)');
  if (!/Це не про втечу від життя\. Це про кілька днів, щоб відновити сили й повернутися до нього трохи спокійнішими/.test(promo.lead)) fail('promo.json: lead без дослівного тексту Олі (R9)');
  if (promo.subtitle !== 'Проживання від 2000 грн на двох') fail('promo.json: subtitle має бути "Проживання від 2000 грн на двох" (R9)');
}

if (errors.length) {
  console.error(`check-data: порушень ${errors.length}`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('check-data: OK (nav, rooms, cottages, barn, spa, menu, cafe, faq, reviews, тексти texts/home, nomery, kotedzhi, barn-house, banya-ta-spa, kafe, promo, photos, ціни і заборонені слова)');
