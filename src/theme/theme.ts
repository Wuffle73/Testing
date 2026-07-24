/**
 * Central design tokens for Tenant Auditor.
 *
 * The app is intentionally light-mode only (dark mode is out of scope per the
 * brief) but everything routes through this file so touch targets, spacing and
 * severity colors stay consistent. Touch targets are deliberately generous —
 * this app is used one-handed while walking through a room.
 */

export const colors = {
  // Brand / surfaces
  background: '#F1F5F9', // slate-100
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC', // slate-50
  border: '#E2E8F0', // slate-200

  // Text
  text: '#0F172A', // slate-900
  textMuted: '#64748B', // slate-500
  textInverse: '#FFFFFF',

  // Primary action
  primary: '#2563EB', // blue-600
  primaryDark: '#1D4ED8',
  primaryMuted: '#DBEAFE',

  // Feedback
  danger: '#DC2626', // red-600
  dangerMuted: '#FEE2E2',
  success: '#16A34A', // green-600
  successMuted: '#DCFCE7',
  warning: '#D97706', // amber-600
  warningMuted: '#FEF3C7',

  // Severity scale used across findings + floor-map pins.
  // Kept in sync with the Severity type in src/types/models.ts.
  severityClean: '#94A3B8', // slate-400  (grey  = clean)
  severityMinor: '#EAB308', // yellow-500 (yellow = minor)
  severityModerate: '#F97316', // orange-500 (moderate)
  severityNeedsReview: '#DC2626', // red-600 (red = needs review)
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/** Minimum height for anything tappable (thumb-friendly, one-handed use). */
export const TOUCH_TARGET = 48;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;
