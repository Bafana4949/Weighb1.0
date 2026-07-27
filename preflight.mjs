import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import process from 'node:process';
import net from 'node:net';

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function check(name, success, message) {
  if (success) {
    console.log(`✅ PASS: ${name}`);
  } else {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   -> ${message}`);
    process.exitCode = 1;
  }
  return success;
}

function warn(name, condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
  } else {
    console.warn(`⚠️  WARNING: ${name}`);
    console.warn(`   -> ${message}`);
  }
}

console.log('--- Preflight Checks ---');

// 1. Node.js version
const nodeVersion = process.versions.node;
check('Node.js version (>= 20.0.0)', parseInt(nodeVersion.split('.')[0], 10) >= 20, `Current version is ${nodeVersion}. Please upgrade to Node.js 20 or later.`);

// 2. .env file
const envPath = path.resolve(__dirname, '.env');
const envExists = check('Root .env file exists', fs.existsSync(envPath), 'Run `Copy-Item .env.example .env` to create it.');

if (envExists) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // 3. Required env vars
  const requiredVars = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'DATABASE_URL', 'AUTH_SECRET', 'SITE_DAEMON_API_KEY', 'PASSWORD_PEPPER'];
  for (const v of requiredVars) {
    const hasVar = new RegExp(`^${v}=.+$`, 'm').test(envContent);
    const isPlaceholder = envContent.includes(`${v}=replace_with_`) || envContent.includes(`${v}=weighbridge_dev_change_me`);
    check(`Environment variable ${v} is set`, hasVar, `Missing in .env`);
    if (hasVar) {
      warn(`Environment variable ${v} is not a placeholder`, !isPlaceholder, `You should replace the default placeholder with a secure value.`);
    }
  }
}

// 4. Port 5432 availability
const port5432InUse = await isPortInUse(5432);
if (port5432InUse) {
  warn('Port 5432 availability', false, 'Port 5432 is already in use. If the Docker Compose Postgres container is not running, you likely have a local Windows PostgreSQL instance running. This will cause authentication failures (P1000) for the seed script.');
} else {
  check('Port 5432 availability', true, '');
}

// 5. Docker CLI
let dockerAvailable = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  dockerAvailable = true;
} catch (e) {}
check('Docker CLI available', dockerAvailable, 'Docker CLI not found. Install Docker Desktop for Windows.');

// 5. Docker daemon
let daemonReachable = false;
if (dockerAvailable) {
  try {
    execSync('docker info', { stdio: 'ignore' });
    daemonReachable = true;
  } catch (e) {
    check('Docker daemon reachable', false, 'Docker daemon is not running. Open Docker Desktop and wait for the engine to start.');
  }
}
if (daemonReachable) {
  check('Docker daemon reachable', true, '');

  // 6. Docker Compose Configuration
  let composeValid = false;
  try {
    execSync('docker compose config', { stdio: 'ignore' });
    composeValid = true;
  } catch (e) {
    check('Docker compose config is valid', false, 'The docker-compose.yml file is invalid.');
  }

  // 7. Check services
  if (composeValid) {
    try {
      const psOutput = execSync('docker compose ps --format json', { encoding: 'utf8' });
      // Depending on docker compose version, output might be array or ndjson
      const services = psOutput.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      }).flat().filter(Boolean);
      
      const postgres = services.find(s => s.Service === 'postgres' || s.Name?.includes('postgres'));
      const mosquitto = services.find(s => s.Service === 'mosquitto' || s.Name?.includes('mosquitto'));

      warn('Postgres container exists', !!postgres, 'Postgres container not found. Run `docker compose up -d postgres mosquitto`.');
      warn('Mosquitto container exists', !!mosquitto, 'Mosquitto container not found. Run `docker compose up -d postgres mosquitto`.');

      if (postgres) {
        const state = postgres.State || postgres.Status; // Depends on version
        const health = postgres.Health || 'unknown';
        const isHealthy = health === 'healthy' || state?.includes('Up');
        warn('Postgres container is healthy', isHealthy, `Container is in state: ${state}, Health: ${health}`);
      }

    } catch (e) {
      // Ignored if containers are not up yet
    }
  }
}

console.log('--- Preflight Complete ---');
if (process.exitCode !== 1) {
  console.log('✅ All critical checks passed. Development environment is ready!');
} else {
  console.log('❌ Some critical checks failed. See the errors above.');
}
