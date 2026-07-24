import { getDb } from './database';
import { uuid } from '../utils/id';
import { deleteSessionVideos } from '../storage/videos';
import type { Session, SessionType } from '../types/models';

/**
 * Walkthrough session persistence. A session groups the per-room clips recorded
 * in one pass (a baseline "move-in" or an inspection "move-out"). Recording one
 * clip per room — rather than one long video — makes crash recovery safe and
 * room-to-room matching reliable.
 */

interface SessionRow {
  id: string;
  property_id: string;
  type: SessionType;
  status: 'in_progress' | 'complete';
  created_at: number;
  completed_at: number | null;
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    propertyId: r.property_id,
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export async function getSession(id: string): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  return row ? rowToSession(row) : null;
}

/** A session enriched with its clip/finding counts, for the storage screen. */
export interface SessionSummary extends Session {
  clipCount: number;
  findingCount: number;
}

export async function listSessionSummaries(propertyId: string): Promise<SessionSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow & { clip_count: number; finding_count: number }>(
    `SELECT s.*,
       (SELECT COUNT(*) FROM clips c WHERE c.session_id = s.id) AS clip_count,
       (SELECT COUNT(*) FROM findings f WHERE f.inspection_session_id = s.id) AS finding_count
     FROM sessions s
     WHERE s.property_id = ?
     ORDER BY s.created_at DESC`,
    [propertyId]
  );
  return rows.map((r) => ({
    ...rowToSession(r),
    clipCount: r.clip_count,
    findingCount: r.finding_count,
  }));
}

/** The in-progress session of a type for a property, if one exists. */
export async function getActiveSession(
  propertyId: string,
  type: SessionType
): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions
     WHERE property_id = ? AND type = ? AND status = 'in_progress'
     ORDER BY created_at DESC LIMIT 1`,
    [propertyId, type]
  );
  return row ? rowToSession(row) : null;
}

/**
 * The session to surface for a type: an in-progress one wins, otherwise the
 * most recently completed. Returns null if the walkthrough was never started.
 */
export async function getCurrentSession(
  propertyId: string,
  type: SessionType
): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions
     WHERE property_id = ? AND type = ?
     ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END,
              COALESCE(completed_at, created_at) DESC
     LIMIT 1`,
    [propertyId, type]
  );
  return row ? rowToSession(row) : null;
}

/** Resumes an in-progress session or starts a fresh one. */
export async function getOrCreateSession(
  propertyId: string,
  type: SessionType
): Promise<Session> {
  const active = await getActiveSession(propertyId, type);
  if (active) return active;

  const db = await getDb();
  const session: Session = {
    id: uuid(),
    propertyId,
    type,
    status: 'in_progress',
    createdAt: Date.now(),
    completedAt: null,
  };
  await db.runAsync(
    `INSERT INTO sessions (id, property_id, type, status, created_at, completed_at)
     VALUES (?, ?, ?, 'in_progress', ?, NULL)`,
    [session.id, propertyId, type, session.createdAt]
  );
  return session;
}

export async function completeSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sessions SET status = 'complete', completed_at = ? WHERE id = ?`,
    [Date.now(), id]
  );
}

/** Re-opens a completed session so specific rooms can be re-recorded. */
export async function reopenSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sessions SET status = 'in_progress', completed_at = NULL WHERE id = ?`,
    [id]
  );
}

/** Deletes a session (cascades clips/keyframes/findings) and its video files. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
  deleteSessionVideos(id);
}
