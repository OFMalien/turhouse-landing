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

// Опис, зручності і тварини беруться з видимого тексту головної (hero.lede, блок «Що є на території») і FAQ (питання про тварин),
// щоб пошуковики і ІІ-асистенти бачили ті самі факти, що й гість (T2). Без FAQ про тварин petsAllowed не пишемо.
export function lodgingBusiness(data) {
  const { site } = data;
  const home = data.texts?.home;
  const node = {
    '@type': 'LodgingBusiness',
    '@id': abs('/#lodging'),
    name: site.name,
    description: home?.hero?.lede || site.tagline,
    url: abs('/'),
    telephone: site.phone.tel,
    image: abs(`/assets/img/static/${site.ogImage.file}`),
    logo: abs('/apple-touch-icon.png'),
    priceRange: priceRange(data),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    hasMap: site.links.googleMaps,
    sameAs: [site.links.instagram, site.links.googleMaps],
  };
  if (site.geo) {
    node.geo = { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude };
  }
  const territory = home?.territory?.items || [];
  if (territory.length) node.amenityFeature = territory.map((t) => ({ '@type': 'LocationFeatureSpecification', name: t.title, value: true }));
  if ((data.faq || []).some((f) => f.id === 'pets')) node.petsAllowed = true;
  return node;
}

// WebSite: назва сайту для Google (site name у видачі) і зв'язок сайту з комплексом.
export function webSite(data) {
  return {
    '@type': 'WebSite',
    '@id': abs('/#website'),
    url: abs('/'),
    name: data.site.name,
    inLanguage: 'uk',
    publisher: { '@id': abs('/#lodging') },
  };
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

// FAQPage: питання і відповіді беруться з src/_data/faq.json, тих самих даних, що й видимий FAQ на головній (правило T2).
export function faqPage(data) {
  return {
    '@type': 'FAQPage',
    '@id': abs('/#faq'),
    mainEntity: (data.faq || []).map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
extras.home = (data) => [faqPage(data)];

// Місткість з рядка даних: «2 гості» -> value 2 (рівно), «до 4 гостей» -> maxValue 4 (не більше).
function occupancy(capacity) {
  const n = Number(String(capacity).match(/\d+/)[0]);
  return /^до\s/i.test(String(capacity)) ? { '@type': 'QuantitativeValue', maxValue: n } : { '@type': 'QuantitativeValue', value: n };
}

// ItemList об'єктів проживання з даних (номери: HotelRoom, котеджі: VacationRental): назва, місткість, ціна за добу, UAH, особливості.
// Ціни акції в розмітку не йдуть: вона діє лише по буднях (R9).
function objectItemList(data, { list, type, pagePath, listName, withAmenities }) {
  const url = (id) => abs(`${pagePath}#${id}`);
  return [
    {
      '@type': 'ItemList',
      '@id': abs(`${pagePath}#list`),
      name: listName,
      numberOfItems: list.length,
      itemListElement: list.map((r, i) => {
        const item = {
          '@type': type,
          '@id': url(r.id),
          url: url(r.id),
          name: r.title,
          occupancy: occupancy(r.capacity),
          containedInPlace: { '@id': abs('/#lodging') },
          offers: { '@type': 'Offer', price: r.price, priceCurrency: 'UAH', url: data.site.links.booking },
        };
        if (withAmenities && r.features?.length) item.amenityFeature = r.features.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true }));
        return { '@type': 'ListItem', position: i + 1, item };
      }),
    },
  ];
}

export const roomsItemList = (data) => objectItemList(data, { list: data.rooms || [], type: 'HotelRoom', pagePath: '/nomery/', listName: data.texts.nomery.types.heading });
extras.nomery = roomsItemList;

export const cottagesItemList = (data) => objectItemList(data, { list: data.cottages || [], type: 'VacationRental', pagePath: '/kotedzhi/', listName: data.texts.kotedzhi.types.heading, withAmenities: true });
extras.kotedzhi = cottagesItemList;

