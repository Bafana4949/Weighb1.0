import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (val) envVars[key] = val;
}

const targetKeys = [
  'DATABASE_URL',
  'DIRECT_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTH_SECRET',
  'AUTH_TRUST_HOST',
  'PASSWORD_PEPPER'
];

for (const key of targetKeys) {
  const val = envVars[key];
  if (!val) continue;
  console.log(`Setting ${key} on Vercel...`);
  const extraArgs = key.startsWith('NEXT_PUBLIC_') ? ['--type', 'config'] : [];
  const res = spawnSync('npx', ['vercel', 'env', 'add', key, 'production,preview,development', ...extraArgs, '--force', '--yes'], {
    input: val + '\n',
    encoding: 'utf8',
    shell: true,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  if (res.status === 0) {
    console.log(`✓ ${key} set successfully.`);
  } else {
    console.error(`✗ Error setting ${key}, code ${res.status}`);
  }
}
console.log('All environment variables synced to Vercel.');
