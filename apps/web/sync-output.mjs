import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dotNext = path.resolve(__dirname, '.next');
const nestedTarget = path.resolve(__dirname, 'apps', 'web', '.next');

if (fs.existsSync(dotNext)) {
  try {
    fs.mkdirSync(path.dirname(nestedTarget), { recursive: true });
    fs.cpSync(dotNext, nestedTarget, { recursive: true });
    console.log('✓ Synced .next to apps/web/.next for Vercel output compatibility');
  } catch (err) {
    console.warn('Warning syncing .next output directory:', err);
  }
}
