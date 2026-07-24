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
import { getCurrentSession, reopenSession } from '../db/sessions';
import { getClipsByRoom } from '../db/clips';
import { listJobsForSession } from '../db/analysisJobs';
import type { Clip, Property, Room, Session } from '../types/models';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';

export function PropertyDetailScreen({ route, navigation }: RootStackScreenProps<'PropertyDetail'>) {
  const { propertyId } = route.params;
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [baseline, setBaseline] = useState<Session | null>(null);
  const [baselineClips, setBaselineClips] = useState<Record<string, Clip>>({});
  const [inspection, setInspection] = useState<Session | null>(null);
  const [inspectionClips, setInspectionClips] = useState<Record<string, Clip>>({});
  const [queuedJobs, setQueuedJobs] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, r, baseSession, inspSession] = await Promise.all([
      getProperty(propertyId),
      listRooms(propertyId),
      getCurrentSession(propertyId, 'baseline'),
      getCurrentSession(propertyId, 'inspection'),
    ]);
    setProperty(p);
    setRooms(r);
    setBaseline(baseSession);
    setBaselineClips(baseSession ? await getClipsByRoom(baseSession.id) : {});
    setInspection(inspSession);
    setInspectionClips(inspSession ? await getClipsByRoom(inspSession.id) : {});
    if (inspSession) {
      const jobs = await listJobsForSession(inspSession.id);
      setQueuedJobs(jobs.filter((j) => j.status === 'queued' || j.status === 'error').length);
    } else {
      setQueuedJobs(0);
    }
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

  const startBaseline = () => navigation.navigate('Record', { propertyId, sessionType: 'baseline' });

  const reRecordBaseline = async () => {
    if (baseline) await reopenSession(baseline.id);
    startBaseline();
  };

  const startInspection = () => navigation.navigate('Record', { propertyId, sessionType: 'inspection' });

  const reRecordInspection = async () => {
    if (inspection) await reopenSession(inspection.id);
    startInspection();
  };

  const playClip = (room: Room, clip: Clip) =>
    navigation.navigate('Playback', { uri: clip.videoUri, title: `${room.name} · baseline` });

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

  const recordedCount = rooms.filter((r) => baselineClips[r.id]).length;
  const baselineComplete = baseline?.status === 'complete';
  const hasRooms = rooms.length > 0;
  const inspectionRecordedCount = rooms.filter((r) => inspectionClips[r.id]).length;
  const inspectionComplete = inspection?.status === 'complete';

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
      {!hasRooms ? (
        <View style={styles.card}>
          <Text style={styles.muted}>
            No rooms yet. Add the rooms or areas you want to walk through — they define the
            recording order for both walkthroughs.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {rooms.map((room, i) => {
            const clip = baselineClips[room.id];
            return (
              <View key={room.id} style={[styles.roomRow, i > 0 && styles.roomRowDivider]}>
                <Text style={styles.roomIndex}>{i + 1}</Text>
                <Text style={styles.roomName}>{room.name}</Text>
                {room.pinX != null && room.pinY != null ? (
                  <Text style={styles.roomPinned}>📍</Text>
                ) : null}
                {clip ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play baseline clip for ${room.name}`}
                    onPress={() => playClip(room, clip)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.playBtnText}>▶</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <View style={styles.rowButtons}>
        <Button
          label={hasRooms ? 'Manage rooms' : 'Add rooms'}
          icon="🚪"
          variant="secondary"
          onPress={() => navigation.navigate('Rooms', { propertyId })}
          style={styles.rowButton}
        />
        <Button
          label="Floor map"
          icon="🗺"
          variant="secondary"
          onPress={() => navigation.navigate('FloorMap', { propertyId })}
          style={styles.rowButton}
        />
      </View>

      <Text style={styles.sectionTitle}>Walkthroughs</Text>

      {/* Baseline (move-in) */}
      <View style={styles.card}>
        <View style={styles.walkHeader}>
          <Text style={styles.roadmapTitle}>🎥 Baseline (move-in)</Text>
          {baselineComplete ? <Text style={styles.completeTag}>Complete ✓</Text> : null}
        </View>
        {!hasRooms ? (
          <Text style={styles.muted}>Add rooms first, then record your move-in walkthrough.</Text>
        ) : (
          <>
            <Text style={styles.muted}>
              {recordedCount} of {rooms.length} rooms recorded.
            </Text>
            {baselineComplete ? (
              <Button
                label="Re-record baseline"
                variant="secondary"
                onPress={reRecordBaseline}
                style={styles.walkBtn}
              />
            ) : (
              <Button
                label={baseline ? 'Continue baseline' : 'Start baseline'}
                icon="🎥"
                onPress={startBaseline}
                style={styles.walkBtn}
              />
            )}
          </>
        )}
      </View>

      {/* Inspection (move-out) */}
      <View style={[styles.card, !baselineComplete && styles.disabledCard]}>
        <View style={styles.walkHeader}>
          <Text style={styles.roadmapTitle}>🔍 Inspection (move-out)</Text>
          {inspectionComplete ? <Text style={styles.completeTag}>Complete ✓</Text> : null}
        </View>
        {!baselineComplete ? (
          <Text style={styles.muted}>
            Complete the baseline first. The inspection records the same rooms and AI-compares
            each against its move-in clip.
          </Text>
        ) : (
          <>
            <Text style={styles.muted}>
              {inspectionRecordedCount} of {rooms.length} rooms recorded
              {queuedJobs > 0 ? ` · ${queuedJobs} queued for AI analysis` : ''}.
            </Text>
            {queuedJobs > 0 ? (
              <Text style={styles.note}>
                Queued comparisons run in the AI analysis step (step 6) — recording never waits on
                them.
              </Text>
            ) : null}
            {inspectionComplete ? (
              <Button
                label="Re-record inspection"
                variant="secondary"
                onPress={reRecordInspection}
                style={styles.walkBtn}
              />
            ) : (
              <Button
                label={inspection ? 'Continue inspection' : 'Start inspection'}
                icon="🔍"
                onPress={startInspection}
                style={styles.walkBtn}
              />
            )}
          </>
        )}
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
  roomName: { flex: 1, fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  roomPinned: { fontSize: fontSize.sm },
  playBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' },
  rowButtons: { flexDirection: 'row', gap: spacing.md },
  rowButton: { flex: 1 },
  walkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completeTag: { color: colors.success, fontWeight: '800', fontSize: fontSize.xs },
  walkBtn: { marginTop: spacing.sm },
  roadmapTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  actions: { marginTop: spacing.xl },
  headerEdit: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  note: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18, fontStyle: 'italic' },
});
