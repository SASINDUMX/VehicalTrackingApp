import { Platform } from 'react-native';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  cardHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  textDark: string;
  primary: string;
  primaryLight: string;
  primaryCyan: string;
  primaryDim: string;
  primaryGlow: string;
  primaryBorder: string;
  success: string;
  successLight: string;
  successDim: string;
  successGlow: string;
  successBorder: string;
  warning: string;
  warningLight: string;
  warningDim: string;
  warningGlow: string;
  warningBorder: string;
  purple: string;
  purpleLight: string;
  purpleDim: string;
  purpleBorder: string;
  danger: string;
  dangerDim: string;
  dangerBorder: string;
  plateYellow: string;
  plateYellowDark: string;
  plateText: string;
  plateBlueBar: string;
  borderGlass: string;
  borderGlassBright: string;
  surfaceOverlay: string;
  surfaceFaint: string;
  backdrop: string;
  progressBg: string;
}

export const DarkColors: ThemeColors = {
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
};

export const LightColors: ThemeColors = {
  // Executive Crisp Light Base
  background: '#f1f5f9',
  surface: '#ffffff',
  surfaceElevated: '#f8fafc',
  card: '#ffffff',
  cardHover: '#f1f5f9',

  // Typography
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textSubtle: '#1e293b',
  textDark: '#0f172a',

  // Brand Accents
  primary: '#0284c7',
  primaryLight: '#0ea5e9',
  primaryCyan: '#0891b2',
  primaryDim: 'rgba(2, 132, 199, 0.1)',
  primaryGlow: 'rgba(2, 132, 199, 0.2)',
  primaryBorder: 'rgba(2, 132, 199, 0.3)',

  // Status & Zones
  success: '#059669',
  successLight: '#10b981',
  successDim: 'rgba(5, 150, 105, 0.1)',
  successGlow: 'rgba(5, 150, 105, 0.2)',
  successBorder: 'rgba(5, 150, 105, 0.3)',

  warning: '#d97706',
  warningLight: '#f59e0b',
  warningDim: 'rgba(217, 119, 6, 0.1)',
  warningGlow: 'rgba(217, 119, 6, 0.2)',
  warningBorder: 'rgba(217, 119, 6, 0.3)',

  purple: '#7c3aed',
  purpleLight: '#8b5cf6',
  purpleDim: 'rgba(124, 58, 237, 0.1)',
  purpleBorder: 'rgba(124, 58, 237, 0.3)',

  danger: '#dc2626',
  dangerDim: 'rgba(220, 38, 38, 0.1)',
  dangerBorder: 'rgba(220, 38, 38, 0.3)',

  // License Plate (Authentic Metallic Finish remains gold yellow)
  plateYellow: '#facc15',
  plateYellowDark: '#eab308',
  plateText: '#0f172a',
  plateBlueBar: '#1d4ed8',

  // Glassmorphism & Borders
  borderGlass: 'rgba(0, 0, 0, 0.08)',
  borderGlassBright: 'rgba(0, 0, 0, 0.15)',
  surfaceOverlay: 'rgba(0, 0, 0, 0.03)',
  surfaceFaint: 'rgba(0, 0, 0, 0.02)',
  backdrop: 'rgba(15, 23, 42, 0.65)',
  progressBg: 'rgba(0, 0, 0, 0.08)',
};

// Default export is DarkColors to preserve existing dark design
export const Colors = DarkColors;

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
