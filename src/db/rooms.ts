import { getDb } from './database';
import type { Room } from '../types/models';

/**
 * Room persistence. Step 1 only reads rooms (to show a count on the property
 * detail screen); create/reorder/pin editing arrives in step 2. The write
 * helpers are included now so the schema contract is exercised end-to-end.
 */

interface RoomRow {
  id: string;
  property_id: string;
  name: string;
  sort_order: number;
  pin_x: number | null;
  pin_y: number | null;
  created_at: number;
}

function rowToRoom(r: RoomRow): Room {
  return {
    id: r.id,
    propertyId: r.property_id,
    name: r.name,
    sortOrder: r.sort_order,
    pinX: r.pin_x,
    pinY: r.pin_y,
    createdAt: r.created_at,
  };
}

export async function listRooms(propertyId: string): Promise<Room[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RoomRow>(
    'SELECT * FROM rooms WHERE property_id = ? ORDER BY sort_order ASC, created_at ASC',
    [propertyId]
  );
  return rows.map(rowToRoom);
}

export async function countRooms(propertyId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM rooms WHERE property_id = ?',
    [propertyId]
  );
  return row?.n ?? 0;
}
