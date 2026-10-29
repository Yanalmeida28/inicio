import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// When DISTRIHUB_REAL_PG_URL points to a disposable PostgreSQL server, the same
// test bodies run against real PostgreSQL instead of the in-process PGlite WASM build.
export const realPostgresUrl = process.env.DISTRIHUB_REAL_PG_URL || '';
export const isRealPostgres = realPostgresUrl !== '';

const clusterRoles = ['anon', 'authenticated', 'service_role'];

export async function openDatabase() {
  if (!isRealPostgres) return new PGlite();
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (value) => Number(value));
  const admin = new pg.Client({ connectionString: realPostgresUrl });
  await admin.connect();
  const name = `dh_${randomUUID().replaceAll('-', '')}`;
  try {
    for (const role of clusterRoles) {
      await admin.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`,
      );
    }
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(realPostgresUrl);
    url.pathname = `/${name}`;
    const client = new pg.Client({ connectionString: url.href });
    await client.connect();
    const roleStatement = new RegExp(`CREATE ROLE (${clusterRoles.join('|')})\\s*;`, 'g');
    return {
      async exec(sql) {
        await client.query(sql.replace(roleStatement, ''));
      },
      query: (sql, params) => client.query(sql, params),
      async close() {
        await client.end().catch(() => {});
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        await admin.end();
      },
    };
  } catch (error) {
    await admin.end().catch(() => {});
    throw error;
  }
}
