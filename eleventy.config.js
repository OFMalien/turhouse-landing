import fs from 'node:fs';
import path from 'node:path';
import env from './src/_data/env.js';

export default function (eleventyConfig) {
  // Статичні файли: CSS, JS і логотип/іконки копіюються як є.
  // Зображення контенту йдуть через @11ty/eleventy-img (шорткод image), не через passthrough.
  eleventyConfig.addPassthroughCopy({
    'src/assets/css': 'assets/css',
    'src/assets/js': 'assets/js',
    'src/assets/img/static': 'assets/img/static',
    // favicon.ico, apple-touch-icon.png та інші файли, що мають лежати в корені
    'src/static': '.',
  });

  // GitHub Pages не має обробляти файли Jekyll'ом.
  eleventyConfig.on('eleventy.after', ({ dir }) => {
    fs.writeFileSync(path.join(dir.output, '.nojekyll'), '');
  });

  // Ціна з пробілом-роздільником тисяч: 2500 -> "2 500".
  // Усі ціни на сайті беруться з _data, у шаблонах цифр немає.
  eleventyConfig.addFilter('price', (value) =>
    new Intl.NumberFormat('uk-UA').format(Number(value)).replace(/ | /g, ' '),
  );

  // Абсолютна адреса сторінки для canonical, og:url, sitemap.
  // page.url не містить pathPrefix, origin для превью його містить.
  eleventyConfig.addFilter('absoluteUrl', (pageUrl) => `${env.origin}${pageUrl}`);

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    pathPrefix: env.pathPrefix,
    templateFormats: ['njk', 'md'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
