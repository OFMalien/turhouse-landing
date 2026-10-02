// Перевірка аналітики кліків (E4-T12): кожне посилання кожної зібраної сторінки "натискається" в jsdom з справжнім tracking.js,
// і порівнюється, що потрапило в dataLayer і в Meta Pixel (fbq). Очікування обчислюються тут окремо від tracking.js за схемою живого сайту
// (ANALYTICS_AUDIT.md) і рішенням R9 (кнопки акції в Direct -> instagram_click). Також перевіряється ViewContent на сторінках об'єктів.
// Використання: node scripts/check-tracking.mjs preview|production   (спершу зберіть сайт)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const mode = process.argv[2] || 'preview';
if (mode !== 'preview' && mode !== 'production') {
  console.error('Використання: node scripts/check-tracking.mjs preview|production');
  process.exit(2);
}
const prefix = mode === 'preview' ? '/turhouse-multipage-preview' : '';
const ORIGIN = mode === 'preview' ? 'https://ofmalien.github.io' : 'https://turhouse.com.ua';
const readJson = (n) => JSON.parse(fs.readFileSync(path.join(root, 'src/_data', n), 'utf8'));
const site = readJson('site.json');
const trackingCode = fs.readFileSync(path.join(siteDir, 'assets/js/tracking.js'), 'utf8');
const errors = [];
const fail = (page, m) => errors.push(`${page}: ${m}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const PROMO = new Set(['promo_modal_weekend', 'promo_section_weekend']);
const OBJECT_CATEGORIES = new Set(['rooms', 'cottages', 'barn', 'banya']);

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

// Очікувані події за схемою живого сайту (незалежно від tracking.js)
function expectFor(href, placement, link) {
  if (href.includes('go.bookmenow.pro')) return { events: ['booking_click', 'Bron_online_ga4'], pixel: 'InitiateCheckout' };
  if (href.startsWith('tel:')) return PROMO.has(placement) ? { events: ['promo_booking_click', 'click_tel', 'Click_tel_ga4'], pixel: 'Lead' } : { events: ['tel_click', 'click_tel', 'Click_tel_ga4'], pixel: 'Contact' };
  if (href.includes('instagram.com') || href.includes('ig.me/')) {
    const direct = href.includes('ig.me/') && !PROMO.has(placement);
    return { events: [direct ? 'instagram_direct_click' : 'instagram_click', 'Click_inst_ga4'], pixel: 'Contact' };
  }
  if (href.includes('google.com/maps') || href.includes('waze.com')) return { events: ['map_route_click'], pixel: 'FindLocation' };
  return null;
}

let clicks = 0;
for (const file of pages) {
  const url = urlOf(file);
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, { url: `${ORIGIN}${prefix}${url}`, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const pixelCalls = [];
  window.fbq = (...args) => pixelCalls.push(args);
  window.eval(trackingCode);
  const dl = window.dataLayer;
  const ctx = dl.find((e) => e.event === 'page_context');

  // ViewContent: ровно один виклик на сторінках об'єктів, жодного на інших
  const vc = pixelCalls.filter((c) => c[1] === 'ViewContent');
  if (ctx && OBJECT_CATEGORIES.has(ctx.item_category)) {
    const from = parseInt(String(ctx.price_range).split('-')[0], 10);
    const want = { content_type: 'product', content_category: ctx.item_category, content_ids: ctx.content_ids, currency: 'UAH', value: from };
    if (vc.length !== 1 || vc[0][0] !== 'track' || !same(vc[0][2], want)) fail(url, `ViewContent: очікується один виклик ${JSON.stringify(want)}, є ${JSON.stringify(vc)}`);
  } else if (vc.length) fail(url, `ViewContent на сторінці не об'єкта (${ctx ? ctx.item_category : 'без контексту'})`);
  pixelCalls.length = 0;

  const links = [...window.document.querySelectorAll('a[href]')];
  for (const link of links) {
    const href = (link.getAttribute('href') || '').trim();
    const holder = link.closest('[data-placement]');
    const placement = holder ? holder.getAttribute('data-placement') : 'general';
    const exp = expectFor(href, placement, link);
    const before = dl.length;
    pixelCalls.length = 0;
    // клік по вкладеному елементу (span усередині посилання) теж має спрацьовувати: беремо найглибший перший нащадок
    let target = link;
    while (target.firstElementChild) target = target.firstElementChild;
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    window.document.addEventListener('click', (e) => e.preventDefault(), { once: true });
    target.dispatchEvent(ev);
    clicks++;
    const got = dl.slice(before);
    const label = `«${norm(link.textContent) || link.getAttribute('aria-label') || href}» (${href.slice(0, 60)})`;
    if (!exp) {
      if (got.length || pixelCalls.length) fail(url, `посилання ${label} не відстежується, але дало події ${JSON.stringify(got.map((e) => e.event))}`);
      continue;
    }
    if (placement === 'general') { fail(url, `посилання ${label}: немає data-placement (подія піде з «general»)`); }
    if (!same(got.map((e) => e.event), exp.events)) { fail(url, `посилання ${label}: події ${JSON.stringify(got.map((e) => e.event))}, очікується ${JSON.stringify(exp.events)}`); continue; }
    const main = got[0];
    if (main.placement !== placement) fail(url, `посилання ${label}: placement «${main.placement}», очікується «${placement}»`);
    if (!String(main.event_label || '').startsWith(`${placement} | `) && exp.events[0] !== 'map_route_click') fail(url, `посилання ${label}: event_label «${main.event_label}» має починатися з «${placement} | »`);
    if (exp.events[0] === 'booking_click') {
      if (main.link_url !== href || main.page_location !== `${prefix}${url}` || main.event_category !== 'ecommerce' || main.event_action !== 'click_bookmenow') fail(url, `booking_click: link_url, page_location, event_category, event_action: ${JSON.stringify(main)}`);
      const wantItem = {};
      for (const [attr, key] of [['data-item-name', 'item_name'], ['data-item-category', 'item_category'], ['data-item-variant', 'item_variant']]) if (link.getAttribute(attr)) wantItem[key] = link.getAttribute(attr);
      const v = Number(link.getAttribute('data-value'));
      if (v > 0) wantItem.value = v;
      for (const [k, v2] of Object.entries(wantItem)) if (main[k] !== v2) fail(url, `booking_click ${label}: ${k} має бути ${v2}, є ${main[k]}`);
      for (const k of ['item_name', 'item_category', 'item_variant', 'value']) if (!(k in wantItem) && main[k] !== undefined) fail(url, `booking_click ${label}: зайве поле ${k}`);
      const pc = pixelCalls[0];
      if (!pc || pc[2].content_name !== (wantItem.item_name || 'BookmeNow Booking') || pc[2].currency !== 'UAH' || pc[2].content_category !== placement || (wantItem.value ? pc[2].value !== wantItem.value : 'value' in pc[2])) fail(url, `InitiateCheckout ${label}: ${JSON.stringify(pc)}`);
    }
    if (href.startsWith('tel:')) {
      if (main.phone_number !== href.replace(/^tel:/, '') || main.phone_number !== site.phone.tel) fail(url, `${main.event} ${label}: phone_number «${main.phone_number}» має бути ${site.phone.tel}`);
      if (main.event_category !== (PROMO.has(placement) ? 'promotion' : 'contact') || main.event_action !== (PROMO.has(placement) ? 'call_promo_booking' : 'click_phone')) fail(url, `${main.event} ${label}: event_category, event_action ${JSON.stringify(main)}`);
    }
    if (exp.events[0].startsWith('instagram')) {
      if (main.link_url !== href || main.event_category !== 'social' || main.event_action !== 'click_instagram') fail(url, `${main.event} ${label}: link_url, event_category, event_action ${JSON.stringify(main)}`);
      const wantName = href.includes('ig.me/') ? 'Instagram Direct Message' : 'Instagram Profile View';
      if (!pixelCalls[0] || pixelCalls[0][2].content_name !== wantName) fail(url, `Meta Pixel Contact ${label}: content_name має бути «${wantName}», є ${JSON.stringify(pixelCalls[0])}`);
    }
    if (exp.events[0] === 'map_route_click') {
      const wantLabel = `${placement} | ${href.includes('waze') ? 'waze' : 'google_maps'}`;
      if (main.event_label !== wantLabel || main.link_url !== href || main.event_category !== 'navigation' || main.event_action !== 'get_directions') fail(url, `map_route_click ${label}: ${JSON.stringify(main)}, event_label має бути «${wantLabel}»`);
    }
    if (!pixelCalls.length || pixelCalls[0][0] !== 'track' || pixelCalls[0][1] !== exp.pixel) fail(url, `посилання ${label}: Meta Pixel має отримати ${exp.pixel}, є ${JSON.stringify(pixelCalls.map((c) => c[1]))}`);
  }
  window.close();
}

