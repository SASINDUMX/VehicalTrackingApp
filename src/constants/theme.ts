import { Platform } from 'react-native';

export const Colors = {
  // Ultra-Premium Carbon Dark Base
  background: '#070b14',
  surface: '#0f172a',
  surfaceElevated: '#182234',
  card: '#1e293b',
  cardHover: '#24334a',

  // Typography
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textSubtle: '#cbd5e1',
  textDark: '#0f172a',

  // Brand Accents
  primary: '#0ea5e9',
  primaryLight: '#38bdf8',
  primaryCyan: '#06b6d4',
  primaryDim: 'rgba(14, 165, 233, 0.12)',
  primaryGlow: 'rgba(14, 165, 233, 0.25)',
  primaryBorder: 'rgba(56, 189, 248, 0.3)',

  // Status & Zones
  success: '#10b981',
  successLight: '#34d399',
  successDim: 'rgba(16, 185, 129, 0.12)',
  successGlow: 'rgba(16, 185, 129, 0.25)',
  successBorder: 'rgba(52, 211, 153, 0.3)',

  warning: '#f59e0b',
  warningLight: '#fbbf24',
  warningDim: 'rgba(245, 158, 11, 0.12)',
  warningGlow: 'rgba(245, 158, 11, 0.25)',
  warningBorder: 'rgba(251, 191, 36, 0.3)',

  purple: '#a855f7',
  purpleLight: '#c084fc',
  purpleDim: 'rgba(168, 85, 247, 0.12)',
  purpleBorder: 'rgba(192, 132, 252, 0.3)',

  danger: '#ef4444',
  dangerDim: 'rgba(239, 68, 68, 0.12)',
  dangerBorder: 'rgba(248, 113, 113, 0.3)',

  // License Plate (Authentic Metallic Finish)
  plateYellow: '#facc15',
  plateYellowDark: '#eab308',
  plateText: '#0f172a',
  plateBlueBar: '#1d4ed8',

  // Glassmorphism & Borders
  borderGlass: 'rgba(255, 255, 255, 0.08)',
  borderGlassBright: 'rgba(255, 255, 255, 0.16)',
  surfaceOverlay: 'rgba(255, 255, 255, 0.04)',
  surfaceFaint: 'rgba(255, 255, 255, 0.02)',
  backdrop: 'rgba(3, 7, 18, 0.85)',
  progressBg: 'rgba(255, 255, 255, 0.08)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  xxxl: 16,
  section: 24,
  modal: 32,
} as const;

export const FontSize = {
  xs: 9,
  sm: 10,
  md: 11,
  base: 12,
  lg: 13,
  xl: 14,
  xxl: 16,
  title: 18,
  hero: 24,
} as const;

export const Radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 9999,
} as const;

export const MonoFont = Platform.OS === 'ios' ? 'Courier' : 'monospace';

