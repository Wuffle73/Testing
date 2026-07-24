import { Directory, File, Paths } from 'expo-file-system';

/**
 * Local video storage for walkthrough clips, built on the SDK 57 file-system
 * API (`Paths` / `File` / `Directory`). Clips live under the persistent
 * document directory at:
 *
 *   <document>/videos/<sessionId>/<roomId>.mp4
 *
 * Using a deterministic path per (session, room) means re-recording a room
 * simply overwrites its file — no orphaned videos accumulate.
 */

const ROOT = 'videos';

/** Warn the landlord if free space drops below this before a recording. */
export const LOW_SPACE_BYTES = 300 * 1024 * 1024; // ~300 MB

function sessionDir(sessionId: string): Directory {
  return new Directory(Paths.document, ROOT, sessionId);
}

function ensureSessionDir(sessionId: string): Directory {
  const dir = sessionDir(sessionId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export interface PersistedVideo {
  uri: string;
  size: number | null;
}

/** Copies a freshly-recorded temp file into persistent per-room storage. */
export async function persistRecording(
  tempUri: string,
  sessionId: string,
  roomId: string
): Promise<PersistedVideo> {
  const dir = ensureSessionDir(sessionId);
  const dest = new File(dir, `${roomId}.mp4`);
  if (dest.exists) dest.delete();
  const src = new File(tempUri);
  await src.copy(dest);
  return { uri: dest.uri, size: dest.exists ? dest.size : null };
}

/** Best-effort delete of a single clip file (safe to call on a missing file). */
export function deleteVideoFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Ignore — the DB row is the source of truth; a stale file is harmless.
  }
}

/** Removes every clip for a session (used when deleting a session). */
export function deleteSessionVideos(sessionId: string): void {
  try {
    const dir = sessionDir(sessionId);
    if (dir.exists) dir.delete();
  } catch {
    // Ignore cleanup failures.
  }
}

/** Free space on the device's internal storage, in bytes. */
export function availableDiskSpace(): number {
  return Paths.availableDiskSpace;
}

export function isLowOnSpace(): boolean {
  return availableDiskSpace() < LOW_SPACE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
