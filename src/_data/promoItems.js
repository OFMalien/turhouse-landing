// Рядки акції збираються з rooms.json і cottages.json: у них і звичайна ціна (price), і ціна акції (promoPrice).
// Так ціни акції не розходяться з цінами карточок. Ціни номерів і котеджа на 4 гості дала Оля (30.09.2026); ціни котеджа на 6 гостей і Барн-хауса додані 05.10.2026 за словами Макса («на всі варіанти») як ціна мінус 20%.
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));

// 05.10.2026 Макс: знижка 20% діє на ВСІ варіанти проживання (будь-який номер, котедж, будинок); ціни котеджа на 6 гостей і Барн-хауса пораховані як ціна мінус 20%.
const barn = read('barn.json');
const barnRows = barn.tariffs.filter((t) => t.promoAmount).map((t) => ({ label: `${barn.title} ${t.label}`, was: t.amount, now: t.promoAmount }));

export default [
  ...[...read('rooms.json'), ...read('cottages.json')]
    .filter((item) => item.promoPrice)
    .map((item) => ({
      label: item.promoLabel || item.title,
      was: item.price,
      now: item.promoPrice,
    })),
  ...barnRows,
];
