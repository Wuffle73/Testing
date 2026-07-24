import type { Severity } from '../types/models';
import type { FramePayload, RawFinding } from './types';

/**
 * Direct Anthropic Messages API client for paired-frame comparison.
 *
 * We call the REST endpoint with `fetch` rather than the SDK — the SDK targets
 * Node/bundlers and adds weight a React Native app doesn't need. Thinking is
 * disabled to keep these many small vision calls fast and cheap; the response
 * is plain JSON we parse defensively.
 *
 * ⚠️ The API key is sent from the device. Fine for local testing; a production
 * app must route this through a backend proxy (see README / Settings screen).
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are a property inspection assistant. You compare "baseline" (move-in) photo frames of a room against "inspection" (move-out) frames of the SAME room and flag likely damage, missing items, or areas a landlord should look at more closely.

Important:
- The two sets of photos were taken by hand at different times, so camera angle, lighting, and framing WILL differ. Do NOT flag differences caused only by angle, lighting, exposure, blur, or minor clutter/staging.
- Only report genuine, defensible changes in the property's condition (new damage, stains, holes, missing fixtures, etc.).
- These are suggestions for a human to review, not verdicts. Be conservative and calibrate your confidence honestly.

Return ONLY a JSON object (no prose, no code fences) of the form:
{"findings":[{"description":"short human-readable description","severity":"minor|moderate|needs_review","confidence":0.0-1.0,"frameIndex":<index of the INSPECTION frame this refers to>,"box":{"x":0.0-1.0,"y":0.0-1.0,"w":0.0-1.0,"h":0.0-1.0}}]}
- "box" is the approximate region of the issue on that inspection frame, normalized 0..1 (x,y = top-left). Use null if you can't localize it.
- If nothing noteworthy changed, return {"findings":[]}.`;

function normalizeSeverity(value: unknown): Severity {
  const s = String(value).toLowerCase().replace(/\s+/g, '_');
  if (s === 'needs_review' || s === 'moderate' || s === 'minor') return s;
  if (s.includes('review')) return 'needs_review';
  if (s.includes('moderate')) return 'moderate';
  return 'minor';
}

function clamp01(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}

/** Pulls the first JSON object out of the model's text (tolerant of stray text). */
function extractFindings(text: string): RawFinding[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const f = raw as Record<string, unknown>;
    const box = f.box as Record<string, unknown> | null | undefined;
    const bx = box ? clamp01(box.x) : null;
    const by = box ? clamp01(box.y) : null;
    const bw = box ? clamp01(box.w) : null;
    const bh = box ? clamp01(box.h) : null;
    return {
      description: String(f.description ?? 'Unspecified finding'),
      severity: normalizeSeverity(f.severity),
      confidence: clamp01(f.confidence) ?? 0.5,
      frameIndex: Number.isFinite(Number(f.frameIndex)) ? Number(f.frameIndex) : null,
      box: bx != null && by != null && bw != null && bh != null ? { x: bx, y: by, w: bw, h: bh } : null,
    } satisfies RawFinding;
  });
}

function imageBlock(frame: FramePayload) {
  return {
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: frame.base64 },
  };
}

export interface CompareArgs {
  apiKey: string;
  model: string;
  roomName: string;
  baselineFrames: FramePayload[];
  inspectionFrames: FramePayload[];
  signal?: AbortSignal;
}

/** One paired-frame comparison call. Throws on HTTP / refusal errors. */
export async function callAnthropicCompare(args: CompareArgs): Promise<RawFinding[]> {
  const content: unknown[] = [
    {
      type: 'text',
      text:
        `Room: "${args.roomName}".\n` +
        `First, the BASELINE (move-in) frames. Then the INSPECTION (move-out) frames, which you index from 0. Compare them and report condition changes as instructed.`,
    },
    { type: 'text', text: 'BASELINE frames (move-in):' },
    ...args.baselineFrames.map(imageBlock),
    { type: 'text', text: 'INSPECTION frames (move-out), indexed from 0 in order:' },
    ...args.inspectionFrames.map(imageBlock),
    { type: 'text', text: 'Now return ONLY the JSON described in the system instructions.' },
  ];

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Allows direct-from-client calls; harmless in React Native.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
    signal: args.signal,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new Error(`Anthropic API ${response.status}: ${detail || response.statusText}`);
  }

  const data = await response.json();
  if (data?.stop_reason === 'refusal') {
    throw new Error('The model declined to analyze these frames.');
  }
  const text: string = (Array.isArray(data?.content) ? data.content : [])
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('\n');

  return extractFindings(text);
}
