// Галерея бані без кадрів, які вже стоять на сторінці вище: кадр шапки (spa.photo) і фото трьох карточок (spa.cards[].photo).
import fs from 'node:fs';

const spa = JSON.parse(fs.readFileSync(new URL('./spa.json', import.meta.url), 'utf8'));
const shown = new Set([spa.photo, ...spa.cards.map((c) => c.photo)]);

export default spa.gallery.filter((id) => !shown.has(id));
