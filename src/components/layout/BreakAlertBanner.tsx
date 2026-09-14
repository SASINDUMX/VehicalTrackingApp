import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface BreakAlertBannerProps {
  activeBreak: { name: string; endStr: string } | null;
}

export const BreakAlertBanner: React.FC<BreakAlertBannerProps> = ({ activeBreak }) => {
  const { colors } = useTheme();

  if (!activeBreak) return null;

  return (
    <View style={[styles.breakStrip, { backgroundColor: colors.warningDim, borderBottomColor: colors.warning }]}>
      <Text style={[styles.breakStripText, { color: colors.warningLight }]} numberOfLines={1}>
        {activeBreak.name.toUpperCase()} BREAK: (UNTIL {activeBreak.endStr}) · TIMERS PAUSED
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  breakStrip: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: 99,
    borderBottomWidth: 1,
  },
  breakStripText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
});
