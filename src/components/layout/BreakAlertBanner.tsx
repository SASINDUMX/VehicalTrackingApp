import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Coffee, Clock, AlertTriangle, ChevronRight, Sparkles } from 'lucide-react-native';

interface BreakAlertBannerProps {
  activeBreak: { name: string; endStr: string } | null;
}

export const BreakAlertBanner: React.FC<BreakAlertBannerProps> = ({ activeBreak }) => {
  const { colors, isDark } = useTheme();
  const { trialInfo, activeBranchName } = useAuth();

  // Priority 1: Active Workshop Shift Break (Tea Time / Lunch)
  if (activeBreak) {
    return (
      <View
        style={[
          styles.stripContainer,
          {
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
            borderBottomColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde68a',
          },
        ]}
      >
        <View style={styles.contentRow}>
          <Coffee size={12} color={colors.warning} />
          <Text style={[styles.stripText, { color: isDark ? colors.warningLight : '#b45309' }]} numberOfLines={1}>
            {activeBreak.name.toUpperCase()} BREAK: (UNTIL {activeBreak.endStr}) · TIMERS PAUSED
          </Text>
        </View>
      </View>
    );
  }

  // Priority 2: Active Evaluation Trial Notice (outside of shift breaks)
  if (trialInfo.isTrial && !trialInfo.isExpired) {
    const isWarning = trialInfo.isExpiringSoon;
    const accentColor = isWarning ? colors.warning : (isDark ? colors.primaryLight : colors.primary);
    const bgColor = isWarning
      ? (isDark ? 'rgba(245, 158, 11, 0.10)' : '#fef3c7')
      : (isDark ? 'rgba(14, 165, 233, 0.10)' : '#e0f2fe');
    const borderColor = isWarning
      ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fde68a')
      : (isDark ? 'rgba(14, 165, 233, 0.25)' : '#bae6fd');

    const handleUpgradePress = () => {
      const message = encodeURIComponent(
        `Hello United Motors Team, we are currently testing the Vehicle Tracking App at ${activeBranchName} (Trial: ${trialInfo.daysRemaining} days left) and would like to inquire about upgrading to a full workshop license.`
      );
      const url = `https://wa.me/94770000000?text=${message}`;
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Linking.openURL(url).catch(() => {});
      }
    };

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleUpgradePress}
        style={[
          styles.stripContainer,
          {
            backgroundColor: bgColor,
            borderBottomColor: borderColor,
          },
        ]}
      >
        <View style={styles.contentRow}>
          {isWarning ? (
            <AlertTriangle size={12} color={accentColor} />
          ) : (
            <Sparkles size={12} color={accentColor} />
          )}
          <Text style={[styles.stripText, { color: accentColor }]} numberOfLines={1}>
            {isWarning
              ? `TRIAL EXPIRING SOON: ${trialInfo.daysRemaining} ${trialInfo.daysRemaining === 1 ? 'DAY' : 'DAYS'} LEFT`
              : `WORKSHOP TRIAL EVALUATION: ${trialInfo.daysRemaining} ${trialInfo.daysRemaining === 1 ? 'DAY' : 'DAYS'} REMAINING`}
          </Text>
          <View style={styles.actionPill}>
            <Text style={[styles.actionPillText, { color: accentColor }]}>Upgrade License</Text>
            <ChevronRight size={11} color={accentColor} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Priority 3: Licensed branch without break — completely invisible (zero height)
  return null;
};

const styles = StyleSheet.create({
  stripContainer: {
    paddingVertical: 5,
    paddingHorizontal: 16,
    width: '100%',
    zIndex: 99,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: 960,
  },
  stripText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  actionPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
