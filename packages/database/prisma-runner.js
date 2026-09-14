import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configPath = path.resolve(__dirname, 'prisma.config.ts');
if (fs.existsSync(configPath)) {
  try { fs.unlinkSync(configPath); } catch (e) {}
}

try {
  const dotenv = await import('dotenv');
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
} catch (e) {}

const [, , ...args] = process.argv;
const schemaPath = `"${path.resolve(__dirname, 'schema.prisma')}"`;
const schemaArg = args.includes('--schema') ? [] : ['--schema', schemaPath];

const localBin = path.resolve(__dirname, 'node_modules/.bin/prisma' + (process.platform === 'win32' ? '.cmd' : ''));
const rootBin = path.resolve(__dirname, '../../node_modules/.bin/prisma' + (process.platform === 'win32' ? '.cmd' : ''));

let cmd = 'npx';
let cmdArgs = ['--yes', 'prisma@6.8.2', ...args, ...schemaArg];

if (fs.existsSync(localBin)) {
  cmd = localBin;
  cmdArgs = [...args, ...schemaArg];
} else if (fs.existsSync(rootBin)) {
  cmd = rootBin;
  cmdArgs = [...args, ...schemaArg];
}

const finalCmd = cmd === 'npx' ? 'npx' : `"${cmd}"`;
const result = spawnSync(finalCmd, cmdArgs, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
