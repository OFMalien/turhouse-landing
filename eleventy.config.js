import fs from 'node:fs';
import path from 'node:path';
import Image from '@11ty/eleventy-img';
import { bundle } from 'lightningcss';
import env from './src/_data/env.js';

// Зображення: web-ready оригінали лежать у src/assets/img/source/, похідні (AVIF, WebP, JPEG)
// генеруються eleventy-img у постійний кеш .eleventy-img-cache/ (у git не йде) і після збірки
// копіюються в _site/assets/img/ лише ті, що справді використані на сторінках.
const IMG_SOURCE_DIR = 'src/assets/img/source';
const IMG_CACHE_DIR = '.eleventy-img-cache';
const IMG_URL_PATH = `${env.pathPrefix}assets/img/`;
const usedImageFiles = new Set();
const photos = JSON.parse(fs.readFileSync(new URL('./src/_data/photos.json', import.meta.url), 'utf8'));

export default function (eleventyConfig) {
  // Статичні файли: CSS, JS і логотип/іконки копіюються як є.
  // Зображення контенту йдуть через @11ty/eleventy-img (шорткод image), не через passthrough.
  eleventyConfig.addPassthroughCopy({
    'src/assets/js': 'assets/js',
    'src/assets/img/static': 'assets/img/static',
    // favicon.ico, apple-touch-icon.png та інші файли, що мають лежати в корені
    'src/static': '.',
  });

  // CSS: точка входу main.css збирається з @import в один мініфікований файл.
  // Частини (tokens.css, base.css, components.css) самі по собі у вивід не потрапляють.
  eleventyConfig.addTemplateFormats('css');
  eleventyConfig.addExtension('css', {
    outputFileExtension: 'css',
    compile: async function (_content, inputPath) {
      if (path.parse(inputPath).name !== 'main') return;
      return async () => {
        const { code } = await bundle({ filename: inputPath, minify: true });
        return code;
      };
    },
  });
  eleventyConfig.addWatchTarget('src/assets/css/');

  // Спільна частина шорткодів image і photo.
  async function renderImage(src, alt, options = {}) {
    if (typeof alt !== 'string') {
      throw new Error(`image "${src}": не задано alt (для декору передайте "")`);
    }
    const { sizes = '100vw', widths = [480, 800, 1200, 1600], priority = false, class: cssClass } = options;
    const metadata = await Image(path.join(IMG_SOURCE_DIR, src), {
      widths,
      formats: ['avif', 'webp', 'jpeg'],
      outputDir: IMG_CACHE_DIR,
      urlPath: IMG_URL_PATH,
      filenameFormat: (id, file, width, format) => {
        const name = path.basename(file, path.extname(file));
        return `${name}-${id}-${width}.${format}`;
      },
    });
    for (const list of Object.values(metadata)) {
      for (const entry of list) usedImageFiles.add(entry.outputPath);
    }
    const attrs = { alt, sizes, decoding: 'async' };
    if (priority) {
      attrs.loading = 'eager';
      attrs.fetchpriority = 'high';
    } else {
      attrs.loading = 'lazy';
    }
    if (cssClass) attrs.class = cssClass;
    return Image.generateHTML(metadata, attrs);
  }

  // {% image "група/файл.jpg", "опис", { sizes: "...", widths: [...], priority: true, class: "..." } %}
  // alt обов'язковий (для суто декоративних кадрів передайте порожній рядок "").
  // priority: true - кадр першого екрана (hero): без lazy, з fetchpriority="high".
  eleventyConfig.addAsyncShortcode('image', renderImage);

  // {% photo "група/назва", { sizes: "...", priority: true, class: "...", alt: "...(необов'язково)" } %}
  // Файл і опис беруться з паспорта src/_data/photos.json, щоб alt не розходився між сторінками.
  eleventyConfig.addAsyncShortcode('photo', async function (id, options = {}) {
    const p = photos[id];
    if (!p) throw new Error(`photo "${id}": немає запису в src/_data/photos.json`);
    return renderImage(p.file, options.alt ?? p.alt, options);
  });

  eleventyConfig.on('eleventy.before', () => {
    usedImageFiles.clear();
  });

  eleventyConfig.on('eleventy.after', ({ dir }) => {
    // Копіюємо в збірку тільки використані похідні зображення.
    if (usedImageFiles.size) {
      const target = path.join(dir.output, 'assets', 'img');
      fs.mkdirSync(target, { recursive: true });
      for (const file of usedImageFiles) fs.copyFileSync(file, path.join(target, path.basename(file)));
    }

    // GitHub Pages не має обробляти файли Jekyll'ом.
    fs.writeFileSync(path.join(dir.output, '.nojekyll'), '');

    // CNAME існує тільки у бойовій збірці (ТЗ §3.2). У превью його немає ніколи:
    // другий сайт з тим самим доменом відбирає прив'язку у бойового.
    const cname = path.join(dir.output, 'CNAME');
    if (env.isProduction) {
      fs.writeFileSync(cname, `${env.domain}\n`);
    } else {
      fs.rmSync(cname, { force: true });
    }
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
