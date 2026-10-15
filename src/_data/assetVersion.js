// Версія стилів для адреси main.css (?v=...): хеш вмісту src/assets/css. Змінюється разом зі стилями,
// тож браузер не тримає старий main.css з кешу після оновлення сайту (Макс 06.10.2026: «у мене нічого не змінилось»).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../assets/css/', import.meta.url);
const h = createHash('sha1');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.css')).sort()) {
  h.update(f);
  h.update(fs.readFileSync(new URL(f, dir)));
}
export default h.digest('hex').slice(0, 10);
