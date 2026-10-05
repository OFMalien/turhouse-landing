// Строки цен для карточек форматов проживания (главная и далее). Цифр в шаблонах нет: все суммы берутся из rooms.json, cottages.json, barn.json.
// Поле promo - цена акции (R9) из rooms.json и cottages.json; в карточках форматов показываем обычные цены, а про акцию даём ссылку на #promo,
// потому что скидка действует только по будням, а писать, какие это дни, нельзя (R9).
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));

const rooms = read('rooms.json');
const cottages = read('cottages.json');
const barn = read('barn.json');
const bigHouse = read('bigHouse.json');

const rows = (list, label) => list.map((i) => ({ label: label(i), amount: i.price, promo: i.promoPrice ?? null }));

// Підпис рядка котеджу коротший за назву: «Котедж на 4 гості» -> «На 4 гості» (у карточці вже є заголовок «Котеджі»)
const short = (title) => {
  const s = title.replace(/^Котедж\s+/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const wrap = (items) => ({ rows: items, hasPromo: items.some((i) => i.promo !== null) });

export default {
  rooms: wrap(rows(rooms, (r) => r.title)),
  cottages: wrap(rows(cottages, (c) => short(c.title))),
  // Барн-хаус и Великий будинок: два разных дома (Макс 05.10.2026), строки в одной карточке, у Великого будинку в подписи его название
  barn: wrap([
    ...barn.tariffs.map((t) => ({ label: `${barn.title}, ${t.label}`, amount: t.amount, promo: null })),
    ...bigHouse.tariffs.map((t) => ({ label: `${bigHouse.title}, ${t.label}`, amount: t.amount, promo: null })),
  ]),
};
