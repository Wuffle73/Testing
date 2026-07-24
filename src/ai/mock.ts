import type { Severity } from '../types/models';
import type { RawFinding } from './types';

/**
 * Offline mock comparison. Returns realistic-looking sample findings without any
 * API call or key, so the whole app (recording → analysis → results) is testable
 * for free. Output is deterministic per room name so re-running is stable, and
 * some rooms come back clean (no findings) to exercise the "grey pin" path.
 */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const SAMPLES: { description: string; severity: Severity }[] = [
  { description: 'Scuff marks and a small dent on the wall near the doorway.', severity: 'minor' },
  { description: 'Carpet staining that was not present in the baseline walkthrough.', severity: 'moderate' },
  { description: 'Cracked tile / possible water damage — inspect this area closely in person.', severity: 'needs_review' },
  { description: 'Light fixture appears to be missing a cover.', severity: 'minor' },
  { description: 'Wall discoloration consistent with a picture or fixture being removed.', severity: 'minor' },
  { description: 'Hole in the wall that looks new relative to the baseline.', severity: 'needs_review' },
];

export function mockCompareFrames(roomName: string, frameCount: number): RawFinding[] {
  const seed = hashString(roomName);
  // ~1 in 3 rooms come back clean.
  if (seed % 3 === 0) return [];

  const count = (seed % 2) + 1; // 1 or 2 findings
  const findings: RawFinding[] = [];
  for (let i = 0; i < count; i++) {
    const sample = SAMPLES[(seed + i * 7) % SAMPLES.length];
    const frameIndex = frameCount > 0 ? (seed + i) % frameCount : 0;
    // Deterministic pseudo-random box in the lower-middle of the frame.
    const x = 0.15 + ((seed >> (i + 1)) % 50) / 100;
    const y = 0.2 + ((seed >> (i + 2)) % 40) / 100;
    findings.push({
      description: sample.description,
      severity: sample.severity,
      confidence: 0.55 + ((seed >> (i + 3)) % 40) / 100, // 0.55–0.95
      frameIndex,
      box: { x: Math.min(x, 0.7), y: Math.min(y, 0.7), w: 0.2, h: 0.2 },
    });
  }
  return findings;
}
