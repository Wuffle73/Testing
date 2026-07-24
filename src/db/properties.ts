import { getDb } from './database';
import { uuid } from '../utils/id';
import type { Property } from '../types/models';

/** Dashboard lifecycle phase for a property, derived from its sessions. */
export type PropertyPhase =
  | 'no_baseline'
  | 'baseline_complete'
  | 'inspection_in_progress'
  | 'inspection_complete';

/** A property enriched with the counts the dashboard chip needs. */
export interface PropertySummary extends Property {
  roomCount: number;
  phase: PropertyPhase;
  /** Non-dismissed findings across all inspection sessions for this property. */
  findingsCount: number;
}

interface PropertyRow {
  id: string;
  name: string;
  address: string;
  floor_map_uri: string | null;
  created_at: number;
  updated_at: number;
}

interface SummaryRow extends PropertyRow {
  room_count: number;
  baseline_complete: number;
  inspection_active: number;
  inspection_complete: number;
  findings_count: number;
}

function rowToProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    floorMapUri: r.floor_map_uri,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function derivePhase(r: SummaryRow): PropertyPhase {
  if (r.inspection_complete > 0) return 'inspection_complete';
  if (r.inspection_active > 0) return 'inspection_in_progress';
  if (r.baseline_complete > 0) return 'baseline_complete';
  return 'no_baseline';
}

export interface PropertyInput {
  name: string;
  address?: string;
  floorMapUri?: string | null;
}

export async function createProperty(input: PropertyInput): Promise<Property> {
  const db = await getDb();
  const now = Date.now();
  const property: Property = {
    id: uuid(),
    name: input.name.trim(),
    address: (input.address ?? '').trim(),
    floorMapUri: input.floorMapUri ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    `INSERT INTO properties (id, name, address, floor_map_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [property.id, property.name, property.address, property.floorMapUri, now, now]
  );
  return property;
}

export async function updateProperty(id: string, input: PropertyInput): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE properties
       SET name = ?, address = ?, floor_map_uri = ?, updated_at = ?
     WHERE id = ?`,
    [input.name.trim(), (input.address ?? '').trim(), input.floorMapUri ?? null, now, id]
  );
}

export async function deleteProperty(id: string): Promise<void> {
  const db = await getDb();
  // Child rows (rooms, sessions, clips, ...) cascade via foreign keys.
  await db.runAsync('DELETE FROM properties WHERE id = ?', [id]);
}

export async function getProperty(id: string): Promise<Property | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<PropertyRow>('SELECT * FROM properties WHERE id = ?', [id]);
  return row ? rowToProperty(row) : null;
}

/** Sets or clears (pass null) the property's floor-map background image. */
export async function setFloorMap(propertyId: string, uri: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE properties SET floor_map_uri = ?, updated_at = ? WHERE id = ?', [
    uri,
    Date.now(),
    propertyId,
  ]);
}

export async function listProperties(): Promise<Property[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PropertyRow>(
    'SELECT * FROM properties ORDER BY updated_at DESC'
  );
  return rows.map(rowToProperty);
}

/** Properties plus the derived room/finding counts and lifecycle phase. */
export async function listPropertySummaries(): Promise<PropertySummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SummaryRow>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM rooms r WHERE r.property_id = p.id) AS room_count,
       (SELECT COUNT(*) FROM sessions s WHERE s.property_id = p.id
          AND s.type = 'baseline' AND s.status = 'complete') AS baseline_complete,
       (SELECT COUNT(*) FROM sessions s WHERE s.property_id = p.id
          AND s.type = 'inspection' AND s.status = 'in_progress') AS inspection_active,
       (SELECT COUNT(*) FROM sessions s WHERE s.property_id = p.id
          AND s.type = 'inspection' AND s.status = 'complete') AS inspection_complete,
       (SELECT COUNT(*) FROM findings f
          JOIN sessions s2 ON f.inspection_session_id = s2.id
          WHERE s2.property_id = p.id AND f.status != 'dismissed') AS findings_count
     FROM properties p
     ORDER BY p.updated_at DESC`
  );
  return rows.map((r) => ({
    ...rowToProperty(r),
    roomCount: r.room_count,
    phase: derivePhase(r),
    findingsCount: r.findings_count,
  }));
}
