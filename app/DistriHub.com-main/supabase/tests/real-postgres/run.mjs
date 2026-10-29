// Runs the database tests that support DISTRIHUB_REAL_PG_URL against a REAL PostgreSQL server.
//
//   Option A (external disposable server): set DISTRIHUB_REAL_PG_URL=postgres://user:pw@host:port/postgres
//   Option B (local, nothing to configure): npm install --no-save embedded-postgres (inside supabase/tests)
//
// NEVER point this at the production Supabase project: every test creates and drops its own database.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = fileURLToPath(new URL('..', import.meta.url));
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.mjs') && readFileSync(join(testsDir, name), 'utf8').includes('test-database.mjs'))
  .map((name) => join(testsDir, name));

function runTests(url) {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    stdio: 'inherit',
    env: { ...process.env, DISTRIHUB_REAL_PG_URL: url },
  });
  return result.status ?? 1;
}

const external = process.env.DISTRIHUB_REAL_PG_URL;
if (external) {
  if (/supabase\.co/i.test(external)) {
    console.error('Refusing to run against a Supabase hosted database.');
    process.exit(2);
  }
  process.exit(runTests(external));
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error('No PostgreSQL available. Set DISTRIHUB_REAL_PG_URL or run: npm install --no-save embedded-postgres');
  process.exit(2);
}

const port = Number(process.env.DISTRIHUB_REAL_PG_PORT || 54339);
const databaseDir = join(tmpdir(), `distrihub-real-pg-${process.pid}`);
const server = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'distrihub-test',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});
let status = 1;
try {
  await server.initialise();
  await server.start();
  status = runTests(`postgres://postgres:distrihub-test@127.0.0.1:${port}/postgres`);
} finally {
  await server.stop().catch(() => {});
  try {
    rmSync(databaseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    console.warn('Temporary data directory could not be removed: ' + databaseDir);
  }
}
process.exit(status);
