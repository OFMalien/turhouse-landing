// Рядки акції збираються з rooms.json і cottages.json: у них і звичайна ціна (price), і ціна акції (promoPrice).
// Так ціни акції не розходяться з цінами карточок. Ціни акції дала Оля (30.09.2026); Макс 05.10.2026: показуємо лише ці чотири, інші не перераховуємо.
import fs from 'node:fs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));

export default [...read('rooms.json'), ...read('cottages.json')]
  .filter((item) => item.promoPrice)
  .map((item) => ({
    label: item.promoLabel || item.title,
    was: item.price,
    now: item.promoPrice,
  }));
