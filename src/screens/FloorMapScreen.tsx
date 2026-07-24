import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import type { RootStackScreenProps } from '../navigation/types';
import { listRooms, setRoomPin } from '../db/rooms';
import { getProperty, setFloorMap } from '../db/properties';
import type { Property, Room } from '../types/models';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';
import { GridBackground } from '../components/GridBackground';

const PIN_SIZE = 44;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Box {
  w: number;
  h: number;
}

export function FloorMapScreen({ route }: RootStackScreenProps<'FloorMap'>) {
  const { propertyId } = route.params;
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([getProperty(propertyId), listRooms(propertyId)]);
    setProperty(p);
    setRooms(r);
    setLoading(false);
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const persistPin = async (roomId: string, nx: number | null, ny: number | null) => {
    await setRoomPin(roomId, nx, ny);
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, pinX: nx, pinY: ny } : r))
    );
  };

  const placeAtCenter = (room: Room) => persistPin(room.id, 0.5, 0.5);
  const removePin = (room: Room) => persistPin(room.id, null, null);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo library access to use a floor-plan image, or use the blank grid instead.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      await setFloorMap(propertyId, uri);
      setProperty((p) => (p ? { ...p, floorMapUri: uri } : p));
    }
  };

  const clearPhoto = async () => {
    await setFloorMap(propertyId, null);
    setProperty((p) => (p ? { ...p, floorMapUri: null } : p));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const placed = rooms.filter((r) => r.pinX != null && r.pinY != null);
  const unplaced = rooms.filter((r) => r.pinX == null || r.pinY == null);
  const indexOf = (room: Room) => rooms.findIndex((r) => r.id === room.id) + 1;

  return (
    <View style={styles.flex}>
      <View style={styles.toolbar}>
        {property?.floorMapUri ? (
          <Button label="Replace photo" variant="secondary" onPress={pickPhoto} style={styles.toolBtn} />
        ) : (
          <Button label="Add floor-plan photo" icon="🖼" variant="secondary" onPress={pickPhoto} style={styles.toolBtn} />
        )}
        {property?.floorMapUri ? (
          <Button label="Use blank grid" variant="secondary" onPress={clearPhoto} style={styles.toolBtn} />
        ) : null}
      </View>

      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {property?.floorMapUri ? (
          <Image source={{ uri: property.floorMapUri }} style={styles.canvasImage} resizeMode="cover" />
        ) : (
          <GridBackground width={box.w} height={box.h} />
        )}

        {box.w > 0 &&
          placed.map((room) => (
            <DraggablePin
              key={room.id}
              index={indexOf(room)}
              room={room}
              box={box}
              onDragEnd={(nx, ny) => persistPin(room.id, nx, ny)}
            />
          ))}

        {rooms.length === 0 ? (
          <View style={styles.canvasEmpty} pointerEvents="none">
            <Text style={styles.canvasEmptyText}>Add rooms first, then drop their pins here.</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.bottom}
        contentContainerStyle={styles.bottomContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.help}>
          Tap an unplaced room to drop its pin, then drag it into position. Tap a placed
          room to remove its pin. This map is just a visual index into rooms.
        </Text>

        {unplaced.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Tap to place</Text>
            <View style={styles.chipRow}>
              {unplaced.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => placeAtCenter(room)}
                  style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipIndex}>{indexOf(room)}</Text>
                  <Text style={styles.chipText}>{room.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {placed.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>On the map</Text>
            <View style={styles.chipRow}>
              {placed.map((room) => (
                <Pressable
                  key={room.id}
                  onPress={() => removePin(room)}
                  style={({ pressed }) => [styles.chipPlaced, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.chipIndexPlaced}>{indexOf(room)}</Text>
                  <Text style={styles.chipTextPlaced}>{room.name}</Text>
                  <Text style={styles.chipRemove}>✕</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * A single draggable room pin. Position is kept in local px state during the
 * drag (smooth for a handful of pins) and persisted as normalized 0..1 coords
 * on release so it survives re-layout and background swaps. Refs hold the
 * latest box/position so the PanResponder — created once — always reads current
 * values.
 */
function DraggablePin({
  index,
  room,
  box,
  onDragEnd,
}: {
  index: number;
  room: Room;
  box: Box;
  onDragEnd: (nx: number, ny: number) => void;
}) {
  const initial = { x: (room.pinX ?? 0.5) * box.w, y: (room.pinY ?? 0.5) * box.h };
  const [pos, setPos] = useState(initial);

  const posRef = useRef(initial);
  const startRef = useRef(initial);
  const boxRef = useRef(box);
  const draggingRef = useRef(false);
  boxRef.current = box;

  const update = (next: { x: number; y: number }) => {
    posRef.current = next;
    setPos(next);
  };

  // Re-sync from persisted coords when the layout or the pin changes and we're
  // not mid-drag (e.g. a background photo is added/removed and resizes canvas).
  useEffect(() => {
    if (draggingRef.current) return;
    const synced = { x: (room.pinX ?? 0.5) * box.w, y: (room.pinY ?? 0.5) * box.h };
    posRef.current = synced;
    setPos(synced);
  }, [box.w, box.h, room.pinX, room.pinY]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = true;
        startRef.current = posRef.current;
      },
      onPanResponderMove: (_evt, g) => {
        const b = boxRef.current;
        update({
          x: clamp(startRef.current.x + g.dx, 0, b.w),
          y: clamp(startRef.current.y + g.dy, 0, b.h),
        });
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        const b = boxRef.current;
        const nx = b.w > 0 ? posRef.current.x / b.w : 0.5;
        const ny = b.h > 0 ? posRef.current.y / b.h : 0.5;
        onDragEnd(clamp(nx, 0, 1), clamp(ny, 0, 1));
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
      },
    })
  ).current;

  return (
    <View
      {...pan.panHandlers}
      style={[styles.pin, { left: pos.x - PIN_SIZE / 2, top: pos.y - PIN_SIZE / 2 }]}
    >
      <View style={styles.pinDot}>
        <Text style={styles.pinIndex}>{index}</Text>
      </View>
      <Text style={styles.pinLabel} numberOfLines={1}>
        {room.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  toolBtn: { flex: 1 },
  canvas: {
    marginHorizontal: spacing.lg,
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    ...shadow.card,
  },
  canvasImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  canvasEmpty: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  canvasEmptyText: { color: colors.textMuted, textAlign: 'center', fontSize: fontSize.sm },
  pin: { position: 'absolute', width: PIN_SIZE, alignItems: 'center' },
  pinDot: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.textInverse,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  pinIndex: { color: colors.textInverse, fontWeight: '800', fontSize: fontSize.md },
  pinLabel: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 4,
    borderRadius: 4,
    maxWidth: 96,
    textAlign: 'center',
  },
  bottom: { flex: 1, marginTop: spacing.md },
  bottomContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  help: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  chipIndex: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: fontSize.sm,
  },
  chipText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },
  chipPlaced: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  chipIndexPlaced: { color: colors.textInverse, fontWeight: '800', fontSize: fontSize.sm },
  chipTextPlaced: { color: colors.textInverse, fontWeight: '700', fontSize: fontSize.sm },
  chipRemove: { color: colors.textInverse, fontWeight: '800', fontSize: fontSize.md, marginLeft: 2 },
});
