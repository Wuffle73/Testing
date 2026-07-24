import { getDb } from './database';
import { uuid } from '../utils/id';
import { deleteVideoFile } from '../storage/videos';
import { deleteClipFrames } from '../storage/frames';
import type { Clip } from '../types/models';

/** Per-room video clip persistence. */

interface ClipRow {
  id: string;
  session_id: string;
  room_id: string;
  video_uri: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: number;
}

function rowToClip(r: ClipRow): Clip {
  return {
    id: r.id,
    sessionId: r.session_id,
    roomId: r.room_id,
    videoUri: r.video_uri,
    durationMs: r.duration_ms,
    width: r.width,
    height: r.height,
    createdAt: r.created_at,
  };
}

export async function listClipsForSession(sessionId: string): Promise<Clip[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ClipRow>('SELECT * FROM clips WHERE session_id = ?', [
    sessionId,
  ]);
  return rows.map(rowToClip);
}

/** Clips keyed by room id, for quick "has this room been recorded?" lookups. */
export async function getClipsByRoom(sessionId: string): Promise<Record<string, Clip>> {
  const clips = await listClipsForSession(sessionId);
  const map: Record<string, Clip> = {};
  for (const c of clips) map[c.roomId] = c;
  return map;
}

export async function getClipForRoom(
  sessionId: string,
  roomId: string
): Promise<Clip | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ClipRow>(
    'SELECT * FROM clips WHERE session_id = ? AND room_id = ?',
    [sessionId, roomId]
  );
  return row ? rowToClip(row) : null;
}

export interface ClipInput {
  sessionId: string;
  roomId: string;
  videoUri: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Inserts a clip for (session, room), or updates the existing row if the room
 * was re-recorded. The video file itself is overwritten in place by the storage
 * layer, so only the row's metadata changes on a re-record.
 */
export async function upsertClip(input: ClipInput): Promise<Clip> {
  const db = await getDb();
  const now = Date.now();
  const existing = await getClipForRoom(input.sessionId, input.roomId);
  if (existing) {
    await db.runAsync(
      `UPDATE clips SET video_uri = ?, duration_ms = ?, width = ?, height = ?, created_at = ?
       WHERE id = ?`,
      [input.videoUri, input.durationMs, input.width, input.height, now, existing.id]
    );
    return { ...existing, ...input, createdAt: now };
  }
  const clip: Clip = { id: uuid(), createdAt: now, ...input };
  await db.runAsync(
    `INSERT INTO clips (id, session_id, room_id, video_uri, duration_ms, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [clip.id, clip.sessionId, clip.roomId, clip.videoUri, clip.durationMs, clip.width, clip.height, now]
  );
  return clip;
}

export async function deleteClip(id: string): Promise<void> {
  const db = await getDb();
  const clip = await db.getFirstAsync<ClipRow>('SELECT * FROM clips WHERE id = ?', [id]);
  if (clip) {
    deleteVideoFile(clip.video_uri);
    deleteClipFrames(clip.session_id, clip.id);
  }
  // Keyframe rows cascade via the foreign key on delete.
  await db.runAsync('DELETE FROM clips WHERE id = ?', [id]);
}
