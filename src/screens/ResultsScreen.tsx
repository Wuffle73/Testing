import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import type { RootStackScreenProps } from '../navigation/types';
import { getProperty } from '../db/properties';
import { listRooms } from '../db/rooms';
import { getCurrentSession } from '../db/sessions';
import { listFindingsForSession } from '../db/findings';
import { SEVERITY_LABEL, SEVERITY_RANK } from '../types/models';
import type { Finding, Property, Room, Session, Severity } from '../types/models';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { GridBackground } from '../components/GridBackground';
import { exportReport, type ExportFormat } from '../utils/export';

const SEVERITY_COLOR: Record<Severity, string> = {
  minor: colors.severityMinor,
  moderate: colors.severityModerate,
  needs_review: colors.severityNeedsReview,
};

const PIN = 40;

export function ResultsScreen({ route, navigation }: RootStackScreenProps<'Results'>) {
  const { propertyId } = route.params;
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const [p, r, s] = await Promise.all([
      getProperty(propertyId),
      listRooms(propertyId),
      getCurrentSession(propertyId, 'inspection'),
    ]);
    setProperty(p);
    setRooms(r);
    setSession(s);
    setFindings(s ? await listFindingsForSession(s.id) : []);
    setLoading(false);
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onExport = async (format: ExportFormat) => {
    if (!property) return;
    setExporting(true);
    try {
      await exportReport(property, rooms, findings, format);
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <EmptyState
        icon="🗺"
        title="No inspection results yet"
        subtitle="Record a move-out inspection and run the AI analysis to see results here."
        action={<Button label="Go back" variant="secondary" onPress={() => navigation.goBack()} />}
      />
    );
  }

  // Derive per-room worst finding (non-dismissed) for pin color + jump target.
  const activeFindings = findings.filter((f) => f.status !== 'dismissed');
  const worstByRoom: Record<string, Finding> = {};
  for (const f of activeFindings) {
    const cur = worstByRoom[f.roomId];
    if (!cur || SEVERITY_RANK[f.severity] > SEVERITY_RANK[cur.severity]) worstByRoom[f.roomId] = f;
  }
  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );
  const nameById: Record<string, string> = {};
  for (const r of rooms) nameById[r.id] = r.name;
  const placed = rooms.filter((r) => r.pinX != null && r.pinY != null);
  const unplacedWithFindings = rooms.filter(
    (r) => (r.pinX == null || r.pinY == null) && worstByRoom[r.id]
  );

  const openRoom = (roomId: string) =>
    navigation.navigate('Comparison', {
      inspectionSessionId: session.id,
      roomId,
      findingId: worstByRoom[roomId]?.id,
    });

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Legend */}
        <View style={styles.legend}>
          <LegendDot color={colors.severityClean} label="Clean" />
          <LegendDot color={colors.severityMinor} label="Minor" />
          <LegendDot color={colors.severityModerate} label="Moderate" />
          <LegendDot color={colors.severityNeedsReview} label="Needs review" />
        </View>

        {/* Map */}
        <View
          style={styles.canvas}
          onLayout={(e: LayoutChangeEvent) =>
            setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          {property?.floorMapUri ? (
            <Image source={{ uri: property.floorMapUri }} style={styles.canvasImage} resizeMode="cover" />
          ) : (
            <GridBackground width={box.w} height={box.h} />
          )}
          {box.w > 0 &&
            placed.map((room) => {
              const worst = worstByRoom[room.id];
              const color = worst ? SEVERITY_COLOR[worst.severity] : colors.severityClean;
              const left = (room.pinX as number) * box.w - PIN / 2;
              const top = (room.pinY as number) * box.h - PIN / 2;
              return (
                <Pressable
                  key={room.id}
                  onPress={() => openRoom(room.id)}
                  style={[styles.pin, { left, top }]}
                >
                  <View style={[styles.pinDot, { backgroundColor: color }]} />
                  <Text style={styles.pinLabel} numberOfLines={1}>
                    {room.name}
                  </Text>
                </Pressable>
              );
            })}
          {rooms.length === 0 ? (
            <View style={styles.canvasEmpty} pointerEvents="none">
              <Text style={styles.muted}>No rooms defined.</Text>
            </View>
          ) : null}
        </View>
        {unplacedWithFindings.length > 0 ? (
          <Text style={styles.hint}>
            {unplacedWithFindings.length} room(s) with findings aren't placed on the map — see the
            list below, or place pins on the floor map.
          </Text>
        ) : null}

        {/* Findings summary */}
        <Text style={styles.sectionTitle}>
          Findings ({activeFindings.length}
          {findings.length !== activeFindings.length ? ` · ${findings.length - activeFindings.length} dismissed` : ''})
        </Text>
        {sortedFindings.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.clean}>✓ No issues flagged in this inspection.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {sortedFindings.map((f, i) => (
              <Pressable
                key={f.id}
                onPress={() =>
                  navigation.navigate('Comparison', {
                    inspectionSessionId: session.id,
                    roomId: f.roomId,
                    findingId: f.id,
                  })
                }
                style={[styles.findingRow, i > 0 && styles.rowDivider]}
              >
                <View style={[styles.sevDot, { backgroundColor: SEVERITY_COLOR[f.severity] }]} />
                <View style={styles.findingText}>
                  <Text style={styles.findingRoom}>
                    {nameById[f.roomId] ?? 'Room'} · {SEVERITY_LABEL[f.severity]}
                    {f.status === 'dismissed' ? ' · dismissed' : f.status === 'confirmed' ? ' · confirmed' : ''}
                  </Text>
                  <Text
                    style={[styles.findingDesc, f.status === 'dismissed' && styles.struck]}
                    numberOfLines={2}
                  >
                    {f.description}
                  </Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Export .txt"
          icon="📄"
          variant="secondary"
          onPress={() => onExport('text')}
          disabled={exporting}
          style={styles.footerBtn}
        />
        <Button
          label="Export .json"
          icon="{ }"
          variant="secondary"
          onPress={() => onExport('json')}
          disabled={exporting}
          style={styles.footerBtn}
        />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 96 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  canvas: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    ...shadow.card,
  },
  canvasImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  canvasEmpty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', width: PIN, alignItems: 'center' },
  pinDot: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    borderWidth: 3,
    borderColor: colors.textInverse,
    ...shadow.card,
  },
  pinLabel: {
    marginTop: 2,
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 4,
    borderRadius: 4,
    maxWidth: 90,
    textAlign: 'center',
  },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.card },
  clean: { fontSize: fontSize.md, color: colors.success, fontWeight: '600', padding: spacing.lg },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sevDot: { width: 14, height: 14, borderRadius: 7 },
  findingText: { flex: 1, gap: 2 },
  findingRoom: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '700' },
  findingDesc: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  chev: { fontSize: fontSize.xl, color: colors.textMuted },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerBtn: { flex: 1, ...shadow.card },
});
