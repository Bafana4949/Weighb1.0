import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localNext = path.resolve(__dirname, '.next');
const rootNext = path.resolve(__dirname, '..', '..', '.next');

if (fs.existsSync(localNext)) {
  try {
    fs.mkdirSync(rootNext, { recursive: true });
    fs.cpSync(localNext, rootNext, { recursive: true });
    console.log('✓ Synced apps/web/.next to root .next for Vercel deployment');
  } catch (err) {
    console.warn('Warning syncing .next to root:', err);
  }
}
