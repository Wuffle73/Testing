import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackScreenProps } from '../navigation/types';
import { deleteSession, listSessionSummaries, type SessionSummary } from '../db/sessions';
import { availableDiskSpace, formatBytes, isLowOnSpace, LOW_SPACE_BYTES } from '../storage/videos';
import { colors, spacing, radius, fontSize, shadow } from '../theme/theme';
import { EmptyState } from '../components/EmptyState';

export function StorageScreen({ route }: RootStackScreenProps<'Storage'>) {
  const { propertyId } = route.params;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [free, setFree] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setSessions(await listSessionSummaries(propertyId));
    setFree(availableDiskSpace());
    setLoading(false);
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onDelete = (s: SessionSummary) => {
    const label = s.type === 'baseline' ? 'baseline' : 'inspection';
    Alert.alert(
      `Delete this ${label}?`,
      `This permanently removes its ${s.clipCount} clip${s.clipCount === 1 ? '' : 's'}, extracted frames${
        s.findingCount ? ` and ${s.findingCount} finding${s.findingCount === 1 ? '' : 's'}` : ''
      }, freeing storage. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(s.id);
            await load();
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

  const low = isLowOnSpace();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={[styles.card, low && styles.warnCard]}>
        <Text style={styles.freeLabel}>Free space on this device</Text>
        <Text style={[styles.freeValue, low && { color: colors.danger }]}>{formatBytes(free)}</Text>
        {low ? (
          <Text style={styles.warnText}>
            Low on space (under {formatBytes(LOW_SPACE_BYTES)}). Delete old sessions below before
            recording more.
          </Text>
        ) : (
          <Text style={styles.muted}>
            Walkthrough videos record at 720p to stay compact, but still add up. Delete sessions you
            no longer need to free space.
          </Text>
        )}
      </View>

      {sessions.length === 0 ? (
        <EmptyState icon="🎞" title="No recordings yet" subtitle="Baseline and inspection sessions will appear here once you record them." />
      ) : (
        <View style={styles.card}>
          {sessions.map((s, i) => (
            <View key={s.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {s.type === 'baseline' ? '🎥 Baseline' : '🔍 Inspection'}
                  {s.status === 'in_progress' ? ' · in progress' : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(s.createdAt).toLocaleDateString()} · {s.clipCount} clip
                  {s.clipCount === 1 ? '' : 's'}
                  {s.type === 'inspection' ? ` · ${s.findingCount} finding${s.findingCount === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete session"
                onPress={() => onDelete(s)}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, ...shadow.card },
  warnCard: { backgroundColor: colors.dangerMuted },
  freeLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  freeValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  warnText: { fontSize: fontSize.sm, color: colors.danger, lineHeight: 20, marginTop: spacing.xs },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  deleteBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.dangerMuted,
  },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: fontSize.sm },
});
