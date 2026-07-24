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
import { getCurrentSession } from '../db/sessions';
import { listRooms } from '../db/rooms';
import { listJobsForSession } from '../db/analysisJobs';
import { listFindingsForSession, setFindingStatus } from '../db/findings';
import { getAiConfig, type AiConfig } from '../ai/config';
import { processQueuedJobs, type JobProgressStatus } from '../ai/analysis';
import type { AnalysisJob, Finding, Room, Session, Severity } from '../types/models';
import { SEVERITY_LABEL } from '../types/models';
import { colors, spacing, radius, fontSize, shadow, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';

const SEVERITY_COLOR: Record<Severity, string> = {
  minor: colors.severityMinor,
  moderate: colors.severityModerate,
  needs_review: colors.severityNeedsReview,
};

export function AnalysisScreen({ route, navigation }: RootStackScreenProps<'Analysis'>) {
  const { propertyId } = route.params;
  const [session, setSession] = useState<Session | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [jobsByRoom, setJobsByRoom] = useState<Record<string, AnalysisJob>>({});
  const [findingsByRoom, setFindingsByRoom] = useState<Record<string, Finding[]>>({});
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [liveStatus, setLiveStatus] = useState<Record<string, JobProgressStatus>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [s, r, cfg] = await Promise.all([
      getCurrentSession(propertyId, 'inspection'),
      listRooms(propertyId),
      getAiConfig(),
    ]);
    setSession(s);
    setRooms(r);
    setConfig(cfg);
    if (s) {
      const [jobs, findings] = await Promise.all([
        listJobsForSession(s.id),
        listFindingsForSession(s.id),
      ]);
      const jobMap: Record<string, AnalysisJob> = {};
      for (const j of jobs) jobMap[j.roomId] = j;
      const findMap: Record<string, Finding[]> = {};
      for (const f of findings) (findMap[f.roomId] ??= []).push(f);
      setJobsByRoom(jobMap);
      setFindingsByRoom(findMap);
    } else {
      setJobsByRoom({});
      setFindingsByRoom({});
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
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AI settings"
          hitSlop={12}
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.headerGear}>⚙︎</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const queuedCount = Object.values(jobsByRoom).filter(
    (j) => j.status === 'queued' || j.status === 'error'
  ).length;

  const runAnalysis = async () => {
    if (!session || !config) return;
    if (!config.mock && !config.apiKey) {
      Alert.alert(
        'No API key',
        'Turn on mock mode, or add an Anthropic API key in settings, to run analysis.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: () => navigation.navigate('Settings') },
        ]
      );
      return;
    }
    setRunning(true);
    setLiveStatus({});
    try {
      await processQueuedJobs(session.id, config, (p) => {
        setLiveStatus((prev) => ({ ...prev, [p.roomId]: p.status }));
      });
    } finally {
      setRunning(false);
      await load();
    }
  };

  const decide = async (finding: Finding, status: 'confirmed' | 'dismissed') => {
    await setFindingStatus(finding.id, status);
    setFindingsByRoom((prev) => {
      const next = { ...prev };
      next[finding.roomId] = (next[finding.roomId] ?? []).map((f) =>
        f.id === finding.id ? { ...f, status } : f
      );
      return next;
    });
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
        icon="🔍"
        title="No inspection yet"
        subtitle="Record a move-out inspection first — each room is queued for AI comparison against its baseline."
        action={<Button label="Go back" variant="secondary" onPress={() => navigation.goBack()} />}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Mode banner */}
        <View style={styles.modeRow}>
          <View style={[styles.modeChip, config?.mock ? styles.modeMock : styles.modeLive]}>
            <Text style={[styles.modeText, { color: config?.mock ? colors.textMuted : colors.success }]}>
              {config?.mock ? 'Mock mode · sample findings' : `Live · ${config?.model}`}
            </Text>
          </View>
        </View>
        {!config?.mock && !config?.apiKey ? (
          <Text style={styles.warn}>No API key set — add one in settings or switch to mock mode.</Text>
        ) : null}

        {rooms.map((room, i) => {
          const job = jobsByRoom[room.id];
          const live = liveStatus[room.id];
          const findings = findingsByRoom[room.id] ?? [];
          const status: JobProgressStatus | 'none' =
            live ?? (job ? (job.status === 'done' ? 'done' : job.status === 'error' ? 'error' : 'running') : 'none');
          return (
            <View key={room.id} style={styles.card}>
              <View style={styles.roomHeader}>
                <Text style={styles.roomIndex}>{i + 1}</Text>
                <Text style={styles.roomName} numberOfLines={1}>
                  {room.name}
                </Text>
                <StatusBadge status={live ?? (job?.status ?? 'none')} running={running} />
              </View>

              {job?.status === 'error' && !live ? (
                <Text style={styles.errorText}>{job.error ?? 'Analysis failed.'}</Text>
              ) : null}

              {findings.length === 0 ? (
                status === 'done' ? (
                  <Text style={styles.clean}>✓ No issues flagged</Text>
                ) : job ? (
                  <Text style={styles.muted}>Queued for analysis.</Text>
                ) : (
                  <Text style={styles.muted}>Not recorded in this inspection.</Text>
                )
              ) : (
                findings.map((f) => (
                  <FindingCard key={f.id} finding={f} onDecide={decide} />
                ))
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={
            running
              ? 'Analyzing…'
              : queuedCount > 0
                ? `Run analysis (${queuedCount})`
                : 'Re-run analysis'
          }
          icon="🤖"
          onPress={runAnalysis}
          loading={running}
          disabled={running || rooms.length === 0}
        />
      </View>
    </View>
  );
}

function StatusBadge({
  status,
  running,
}: {
  status: JobProgressStatus | 'queued' | 'none';
  running: boolean;
}) {
  if (status === 'running') {
    return (
      <View style={[styles.badge, styles.badgeRunning]}>
        {running ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <Text style={[styles.badgeText, { color: colors.primaryDark }]}>Analyzing</Text>
      </View>
    );
  }
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    done: { label: 'Done', bg: colors.successMuted, fg: colors.success },
    error: { label: 'Failed', bg: colors.dangerMuted, fg: colors.danger },
    queued: { label: 'Queued', bg: colors.border, fg: colors.textMuted },
    none: { label: 'No clip', bg: colors.border, fg: colors.textMuted },
  };
  const s = map[status] ?? map.none;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function FindingCard({
  finding,
  onDecide,
}: {
  finding: Finding;
  onDecide: (f: Finding, status: 'confirmed' | 'dismissed') => void;
}) {
  const dismissed = finding.status === 'dismissed';
  const confirmed = finding.status === 'confirmed';
  return (
    <View style={[styles.finding, dismissed && styles.findingDismissed]}>
      <View style={styles.findingTop}>
        <View style={[styles.sevDot, { backgroundColor: SEVERITY_COLOR[finding.severity] }]} />
        <Text style={styles.sevLabel}>{SEVERITY_LABEL[finding.severity]}</Text>
        <Text style={styles.conf}>{Math.round(finding.confidence * 100)}% confidence</Text>
      </View>
      <Text style={[styles.findingDesc, dismissed && styles.struck]}>{finding.description}</Text>
      <View style={styles.decideRow}>
        <Pressable
          onPress={() => onDecide(finding, 'confirmed')}
          style={[styles.decideBtn, confirmed && styles.confirmedBtn]}
        >
          <Text style={[styles.decideText, confirmed && { color: colors.textInverse }]}>
            {confirmed ? '✓ Confirmed' : 'Confirm'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDecide(finding, dismissed ? 'confirmed' : 'dismissed')}
          style={[styles.decideBtn, dismissed && styles.dismissedBtn]}
        >
          <Text style={[styles.decideText, dismissed && { color: colors.textInverse }]}>
            {dismissed ? '↺ Restore' : 'Dismiss'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 96 },
  headerGear: { fontSize: 22, color: colors.primary, paddingHorizontal: spacing.sm },
  modeRow: { flexDirection: 'row' },
  modeChip: { borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  modeMock: { backgroundColor: colors.border },
  modeLive: { backgroundColor: colors.successMuted },
  modeText: { fontSize: fontSize.xs, fontWeight: '700' },
  warn: { color: colors.warning, fontSize: fontSize.sm, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, ...shadow.card },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  roomName: { flex: 1, fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  badgeRunning: { backgroundColor: colors.primaryMuted },
  badgeText: { fontSize: fontSize.xs, fontWeight: '800' },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  clean: { fontSize: fontSize.sm, color: colors.success, fontWeight: '600' },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
  finding: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  findingDismissed: { opacity: 0.6 },
  findingTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sevDot: { width: 12, height: 12, borderRadius: 6 },
  sevLabel: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text },
  conf: { marginLeft: 'auto', fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  findingDesc: { fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  decideRow: { flexDirection: 'row', gap: spacing.sm },
  decideBtn: {
    flex: 1,
    minHeight: TOUCH_TARGET - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  confirmedBtn: { backgroundColor: colors.success, borderColor: colors.success },
  dismissedBtn: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  decideText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  footer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
  },
});
