import { ThemeColors } from './theme';

export type TaskStatus = 'DONE' | 'SKIPPED' | 'PENDING';
export type StageStatus = 'IDLE' | 'ACTIVE' | 'DONE' | 'SKIPPED' | 'PENDING';
export type VehicleLifecycleStatus = 'INTAKE' | 'IN_SERVICE' | 'READY' | 'DELIVERED';
export type AppStatusKey = 
  | 'DONE'
  | 'READY'
  | 'SKIPPED'
  | 'IDLE'
  | 'ACTIVE'
  | 'PENDING'
  | 'URGENT'
  | 'REMARKS';

export interface StatusStyle {
  color: string;
  bg: string;
  border: string;
}

export interface StatusConfig {
  key: AppStatusKey;
  label: string;
  getColor: (colors: ThemeColors) => StatusStyle;
}

export const APP_STATUSES: Record<AppStatusKey, StatusConfig> = {
  DONE: {
    key: 'DONE',
    label: 'DONE',
    getColor: (colors: ThemeColors) => ({
      color: colors.success,
      bg: colors.successDim,
      border: colors.successBorder,
    }),
  },
  READY: {
    key: 'READY',
    label: 'READY',
    getColor: (colors: ThemeColors) => ({
      color: colors.success,
      bg: colors.successDim,
      border: colors.successBorder,
    }),
  },
  SKIPPED: {
    key: 'SKIPPED',
    label: 'SKIPPED',
    getColor: (colors: ThemeColors) => ({
      color: colors.cancelled,
      bg: colors.cancelledDim,
      border: colors.cancelledBorder,
    }),
  },
  IDLE: {
    key: 'IDLE',
    label: 'IDLE',
    getColor: (colors: ThemeColors) => ({
      color: colors.warningLight,
      bg: colors.warningDim,
      border: colors.warningBorder,
    }),
  },
  ACTIVE: {
    key: 'ACTIVE',
    label: 'ACTIVE',
    getColor: (colors: ThemeColors) => ({
      color: colors.primaryLight,
      bg: colors.primaryDim,
      border: colors.primaryBorder,
    }),
  },
  PENDING: {
    key: 'PENDING',
    label: 'PENDING',
    getColor: (colors: ThemeColors) => ({
      color: colors.textSecondary,
      bg: colors.surfaceElevated,
      border: colors.borderGlass,
    }),
  },
  URGENT: {
    key: 'URGENT',
    label: 'URGENT',
    getColor: (colors: ThemeColors) => ({
      color: colors.danger,
      bg: colors.dangerDim,
      border: colors.dangerBorder,
    }),
  },
  REMARKS: {
    key: 'REMARKS',
    label: 'REMARKS',
    getColor: (colors: ThemeColors) => ({
      color: colors.remarksLight,
      bg: colors.remarksDim,
      border: colors.remarksBorder,
    }),
  },
};

export const getStatusStyle = (key: AppStatusKey, colors: ThemeColors): StatusStyle => {
  const cfg = APP_STATUSES[key];
  if (cfg) return cfg.getColor(colors);
  return {
    color: colors.textSecondary,
    bg: colors.surfaceElevated,
    border: colors.borderGlass,
  };
};
