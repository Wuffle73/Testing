import { File } from 'expo-file-system';

import { getSession, getCurrentSession } from '../db/sessions';
import { listRooms } from '../db/rooms';
import { getClipForRoom } from '../db/clips';
import { listKeyframesForClip } from '../db/keyframes';
import { listJobsForSession, updateJob } from '../db/analysisJobs';
import { replaceFindingsForRoom, type FindingInput } from '../db/findings';
import type { AnalysisJob, Keyframe } from '../types/models';
import { callAnthropicCompare } from './anthropic';
import { mockCompareFrames } from './mock';
import type { AiConfig } from './config';
import type { FramePayload, RawFinding } from './types';

/** Cap frames per side to bound payload size, cost, and latency. */
const MAX_FRAMES_PER_SIDE = 4;
const TIMEOUT_MS = 60000;
const RETRIES = 1;

/** Evenly sample up to `n` items from an array. */
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  }
  return out;
}

async function encodeFrames(keyframes: Keyframe[]): Promise<FramePayload[]> {
  const out: FramePayload[] = [];
  for (const kf of keyframes) {
    try {
      const base64 = await new File(kf.imageUri).base64();
      out.push({ timestampMs: kf.timestampMs, base64 });
    } catch {
      // Skip an unreadable frame rather than failing the whole comparison.
    }
  }
  return out;
}

async function withTimeoutRetry<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function toFindingInputs(
  raw: RawFinding[],
  ctx: {
    inspectionSessionId: string;
    roomId: string;
    baselineClipId: string | null;
    inspectionClipId: string;
    inspectionKeyframes: Keyframe[];
    baselineKeyframes: Keyframe[];
  }
): FindingInput[] {
  const baselineFrameMs = ctx.baselineKeyframes[0]?.timestampMs ?? null;
  return raw.map((r) => {
    const kf =
      r.frameIndex != null && ctx.inspectionKeyframes[r.frameIndex]
        ? ctx.inspectionKeyframes[r.frameIndex]
        : ctx.inspectionKeyframes[0];
    return {
      inspectionSessionId: ctx.inspectionSessionId,
      roomId: ctx.roomId,
      baselineClipId: ctx.baselineClipId,
      inspectionClipId: ctx.inspectionClipId,
      description: r.description,
      severity: r.severity,
      confidence: r.confidence,
      locX: r.box?.x ?? null,
      locY: r.box?.y ?? null,
      boxW: r.box?.w ?? null,
      boxH: r.box?.h ?? null,
      baselineFrameMs,
      inspectionFrameMs: kf?.timestampMs ?? null,
    };
  });
}

/** Runs one room's comparison and persists its findings. Throws on failure. */
async function runJobForRoom(job: AnalysisJob, config: AiConfig, roomName: string): Promise<number> {
  const inspection = await getSession(job.inspectionSessionId);
  if (!inspection) throw new Error('Inspection session not found.');

  const inspClip = await getClipForRoom(job.inspectionSessionId, job.roomId);
  if (!inspClip) throw new Error('No inspection recording for this room.');

  const baseline = await getCurrentSession(inspection.propertyId, 'baseline');
  const baseClip = baseline ? await getClipForRoom(baseline.id, job.roomId) : null;

  const inspKeyframes = sample(await listKeyframesForClip(inspClip.id), MAX_FRAMES_PER_SIDE);
  const baseKeyframes = baseClip
    ? sample(await listKeyframesForClip(baseClip.id), MAX_FRAMES_PER_SIDE)
    : [];

  let raw: RawFinding[];
  if (config.mock || !config.apiKey) {
    raw = mockCompareFrames(roomName, inspKeyframes.length);
  } else {
    const [inspectionFrames, baselineFrames] = await Promise.all([
      encodeFrames(inspKeyframes),
      encodeFrames(baseKeyframes),
    ]);
    raw = await withTimeoutRetry((signal) =>
      callAnthropicCompare({
        apiKey: config.apiKey as string,
        model: config.model,
        roomName,
        baselineFrames,
        inspectionFrames,
        signal,
      })
    );
  }

  const findings = toFindingInputs(raw, {
    inspectionSessionId: job.inspectionSessionId,
    roomId: job.roomId,
    baselineClipId: baseClip?.id ?? null,
    inspectionClipId: inspClip.id,
    inspectionKeyframes: inspKeyframes,
    baselineKeyframes: baseKeyframes,
  });
  await replaceFindingsForRoom(job.inspectionSessionId, job.roomId, findings);
  return findings.length;
}

export type JobProgressStatus = 'running' | 'done' | 'error';
export interface JobProgress {
  roomId: string;
  status: JobProgressStatus;
  findings?: number;
  error?: string;
}

export interface AnalysisSummary {
  total: number;
  done: number;
  failed: number;
}

/**
 * Processes all queued/errored jobs for an inspection session, one room at a
 * time. A failed room is recorded and skipped — it never blocks the others,
 * and can be retried later. `onProgress` drives per-room UI updates.
 */
export async function processQueuedJobs(
  inspectionSessionId: string,
  config: AiConfig,
  onProgress?: (p: JobProgress) => void
): Promise<AnalysisSummary> {
  const jobs = (await listJobsForSession(inspectionSessionId)).filter(
    (j) => j.status === 'queued' || j.status === 'error'
  );
  const inspection = await getSession(inspectionSessionId);
  const rooms = inspection ? await listRooms(inspection.propertyId) : [];
  const nameById: Record<string, string> = {};
  for (const r of rooms) nameById[r.id] = r.name;

  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    await updateJob(job.id, { status: 'running' });
    onProgress?.({ roomId: job.roomId, status: 'running' });
    try {
      const count = await runJobForRoom(job, config, nameById[job.roomId] ?? 'Room');
      await updateJob(job.id, { status: 'done', error: null });
      done++;
      onProgress?.({ roomId: job.roomId, status: 'done', findings: count });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateJob(job.id, { status: 'error', error: message, incrementAttempts: true });
      failed++;
      onProgress?.({ roomId: job.roomId, status: 'error', error: message });
    }
  }
  return { total: jobs.length, done, failed };
}
