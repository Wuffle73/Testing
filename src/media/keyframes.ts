import * as VideoThumbnails from 'expo-video-thumbnails';

import type { Clip, Keyframe } from '../types/models';
import { deleteClipFrames, persistFrame } from '../storage/frames';
import { deleteKeyframesForClip, insertKeyframe } from '../db/keyframes';

/**
 * Keyframe extraction pipeline.
 *
 * Rather than attempt frame-perfect diffing between two handheld videos (which
 * is unreliable), we sample one still frame every ~1.5s per clip. These frames
 * are what get paired (baseline vs inspection) and sent to the vision model in
 * step 6. Extraction is capped so a long clip can't produce a huge number of
 * frames / API images.
 */

export const KEYFRAME_INTERVAL_MS = 1500;
export const MAX_KEYFRAMES = 16;

/** The timestamps (ms) to sample, given a clip duration. Always ≥ 1 frame. */
export function planTimestamps(
  durationMs: number | null,
  intervalMs = KEYFRAME_INTERVAL_MS,
  max = MAX_KEYFRAMES
): number[] {
  const duration = durationMs && durationMs > 0 ? durationMs : intervalMs;
  const times: number[] = [];
  for (let t = 0; t <= duration && times.length < max; t += intervalMs) {
    times.push(t);
  }
  if (times.length === 0) times.push(0);
  return times;
}

/**
 * Extracts and stores keyframes for a clip, replacing any previously-extracted
 * frames (safe to re-run after a re-record). A single frame failing is skipped
 * rather than aborting the whole clip.
 */
export async function extractKeyframesForClip(clip: Clip): Promise<Keyframe[]> {
  await deleteKeyframesForClip(clip.id);
  deleteClipFrames(clip.sessionId, clip.id);

  const times = planTimestamps(clip.durationMs);
  const frames: Keyframe[] = [];

  for (let i = 0; i < times.length; i++) {
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(clip.videoUri, {
        time: times[i],
        quality: 0.6,
      });
      const uri = await persistFrame(thumb.uri, clip.sessionId, clip.id, i);
      const keyframe = await insertKeyframe({
        clipId: clip.id,
        timestampMs: times[i],
        imageUri: uri,
        frameIndex: i,
      });
      frames.push(keyframe);
    } catch (err) {
      console.warn(`Keyframe extraction failed at ${times[i]}ms`, err);
    }
  }

  return frames;
}
