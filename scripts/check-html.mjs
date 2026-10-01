// Валидность разметки собранного сайта (E5-T4, п.26 ТЗ при недоступности validator.w3.org): html-validate по всем страницам, 0 ошибок.
// Правила: html-validate:recommended, кроме tel-non-breaking (номер уже не переносится через .nowrap, это стилевая подсказка, а не ошибка разметки), см. .htmlvalidate.json.
// Использование: node scripts/check-html.mjs   (спершу зберіть сайт: preview або production)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HtmlValidate, FileSystemConfigLoader } from 'html-validate/node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.join(root, '_site');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets' && e.name !== 'dev') walk(p); }
    else if (e.name === 'index.html' || (dir === siteDir && e.name === '404.html')) files.push(p);
  }
})(siteDir);

const validator = new HtmlValidate(new FileSystemConfigLoader()); // конфигурация из .htmlvalidate.json в корне репозитория
let problems = 0;
const lines = [];
for (const f of files) {
  const report = await validator.validateFile(f);
  for (const r of report.results) for (const m of r.messages) {
    problems++;
    lines.push(`  - ${path.relative(siteDir, f)}:${m.line}:${m.column} ${m.ruleId}: ${m.message}`);
  }
}
if (problems) {
  console.error(`check-html: ошибок ${problems}`);
  for (const l of lines.slice(0, 60)) console.error(l);
  process.exit(1);
}
console.log(`check-html: OK, страниц ${files.length}, 0 ошибок html-validate`);
