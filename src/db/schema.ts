import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Schema + migration runner for Tenant Auditor.
 *
 * We use SQLite's `PRAGMA user_version` as the migration counter: it starts at
 * 0 on a fresh database and we apply every migration whose 1-based index is
 * greater than the stored version. To evolve the schema in a later build step,
 * append a new SQL string to MIGRATIONS — never edit an existing entry.
 *
 * The full data model (properties, rooms, sessions, clips, keyframes, findings,
 * analysis jobs, settings) is created in migration 1 so that later steps add
 * only UI, not structural migrations.
 */

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS properties (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  floor_map_uri TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  pin_x       REAL,
  pin_y       REAL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(property_id);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY NOT NULL,
  property_id  TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('baseline','inspection')),
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','complete')),
  created_at   INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_property ON sessions(property_id);

CREATE TABLE IF NOT EXISTS clips (
  id          TEXT PRIMARY KEY NOT NULL,
  session_id  TEXT NOT NULL,
  room_id     TEXT NOT NULL,
  video_uri   TEXT NOT NULL,
  duration_ms INTEGER,
  width       INTEGER,
  height      INTEGER,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_clips_session ON clips(session_id);
CREATE INDEX IF NOT EXISTS idx_clips_room ON clips(room_id);

CREATE TABLE IF NOT EXISTS keyframes (
  id           TEXT PRIMARY KEY NOT NULL,
  clip_id      TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  image_uri    TEXT NOT NULL,
  frame_index  INTEGER NOT NULL,
  FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_keyframes_clip ON keyframes(clip_id);

CREATE TABLE IF NOT EXISTS findings (
  id                    TEXT PRIMARY KEY NOT NULL,
  inspection_session_id TEXT NOT NULL,
  room_id               TEXT NOT NULL,
  baseline_clip_id      TEXT,
  inspection_clip_id    TEXT,
  description           TEXT NOT NULL,
  severity              TEXT NOT NULL CHECK (severity IN ('minor','moderate','needs_review')),
  confidence            REAL NOT NULL DEFAULT 0,
  loc_x                 REAL,
  loc_y                 REAL,
  box_w                 REAL,
  box_h                 REAL,
  baseline_frame_ms     INTEGER,
  inspection_frame_ms   INTEGER,
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','dismissed')),
  created_at            INTEGER NOT NULL,
  FOREIGN KEY (inspection_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_findings_session ON findings(inspection_session_id);
CREATE INDEX IF NOT EXISTS idx_findings_room ON findings(room_id);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id                    TEXT PRIMARY KEY NOT NULL,
  inspection_session_id TEXT NOT NULL,
  room_id               TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  attempts              INTEGER NOT NULL DEFAULT 0,
  error                 TEXT,
  updated_at            INTEGER NOT NULL,
  FOREIGN KEY (inspection_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_jobs_session ON analysis_jobs(inspection_session_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;

/** Ordered list of migrations. Append only; index + 1 == schema version. */
const MIGRATIONS: string[] = [MIGRATION_1];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    // Each migration runs in its own transaction; the version bump is part of it.
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    // PRAGMA user_version cannot be parameterized, so interpolate the trusted int.
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}
