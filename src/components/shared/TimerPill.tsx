import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface TimerPillProps {
  elapsedText: string;
  variant?: 'cyan' | 'amber' | 'green';
  size?: 'sm' | 'md';
  isPaused?: boolean;
}

/** TimerPill — live elapsed timer display. Uses the same plate-DNA shape as StatusPill. */
export const TimerPill: React.FC<TimerPillProps> = ({
  elapsedText, variant = 'cyan', size = 'md', isPaused = false,
}) => {
  const { colors } = useTheme();
  const isAmber = isPaused || variant === 'amber';
  const isGreen = variant === 'green';
  const isSm = size === 'sm';
  
  const color  = isGreen ? colors.successLight  : isAmber ? colors.warningLight  : colors.primaryLight;
  const bg     = isGreen ? colors.successDim    : isAmber ? colors.warningDim    : colors.primaryDim;
  const border = isGreen ? colors.successBorder : isAmber ? colors.warningBorder : colors.primaryBorder;

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }, isSm && styles.pillSm]}>
      <Clock size={isSm ? 10 : 12} color={color} />
      <Text style={[styles.label, { color }, isSm && styles.labelSm]}>{elapsedText}</Text>
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
