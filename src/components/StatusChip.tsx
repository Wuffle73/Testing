import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, fontSize } from '../theme/theme';
import type { PropertyPhase } from '../db/properties';

interface PhaseChipProps {
  phase: PropertyPhase;
  findingsCount: number;
}

const PHASE_STYLES: Record<PropertyPhase, { label: string; bg: string; fg: string }> = {
  no_baseline: { label: 'No baseline yet', bg: colors.border, fg: colors.textMuted },
  baseline_complete: { label: 'Baseline complete', bg: colors.primaryMuted, fg: colors.primaryDark },
  inspection_in_progress: {
    label: 'Inspection in progress',
    bg: colors.warningMuted,
    fg: colors.warning,
  },
  inspection_complete: {
    label: 'Inspection complete',
    bg: colors.successMuted,
    fg: colors.success,
  },
};

/** Status pill shown on each dashboard property row. */
export function PhaseChip({ phase, findingsCount }: PhaseChipProps) {
  const s = PHASE_STYLES[phase];
  const label =
    phase === 'inspection_complete'
      ? `${s.label} · ${findingsCount} finding${findingsCount === 1 ? '' : 's'}`
      : s.label;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  text: { fontSize: fontSize.xs, fontWeight: '700' },
});
