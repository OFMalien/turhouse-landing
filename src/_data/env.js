// Окружение сборки. ELEVENTY_ENV: preview (за замовчуванням) або production.
// За замовчуванням preview, щоб випадкова локальна збірка не отримала CNAME і не стала індексованою.
const name = process.env.ELEVENTY_ENV || 'preview';

if (name !== 'preview' && name !== 'production') {
  throw new Error(`ELEVENTY_ENV має бути preview або production, отримано: "${name}"`);
}

const isProduction = name === 'production';

export default {
  name,
  isPreview: !isProduction,
  isProduction,
  // Префікс шляху: превью живе як project site, бойовий сайт у корені домену.
  pathPrefix: isProduction ? '/' : '/turhouse-multipage-preview/',
  // Домен бойового сайту (потрапляє у файл CNAME тільки при production).
  domain: 'turhouse.com.ua',
  // Абсолютна адреса для canonical, og:url, og:image, sitemap (без завершального слеша).
  origin: isProduction
    ? 'https://turhouse.com.ua'
    : 'https://ofmalien.github.io/turhouse-multipage-preview',
  // Аналітика (GTM і Meta Pixel) підключається тільки в бойовій збірці.
  analyticsEnabled: isProduction,
  // Превью закрите від індексації; бойова збірка відкрита.
  noindex: !isProduction,
  // Дата збірки (YYYY-MM-DD) для sitemap.xml <lastmod>
  buildDate: new Date().toISOString().slice(0, 10),
};
