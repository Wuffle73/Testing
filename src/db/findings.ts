import { getDb } from './database';
import { uuid } from '../utils/id';
import { SEVERITY_RANK } from '../types/models';
import type { Finding, FindingStatus, Severity } from '../types/models';

/** Persistence for AI findings (paired-frame comparison results). */

interface FindingRow {
  id: string;
  inspection_session_id: string;
  room_id: string;
  baseline_clip_id: string | null;
  inspection_clip_id: string | null;
  description: string;
  severity: Severity;
  confidence: number;
  loc_x: number | null;
  loc_y: number | null;
  box_w: number | null;
  box_h: number | null;
  baseline_frame_ms: number | null;
  inspection_frame_ms: number | null;
  status: FindingStatus;
  created_at: number;
}

function rowToFinding(r: FindingRow): Finding {
  return {
    id: r.id,
    inspectionSessionId: r.inspection_session_id,
    roomId: r.room_id,
    baselineClipId: r.baseline_clip_id,
    inspectionClipId: r.inspection_clip_id,
    description: r.description,
    severity: r.severity,
    confidence: r.confidence,
    locX: r.loc_x,
    locY: r.loc_y,
    boxW: r.box_w,
    boxH: r.box_h,
    baselineFrameMs: r.baseline_frame_ms,
    inspectionFrameMs: r.inspection_frame_ms,
    status: r.status,
    createdAt: r.created_at,
  };
}

export type FindingInput = Omit<Finding, 'id' | 'createdAt' | 'status'> & {
  status?: FindingStatus;
};

export async function insertFinding(input: FindingInput): Promise<Finding> {
  const db = await getDb();
  const finding: Finding = {
    id: uuid(),
    createdAt: Date.now(),
    status: input.status ?? 'open',
    ...input,
  };
  await db.runAsync(
    `INSERT INTO findings
       (id, inspection_session_id, room_id, baseline_clip_id, inspection_clip_id,
        description, severity, confidence, loc_x, loc_y, box_w, box_h,
        baseline_frame_ms, inspection_frame_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      finding.id,
      finding.inspectionSessionId,
      finding.roomId,
      finding.baselineClipId,
      finding.inspectionClipId,
      finding.description,
      finding.severity,
      finding.confidence,
      finding.locX,
      finding.locY,
      finding.boxW,
      finding.boxH,
      finding.baselineFrameMs,
      finding.inspectionFrameMs,
      finding.status,
      finding.createdAt,
    ]
  );
  return finding;
}

/** Replaces all findings for a (session, room) — used before re-analysis. */
export async function replaceFindingsForRoom(
  inspectionSessionId: string,
  roomId: string,
  findings: FindingInput[]
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM findings WHERE inspection_session_id = ? AND room_id = ?',
    [inspectionSessionId, roomId]
  );
  for (const f of findings) await insertFinding(f);
}

export async function listFindingsForSession(
  inspectionSessionId: string
): Promise<Finding[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FindingRow>(
    'SELECT * FROM findings WHERE inspection_session_id = ? ORDER BY created_at ASC',
    [inspectionSessionId]
  );
  return rows.map(rowToFinding);
}

export async function listFindingsForRoom(
  inspectionSessionId: string,
  roomId: string
): Promise<Finding[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FindingRow>(
    'SELECT * FROM findings WHERE inspection_session_id = ? AND room_id = ? ORDER BY created_at ASC',
    [inspectionSessionId, roomId]
  );
  return rows.map(rowToFinding);
}

export async function setFindingStatus(id: string, status: FindingStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE findings SET status = ? WHERE id = ?', [status, id]);
}

/** Worst (highest-rank) non-dismissed severity per room, for map pin coloring. */
export async function worstSeverityByRoom(
  inspectionSessionId: string
): Promise<Record<string, Severity>> {
  const findings = await listFindingsForSession(inspectionSessionId);
  const worst: Record<string, Severity> = {};
  for (const f of findings) {
    if (f.status === 'dismissed') continue;
    const current = worst[f.roomId];
    if (!current || SEVERITY_RANK[f.severity] > SEVERITY_RANK[current]) {
      worst[f.roomId] = f.severity;
    }
  }
  return worst;
}
