import { getDb } from './database';
import { uuid } from '../utils/id';
import type { Room } from '../types/models';

/**
 * Room persistence.
 *
 * Rooms carry a `sortOrder` that defines both the list order and the order the
 * guided walkthrough (steps 3 & 5) steps through them — recording order is how
 * baseline and inspection clips are matched, so it matters. Each room also
 * optionally stores a normalized (0..1) pin position on the property floor map.
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

/** Appends a room to the end of the property's ordered list. */
export async function createRoom(propertyId: string, name: string): Promise<Room> {
  const db = await getDb();
  const maxRow = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) AS max_order FROM rooms WHERE property_id = ?',
    [propertyId]
  );
  const sortOrder = (maxRow?.max_order ?? -1) + 1;
  const room: Room = {
    id: uuid(),
    propertyId,
    name: name.trim(),
    sortOrder,
    pinX: null,
    pinY: null,
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO rooms (id, property_id, name, sort_order, pin_x, pin_y, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?)`,
    [room.id, propertyId, room.name, sortOrder, room.createdAt]
  );
  return room;
}

export async function renameRoom(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE rooms SET name = ? WHERE id = ?', [name.trim(), id]);
}

export async function deleteRoom(id: string): Promise<void> {
  const db = await getDb();
  // Clips/keyframes/findings referencing this room cascade via foreign keys.
  await db.runAsync('DELETE FROM rooms WHERE id = ?', [id]);
}

/** Persists a full reordering by rewriting every room's sort_order in one tx. */
export async function reorderRooms(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE rooms SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
    }
  });
}

/** Sets or clears (pass null) a room's normalized floor-map pin position. */
export async function setRoomPin(
  id: string,
  pinX: number | null,
  pinY: number | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE rooms SET pin_x = ?, pin_y = ? WHERE id = ?', [pinX, pinY, id]);
}
