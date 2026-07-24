import React, { useCallback, useLayoutEffect, useState } from 'react';
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
import { deleteProperty, getProperty } from '../db/properties';
import { listRooms } from '../db/rooms';
import type { Property, Room } from '../types/models';
import { colors, spacing, radius, fontSize, shadow } from '../theme/theme';
import { Button } from '../components/Button';

export function PropertyDetailScreen({ route, navigation }: RootStackScreenProps<'PropertyDetail'>) {
  const { propertyId } = route.params;
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: property?.name ?? 'Property',
      headerRight: () =>
        property ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit property"
            hitSlop={12}
            onPress={() => navigation.navigate('PropertyForm', { propertyId })}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Text style={styles.headerEdit}>Edit</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, property, propertyId]);

  const onDelete = () => {
    Alert.alert(
      'Delete property?',
      'This permanently removes the property and all its rooms, recordings and findings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProperty(propertyId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This property no longer exists.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{property.name}</Text>
        {property.address ? <Text style={styles.address}>{property.address}</Text> : null}
        <Text style={styles.meta}>
          {rooms.length} room{rooms.length === 1 ? '' : 's'} defined
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Rooms</Text>
      {rooms.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            No rooms yet. Room management and the floor-map pins arrive in the next build step.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {rooms.map((room, i) => (
            <View
              key={room.id}
              style={[styles.roomRow, i > 0 && styles.roomRowDivider]}
            >
              <Text style={styles.roomIndex}>{i + 1}</Text>
              <Text style={styles.roomName}>{room.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Roadmap placeholders — these flows are wired up in later build steps. */}
      <Text style={styles.sectionTitle}>Walkthroughs</Text>
      <View style={[styles.card, styles.disabledCard]}>
        <Text style={styles.roadmapTitle}>🎥 Baseline (move-in)</Text>
        <Text style={styles.muted}>Guided per-room recording — coming in step 3.</Text>
      </View>
      <View style={[styles.card, styles.disabledCard]}>
        <Text style={styles.roadmapTitle}>🔍 Inspection (move-out)</Text>
        <Text style={styles.muted}>Records and AI-compares against the baseline — steps 5–7.</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Delete property" variant="danger" icon="🗑" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  disabledCard: { opacity: 0.65 },
  name: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  address: { fontSize: fontSize.sm, color: colors.textMuted },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  roomRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  roomIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    color: colors.primaryDark,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: fontSize.xs,
    fontWeight: '800',
    overflow: 'hidden',
  },
  roomName: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  roadmapTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  actions: { marginTop: spacing.xl },
  headerEdit: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
});
