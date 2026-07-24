import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackScreenProps } from '../navigation/types';
import { listPropertySummaries, type PropertySummary } from '../db/properties';
import { availableDiskSpace, formatBytes, isLowOnSpace } from '../storage/videos';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { PhaseChip } from '../components/StatusChip';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';

export function DashboardScreen({ navigation }: RootStackScreenProps<'Dashboard'>) {
  const [summaries, setSummaries] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await listPropertySummaries();
      setSummaries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload every time the dashboard regains focus (e.g. after add/edit/delete).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="AI settings"
            hitSlop={12}
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.headerGear, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.headerGearText}>⚙︎</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add property"
            hitSlop={12}
            onPress={() => navigation.navigate('PropertyForm')}
            style={({ pressed }) => [styles.headerAdd, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.headerAddText}>＋ Add</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon="🏠"
        title="No properties yet"
        subtitle="Add a property to start recording move-in and move-out walkthroughs."
        action={
          <Button
            label="Add your first property"
            icon="＋"
            onPress={() => navigation.navigate('PropertyForm')}
          />
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={summaries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          isLowOnSpace() ? (
            <View style={styles.lowSpace}>
              <Text style={styles.lowSpaceText}>
                ⚠️ Low storage — {formatBytes(availableDiskSpace())} free. Delete old sessions from a
                property's Storage screen before recording.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <PropertyCard
            summary={item}
            onPress={() => navigation.navigate('PropertyDetail', { propertyId: item.id })}
          />
        )}
      />
      <View style={styles.fabWrap} pointerEvents="box-none">
        <Button
          label="Add property"
          icon="＋"
          onPress={() => navigation.navigate('PropertyForm')}
          style={styles.fab}
        />
      </View>
    </View>
  );
}

function PropertyCard({
  summary,
  onPress,
}: {
  summary: PropertySummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <Text style={styles.cardTitle} numberOfLines={1}>
        {summary.name}
      </Text>
      {summary.address ? (
        <Text style={styles.cardAddress} numberOfLines={1}>
          {summary.address}
        </Text>
      ) : null}
      <View style={styles.cardMetaRow}>
        <PhaseChip phase={summary.phase} findingsCount={summary.findingsCount} />
        <Text style={styles.roomCount}>
          {summary.roomCount} room{summary.roomCount === 1 ? '' : 's'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.lg, paddingBottom: 96, gap: spacing.md },
  lowSpace: { backgroundColor: colors.dangerMuted, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  lowSpaceText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600', lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  cardAddress: { fontSize: fontSize.sm, color: colors.textMuted },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  roomCount: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerGear: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  headerGearText: { color: colors.primary, fontSize: 20 },
  headerAdd: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerAddText: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
  fabWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
  },
  fab: { ...shadow.card },
});
