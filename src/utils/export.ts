import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { SEVERITY_LABEL, SEVERITY_RANK } from '../types/models';
import type { Finding, Property, Room } from '../types/models';

/**
 * Builds and shares a per-property findings report as plain text or JSON.
 * (A polished PDF report is a later phase — text/JSON is enough for the MVP.)
 */

export type ExportFormat = 'text' | 'json';

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'property';
}

function sortFindings(findings: Finding[], nameById: Record<string, string>): Finding[] {
  return [...findings].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (rank !== 0) return rank;
    return (nameById[a.roomId] ?? '').localeCompare(nameById[b.roomId] ?? '');
  });
}

export function buildTextReport(
  property: Property,
  rooms: Room[],
  findings: Finding[]
): string {
  const nameById: Record<string, string> = {};
  for (const r of rooms) nameById[r.id] = r.name;
  const sorted = sortFindings(findings, nameById);

  const lines: string[] = [];
  lines.push(`Tenant Auditor — Findings report`);
  lines.push(`Property: ${property.name}`);
  if (property.address) lines.push(`Address: ${property.address}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Total findings: ${findings.length}`);
  lines.push('');
  lines.push('NOTE: AI findings are suggestions for human review, not verdicts.');
  lines.push('');

  if (sorted.length === 0) {
    lines.push('No findings flagged.');
  } else {
    for (const f of sorted) {
      const room = nameById[f.roomId] ?? 'Unknown room';
      const conf = `${Math.round(f.confidence * 100)}%`;
      const status = f.status === 'open' ? 'unreviewed' : f.status;
      lines.push(`[${SEVERITY_LABEL[f.severity].toUpperCase()}] ${room} (${conf}, ${status})`);
      lines.push(`  ${f.description}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function buildJsonReport(
  property: Property,
  rooms: Room[],
  findings: Finding[]
): string {
  const nameById: Record<string, string> = {};
  for (const r of rooms) nameById[r.id] = r.name;
  const sorted = sortFindings(findings, nameById);

  return JSON.stringify(
    {
      property: { name: property.name, address: property.address },
      generatedAt: new Date().toISOString(),
      disclaimer: 'AI findings are suggestions for human review, not verdicts.',
      totalFindings: findings.length,
      findings: sorted.map((f) => ({
        room: nameById[f.roomId] ?? null,
        severity: f.severity,
        confidence: f.confidence,
        status: f.status,
        description: f.description,
        inspectionFrameMs: f.inspectionFrameMs,
        box:
          f.locX != null && f.locY != null && f.boxW != null && f.boxH != null
            ? { x: f.locX, y: f.locY, w: f.boxW, h: f.boxH }
            : null,
      })),
    },
    null,
    2
  );
}

/** Writes the report to a file and opens the share sheet. */
export async function exportReport(
  property: Property,
  rooms: Room[],
  findings: Finding[],
  format: ExportFormat
): Promise<void> {
  const content =
    format === 'json'
      ? buildJsonReport(property, rooms, findings)
      : buildTextReport(property, rooms, findings);

  const ext = format === 'json' ? 'json' : 'txt';
  const mimeType = format === 'json' ? 'application/json' : 'text/plain';

  const dir = new Directory(Paths.document, 'exports');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${slug(property.name)}-findings.${ext}`);
  if (file.exists) file.delete();
  file.create();
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export findings' });
  } else {
    throw new Error('Sharing is not available on this device.');
  }
}
