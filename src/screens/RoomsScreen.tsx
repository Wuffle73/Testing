import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackScreenProps } from '../navigation/types';
import {
  createRoom,
  deleteRoom,
  listRooms,
  renameRoom,
  reorderRooms,
} from '../db/rooms';
import type { Room } from '../types/models';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { TextPromptModal } from '../components/TextPromptModal';

type PromptState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'rename'; room: Room };

export function RoomsScreen({ route, navigation }: RootStackScreenProps<'Rooms'>) {
  const { propertyId } = route.params;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<PromptState>({ mode: 'closed' });

  const load = useCallback(async () => {
    const data = await listRooms(propertyId);
    setRooms(data);
    setLoading(false);
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onAdd = async (name: string) => {
    setPrompt({ mode: 'closed' });
    await createRoom(propertyId, name);
    await load();
  };

  const onRename = async (room: Room, name: string) => {
    setPrompt({ mode: 'closed' });
    await renameRoom(room.id, name);
    await load();
  };

  const onDelete = (room: Room) => {
    Alert.alert(
      'Delete room?',
      `"${room.name}" and any recordings/findings for it will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoom(room.id);
            await load();
          },
        },
      ]
    );
  };

  // Optimistic reorder: swap locally, persist the new order.
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rooms.length) return;
    const next = [...rooms];
    [next[index], next[target]] = [next[target], next[index]];
    setRooms(next);
    await reorderRooms(next.map((r) => r.id));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>
          Rooms are recorded in this order during both the move-in and move-out
          walkthroughs. Keep the order consistent so clips line up.
        </Text>

        {rooms.length === 0 ? (
          <EmptyState
            icon="🚪"
            title="No rooms yet"
            subtitle="Add each room or area you want to walk through — e.g. Kitchen, Living Room, Bathroom 1."
          />
        ) : (
          <View style={styles.list}>
            {rooms.map((room, i) => (
              <View key={room.id} style={styles.row}>
                <Text style={styles.index}>{i + 1}</Text>
                <Pressable
                  style={styles.nameWrap}
                  onPress={() => setPrompt({ mode: 'rename', room })}
                >
                  <Text style={styles.name} numberOfLines={1}>
                    {room.name}
                  </Text>
                  {room.pinX != null && room.pinY != null ? (
                    <Text style={styles.pinned}>📍 on map</Text>
                  ) : null}
                </Pressable>
                <View style={styles.controls}>
                  <IconButton
                    label="↑"
                    disabled={i === 0}
                    onPress={() => move(i, -1)}
                    accessibilityLabel={`Move ${room.name} up`}
                  />
                  <IconButton
                    label="↓"
                    disabled={i === rooms.length - 1}
                    onPress={() => move(i, 1)}
                    accessibilityLabel={`Move ${room.name} down`}
                  />
                  <IconButton
                    label="🗑"
                    onPress={() => onDelete(room)}
                    accessibilityLabel={`Delete ${room.name}`}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Button label="Add room" icon="＋" onPress={() => setPrompt({ mode: 'add' })} />
          <Button
            label="Open floor map"
            icon="🗺"
            variant="secondary"
            onPress={() => navigation.navigate('FloorMap', { propertyId })}
          />
        </View>
        {rooms.length > 0 ? (
          <Text style={styles.tip}>Tap a room name to rename it.</Text>
        ) : null}
      </ScrollView>

      <TextPromptModal
        visible={prompt.mode === 'add'}
        title="Add room"
        placeholder="e.g. Kitchen"
        confirmLabel="Add"
        onConfirm={onAdd}
        onCancel={() => setPrompt({ mode: 'closed' })}
      />
      <TextPromptModal
        visible={prompt.mode === 'rename'}
        title="Rename room"
        initialValue={prompt.mode === 'rename' ? prompt.room.name : ''}
        onConfirm={(name) => prompt.mode === 'rename' && onRename(prompt.room, name)}
        onCancel={() => setPrompt({ mode: 'closed' })}
      />
    </View>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed && !disabled && { opacity: 0.6 },
        disabled && { opacity: 0.25 },
      ]}
    >
      <Text style={styles.iconText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.card },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  index: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryMuted,
    color: colors.primaryDark,
    textAlign: 'center',
    lineHeight: 28,
    fontSize: fontSize.sm,
    fontWeight: '800',
    overflow: 'hidden',
  },
  nameWrap: { flex: 1, justifyContent: 'center', minHeight: TOUCH_TARGET },
  name: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  pinned: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: fontSize.lg, color: colors.text },
  actions: { gap: spacing.md, marginTop: spacing.md },
  tip: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
});
