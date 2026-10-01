// Общие проверки зібраного сайту для КОЖНОЇ сторінки (E4): мета-теги, шапка, меню, підвал, фінальний CTA, липка кнопка, акція,
// посилання і телефони, файли картинок і скриптів, alt із паспорта фото, заголовки і якорі, тексти з texts/<сторінка>.json.
// Усе звіряється з даними (site.json, nav.json, promo.json, photos.json, texts/*.json), руками жодних значень тут немає.
// Сторінкові правила (ціни карточок, меню кафе, тарифи) лежать у check-pages.mjs, розмітка JSON-LD у check-jsonld.mjs.
// Використання: node scripts/check-site.mjs preview|production   (спершу зберіть сайт: ELEVENTY_ENV=... npm run build)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import promoItems from '../src/_data/promoItems.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const mode = process.argv[2] || 'preview';
if (mode !== 'preview' && mode !== 'production') {
  console.error('Використання: node scripts/check-site.mjs preview|production');
  process.exit(2);
}
const prefix = mode === 'preview' ? '/turhouse-multipage-preview' : '';
const ORIGIN = mode === 'production' ? 'https://turhouse.com.ua' : 'https://ofmalien.github.io/turhouse-multipage-preview';
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(root, 'src/_data', n), 'utf8'));
const site = readJson('site.json');
const nav = readJson('nav.json');
const promo = readJson('promo.json');
const photos = readJson('photos.json');
const money = (n) => new Intl.NumberFormat('uk-UA').format(n).replace(/[  ]/g, ' ');
const norm = (s) => (s || '').replace(/[\s  ]+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errors = [];
const fail = (page, m) => errors.push(`${page}: ${m}`);

// ---------- зібрані сторінки ----------
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
const docs = new Map(pages.map((f) => [urlOf(f), { html: fs.readFileSync(f, 'utf8'), doc: parse(fs.readFileSync(f, 'utf8')) }]));
const textsFile = (slug) => path.join(root, 'src/_data/texts', `${slug}.json`);
const slugOf = (url) => (url === '/' ? 'home' : url === '/404.html' ? '404' : url.replace(/\//g, ''));

// ---------- допустимі адреси ----------
const EXTERNAL_OK = new Set([
  site.links.booking, site.links.instagram, site.links.instagramDirect, site.links.googleMaps, site.links.googleMapsRoute, site.links.waze,
  promo.cta.url, 'https://beremytske.com.ua/',
]);
const HEAD_EXTERNAL_OK = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://www.facebook.com'];
const TEL = `tel:${site.phone.tel}`;
const TEL_ARIA = `Зателефонувати: ${site.phone.display}`;

// Файл у _site за адресою зі сторінки: перевіряємо префікс (превью живе під /turhouse-multipage-preview/) і наявність файлу
function localFile(page, ref, what) {
  let u = ref.trim();
  let absolute = false;
  if (u.startsWith(`${ORIGIN}/`)) { u = u.slice(ORIGIN.length); absolute = true; } // ORIGIN уже містить префікс превью
  else if (/^https?:\/\//.test(u)) return null;
  if (!u.startsWith('/')) { fail(page, `${what}: адреса «${ref}» без початкового слеша`); return null; }
  if (prefix && !absolute) {
    if (!u.startsWith(`${prefix}/`)) { fail(page, `${what}: адреса «${ref}» без префікса ${prefix}/`); return null; }
    u = u.slice(prefix.length);
  }
  u = u.split('#')[0].split('?')[0];
  const file = path.join(siteDir, decodeURIComponent(u));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) { fail(page, `${what}: файлу «${ref}» немає в збірці`); return null; }
  return file;
}
const srcsetUrls = (v) => (v || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);

// ---------- тексти сторінки: усі рядки з texts/<сторінка>.json мають бути на сторінці ----------
const SKIP_KEYS = new Set(['photo', 'photos', 'url', 'href', 'id', 'meta']);
function textLeaves(obj, key = '', out = []) {
  if (typeof obj === 'string') { if (!SKIP_KEYS.has(key)) out.push(obj); }
  else if (Array.isArray(obj)) obj.forEach((x) => textLeaves(x, key, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { if (!SKIP_KEYS.has(k)) textLeaves(v, k, out); }
  return out;
}

// Пари {url, label} з texts (кнопки-посилання): кожна має бути на сторінці як <a> з цим підписом і цією адресою
function linkPairs(obj, out = []) {
  if (Array.isArray(obj)) obj.forEach((x) => linkPairs(x, out));
  else if (obj && typeof obj === 'object') {
    if (typeof obj.url === 'string' && typeof obj.label === 'string') out.push({ url: obj.url, label: obj.label });
    if (typeof obj.href === 'string' && typeof obj.label === 'string') out.push({ href: obj.href, label: obj.label }); // зовнішнє посилання: адреса як є
    for (const [k, v] of Object.entries(obj)) if (k !== 'meta') linkPairs(v, out);
  }
  return out;
}
// Ідентифікатор кадру за адресою картинки: ім'я файлу без хеша і ширини -> id у photos.json
function photoIdOf(src) {
  const m = path.basename(src || '').match(/^(.+)-[A-Za-z0-9_-]{10}-\d+\.[a-z]+$/);
  const e = m && Object.entries(photos).find(([, v]) => path.basename(v.file, path.extname(v.file)) === m[1]);
  return e ? e[0] : null;
}

// ---------- сторінки з акцією: банер і вікно ----------
const PROMO_BANNER = new Set(['/', '/nomery/', '/kotedzhi/']);
const PROMO_MODAL = new Set(['/', '/nomery/', '/kotedzhi/']);

for (const [url, { doc }] of docs) {
  const f = (m) => fail(url, m);
  const is404 = url === '/404.html';

  // ----- голова документа -----
  const html = doc.querySelector('html');
  if (html?.getAttribute('lang') !== 'uk') f(`<html lang> має бути uk, є «${html?.getAttribute('lang')}»`);
  if (doc.querySelectorAll('meta[charset]').length !== 1 || doc.querySelector('meta[charset]').getAttribute('charset').toLowerCase() !== 'utf-8') f('має бути один <meta charset="utf-8">');
  const vps = doc.querySelectorAll('meta[name="viewport"]');
  if (vps.length !== 1 || vps[0].getAttribute('content') !== 'width=device-width, initial-scale=1') f('viewport має бути рівно «width=device-width, initial-scale=1» (без заборони масштабу)');
  if (doc.querySelectorAll('title').length !== 1) f('має бути один <title>');
  const robots = doc.querySelectorAll('meta[name="robots"]');
  if (robots.length !== 1) f('має бути один <meta name="robots">');
  else {
    const noindex = /noindex/.test(robots[0].getAttribute('content') || '');
    if (mode === 'preview' && !noindex) f('у превью має бути noindex');
    if (mode === 'production' && !is404 && noindex) f('у бойовій збірці noindex допустимий лише на 404');
  }
  const canon = doc.querySelectorAll('link[rel="canonical"]');
  if (is404) { if (canon.length) f('на 404 canonical не потрібен'); }
  else if (canon.length !== 1) f(`canonical має бути один, є ${canon.length}`);
  for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const m = doc.querySelector(sel);
    const v = m?.getAttribute('content');
    if (!v) { f(`немає ${sel}`); continue; }
    if (!v.startsWith(`${ORIGIN}/`)) f(`${sel}: адреса має починатися з ${ORIGIN}/ (є «${v}»)`);
    else localFile(url, v, sel);
  }
  if (doc.querySelector('meta[property="og:image"]')?.getAttribute('content') !== `${ORIGIN}/assets/img/static/${site.ogImage.file}`) f('og:image має бути картинкою з site.json ogImage');
  if (!doc.querySelectorAll('script').some((s) => /classList\.add\('js'\)/.test(s.text))) f('немає інлайн-скрипта, що ставить клас js на <html>');
  // посилання на CSS, JS, іконки, маніфест: адреси з префіксом, файли існують
  for (const l of doc.querySelectorAll('link[href]')) {
    const rel = l.getAttribute('rel');
    const href = l.getAttribute('href');
    if (rel === 'canonical') continue;
    if (/^https?:\/\//.test(href)) { if (!HEAD_EXTERNAL_OK.some((h) => href.startsWith(h))) f(`link ${rel}: зовнішня адреса «${href}» не з дозволеного списку`); continue; }
    localFile(url, href, `link ${rel}`);
  }
  if (!doc.querySelectorAll('link[rel="stylesheet"]').some((l) => l.getAttribute('href') === `${prefix}/assets/css/main.css`)) f('немає link на main.css з префіксом');
  const scripts = doc.querySelectorAll('script[src]').map((s) => s.getAttribute('src'));
  for (const src of scripts) { if (/^https?:\/\//.test(src)) { if (!HEAD_EXTERNAL_OK.some((h) => src.startsWith(h))) f(`script: зовнішня адреса «${src}» не з дозволеного списку`); } else localFile(url, src, 'script'); }
  if (!scripts.includes(`${prefix}/assets/js/app.js`)) f('немає скрипта app.js');
  if (doc.querySelectorAll('script[src$="app.js"]').length !== 1) f('app.js має бути підключений один раз');
  if (doc.querySelector('script[src$="promo.js"]') && !doc.querySelector('#promo-modal')) f('promo.js без вікна акції');

  // ----- каркас: header, main, footer -----
  const headers = doc.querySelectorAll('header.site-header');
  const mains = doc.querySelectorAll('main');
  const footers = doc.querySelectorAll('footer.site-footer');
  if (headers.length !== 1) f(`має бути один header.site-header, є ${headers.length}`);
  if (mains.length !== 1 || mains[0].getAttribute('id') !== 'main') f('має бути один <main id="main">');
  if (footers.length !== 1) f(`має бути один footer.site-footer, є ${footers.length}`);
  if (headers[0] && (headers[0].querySelector('main') || headers[0].querySelector('footer'))) f('header містить main або footer (незакритий тег?)');
  if (mains[0] && (mains[0].querySelector('header.site-header') || mains[0].querySelector('footer.site-footer'))) f('main містить шапку або підвал (незакритий тег?)');
  const skip = doc.querySelectorAll('a.skip-link');
  if (skip.length !== 1 || skip[0].getAttribute('href') !== '#main' || !norm(skip[0].text)) f('має бути одне посилання «Перейти до змісту» на #main');
  const body = doc.querySelector('body');
  const firstLink = body?.querySelector('a');
  if (firstLink && firstLink !== skip[0]) f('посилання «Перейти до змісту» має бути першим на сторінці');

  // ----- шапка і меню -----
  const navLinks = (sel) => doc.querySelectorAll(sel).map((a) => ({ t: norm(a.text), h: a.getAttribute('href'), cur: a.getAttribute('aria-current') }));
  const wantNav = nav.map((n) => ({ t: n.title, h: `${prefix}${n.url}` }));
  const curKey = nav.find((n) => n.url === url)?.url;
  const checkNav = (label, got) => {
    if (!same(got.map((x) => ({ t: x.t, h: x.h })), wantNav)) f(`${label}: пункти меню не збігаються з nav.json`);
    const cur = got.filter((x) => x.cur);
    if (curKey) { if (cur.length !== 1 || cur[0].h !== `${prefix}${curKey}` || cur[0].cur !== 'page') f(`${label}: aria-current="page" має стояти лише на «${nav.find((n) => n.url === curKey).title}»`); }
    else if (cur.length) f(`${label}: на цій сторінці aria-current у меню не потрібен`);
  };
  checkNav('меню в шапці', navLinks('header.site-header nav.site-nav a'));
  checkNav('меню в панелі телефона', navLinks('#nav-drawer nav.drawer-links a'));
  const brand = doc.querySelector('header.site-header a.brand');
  if (brand?.getAttribute('href') !== `${prefix}/` || brand?.getAttribute('aria-label') !== `${site.name}, на головну`) f('лого в шапці має вести на головну з aria-label «Tur House, на головну»');
  const ig = doc.querySelector('header.site-header a.icon-btn');
  if (ig?.getAttribute('href') !== site.links.instagram || ig?.getAttribute('aria-label') !== `Instagram ${site.links.instagramHandle}` || !/\bnoopener\b/.test(ig?.getAttribute('rel') || '')) f('іконка Instagram у шапці: адреса, aria-label і rel з site.json');
  const hb = doc.querySelector('header.site-header .header-actions a.btn-primary');
  if (hb?.getAttribute('href') !== site.links.booking || norm(hb?.text) !== 'Забронювати') f('кнопка «Забронювати» в шапці має вести на BookmeNow з site.json');
  const toggle = doc.querySelector('header.site-header button.nav-toggle');
  if (!toggle || toggle.getAttribute('aria-controls') !== 'nav-drawer' || toggle.getAttribute('aria-expanded') !== 'false' || !toggle.getAttribute('aria-label')) f('кнопка меню: aria-controls=nav-drawer, aria-expanded=false, aria-label');
  const drawer = doc.querySelector('#nav-drawer');
  if (!drawer || drawer.getAttribute('role') !== 'dialog' || drawer.getAttribute('aria-modal') !== 'true' || drawer.getAttribute('inert') === undefined) f('панель меню: role=dialog, aria-modal=true і inert, поки закрита');
  if (drawer && !drawer.querySelector('button.drawer-close[aria-label]')) f('у панелі меню немає кнопки закриття з aria-label');
  const db = drawer?.querySelector('.drawer-footer a.btn-primary');
  if (db?.getAttribute('href') !== site.links.booking) f('кнопка «Забронювати онлайн» у панелі меню має вести на BookmeNow');

  // ----- підвал -----
  const foot = footers[0];
  if (foot) {
    const fn = foot.querySelectorAll('nav.footer-col ul a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href'), cur: a.getAttribute('aria-current') }));
    const wantF = [...wantNav, { t: 'Політика конфіденційності', h: `${prefix}/pryvatnist/` }];
    if (!same(fn.map((x) => ({ t: x.t, h: x.h })), wantF)) f('розділи в підвалі не збігаються з nav.json і політикою');
    const cur = fn.filter((x) => x.cur);
    const curUrl = url === '/pryvatnist/' ? url : curKey;
    if (curUrl) { if (cur.length !== 1 || cur[0].h !== `${prefix}${curUrl}`) f('підвал: aria-current має стояти лише на поточній сторінці'); }
    else if (cur.length) f('підвал: aria-current на цій сторінці не потрібен');
    if (norm(foot.querySelector('.footer-brand')?.text) !== site.name) f('підвал: назва закладу не збігається з site.json');
    if (norm(foot.querySelector('.footer-addr')?.text) !== `${site.descriptor}, ${site.address.full}`) f('підвал: адреса не збігається з site.json');
    if (norm(foot.querySelector('.footer-bottom')?.text) !== `${site.name} · ${site.address.short}`) f('підвал: нижній рядок не збігається з site.json');
    const links = foot.querySelectorAll('.footer-col:last-child a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href') }));
    const wantC = [{ t: site.phone.display, h: TEL }, { t: `Instagram ${site.links.instagramHandle}`, h: site.links.instagram }, { t: 'Google Карти', h: site.links.googleMaps }];
    if (!same(links, wantC)) f('«Зв\'язок» у підвалі: телефон, Instagram і Google Карти з site.json');
  }

  // ----- фінальний CTA і липка кнопка -----
  if (!is404) {
    const cta = doc.querySelectorAll('section.cta-band');
    if (cta.length !== 1) f(`фінальний блок CTA: має бути один, є ${cta.length}`);
    else {
      const c = cta[0];
      if (norm(c.querySelector('.caption')?.text) !== site.cta.caption || norm(c.querySelector('#cta-title')?.text) !== site.cta.heading) f('фінальний CTA: підпис і заголовок з site.json');
      const bl = c.querySelectorAll('.btn-row a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href'), aria: a.getAttribute('aria-label') }));
      const want = [
        { t: site.cta.booking, h: site.links.booking, aria: undefined },
        { t: site.cta.instagramProfile, h: site.links.instagram, aria: undefined },
        { t: site.phone.display, h: TEL, aria: TEL_ARIA },
      ];
      if (!same(bl, want)) f('фінальний CTA: кнопки броні, Instagram і телефон з site.json');
    }
  }
  const sticky = doc.querySelectorAll('.sticky-cta');
  if (sticky.length !== 1) f(`липка кнопка: має бути одна, є ${sticky.length}`);
  else if (sticky[0].querySelector('a')?.getAttribute('href') !== site.links.booking || norm(sticky[0].querySelector('a')?.text) !== 'Забронювати зараз') f('липка кнопка «Забронювати зараз» має вести на BookmeNow');

  // ----- акція: банер і вікно рівно з promo.json -----
  const wantRows = promoItems.map((r) => ({ who: r.label, was: `${money(r.was)} грн`, now: `${money(r.now)} грн` }));
  const rowsOf = (sel, whoSel) => doc.querySelectorAll(sel).map((li) => ({ who: norm(li.querySelector(whoSel)?.text), was: norm(li.querySelector('s')?.text), now: norm(li.querySelector('strong')?.text) }));
  const banner = doc.querySelector('#promo');
  const modal = doc.querySelector('#promo-modal');
  if (promo.enabled && PROMO_BANNER.has(url) && !banner) f('має бути банер акції #promo');
  if (promo.enabled && PROMO_MODAL.has(url) && !modal) f('має бути вікно акції #promo-modal');
  if ((!promo.enabled || !PROMO_BANNER.has(url)) && banner) f('банера акції на цій сторінці бути не повинно');
  if ((!promo.enabled || !PROMO_MODAL.has(url)) && modal) f('вікна акції на цій сторінці бути не повинно');
  if (banner) {
    const g = (s) => norm(banner.querySelector(s)?.text);
    if (g('.promo-badge') !== promo.badge || g('#promo-title') !== promo.title || g('.promo-banner__subtitle') !== promo.subtitle || g('.promo-banner__content > .lede') !== promo.lead || g('.promo-banner__note') !== promo.note) f('банер акції: бейдж, заголовок, підзаголовок, текст або примітка не збігаються з promo.json');
    if (!same(banner.querySelectorAll('.promo-terms li').map((li) => norm(li.text)), promo.terms.map(norm))) f('банер акції: умови не збігаються з promo.json');
    if (!same(rowsOf('.promo-prices li', '.promo-price__who'), wantRows)) f(`банер акції: ціни мають бути ${JSON.stringify(wantRows)}`);
    const cb = banner.querySelector('.btn-row a.btn-primary');
    if (cb?.getAttribute('href') !== promo.cta.url || norm(cb?.text) !== promo.cta.label) f('банер акції: кнопка має вести в Instagram Direct з promo.json');
    const tb = banner.querySelector('.btn-row a:not(.btn-primary)');
    if (tb?.getAttribute('href') !== TEL || tb?.getAttribute('aria-label') !== TEL_ARIA) f('банер акції: кнопка «Зателефонувати» має вести на телефон із site.json');
  }
  if (modal) {
    const g = (s) => norm(modal.querySelector(s)?.text);
    if (modal.getAttribute('hidden') === undefined) f('вікно акції має бути прихованим за замовчуванням');
    if (modal.getAttribute('data-session-key') !== promo.sessionKey) f('вікно акції: data-session-key з promo.json');
    if (g('.promo-badge') !== promo.badge || g('#promo-modal-title') !== promo.title || g('.promo-modal__text') !== promo.modalText) f('вікно акції: бейдж, заголовок або текст не збігаються з promo.json');
    if (!same(rowsOf('.promo-rows li', 'span:first-child'), wantRows)) f(`вікно акції: ціни мають бути ${JSON.stringify(wantRows)}`);
    const cb = modal.querySelector('a.btn-primary');
    if (cb?.getAttribute('href') !== promo.cta.url || norm(cb?.text) !== promo.cta.label) f('вікно акції: кнопка має вести в Instagram Direct з promo.json');
    if (modal.querySelector('a.promo-modal__more')?.getAttribute('href') !== `${prefix}/#promo`) f('вікно акції: «Деталі акції» має вести на головну #promo');
    if (!modal.querySelector('button.promo-modal__close[aria-label]')) f('вікно акції: немає кнопки закриття з aria-label');
    if (!doc.querySelector(`script[src="${prefix}/assets/js/promo.js"]`)) f('вікно акції без promo.js');
  }

  // ----- усі посилання -----
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    const label = norm(a.text) || a.getAttribute('aria-label') || '(без підпису)';
    if (href === undefined || href === null || href.trim() === '' || href === '#') { f(`посилання «${label}» без адреси (href порожній або «#»)`); continue; }
    if (href.startsWith('#')) continue;
    if (href.startsWith('tel:')) {
      if (href !== TEL) f(`посилання «${label}»: телефон ${href} не збігається з site.json (${TEL})`);
      const aria = a.getAttribute('aria-label');
      if (aria !== undefined && aria !== TEL_ARIA && !/^Зателефонувати$/.test(norm(a.text))) f(`посилання «${label}»: aria-label «${aria}» не збігається з «${TEL_ARIA}»`);
      const vis = norm(a.text);
      if (/\d/.test(vis) && vis !== site.phone.display) f(`посилання на телефон показує «${vis}», а має «${site.phone.display}»`);
      continue;
    }
    if (/^mailto:|^javascript:/i.test(href)) { f(`посилання «${label}»: ${href} не передбачено`); continue; }
    if (/^https?:\/\//.test(href)) {
      if (href.startsWith(ORIGIN)) { f(`посилання «${label}» ведіть на власну адресу «${href}» повним URL: потрібен фільтр | url`); continue; }
      if (!EXTERNAL_OK.has(href)) f(`посилання «${label}»: зовнішня адреса «${href}» не з дозволеного списку (site.json, promo.json)`);
      if (a.getAttribute('target') === '_blank' && !/\bnoopener\b/.test(a.getAttribute('rel') || '')) f(`посилання «${label}»: target=_blank без rel=noopener`);
      continue;
    }
    if (!href.startsWith('/')) { f(`посилання «${label}»: адреса «${href}» без початкового слеша`); continue; }
    if (prefix && !href.startsWith(`${prefix}/`)) f(`посилання «${label}»: адреса «${href}» без префікса ${prefix}/`);
    if (/localhost|\/dev\//.test(href)) f(`посилання «${label}»: службова адреса «${href}»`);
    if (a.getAttribute('target') === '_blank' && !/\bnoopener\b/.test(a.getAttribute('rel') || '')) f(`посилання «${label}»: target=_blank без rel=noopener`);
  }
  // хлібні крихти: перший пункт веде на головну
  const crumb1 = doc.querySelector('nav.breadcrumbs li a');
  if (crumb1 && crumb1.getAttribute('href') !== `${prefix}/`) f('хлібні крихти: «Головна» має вести на головну');
  if (/localhost|127\.0\.0\.1/.test(doc.toString().replace(/https?:\/\/127\.0\.0\.1:8765/g, ''))) f('на сторінці є localhost або 127.0.0.1');

  // ----- телефон, адреса, відсотки у видимому тексті -----
  const bodyText = norm(doc.querySelector('body')?.text);
  for (const m of bodyText.matchAll(/\+38[\d\s()-]{8,}\d/g)) if (norm(m[0]) !== site.phone.display) f(`у тексті телефон «${norm(m[0])}», а має бути «${site.phone.display}»`);
  for (const m of bodyText.matchAll(/вул\.\s*Лугов\S*,?\s*\d+/g)) if (!site.address.full.startsWith(norm(m[0]))) f(`у тексті адреса «${norm(m[0])}» не збігається з site.json`);
  const pctOk = String(promo.title.match(/(\d+)\s*%/)?.[1] || promo.shortLabel.match(/(\d+)\s*%/)?.[1]);
  for (const m of bodyText.matchAll(/(\d+)\s*%/g)) if (m[1] !== pctOk) f(`у тексті відсоток «${m[0]}», знижка за promo.json ${pctOk}%`);

  // ----- картинки: файли, alt із паспорта фото, завантаження -----
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (!src) { f('<img> без src'); continue; }
    if (img.getAttribute('width') === undefined || img.getAttribute('height') === undefined) f(`<img ${src}> без width/height`);
    localFile(url, src, 'img src');
    for (const u of srcsetUrls(img.getAttribute('srcset'))) localFile(url, u, 'img srcset');
    if (src.includes('/assets/img/static/')) continue;
    const m = path.basename(src).match(/^(.+)-[A-Za-z0-9_-]{10}-\d+\.[a-z]+$/);
    const entry = m && Object.entries(photos).find(([, v]) => path.basename(v.file, path.extname(v.file)) === m[1]);
    if (!entry) { f(`<img ${path.basename(src)}>: кадр не знайдено в photos.json`); continue; }
    if (img.getAttribute('alt') !== entry[1].alt) f(`<img ${entry[0]}>: alt має бути «${entry[1].alt}» (photos.json), є «${img.getAttribute('alt')}»`);
    if (img.getAttribute('decoding') !== 'async') f(`<img ${entry[0]}>: decoding=async`);
  }
  for (const s of doc.querySelectorAll('picture source')) {
    for (const u of srcsetUrls(s.getAttribute('srcset'))) localFile(url, u, 'source srcset');
    if (!/^image\/(avif|webp)$/.test(s.getAttribute('type') || '')) f(`<source>: тип «${s.getAttribute('type')}» не avif і не webp`);
  }
  const heroImg = doc.querySelector('.page-hero img, .hero img');
  if (heroImg && (heroImg.getAttribute('loading') !== 'eager' || heroImg.getAttribute('fetchpriority') !== 'high')) f('картинка шапки (LCP) має бути loading=eager і fetchpriority=high');
  for (const img of doc.querySelectorAll('main img')) if (img !== heroImg && img.getAttribute('loading') !== 'lazy') f(`<img ${path.basename(img.getAttribute('src') || '')}> нижче шапки має бути loading=lazy`);

  // ----- заголовки, id, aria-посилання -----
  const ids = doc.querySelectorAll('[id]').map((e) => e.getAttribute('id'));
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) f(`повторні id: ${[...new Set(dup)].join(', ')}`);
  const idSet = new Set(ids);
  for (const e of doc.querySelectorAll('[aria-labelledby], [aria-controls]')) {
    for (const ref of `${e.getAttribute('aria-labelledby') || ''} ${e.getAttribute('aria-controls') || ''}`.split(/\s+/).filter(Boolean)) if (!idSet.has(ref)) f(`aria-посилання на неіснуючий id «${ref}»`);
  }
  for (const s of doc.querySelectorAll('main section[aria-labelledby]')) {
    const h = doc.querySelector(`[id="${s.getAttribute('aria-labelledby')}"]`);
    if (!h || !/^h[1-3]$/i.test(h.tagName) || !norm(h.text)) f(`розділ «${s.getAttribute('id') || s.getAttribute('aria-labelledby')}»: заголовок за aria-labelledby має бути непорожнім h1-h3`);
    else if (!s.classList.contains('menu-section') && !/^h[12]$/i.test(h.tagName)) f(`розділ «${s.getAttribute('id')}»: заголовок розділу має бути h1 або h2, є ${h.tagName.toLowerCase()}`);
  }
  for (const h of doc.querySelectorAll('h1, h2, h3, h4')) if (!norm(h.text)) f(`порожній заголовок <${h.tagName.toLowerCase()}>${h.getAttribute('id') ? ` #${h.getAttribute('id')}` : ''}`);
  const cta = doc.querySelector('section.cta-band');
  if (cta && !cta.querySelector('h2')) f('у фінальному CTA немає h2');

  // ----- тексти сторінки з texts/<сторінка>.json: кожен рядок є на сторінці -----
  const slug = slugOf(url);
  if (!is404 && fs.existsSync(textsFile(slug))) {
    const t = JSON.parse(fs.readFileSync(textsFile(slug), 'utf8'));
    const mainText = norm(doc.querySelector('main')?.text);
    for (const s of textLeaves(t)) if (!mainText.includes(norm(s))) f(`текст з texts/${slug}.json немає на сторінці: «${norm(s).slice(0, 70)}»`);
    // кнопки-посилання: підпис і адреса разом (інакше два посилання з поміняними адресами проходять)
    const anchors = doc.querySelectorAll('main a').map((a) => ({ t: norm(a.text), h: a.getAttribute('href') }));
    for (const p of linkPairs(t)) {
      const wantHref = p.href ?? `${prefix}${p.url}`;
      if (!anchors.some((a) => a.t === norm(p.label) && a.h === wantHref)) f(`texts/${slug}.json: посилання «${p.label}» має вести на ${wantHref}`);
    }
    // кадр шапки і галерея з texts: ті самі кадри в тому самому порядку
    if (t.hero?.photo) {
      const hi = doc.querySelector('.page-hero img, .hero img');
      if (!hi) f(`у шапці немає картинки (texts/${slug}.json hero.photo = ${t.hero.photo})`);
      else if (photoIdOf(hi.getAttribute('src')) !== t.hero.photo) f(`картинка шапки має бути ${t.hero.photo}, є ${photoIdOf(hi.getAttribute('src'))}`);
    }
    if (Array.isArray(t.gallery?.photos)) {
      const got = doc.querySelectorAll('#gallery img').map((i) => photoIdOf(i.getAttribute('src')));
      if (!same(got, t.gallery.photos)) f(`галерея: кадри мають бути ${JSON.stringify(t.gallery.photos)}, є ${JSON.stringify(got)}`);
    }
  }
}

if (errors.length) {
  console.error(`check-site (${mode}): порушень ${errors.length}`);
  for (const e of errors.slice(0, 80)) console.error(`  - ${e}`);
  if (errors.length > 80) console.error(`  ... і ще ${errors.length - 80}`);
  process.exit(1);
}
console.log(`check-site (${mode}): OK, сторінок ${docs.size}`);
