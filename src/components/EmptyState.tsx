import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, fontSize } from '../theme/theme';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  /** Optional action element (e.g. a Button) rendered below the copy. */
  action?: React.ReactNode;
}

/** Centered empty-state placeholder used when a list has no content yet. */
export function EmptyState({ icon = '📋', title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  icon: { fontSize: 48, marginBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  action: { marginTop: spacing.lg, alignSelf: 'stretch', maxWidth: 320 },
});
