import { Directory, File, Paths } from 'expo-file-system';

/**
 * Local storage for extracted keyframes. Frames live alongside their session's
 * videos so a single session-directory delete cleans up everything:
 *
 *   <document>/videos/<sessionId>/frames/<clipId>/<frameIndex>.jpg
 */

const ROOT = 'videos';

function clipFramesDir(sessionId: string, clipId: string): Directory {
  return new Directory(Paths.document, ROOT, sessionId, 'frames', clipId);
}

function ensureClipFramesDir(sessionId: string, clipId: string): Directory {
  const dir = clipFramesDir(sessionId, clipId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Copies a freshly-extracted thumbnail into persistent per-clip storage. */
export async function persistFrame(
  tempUri: string,
  sessionId: string,
  clipId: string,
  index: number
): Promise<string> {
  const dir = ensureClipFramesDir(sessionId, clipId);
  const dest = new File(dir, `${index}.jpg`);
  if (dest.exists) dest.delete();
  const src = new File(tempUri);
  await src.copy(dest);
  return dest.uri;
}

/** Removes every extracted frame for a clip (used on re-record / delete). */
export function deleteClipFrames(sessionId: string, clipId: string): void {
  try {
    const dir = clipFramesDir(sessionId, clipId);
    if (dir.exists) dir.delete();
  } catch {
    // Ignore — DB rows are the source of truth; stray files are harmless.
  }
}
