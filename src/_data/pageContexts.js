// Контекст сторінки для dataLayer (ТЗ §9.3): page_type, item_category, price_range, content_ids. Значення рахуються з _data, руками їх у шаблонах не пишемо.
// Сторінка вибирає контекст ключем analyticsKind у front matter; головна задає analytics у front matter напряму.
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const rooms = read('rooms.json');
const cottages = read('cottages.json');
const barn = read('barn.json');
const spa = read('spa.json');
const menu = read('menu.json');

const range = (nums) => `${Math.min(...nums)}-${Math.max(...nums)}`;

export default {
  rooms: { page_type: 'category', item_category: 'rooms', price_range: range(rooms.map((r) => r.price)), content_ids: rooms.map((r) => r.id) },
  cottages: { page_type: 'category', item_category: 'cottages', price_range: range(cottages.map((c) => c.price)), content_ids: cottages.map((c) => c.id) },
  barn: { page_type: 'category', item_category: 'barn', price_range: range(barn.tariffs.filter((t) => !t.name).map((t) => t.amount)), content_ids: [barn.id] },
  // Великий будинок: тариф з name в barn.json, окрема сторінка (Макс 09.10.2026)
  bigHouse: { page_type: 'category', item_category: 'barn', price_range: range(barn.tariffs.filter((t) => t.name).map((t) => t.amount)), content_ids: ['big-house'] },
  // ТЗ §9.3: для бані приклад '600-800' і 'banya-1h' (перша година плюс наступна)
  spa: { page_type: 'category', item_category: 'banya', price_range: `${spa.price.first}-${spa.price.first + spa.price.next}`, content_ids: ['banya-1h'] },
  cafe: { page_type: 'category', item_category: 'cafe', price_range: range(menu.sections.flatMap((s) => s.items.map((i) => i.price))), content_ids: [] },
  area: { page_type: 'info', item_category: 'area' },
  route: { page_type: 'info', item_category: 'route' },
  contacts: { page_type: 'contact', item_category: 'contacts' },
  privacy: { page_type: 'info', item_category: 'general' },
  notFound: { page_type: 'error', item_category: 'general' },
};
