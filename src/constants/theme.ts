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
  dangerLight: string;
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

  // Spatial Bays (Independent of Statuses)
  bayWorkshop: string;
  bayWorkshopLight: string;
  bayWorkshopDim: string;
  bayWorkshopBorder: string;
  bayAlignment: string;
  bayAlignmentLight: string;
  bayAlignmentDim: string;
  bayAlignmentBorder: string;
  bayHoist: string;
  bayHoistLight: string;
  bayHoistDim: string;
  bayHoistBorder: string;
  bayInspection: string;
  bayInspectionLight: string;
  bayInspectionDim: string;
  bayInspectionBorder: string;

  // Whole Card States (High Visibility & Contrast)
  cardActiveBg: string;
  cardActiveBorder: string;
  cardIdleBg: string;
  cardIdleBorder: string;
  cardDoneBg: string;
  cardDoneBorder: string;
  cardUrgentBg: string;
  cardUrgentBorder: string;

  // Annotations & Auxiliary Statuses
  remarks: string;
  remarksLight: string;
  remarksDim: string;
  remarksBorder: string;
  cancelled: string;
  cancelledDim: string;
  cancelledBorder: string;
  queueOut: string;
  queueOutDim: string;
  queueOutBorder: string;
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
  dangerLight: '#f87171',
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

  // Spatial Bays (Independent of Statuses)
  bayWorkshop: '#3b82f6',
  bayWorkshopLight: '#60a5fa',
  bayWorkshopDim: 'rgba(59, 130, 246, 0.14)',
  bayWorkshopBorder: 'rgba(96, 165, 250, 0.35)',
  bayAlignment: '#14b8a6',
  bayAlignmentLight: '#2dd4bf',
  bayAlignmentDim: 'rgba(20, 184, 166, 0.14)',
  bayAlignmentBorder: 'rgba(45, 212, 191, 0.35)',
  bayHoist: '#6366f1',
  bayHoistLight: '#818cf8',
  bayHoistDim: 'rgba(99, 102, 241, 0.14)',
  bayHoistBorder: 'rgba(129, 140, 248, 0.35)',
  bayInspection: '#a855f7',
  bayInspectionLight: '#c084fc',
  bayInspectionDim: 'rgba(168, 85, 247, 0.14)',
  bayInspectionBorder: 'rgba(192, 132, 252, 0.35)',

  // Whole Card States (Transparent Glassmorphic + State Glow)
  cardActiveBg: 'rgba(14, 165, 233, 0.04)',
  cardActiveBorder: 'rgba(56, 189, 248, 0.22)',
  cardIdleBg: 'rgba(245, 158, 11, 0.05)',
  cardIdleBorder: 'rgba(251, 191, 36, 0.25)',
  cardDoneBg: 'rgba(16, 185, 129, 0.05)',
  cardDoneBorder: 'rgba(52, 211, 153, 0.25)',
  cardUrgentBg: 'rgba(239, 68, 68, 0.08)',
  cardUrgentBorder: 'rgba(248, 113, 113, 0.35)',

  // Annotations & Auxiliary Statuses
  remarks: '#818cf8',
  remarksLight: '#a5b4fc',
  remarksDim: 'rgba(99, 102, 241, 0.12)',
  remarksBorder: 'rgba(129, 140, 248, 0.3)',
  cancelled: '#94a3b8',
  cancelledDim: 'rgba(148, 163, 184, 0.12)',
  cancelledBorder: 'rgba(148, 163, 184, 0.3)',
  queueOut: '#fb923c',
  queueOutDim: 'rgba(251, 146, 60, 0.12)',
  queueOutBorder: 'rgba(251, 146, 60, 0.35)',
};

