import { getDb } from './database';
import { uuid } from '../utils/id';
import type { AnalysisJob, AnalysisJobStatus } from '../types/models';

/**
 * Queue of paired-frame AI comparisons — one job per (inspection session, room).
 *
 * Decoupling "record the room" from "run the comparison" means a slow, failed,
 * or offline AI call never blocks the walkthrough: a room's job sits `queued`
 * (or `error`, retryable) until the analysis engine (build step 6) processes
 * it. Enqueuing here in step 5 is the producer side of that queue.
 */

interface JobRow {
  id: string;
  inspection_session_id: string;
  room_id: string;
  status: AnalysisJobStatus;
  attempts: number;
  error: string | null;
  updated_at: number;
}

function rowToJob(r: JobRow): AnalysisJob {
  return {
    id: r.id,
    inspectionSessionId: r.inspection_session_id,
    roomId: r.room_id,
    status: r.status,
    attempts: r.attempts,
    error: r.error,
    updatedAt: r.updated_at,
  };
}

export async function getJobForRoom(
  inspectionSessionId: string,
  roomId: string
): Promise<AnalysisJob | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<JobRow>(
    'SELECT * FROM analysis_jobs WHERE inspection_session_id = ? AND room_id = ?',
    [inspectionSessionId, roomId]
  );
  return row ? rowToJob(row) : null;
}

export async function listJobsForSession(inspectionSessionId: string): Promise<AnalysisJob[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<JobRow>(
    'SELECT * FROM analysis_jobs WHERE inspection_session_id = ? ORDER BY updated_at ASC',
    [inspectionSessionId]
  );
  return rows.map(rowToJob);
}

/**
 * Queues (or re-queues) the comparison for a room. Idempotent per room: a
 * re-record resets the existing job back to `queued` with a clean attempt
 * count rather than creating a duplicate.
 */
export async function enqueueJob(
  inspectionSessionId: string,
  roomId: string
): Promise<AnalysisJob> {
  const db = await getDb();
  const now = Date.now();
  const existing = await getJobForRoom(inspectionSessionId, roomId);
  if (existing) {
    await db.runAsync(
      `UPDATE analysis_jobs SET status = 'queued', attempts = 0, error = NULL, updated_at = ?
       WHERE id = ?`,
      [now, existing.id]
    );
    return { ...existing, status: 'queued', attempts: 0, error: null, updatedAt: now };
  }
  const job: AnalysisJob = {
    id: uuid(),
    inspectionSessionId,
    roomId,
    status: 'queued',
    attempts: 0,
    error: null,
    updatedAt: now,
  };
  await db.runAsync(
    `INSERT INTO analysis_jobs (id, inspection_session_id, room_id, status, attempts, error, updated_at)
     VALUES (?, ?, ?, 'queued', 0, NULL, ?)`,
    [job.id, inspectionSessionId, roomId, now]
  );
  return job;
}

export interface JobUpdate {
  status: AnalysisJobStatus;
  error?: string | null;
  incrementAttempts?: boolean;
}

/** Used by the analysis engine (step 6) to move a job through its lifecycle. */
export async function updateJob(id: string, update: JobUpdate): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE analysis_jobs
       SET status = ?,
           error = ?,
           attempts = attempts + ?,
           updated_at = ?
     WHERE id = ?`,
    [update.status, update.error ?? null, update.incrementAttempts ? 1 : 0, Date.now(), id]
  );
}
