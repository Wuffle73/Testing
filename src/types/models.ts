/**
 * Domain model for Tenant Auditor.
 *
 * These TypeScript types mirror the SQLite schema in src/db/schema.ts. The full
 * schema (including sessions, clips, keyframes, findings) is created up front in
 * step 1 so later build steps only add UI, not migrations. Step 1 exercises the
 * Property + Room tables via the property CRUD flow.
 */

/** Which kind of walkthrough a recording session belongs to. */
export type SessionType = 'baseline' | 'inspection';

export type SessionStatus = 'in_progress' | 'complete';

/**
 * Severity of an AI finding. Ordered from least to most serious; the numeric
 * rank in SEVERITY_RANK is what drives "worst severity" pin coloring.
 */
export type Severity = 'minor' | 'moderate' | 'needs_review';

/** Landlord's verdict on an AI finding. Findings start life as `open`. */
export type FindingStatus = 'open' | 'confirmed' | 'dismissed';

/** Lifecycle of a queued paired-frame AI comparison for a room. */
export type AnalysisJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Property {
  id: string;
  name: string;
  address: string;
  /** Optional local URI of an uploaded floor-plan photo for the pin canvas. */
  floorMapUri: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Room {
  id: string;
  propertyId: string;
  name: string;
  /** Recording order; also the order the guided walkthrough steps through. */
  sortOrder: number;
  /** Normalized (0..1) pin position on the floor map, or null if unplaced. */
  pinX: number | null;
  pinY: number | null;
  createdAt: number;
}

export interface Session {
  id: string;
  propertyId: string;
  type: SessionType;
  status: SessionStatus;
  createdAt: number;
  completedAt: number | null;
}

/** One video clip: a single room recorded during a single session. */
export interface Clip {
  id: string;
  sessionId: string;
  roomId: string;
  videoUri: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

/** A still frame extracted from a clip for AI comparison. */
export interface Keyframe {
  id: string;
  clipId: string;
  /** Position of this frame within the clip, in milliseconds. */
  timestampMs: number;
  imageUri: string;
  /** 0-based index within the clip's extracted frames. */
  frameIndex: number;
}

/** A single AI-flagged issue comparing a baseline clip against an inspection clip. */
export interface Finding {
  id: string;
  inspectionSessionId: string;
  roomId: string;
  baselineClipId: string | null;
  inspectionClipId: string | null;
  description: string;
  severity: Severity;
  confidence: number; // 0..1
  /** Normalized location box on the inspection frame (0..1). */
  locX: number | null;
  locY: number | null;
  boxW: number | null;
  boxH: number | null;
  /** Timestamps (ms) of the frames the finding refers to, for auto-seek. */
  baselineFrameMs: number | null;
  inspectionFrameMs: number | null;
  status: FindingStatus;
  createdAt: number;
}

/**
 * A queued comparison of one room's inspection frames against its baseline.
 * Lets AI calls fail/retry without blocking the recording flow.
 */
export interface AnalysisJob {
  id: string;
  inspectionSessionId: string;
  roomId: string;
  status: AnalysisJobStatus;
  attempts: number;
  error: string | null;
  updatedAt: number;
}

/** Numeric ranking so "worst" severity in a room can be computed. */
export const SEVERITY_RANK: Record<Severity, number> = {
  minor: 1,
  moderate: 2,
  needs_review: 3,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  needs_review: 'Needs review',
};
