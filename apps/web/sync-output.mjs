import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localNext = path.resolve(__dirname, '.next');
const rootNext = path.resolve(__dirname, '..', '..', '.next');

// Sync from local apps/web/.next to root .next
if (fs.existsSync(localNext)) {
  try {
    fs.mkdirSync(rootNext, { recursive: true });
    fs.cpSync(localNext, rootNext, { recursive: true });
    console.log('✓ Successfully synced apps/web/.next -> root .next for Vercel');
  } catch (err) {
    console.warn('Warning syncing to root .next:', err);
  }
}

// Sync from root .next to local apps/web/.next if built from root
if (fs.existsSync(rootNext) && !fs.existsSync(localNext)) {
  try {
    fs.mkdirSync(localNext, { recursive: true });
    fs.cpSync(rootNext, localNext, { recursive: true });
    console.log('✓ Successfully synced root .next -> apps/web/.next for Vercel');
  } catch (err) {
    console.warn('Warning syncing to local .next:', err);
  }
}
