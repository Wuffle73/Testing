import * as SQLite from 'expo-sqlite';
import { runMigrations } from './schema';

const DB_NAME = 'tenant_auditor.db';

/**
 * Lazily-opened singleton database handle. We cache the promise (not just the
 * resolved db) so concurrent callers during app startup share one open +
 * migrate sequence rather than racing.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // WAL improves write concurrency; foreign_keys enforces our ON DELETE CASCADEs.
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      return db;
    })().catch((err) => {
      // Reset so a later retry can re-attempt opening rather than reusing a
      // permanently-rejected promise.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/** Convenience used by App bootstrap to surface DB init errors early. */
export async function initDatabase(): Promise<void> {
  await getDb();
}
