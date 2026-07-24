import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Rect } from 'react-native-svg';

import type { RootStackScreenProps } from '../navigation/types';
import { getSession, getCurrentSession } from '../db/sessions';
import { listRooms } from '../db/rooms';
import { getClipForRoom } from '../db/clips';
import { listFindingsForRoom, setFindingStatus } from '../db/findings';
import type { Finding, Severity } from '../types/models';
import { SEVERITY_LABEL } from '../types/models';
import { colors, spacing, radius, fontSize, TOUCH_TARGET } from '../theme/theme';

const SEVERITY_COLOR: Record<Severity, string> = {
  minor: colors.severityMinor,
  moderate: colors.severityModerate,
  needs_review: colors.severityNeedsReview,
};

export function ComparisonScreen({ route, navigation }: RootStackScreenProps<'Comparison'>) {
  const { inspectionSessionId, roomId, findingId } = route.params;
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState('Room');
  const [baselineUri, setBaselineUri] = useState<string | null>(null);
  const [inspectionUri, setInspectionUri] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: roomName });
  }, [navigation, roomName]);

  useEffect(() => {
    let active = true;
    (async () => {
      const inspection = await getSession(inspectionSessionId);
      const rooms = inspection ? await listRooms(inspection.propertyId) : [];
      const room = rooms.find((r) => r.id === roomId);
      const inspClip = await getClipForRoom(inspectionSessionId, roomId);
      const baseline = inspection
        ? await getCurrentSession(inspection.propertyId, 'baseline')
        : null;
      const baseClip = baseline ? await getClipForRoom(baseline.id, roomId) : null;
      const roomFindings = await listFindingsForRoom(inspectionSessionId, roomId);
      if (!active) return;
      setRoomName(room?.name ?? 'Room');
      setInspectionUri(inspClip?.videoUri ?? null);
      setBaselineUri(baseClip?.videoUri ?? null);
      setFindings(roomFindings);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [inspectionSessionId, roomId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ComparisonView
      roomName={roomName}
      baselineUri={baselineUri}
      inspectionUri={inspectionUri}
      findings={findings}
      initialFindingId={findingId}
      onFindingsChange={setFindings}
    />
  );
}

function ComparisonView({
  baselineUri,
  inspectionUri,
  findings,
  initialFindingId,
  onFindingsChange,
}: {
  roomName: string;
  baselineUri: string | null;
  inspectionUri: string | null;
  findings: Finding[];
  initialFindingId?: string;
  onFindingsChange: (f: Finding[]) => void;
}) {
  const initialIndex = Math.max(
    0,
    initialFindingId ? findings.findIndex((f) => f.id === initialFindingId) : 0
  );
  const [index, setIndex] = useState(initialIndex);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const baselinePlayer = useVideoPlayer(baselineUri, (p) => {
    p.loop = false;
    p.muted = true;
  });
  const inspectionPlayer = useVideoPlayer(inspectionUri, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const current = findings[index];

  // Auto-jump both players to the flagged timestamps when the finding changes.
  useEffect(() => {
    if (!current) return;
    try {
      if (current.inspectionFrameMs != null) {
        inspectionPlayer.currentTime = current.inspectionFrameMs / 1000;
      }
      if (current.baselineFrameMs != null) {
        baselinePlayer.currentTime = current.baselineFrameMs / 1000;
      }
    } catch {
      // Seeking before the player is ready is a no-op; native controls still work.
    }
  }, [current, baselinePlayer, inspectionPlayer]);

  const decide = useCallback(
    async (status: 'confirmed' | 'dismissed') => {
      if (!current) return;
      await setFindingStatus(current.id, status);
      onFindingsChange(findings.map((f) => (f.id === current.id ? { ...f, status } : f)));
    },
    [current, findings, onFindingsChange]
  );

  const onInspectionLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const showBox =
    current &&
    current.locX != null &&
    current.locY != null &&
    current.boxW != null &&
    current.boxH != null &&
    box.w > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.note}>
        Baseline (move-in) on top, inspection (move-out) below. Both are seekable and jump to the
        flagged moment. The box marks the AI's approximate location — angle and lighting differ, so
        treat it as a pointer, not a measurement.
      </Text>

      {/* Baseline */}
      <Text style={styles.panelLabel}>🎥 Baseline (move-in)</Text>
      <View style={styles.videoWrap}>
        {baselineUri ? (
          <VideoView player={baselinePlayer} style={styles.video} nativeControls contentFit="contain" />
        ) : (
          <View style={styles.videoMissing}>
            <Text style={styles.muted}>No baseline clip for this room.</Text>
          </View>
        )}
      </View>

      {/* Inspection with overlay */}
      <Text style={styles.panelLabel}>🔍 Inspection (move-out)</Text>
      <View style={styles.videoWrap} onLayout={onInspectionLayout}>
        {inspectionUri ? (
          <VideoView player={inspectionPlayer} style={styles.video} nativeControls contentFit="contain" />
        ) : (
          <View style={styles.videoMissing}>
            <Text style={styles.muted}>No inspection clip for this room.</Text>
          </View>
        )}
        {showBox && current ? (
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Rect
              x={(current.locX as number) * box.w}
              y={(current.locY as number) * box.h}
              width={(current.boxW as number) * box.w}
              height={(current.boxH as number) * box.h}
              stroke={SEVERITY_COLOR[current.severity]}
              strokeWidth={3}
              fill={SEVERITY_COLOR[current.severity]}
              fillOpacity={0.15}
              rx={4}
            />
          </Svg>
        ) : null}
      </View>

      {/* Finding details */}
      {findings.length === 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.clean}>✓ No issues were flagged for this room.</Text>
        </View>
      ) : current ? (
        <View style={styles.detailCard}>
          {findings.length > 1 ? (
            <View style={styles.pager}>
              <Pressable
                onPress={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                style={[styles.pagerBtn, index === 0 && styles.pagerDisabled]}
              >
                <Text style={styles.pagerText}>‹</Text>
              </Pressable>
              <Text style={styles.pagerLabel}>
                Finding {index + 1} of {findings.length}
              </Text>
              <Pressable
                onPress={() => setIndex((i) => Math.min(findings.length - 1, i + 1))}
                disabled={index === findings.length - 1}
                style={[styles.pagerBtn, index === findings.length - 1 && styles.pagerDisabled]}
              >
                <Text style={styles.pagerText}>›</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sevRow}>
            <View style={[styles.sevDot, { backgroundColor: SEVERITY_COLOR[current.severity] }]} />
            <Text style={styles.sevLabel}>{SEVERITY_LABEL[current.severity]}</Text>
            <Text style={styles.conf}>{Math.round(current.confidence * 100)}% confidence</Text>
          </View>
          <Text style={styles.desc}>{current.description}</Text>

          <View style={styles.decideRow}>
            <Pressable
              onPress={() => decide('confirmed')}
              style={[styles.decideBtn, current.status === 'confirmed' && styles.confirmedBtn]}
            >
              <Text
                style={[styles.decideText, current.status === 'confirmed' && { color: colors.textInverse }]}
              >
                {current.status === 'confirmed' ? '✓ Confirmed' : 'Confirm'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => decide(current.status === 'dismissed' ? 'confirmed' : 'dismissed')}
              style={[styles.decideBtn, current.status === 'dismissed' && styles.dismissedBtn]}
            >
              <Text
                style={[styles.decideText, current.status === 'dismissed' && { color: colors.textInverse }]}
              >
                {current.status === 'dismissed' ? '↺ Restore' : 'Dismiss'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  note: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  panelLabel: { fontSize: fontSize.sm, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  videoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: '100%' },
  videoMissing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clean: { fontSize: fontSize.md, color: colors.success, fontWeight: '600' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  pagerDisabled: { opacity: 0.3 },
  pagerText: { fontSize: fontSize.xl, color: colors.primary, fontWeight: '800' },
  pagerLabel: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '700' },
  sevRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sevDot: { width: 14, height: 14, borderRadius: 7 },
  sevLabel: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  conf: { marginLeft: 'auto', fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  desc: { fontSize: fontSize.md, color: colors.text, lineHeight: 22 },
  decideRow: { flexDirection: 'row', gap: spacing.md },
  decideBtn: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  confirmedBtn: { backgroundColor: colors.success, borderColor: colors.success },
  dismissedBtn: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  decideText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
});
