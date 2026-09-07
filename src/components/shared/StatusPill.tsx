import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AppStatusKey, getStatusStyle } from '../../constants/status';

export type StatusPillVariant =
  | 'success'
  | 'danger'
  | 'warning'
  | 'timer'
  | 'neutral'
  | 'active'
  | 'idle'
  | 'cancelled'
  | 'remarks'
  | AppStatusKey;

interface StatusPillProps {
  label: string;
  variant: StatusPillVariant;
  size?: 'sm' | 'md';
  IconComponent?: React.ComponentType<any>;
}

export const StatusPill: React.FC<StatusPillProps> = ({ label, variant, size = 'md', IconComponent }) => {
  const { colors } = useTheme();
  const isSm = size === 'sm';
  const isUrgent = variant === 'URGENT' || variant === 'danger';
  const iconSize = isSm ? 10 : 12;

  // Map variant to style cleanly via centralized status definition or fallback
  const getPillStyle = () => {
    switch (variant) {
      case 'DONE':
      case 'success':
        return getStatusStyle('DONE', colors);
      case 'READY':
        return getStatusStyle('READY', colors);
      case 'SKIPPED':
      case 'cancelled':
        return getStatusStyle('SKIPPED', colors);
      case 'IDLE':
      case 'idle':
      case 'warning':
        return getStatusStyle('IDLE', colors);
      case 'ACTIVE':
      case 'active':
      case 'timer':
        return getStatusStyle('ACTIVE', colors);
      case 'PENDING':
      case 'neutral':
        return getStatusStyle('PENDING', colors);
      case 'URGENT':
      case 'danger':
        return getStatusStyle('URGENT', colors);
      case 'REMARKS':
      case 'remarks':
        return getStatusStyle('REMARKS', colors);
      default:
        return getStatusStyle('PENDING', colors);
    }
  };

  const { color, bg, border } = getPillStyle();

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg, borderColor: border },
        isSm && styles.pillSm,
        isUrgent && (isSm ? styles.pillUrgentSm : styles.pillUrgent),
      ]}
    >
      {IconComponent && <IconComponent size={iconSize} color={color} />}
      <Text
        style={[
          styles.label,
          { color },
          isSm && styles.labelSm,
          isUrgent && (isSm ? styles.labelUrgentSm : styles.labelUrgent),
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingHorizontal: 8, paddingVertical: 3, minHeight: 24, borderRadius: 5, borderWidth: 1,
  },
  pillSm: { paddingHorizontal: 6, paddingVertical: 2, minHeight: 20, borderRadius: 4, gap: 3 },
  pillUrgent: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    minHeight: 25,
    borderRadius: 5,
    borderWidth: 1.5,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 6px rgba(239, 68, 68, 0.3)' } as any)
      : {
          shadowColor: '#ef4444',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.3,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  pillUrgentSm: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    minHeight: 22,
    borderRadius: 4,
    borderWidth: 1.2,
  },
  label: {
    fontSize: 11, fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  labelSm: { fontSize: 9, letterSpacing: 0.3 },
  labelUrgent: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  labelUrgentSm: {
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
