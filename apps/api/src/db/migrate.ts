import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.js';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

export interface Migration {
  readonly version: string;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export const loadMigrations = async (dir = MIGRATIONS_DIR): Promise<Migration[]> => {
  const files = (await readdir(dir)).filter((f) => FILE_PATTERN.test(f)).sort();
  return Promise.all(
    files.map(async (file) => {
      const [, version, name] = FILE_PATTERN.exec(file) as RegExpExecArray;
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      return { version: version as string, name: name as string, sql, checksum };
    }),
  );
};

/**
 * Forward-only migration runner. Each migration runs in its own transaction and
 * is recorded with a checksum; editing an applied migration aborts the run.
 * An advisory lock prevents two processes migrating concurrently.
 */
export const migrate = async (
  pool: Pool,
  dir = MIGRATIONS_DIR,
): Promise<{ applied: string[]; skipped: string[] }> => {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(41060001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const done = new Map(rows.map((r) => [r.version, r.checksum]));
    const applied: string[] = [];
    const skipped: string[] = [];
    for (const m of await loadMigrations(dir)) {
      const existing = done.get(m.version);
      if (existing !== undefined) {
        if (existing !== m.checksum) {
          throw new Error(`Checksum mismatch for applied migration ${m.version}_${m.name}`);
        }
        skipped.push(m.version);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        await client.query('COMMIT');
        applied.push(m.version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.version}_${m.name} failed: ${(error as Error).message}`);
      }
    }
    return { applied, skipped };
  } finally {
    await client.query('SELECT pg_advisory_unlock(41060001)').catch(() => undefined);
    client.release();
  }
};

/** Drops and recreates the public schema. Development and test only. */
export const resetSchema = async (pool: Pool): Promise<void> => {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
};
