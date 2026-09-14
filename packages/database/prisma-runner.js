import { config } from 'dotenv';
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

config({ path: path.resolve(__dirname, '../../.env') });

const [, , ...args] = process.argv;
const schemaPath = path.resolve(__dirname, 'schema.prisma');
const schemaArg = args.includes('--schema') ? [] : ['--schema', `"${schemaPath}"`];
const result = spawnSync('npx', ['prisma', ...args, ...schemaArg], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
