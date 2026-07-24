import { getDb } from './database';

/**
 * Simple key/value app settings persisted in SQLite (the `app_settings` table).
 * Used for non-secret preferences like AI mock-mode and the chosen model.
 * Secrets (the Anthropic API key) live in SecureStore, not here — see ai/config.ts.
 */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
