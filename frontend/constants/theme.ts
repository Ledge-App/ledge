// Single source of truth for design tokens — see docs/design.md.
// No hex values, spacing numbers, or font names should appear outside this file.
//
// Light-mode-first (pivoted 2026-08 from the original dark-mode spec — see design.md's
// changelog note). Every color here doubles as text/icon color in this codebase (see
// SecretInput, TextField, ErrorBanner, SettingsRow), so each is chosen to meet WCAG AA
// contrast against `background`/`surface`, not just to "look like" its dark-mode counterpart.
// Category card pastel fills derive from `categoryColors` via `hexToRgba`, not from these
// semantic tokens — those hues don't need the same text-contrast treatment.

export const colors = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceRaised: '#F3F3EF',
  border: '#E8E8E2',
  borderStrong: '#D3D3CA',

  primary: '#0F766E',
  primaryDim: '#0B5C56',
  primaryMuted: 'rgba(15,118,110,0.10)',

  income: '#059669',
  expense: '#E11D48',
  warning: '#B45309',
  reimbursed: '#7C3AED',
  transfer: '#0E7490',

  textPrimary: '#1C1C18',
  textSecondary: '#6E6E64',
  textMuted: '#A8A89C',
  textInverse: '#FFFFFF',
} as const

export const categoryColors = {
  foodAndDrink: '#F97316',
  transport: '#3B82F6',
  travel: '#8B5CF6',
  entertainment: '#EC4899',
  shopping: '#EAB308',
  bills: '#6B7280',
  health: '#10B981',
  personalCare: '#F43F5E',
  home: '#84CC16',
  services: '#06B6D4',
  income: '#34D399',
  transfersIn: '#2DD4BF',
  transfersOut: '#9CA3AF',
  loans: '#F87171',
  fees: '#6B7280',
  other: '#71717A',
} as const

// Fallback channels for malformed input. category.color is a free-text DB column (validated
// only as a non-empty string), so a value like 'red' or '#f00' would otherwise parse to NaN
// channels and crash React Native at render time. Falls back to `textMuted` (#A8A89C).
const FALLBACK_RGB = [168, 168, 156] as const

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const [r, g, b] = FALLBACK_RGB
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const fontFamily = {
  display: 'DMSans_700Bold',
  sans: 'Inter_400Regular',
  sansMed: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
} as const

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 22,
  xl: 28,
  '2xl': 36,
  '3xl': 48,
} as const

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

export const borderRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 9999,
} as const

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  card: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
} as const
