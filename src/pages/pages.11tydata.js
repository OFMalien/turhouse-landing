import fs from 'node:fs';
import { buildJsonLd } from '../_lib/schema.js';

// Обкладинка для соцмереж і месенджерів: своя для сторінки, якщо make-static.mjs зробив og-<сторінка>.jpg з кадру hero, інакше спільна з site.json.
const slugOf = (url) => (url === '/' ? 'home' : url.replace(/\//g, ''));
const pageOgFile = (data) => {
  const slug = slugOf(data.page.url);
  const file = `og-${slug}.jpg`;
  const photo = data.texts?.[slug]?.hero?.photo;
  if (slug === 'home' || !photo) return null;
  return fs.existsSync(new URL(`../assets/img/static/${file}`, import.meta.url)) ? { file, alt: data.photos?.[photo]?.alt } : null;
};

export default {
  eleventyComputed: {
    jsonLd: (data) => buildJsonLd(data),
    ogImage: (data) => pageOgFile(data)?.file || data.ogImage,
    ogImageAlt: (data) => pageOgFile(data)?.alt || data.ogImageAlt,
  },
};