// Піксель з'являється пізніше за клік (його вантажить GTM, який стартує при першій дії): подія має почекати в черзі і піти, коли з'явиться fbq
{
  const file = pages.find((f) => urlOf(f) === '/nomery/');
  const url = '/nomery/';
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), { url: `${ORIGIN}${prefix}${url}`, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.eval(trackingCode); // fbq ще не існує
  const link = window.document.querySelector('a[href^="https://go.bookmenow.pro"]');
  window.document.addEventListener('click', (e) => e.preventDefault(), { once: true });
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const calls = [];
  const events = window.dataLayer.filter((e) => e.event === 'booking_click').length;
  if (events !== 1) fail(url, `без fbq booking_click у dataLayer має бути одразу, є ${events}`);
  await new Promise((r) => setTimeout(r, 400));
  window.fbq = (...a) => calls.push(a);
  await new Promise((r) => setTimeout(r, 700));
  const names = calls.map((c) => c[1]);
  if (!same(names, ['ViewContent', 'InitiateCheckout'])) fail(url, `після появи fbq мають піти по черзі ViewContent і InitiateCheckout, є ${JSON.stringify(names)}`);
  window.close();
}

if (errors.length) {
  console.error(`check-tracking (${mode}): порушень ${errors.length}`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  ... і ще ${errors.length - 60}`);
  process.exit(1);
}
console.log(`check-tracking (${mode}): OK, сторінок ${pages.length}, кліків по посиланнях ${clicks}`);
