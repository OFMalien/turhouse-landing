// Перевірка контрасту пар кольорів дизайн-системи (WCAG 2.x).
// Кольори читаються з src/assets/css/tokens.css. Порівнюємо з таблицею ТЗ §5.2 і з парами, які додав проєкт.
// Використання: node scripts/check-contrast.mjs        (код 1, якщо щось не збігається або пара порушує межу)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src/assets/css/tokens.css'), 'utf8');
const colors = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]),
);
colors.white = '#ffffff';

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (fg, bg) => {
  const [a, b] = [lum(colors[fg]), lum(colors[bg])].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

// [текст, фон, значення з ТЗ або null, вердикт ТЗ]: allow >= 4.5; large >= 3 і тільки великий текст; forbid - заборонено для тексту.
const TZ = [
  ['onyx-warm', 'parchment', 10.43, 'allow'],
  ['onyx-warm', 'parchment-light', 12.08, 'allow'],
  ['espresso', 'parchment', 7.74, 'allow'],
  ['walnut', 'parchment', 5.67, 'allow'],
  ['walnut', 'parchment-light', 6.56, 'allow'],
  ['parchment', 'espresso', 7.74, 'allow'],
  ['parchment-light', 'onyx-warm', 12.08, 'allow'],
  ['onyx-warm', 'saffron-glow', 5.55, 'allow'],
  ['onyx-warm', 'saffron-bright', 6.57, 'allow'],
  ['saffron-bright', 'espresso', 4.88, 'allow'],
  ['saffron-glow', 'espresso', 4.12, 'large'],
  ['walnut', 'warm-stone', 4.01, 'large'],
  ['saffron-glow', 'parchment', 1.88, 'forbid'],
  ['saffron-bright', 'parchment', 1.59, 'forbid'],
  ['white', 'saffron-glow', 3.0, 'forbid'],
  ['warm-stone', 'parchment', 1.42, 'forbid'],
];

// Пари, які проєкт додає до ТЗ (потрібні для компонентів на темному фоні). Мають бути allow (>= 4.5).
const EXTRA = [
  ['espresso', 'parchment-light'],
  ['parchment', 'midnight-roast'],
  ['parchment', 'onyx-warm'],
  ['saffron-bright', 'midnight-roast'],
  ['saffron-bright', 'onyx-warm'],
  ['linen', 'espresso'],
  ['linen', 'midnight-roast'],
  ['linen', 'onyx-warm'],
  ['parchment-light', 'espresso'],
  ['parchment-light', 'midnight-roast'],
];

let bad = 0;
const fmt = (n) => n.toFixed(2);
console.log('Таблиця ТЗ §5.2 (значення ТЗ → розраховане):');
for (const [fg, bg, tz, verdict] of TZ) {
  const r = ratio(fg, bg);
  const match = Math.abs(r - tz) <= 0.015;
  const actual = r >= 4.5 ? 'allow' : r >= 3 ? 'large' : 'forbid';
  // "white on saffron-glow 3.00" у ТЗ вважається забороненим для тексту, бо < 4.5
  const okVerdict = verdict === 'forbid' ? r < 4.5 : verdict === 'large' ? r < 4.5 && r >= 3 : r >= 4.5;
  const flag = match && okVerdict ? 'OK ' : 'ПОМИЛКА';
  if (!(match && okVerdict)) bad++;
  console.log(`  ${flag} ${fg} на ${bg}: ТЗ ${fmt(tz)}, розраховано ${fmt(r)} (${actual}), вердикт ТЗ: ${verdict}`);
}

console.log('\nДодаткові пари проєкту (мають бути >= 4.5):');
for (const [fg, bg] of EXTRA) {
  const r = ratio(fg, bg);
  const ok = r >= 4.5;
  if (!ok) bad++;
  console.log(`  ${ok ? 'OK ' : 'ПОМИЛКА'} ${fg} на ${bg}: ${fmt(r)}`);
}

if (bad) {
  console.error(`\ncheck-contrast: порушень або розбіжностей: ${bad}`);
  process.exit(1);
}
console.log('\ncheck-contrast: усі пари збігаються з ТЗ і проходять межі');