// Барн-хаус: один будинок і два тарифи (R6) -> один VacationRental з двома Offer. Ціна кожного Offer із barn.tariffs,
// кількість гостей береться з підпису тарифу («до 8 гостей» -> eligibleQuantity.maxValue 8), місткість будинку це найбільший тариф.
export function barnVacationRental(data) {
  const barn = data.barn;
  const guests = (label) => Number(String(label).match(/\d+/)[0]);
  const id = abs(`/barn-house/#${barn.id}`);
  const node = {
    '@type': 'VacationRental',
    '@id': id,
    url: id,
    name: barn.title,
    description: data.texts['barn-house'].hero.lede,
    occupancy: { '@type': 'QuantitativeValue', maxValue: Math.max(...barn.tariffs.map((t) => guests(t.label))) },
    containedInPlace: { '@id': abs('/#lodging') },
    amenityFeature: (barn.features || []).map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
    offers: barn.tariffs.map((t) => ({
      '@type': 'Offer',
      name: `${barn.title}, ${t.label}`,
      price: t.amount,
      priceCurrency: 'UAH',
      eligibleQuantity: { '@type': 'QuantitativeValue', maxValue: guests(t.label), unitText: 'гостей' },
      url: data.site.links.booking,
    })),
  };
  return [node];
}
extras['barn-house'] = barnVacationRental;

// Баня та спа: DaySpa (заклад) і Service (відвідування) з двома цінами за годину з spa.json: перша година з особи і кожна наступна.
// Адреса і телефон ті самі, що в LodgingBusiness; склад комплексу в amenityFeature. Годин роботи в джерелах немає, openingHours не пишемо.
export function spaNodes(data) {
  const { site, spa } = data;
  const page = data.texts['banya-ta-spa'];
  const spaId = abs('/banya-ta-spa/#spa');
  const serviceId = abs('/banya-ta-spa/#service');
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const spec = (label, amount) => ({
    '@type': 'UnitPriceSpecification',
    name: `${cap(label)}, ${spa.price.per}`,
    price: amount,
    priceCurrency: 'UAH',
    unitText: 'година',
  });
  return [
    {
      '@type': 'DaySpa',
      '@id': spaId,
      name: `${page.meta.breadcrumbTitle} ${site.name}`,
      description: page.hero.lede,
      url: abs('/banya-ta-spa/'),
      telephone: site.phone.tel,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.locality,
        addressRegion: site.address.region,
        postalCode: site.address.postalCode,
        addressCountry: site.address.country,
      },
      parentOrganization: { '@id': abs('/#lodging') },
      amenityFeature: spa.complex.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
      makesOffer: { '@id': serviceId },
    },
    {
      '@type': 'Service',
      '@id': serviceId,
      name: `${page.meta.breadcrumbTitle}: відвідування`,
      serviceType: 'Баня',
      provider: { '@id': spaId },
      url: abs('/banya-ta-spa/'),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'UAH',
        priceSpecification: [spec(spa.price.firstLabel, spa.price.first), spec(spa.price.nextLabel, spa.price.next)],
        url: site.links.instagramDirect,
      },
    },
  ];
}
extras['banya-ta-spa'] = spaNodes;

// Кафе та піца-бар: CafeOrCoffeeShop з меню (Menu > MenuSection > MenuItem з ціною) із menu.json і cafe.json.
// Годин роботи в джерелах немає (cafe.hours === null), тому openingHours, priceRange і acceptsReservations не пишемо.
export function menuItemDescription(item) {
  const base = [item.details, item.weight].filter(Boolean).join(', ');
  const variants = item.variants?.length ? `Варіанти: ${item.variants.join('; ')}` : '';
  return [base, variants].filter(Boolean).join('. ') || undefined;
}

export function cafeNodes(data) {
  const { site, cafe, menu } = data;
  const page = data.texts.kafe;
  const cafeId = abs('/kafe/#cafe');
  return [
    {
      '@type': 'CafeOrCoffeeShop',
      '@id': cafeId,
      name: `${cafe.title} ${site.name}`,
      description: page.hero.lede,
      url: abs('/kafe/'),
      telephone: site.phone.tel,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.locality,
        addressRegion: site.address.region,
        postalCode: site.address.postalCode,
        addressCountry: site.address.country,
      },
      servesCuisine: cafe.cuisine,
      parentOrganization: { '@id': abs('/#lodging') },
      hasMenu: {
        '@type': 'Menu',
        '@id': abs('/kafe/#menu'),
        name: page.menu.heading,
        inLanguage: 'uk',
        dateModified: cafe.menuUpdated,
        hasMenuSection: menu.sections.map((sec) => ({
          '@type': 'MenuSection',
          name: sec.title,
          hasMenuItem: sec.items.map((item) => {
            const node = { '@type': 'MenuItem', name: item.title };
            const description = menuItemDescription(item);
            if (description) node.description = description;
            node.offers = { '@type': 'Offer', price: item.price, priceCurrency: menu.currency };
            return node;
          }),
        })),
      },
    },
  ];
}
extras.kafe = cafeNodes;

