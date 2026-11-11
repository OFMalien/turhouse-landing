import { createHash } from 'node:crypto';
import fs from 'node:fs';

export default createHash('sha1')
  .update(fs.readFileSync(new URL('../assets/js/app.js', import.meta.url)))
  .digest('hex').slice(0, 10);
