import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';

import type { RootStackScreenProps } from '../navigation/types';
import { listRooms } from '../db/rooms';
import {
  completeSession,
  getOrCreateSession,
} from '../db/sessions';
import { getClipsByRoom, upsertClip } from '../db/clips';
import { countKeyframesForClip } from '../db/keyframes';
import { extractKeyframesForClip } from '../media/keyframes';
import {
  availableDiskSpace,
  formatBytes,
  isLowOnSpace,
  LOW_SPACE_BYTES,
  persistRecording,
} from '../storage/videos';
import type { Clip, Room, Session } from '../types/models';
import { colors, spacing, radius, fontSize, TOUCH_TARGET } from '../theme/theme';
import { Button } from '../components/Button';

const MAX_DURATION_S = 300; // 5 min per room is plenty for a walkthrough.

type Phase = 'idle' | 'recording' | 'saving';

export function RecordScreen({ route, navigation }: RootStackScreenProps<'Record'>) {
  const { propertyId, sessionType } = route.params;
  const isFocused = useIsFocused();

  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [savingLabel, setSavingLabel] = useState('Saving…');
  const [frameCounts, setFrameCounts] = useState<Record<string, number>>({});
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const cameraRef = useRef<CameraView>(null);
  const recordStartRef = useRef(0);

  const title = sessionType === 'baseline' ? 'Record baseline' : 'Record inspection';
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  // Bootstrap: load rooms, resume/create the session, load any existing clips.
  useEffect(() => {
    let active = true;
    (async () => {
      const roomList = await listRooms(propertyId);
      if (roomList.length === 0) {
        if (active) {
          setRooms([]);
          setLoading(false);
        }
        return;
      }
      const s = await getOrCreateSession(propertyId, sessionType);
      const clipMap = await getClipsByRoom(s.id);
      if (!active) return;
      // Frame counts for rooms already recorded (shown on the "done" badge).
      const counts: Record<string, number> = {};
      await Promise.all(
        Object.values(clipMap).map(async (c) => {
          counts[c.roomId] = await countKeyframesForClip(c.id);
        })
      );
      if (!active) return;
      setRooms(roomList);
      setSession(s);
      setClips(clipMap);
      setFrameCounts(counts);
      // Resume at the first not-yet-recorded room.
      const firstUnrecorded = roomList.findIndex((r) => !clipMap[r.id]);
      setIndex(firstUnrecorded === -1 ? 0 : firstUnrecorded);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [propertyId, sessionType]);

  // On-screen elapsed timer while recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase]);

  const room = rooms[index];
  const currentClip = room ? clips[room.id] : undefined;
  const recordedCount = rooms.filter((r) => clips[r.id]).length;
  const allRecorded = rooms.length > 0 && recordedCount === rooms.length;

  const beginCapture = useCallback(async () => {
    if (!cameraRef.current || !room || !session) return;
    setPhase('recording');
    recordStartRef.current = Date.now();
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: MAX_DURATION_S });
      if (!result?.uri) {
        setPhase('idle');
        return;
      }
      setPhase('saving');
      setSavingLabel('Saving video…');
      const durationMs = Date.now() - recordStartRef.current;
      const { uri } = await persistRecording(result.uri, session.id, room.id);
      const clip = await upsertClip({
        sessionId: session.id,
        roomId: room.id,
        videoUri: uri,
        durationMs,
        width: null,
        height: null,
      });
      setClips((prev) => ({ ...prev, [room.id]: clip }));

      // Extract keyframes for this clip. Failure here doesn't lose the clip —
      // frames can be re-extracted later, and step 6 tolerates missing frames.
      setSavingLabel('Extracting frames…');
      try {
        const frames = await extractKeyframesForClip(clip);
        setFrameCounts((prev) => ({ ...prev, [room.id]: frames.length }));
      } catch (err) {
        console.warn('Keyframe extraction failed', err);
        setFrameCounts((prev) => ({ ...prev, [room.id]: 0 }));
      }
      setPhase('idle');
    } catch (err) {
      setPhase('idle');
      Alert.alert('Recording failed', err instanceof Error ? err.message : String(err));
    }
  }, [room, session]);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || !room || !session) return;

    if (isLowOnSpace()) {
      Alert.alert(
        'Low on storage',
        `Only ${formatBytes(availableDiskSpace())} free (recommended: ${formatBytes(
          LOW_SPACE_BYTES
        )}+). Recording may fail or fill your device. Free up space or record anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Record anyway', style: 'destructive', onPress: () => void beginCapture() },
        ]
      );
      return;
    }
    await beginCapture();
  }, [room, session, beginCapture]);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(rooms.length - 1, i + 1));

  const finish = async () => {
    if (!session) return;
    await completeSession(session.id);
    navigation.goBack();
  };

  const playCurrent = () => {
    if (!room || !currentClip) return;
    navigation.navigate('Playback', {
      uri: currentClip.videoUri,
      title: `${room.name} · ${sessionType}`,
    });
  };

  // ---- Render states -------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.centerDark}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (rooms.length === 0) {
    return (
      <View style={styles.centerPad}>
        <Text style={styles.emptyTitle}>No rooms to record</Text>
        <Text style={styles.emptyBody}>Add rooms to this property first, then start the walkthrough.</Text>
        <Button
          label="Add rooms"
          onPress={() => navigation.replace('Rooms', { propertyId })}
          style={styles.emptyBtn}
        />
      </View>
    );
  }

  // Permission gate — camera AND microphone are both required to record video.
  const permsLoaded = camPerm && micPerm;
  const permsGranted = camPerm?.granted && micPerm?.granted;
  if (!permsLoaded) {
    return (
      <View style={styles.centerDark}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  if (!permsGranted) {
    const canAsk = camPerm.canAskAgain && micPerm.canAskAgain;
    return (
      <View style={styles.centerPad}>
        <Text style={styles.emptyTitle}>📷 Camera & microphone needed</Text>
        <Text style={styles.emptyBody}>
          Recording a walkthrough needs access to your camera and microphone. Your videos stay
          on this device — nothing is uploaded automatically.
        </Text>
        {canAsk ? (
          <Button
            label="Allow access"
            onPress={async () => {
              await requestCam();
              await requestMic();
            }}
            style={styles.emptyBtn}
          />
        ) : (
          <Button
            label="Open settings"
            onPress={() => Linking.openSettings()}
            style={styles.emptyBtn}
          />
        )}
        <Button
          label="Go back"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={styles.emptyBtn}
        />
      </View>
    );
  }

  const isRecording = phase === 'recording';
  const isSaving = phase === 'saving';

  return (
    <View style={styles.container}>
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="video"
          videoQuality="720p"
          active={isFocused}
          onCameraReady={() => setCameraReady(true)}
        />

        {/* Top guidance banner */}
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerLabel}>Now recording</Text>
          <Text style={styles.bannerRoom} numberOfLines={1}>
            {room?.name}
          </Text>
          <Text style={styles.bannerProgress}>
            Room {index + 1} of {rooms.length} · {recordedCount} recorded
          </Text>
        </View>

        {/* Recording indicator / recorded badge */}
        {isRecording ? (
          <View style={styles.recPill} pointerEvents="none">
            <View style={styles.recDot} />
            <Text style={styles.recText}>{formatTime(elapsed)}</Text>
          </View>
        ) : currentClip ? (
          <View style={styles.doneBadge} pointerEvents="none">
            <Text style={styles.doneText}>
              ✓ Recorded{room && frameCounts[room.id] ? ` · ${frameCounts[room.id]} frames` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {isSaving ? <Text style={styles.savingCaption}>{savingLabel}</Text> : null}
        <View style={styles.dots}>
          {rooms.map((r, i) => (
            <View
              key={r.id}
              style={[
                styles.dot,
                clips[r.id] && styles.dotDone,
                i === index && styles.dotCurrent,
              ]}
            />
          ))}
        </View>

        <View style={styles.mainRow}>
          <NavBtn label="‹ Prev" onPress={goPrev} disabled={index === 0 || isRecording || isSaving} />

          {isSaving ? (
            <View style={styles.recordBtnSaving}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : isRecording ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop recording"
              onPress={stopRecording}
              style={styles.recordBtnOuter}
            >
              <View style={styles.stopInner} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={currentClip ? 'Re-record this room' : 'Start recording'}
              onPress={startRecording}
              disabled={!cameraReady}
              style={[styles.recordBtnOuter, !cameraReady && { opacity: 0.5 }]}
            >
              <View style={styles.recordInner} />
            </Pressable>
          )}

          <NavBtn
            label="Next ›"
            onPress={goNext}
            disabled={index === rooms.length - 1 || isRecording || isSaving}
          />
        </View>

        <View style={styles.secondaryRow}>
          {currentClip ? (
            <>
              <Text style={styles.secondaryHint}>
                {currentClip ? 'Tap the button to re-record.' : ''}
              </Text>
              <Pressable onPress={playCurrent} hitSlop={8} style={styles.playLink}>
                <Text style={styles.playLinkText}>▶ Play clip</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.secondaryHint}>Tap the red button to record this room.</Text>
          )}
        </View>

        <Button
          label={allRecorded ? 'Finish walkthrough' : `Finish (${recordedCount}/${rooms.length})`}
          onPress={finish}
          disabled={!allRecorded || isRecording || isSaving}
          style={styles.finishBtn}
        />
      </View>
    </View>
  );
}

function NavBtn({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.navBtn, pressed && !disabled && { opacity: 0.6 }, disabled && { opacity: 0.3 }]}
    >
      <Text style={styles.navBtnText}>{label}</Text>
    </Pressable>
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const RECORD_BTN = 76;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerDark: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  centerPad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.sm },

  cameraWrap: { flex: 1, overflow: 'hidden', backgroundColor: '#111' },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bannerLabel: { color: '#CBD5E1', fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  bannerRoom: { color: '#fff', fontSize: fontSize.xl, fontWeight: '800' },
  bannerProgress: { color: '#E2E8F0', fontSize: fontSize.sm, marginTop: 2 },

  recPill: {
    position: 'absolute',
    top: spacing.xxl + spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  recText: { color: '#fff', fontWeight: '800', fontSize: fontSize.md },
  doneBadge: {
    position: 'absolute',
    top: spacing.xxl + spacing.xl,
    alignSelf: 'center',
    backgroundColor: 'rgba(22,163,74,0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  doneText: { color: '#fff', fontWeight: '800', fontSize: fontSize.sm },

  controls: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  savingCaption: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.success },
  dotCurrent: { borderWidth: 2, borderColor: colors.primary },

  mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    minWidth: 84,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  navBtnText: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },

  recordBtnOuter: {
    width: RECORD_BTN,
    height: RECORD_BTN,
    borderRadius: RECORD_BTN / 2,
    borderWidth: 4,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  recordBtnSaving: {
    width: RECORD_BTN,
    height: RECORD_BTN,
    borderRadius: RECORD_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  recordInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.danger },
  stopInner: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.danger },

  secondaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryHint: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1 },
  playLink: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  playLinkText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },

  finishBtn: { marginTop: spacing.xs },
});
