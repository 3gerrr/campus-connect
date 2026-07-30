#!/usr/bin/env node
// Cross-platform equivalent of ../../dev-up.ps1 -- starts the local Docker
// Postgres (campus-pg) used for Phase 0 development. Read-only beyond
// starting the container: no resets, no migrations, no data changes.
// See PHASE-0-CHECKLIST.md Step 3.
//
// Usage: npm run dev:up  (from backend/)

const { execFileSync } = require('child_process');

function docker(args) {
  return execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function dockerRunning() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function containerNames(includeStopped) {
  try {
    const args = includeStopped
      ? ['ps', '-a', '--format', '{{.Names}}']
      : ['ps', '--format', '{{.Names}}'];
    return docker(args)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!dockerRunning()) {
    console.error(
      "Docker doesn't seem to be reachable. Open Docker Desktop first, then re-run: npm run dev:up",
    );
    process.exit(1);
  }

  if (!containerNames(true).includes('campus-pg')) {
    console.log('campus-pg container not found -- creating it on port 5433...');
    docker(['run', '--name', 'campus-pg', '-e', 'POSTGRES_PASSWORD=postgres', '-p', '5433:5432', '-d', 'postgres']);
  } else if (!containerNames(false).includes('campus-pg')) {
    console.log('Starting existing campus-pg container...');
    docker(['start', 'campus-pg']);
  } else {
    console.log('campus-pg is already running.');
  }

  process.stdout.write('Waiting for Postgres to accept connections...');
  const maxAttempts = 30;
  let ready = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      execFileSync('docker', ['exec', 'campus-pg', 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' });
      ready = true;
      break;
    } catch {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  console.log('');

  if (!ready) {
    console.error(`Postgres did not become ready within ${maxAttempts} seconds. Check: docker logs campus-pg`);
    process.exit(1);
  }

  console.log('ready — run: cd backend; npm run start:dev');
}

main();
