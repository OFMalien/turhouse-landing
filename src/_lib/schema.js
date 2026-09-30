// Генератор JSON-LD (Schema.org) з тих самих даних, що й видимий текст (правило T2): руками розмітку не пишемо.
// Підключається через src/pages/pages.11tydata.js (eleventyComputed.jsonLd), виводиться в components/json-ld.njk.
// aggregateRating, reviewCount, ratingValue у розмітку не потрапляють ніколи (ТЗ §7.2).
import env from '../_data/env.js';

const abs = (p) => `${env.origin}${p}`;

// Діапазон цін з даних: усі price і tariffs[].amount з rooms, cottages, barn.
function priceRange(data) {
  const nums = [];
  for (const list of [data.rooms, data.cottages]) {
    for (const item of list || []) {
      if (typeof item.price === 'number') nums.push(item.price);
      for (const t of item.tariffs || []) nums.push(t.amount);
    }
  }
  const barn = data.barn;
  for (const t of (barn && barn.tariffs) || []) nums.push(t.amount);
  if (!nums.length) return undefined;
  return `${Math.min(...nums)}-${Math.max(...nums)} UAH`;
}

export function lodgingBusiness(data) {
  const { site } = data;
  const node = {
    '@type': 'LodgingBusiness',
    '@id': abs('/#lodging'),
    name: site.name,
    description: site.tagline,
    url: abs('/'),
    telephone: site.phone.tel,
    image: abs(`/assets/img/static/${site.ogImage.file}`),
    priceRange: priceRange(data),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      addressCountry: site.address.country,
    },
    hasMap: site.links.googleMaps,
    sameAs: [site.links.instagram],
  };
  if (site.geo) {
    node.geo = { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude };
  }
  return node;
}

// Хлібні крихти: Головна > поточна сторінка. Назва береться з nav (за адресою), інакше з breadcrumbTitle або title.
export function breadcrumbList(data) {
  const { page, nav } = data;
  const home = { '@type': 'ListItem', position: 1, name: nav.find((n) => n.url === '/').title, item: abs('/') };
  const items = [home];
  if (page.url !== '/') {
    const navItem = nav.find((n) => n.url === page.url);
    const name = data.breadcrumbTitle || (navItem && navItem.title) || data.title;
    items.push({ '@type': 'ListItem', position: 2, name, item: abs(page.url) });
  }
  return { '@type': 'BreadcrumbList', itemListElement: items };
}

// Додаткові вузли для конкретних сторінок (FAQPage, ItemList, VacationRental ...) додаються в задачах E4 за ключем
// schemaType з front matter сторінки: extras.home = (data) => [ ... ].
export const extras = {};

export function buildJsonLd(data) {
  if (!data.site || !data.page || !data.nav) return undefined;
  const nodes = [lodgingBusiness(data), breadcrumbList(data)];
  const extra = data.schemaType && extras[data.schemaType];
  if (extra) nodes.push(...extra(data));
  return { '@context': 'https://schema.org', '@graph': nodes };
}