export const LightColors: ThemeColors = {
  // Executive Crisp Light Base
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceElevated: '#f1f5f9',
  card: '#ffffff',
  cardHover: '#f8fafc',

  // Typography
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textSubtle: '#1e293b',
  textDark: '#0f172a',

  // Brand Accents (Deep, rich, accessible on light backgrounds)
  primary: '#0284c7',
  primaryLight: '#0284c7',
  primaryCyan: '#0891b2',
  primaryDim: 'rgba(2, 132, 199, 0.08)',
  primaryGlow: 'rgba(2, 132, 199, 0.15)',
  primaryBorder: 'rgba(2, 132, 199, 0.25)',

  // Status & Zones
  success: '#059669',
  successLight: '#059669',
  successDim: 'rgba(5, 150, 105, 0.08)',
  successGlow: 'rgba(5, 150, 105, 0.15)',
  successBorder: 'rgba(5, 150, 105, 0.25)',

  warning: '#d97706',
  warningLight: '#d97706',
  warningDim: 'rgba(217, 119, 6, 0.08)',
  warningGlow: 'rgba(217, 119, 6, 0.15)',
  warningBorder: 'rgba(217, 119, 6, 0.25)',

  purple: '#7c3aed',
  purpleLight: '#7c3aed',
  purpleDim: 'rgba(124, 58, 237, 0.08)',
  purpleBorder: 'rgba(124, 58, 237, 0.25)',

  danger: '#dc2626',
  dangerLight: '#ef4444',
  dangerDim: 'rgba(220, 38, 38, 0.08)',
  dangerBorder: 'rgba(220, 38, 38, 0.25)',

  // License Plate (Authentic Metallic Finish remains gold yellow)
  plateYellow: '#facc15',
  plateYellowDark: '#eab308',
  plateText: '#0f172a',
  plateBlueBar: '#1d4ed8',

  // Glassmorphism & Borders
  borderGlass: 'rgba(0, 0, 0, 0.08)',
  borderGlassBright: 'rgba(0, 0, 0, 0.14)',
  surfaceOverlay: 'rgba(0, 0, 0, 0.03)',
  surfaceFaint: 'rgba(0, 0, 0, 0.015)',
  backdrop: 'rgba(15, 23, 42, 0.6)',
  progressBg: 'rgba(0, 0, 0, 0.06)',

  // Spatial Bays (Independent of Statuses)
  bayWorkshop: '#2563eb',
  bayWorkshopLight: '#3b82f6',
  bayWorkshopDim: 'rgba(37, 99, 235, 0.08)',
  bayWorkshopBorder: 'rgba(37, 99, 235, 0.25)',
  bayAlignment: '#0d9488',
  bayAlignmentLight: '#14b8a6',
  bayAlignmentDim: 'rgba(13, 148, 136, 0.08)',
  bayAlignmentBorder: 'rgba(13, 148, 136, 0.25)',
  bayHoist: '#4f46e5',
  bayHoistLight: '#6366f1',
  bayHoistDim: 'rgba(79, 70, 229, 0.08)',
  bayHoistBorder: 'rgba(79, 70, 229, 0.25)',
  bayInspection: '#7c3aed',
  bayInspectionLight: '#9333ea',
  bayInspectionDim: 'rgba(124, 58, 237, 0.08)',
  bayInspectionBorder: 'rgba(124, 58, 237, 0.25)',

  // Whole Card States (Transparent Glassmorphic + State Glow)
  cardActiveBg: 'rgba(2, 132, 199, 0.03)',
  cardActiveBorder: 'rgba(2, 132, 199, 0.18)',
  cardIdleBg: 'rgba(217, 119, 6, 0.04)',
  cardIdleBorder: 'rgba(217, 119, 6, 0.22)',
  cardDoneBg: 'rgba(5, 150, 105, 0.04)',
  cardDoneBorder: 'rgba(5, 150, 105, 0.22)',
  cardUrgentBg: 'rgba(220, 38, 38, 0.05)',
  cardUrgentBorder: 'rgba(220, 38, 38, 0.25)',

  // Annotations & Auxiliary Statuses
  remarks: '#4f46e5',
  remarksLight: '#6366f1',
  remarksDim: 'rgba(79, 70, 229, 0.08)',
  remarksBorder: 'rgba(79, 70, 229, 0.25)',
  cancelled: '#64748b',
  cancelledDim: 'rgba(100, 116, 139, 0.08)',
  cancelledBorder: 'rgba(100, 116, 139, 0.25)',
  queueOut: '#ea580c',
  queueOutDim: 'rgba(234, 88, 12, 0.08)',
  queueOutBorder: 'rgba(234, 88, 12, 0.25)',
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
