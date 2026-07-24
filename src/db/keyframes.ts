import { getDb } from './database';
import { uuid } from '../utils/id';
import type { Keyframe } from '../types/models';

/** Persistence for keyframes extracted from a clip. */

interface KeyframeRow {
  id: string;
  clip_id: string;
  timestamp_ms: number;
  image_uri: string;
  frame_index: number;
}

function rowToKeyframe(r: KeyframeRow): Keyframe {
  return {
    id: r.id,
    clipId: r.clip_id,
    timestampMs: r.timestamp_ms,
    imageUri: r.image_uri,
    frameIndex: r.frame_index,
  };
}

export interface KeyframeInput {
  clipId: string;
  timestampMs: number;
  imageUri: string;
  frameIndex: number;
}

export async function insertKeyframe(input: KeyframeInput): Promise<Keyframe> {
  const db = await getDb();
  const keyframe: Keyframe = { id: uuid(), ...input };
  await db.runAsync(
    `INSERT INTO keyframes (id, clip_id, timestamp_ms, image_uri, frame_index)
     VALUES (?, ?, ?, ?, ?)`,
    [keyframe.id, keyframe.clipId, keyframe.timestampMs, keyframe.imageUri, keyframe.frameIndex]
  );
  return keyframe;
}

export async function listKeyframesForClip(clipId: string): Promise<Keyframe[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<KeyframeRow>(
    'SELECT * FROM keyframes WHERE clip_id = ? ORDER BY frame_index ASC',
    [clipId]
  );
  return rows.map(rowToKeyframe);
}

export async function countKeyframesForClip(clipId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM keyframes WHERE clip_id = ?',
    [clipId]
  );
  return row?.n ?? 0;
}

export async function deleteKeyframesForClip(clipId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM keyframes WHERE clip_id = ?', [clipId]);
}