// Околиці: Article про околиці з посиланням (about) на TouristAttraction, тобто парк природи «Беремицьке».
// Парк окрема сутність: назва і опис з texts, без посилання на сайт парку (питання 24б: парк конкурент по проживанню), адреси, координат, годин і квитків немає (в джерелах їх немає), Tur House частиною парку не названий.
export function okolitsiNodes(data) {
  const page = data.texts.okolitsi;
  const parkId = abs('/okolitsi/#park');
  return [
    {
      '@type': 'Article',
      '@id': abs('/okolitsi/#article'),
      headline: page.hero.h1,
      description: page.meta.description,
      url: abs('/okolitsi/'),
      mainEntityOfPage: abs('/okolitsi/'),
      inLanguage: 'uk',
      about: { '@id': parkId },
      publisher: { '@id': abs('/#lodging') },
    },
    {
      '@type': 'TouristAttraction',
      '@id': parkId,
      name: page.park.heading,
      description: page.park.text,
    },
  ];
}
extras.okolitsi = okolitsiNodes;

// Як дістатися: WebPage про розташування і Place з адресою і координатами з site.json (координати з публічної картки Google Карт).
// Координати лише в розмітці, у видимому тексті їх немає. Км, час у дорозі і опис траси в розмітку не потрапляють (C9).
export function routeNodes(data) {
  const { site } = data;
  const page = data.texts['yak-distatysya'];
  const placeId = abs('/yak-distatysya/#place');
  return [
    {
      '@type': 'WebPage',
      '@id': abs('/yak-distatysya/#webpage'),
      url: abs('/yak-distatysya/'),
      name: page.hero.h1,
      description: page.meta.description,
      inLanguage: 'uk',
      about: { '@id': placeId },
    },
    {
      '@type': 'Place',
      '@id': placeId,
      name: site.name,
      description: page.hero.lede,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.locality,
        addressRegion: site.address.region,
        postalCode: site.address.postalCode,
        addressCountry: site.address.country,
      },
      geo: { '@type': 'GeoCoordinates', latitude: site.geo.latitude, longitude: site.geo.longitude },
      hasMap: site.links.googleMaps,
    },
  ];
}
extras['yak-distatysya'] = routeNodes;

// Контакти: ContactPage з посиланням на LodgingBusiness (телефон, адреса, сайт лежать у самому LodgingBusiness).
// Годин роботи рецепції, e-mail і реквізитів у джерелах немає, тому contactPoint із часом роботи не пишемо.
export function contactsNodes(data) {
  const page = data.texts.kontakty;
  return [
    {
      '@type': 'ContactPage',
      '@id': abs('/kontakty/#contact'),
      url: abs('/kontakty/'),
      name: page.hero.h1,
      description: page.meta.description,
      inLanguage: 'uk',
      about: { '@id': abs('/#lodging') },
      mainEntity: { '@id': abs('/#lodging') },
    },
  ];
}
extras.kontakty = contactsNodes;

// FAQPage внутрішньої сторінки: питання і відповіді з texts/<сторінка>.json -> faq.items, тих самих, що у видимому блоці faq-block.njk (T2).
export function pageFaqPage(data) {
  const slug = data.page.url.replace(/\//g, '');
  const items = data.texts?.[slug]?.faq?.items;
  if (!slug || !items?.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': abs(`${data.page.url}#faq`),
    mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  };
}

export function buildJsonLd(data) {
  if (!data.site || !data.page || !data.nav) return undefined;
  const nodes = [lodgingBusiness(data), webSite(data), breadcrumbList(data)];
  const extra = data.schemaType && extras[data.schemaType];
  if (extra) nodes.push(...extra(data));
  const faqNode = pageFaqPage(data);
  if (faqNode) nodes.push(faqNode);
  return { '@context': 'https://schema.org', '@graph': nodes };
}
