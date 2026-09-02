import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export type StatusPillVariant = 'success' | 'danger' | 'warning' | 'timer' | 'neutral';

interface StatusPillProps {
  label: string;
  variant: StatusPillVariant;
  size?: 'sm' | 'md';
  IconComponent?: React.ComponentType<any>;
}

export const StatusPill: React.FC<StatusPillProps> = ({ label, variant, size = 'md', IconComponent }) => {
  const { colors } = useTheme();
  const isSm = size === 'sm';
  const iconSize = isSm ? 10 : 12;

  const configs: Record<StatusPillVariant, { color: string; bg: string; border: string }> = {
    success: { color: colors.success,       bg: colors.successDim,      border: colors.successBorder },
    danger:  { color: '#ef4444',            bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
    warning: { color: colors.warningLight,  bg: colors.warningDim,      border: colors.warningBorder },
    timer:   { color: colors.primaryLight,  bg: colors.primaryDim,      border: colors.primaryBorder },
    neutral: { color: colors.textSecondary, bg: colors.surfaceElevated, border: colors.borderGlass },
  };

  const { color, bg, border } = configs[variant];

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }, isSm && styles.pillSm]}>
      {IconComponent && <IconComponent size={iconSize} color={color} />}
      <Text style={[styles.label, { color }, isSm && styles.labelSm]} numberOfLines={1}>
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
  label: {
    fontSize: 11, fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  labelSm: { fontSize: 9, letterSpacing: 0.3 },
});
