import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface LoadingSpotProps {
  message?: string;
  color?: string;
  compact?: boolean;
}

export const LoadingSpot: React.FC<LoadingSpotProps> = ({
  message = APP_TERMINOLOGY.telemetry.syncing,
  color,
  compact = false,
}) => {
  const { colors, isDark } = useTheme();
  const indicatorColor = color || colors.primary;

  return (
    <View
      style={[
        compact ? styles.compactContainer : styles.standardContainer,
        { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)' },
      ]}
    >
      <ActivityIndicator size="small" color={indicatorColor} />
      <Text style={[styles.loadingText, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  standardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
    borderRadius: 16,
    width: '100%',
  },
  compactContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
    borderRadius: 12,
    width: '100%',
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
