import type { Severity } from '../types/models';

/**
 * A finding as produced by the comparison step (mock or live), before it's
 * mapped onto DB rows. `frameIndex` refers to the inspection frame (0-based)
 * the finding is about, so the engine can resolve a timestamp for auto-seek.
 * `box` is a normalized (0..1) region on that inspection frame.
 */
export interface RawFinding {
  description: string;
  severity: Severity;
  confidence: number; // 0..1
  frameIndex: number | null;
  box: { x: number; y: number; w: number; h: number } | null;
}

/** A frame handed to the comparison step. */
export interface FramePayload {
  timestampMs: number;
  base64: string;
}
