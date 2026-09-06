import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, ActivityIndicator, Platform } from 'react-native';
import { Play, Bookmark, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Vehicle } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';
import { LicensePlate } from './LicensePlate';
import { VehicleNotePill } from './VehicleNotePill';
import { TimerPill } from './TimerPill';

export interface VehicleCardHeaderProps {
  vehicle: Vehicle;
  size?: 'sm' | 'md' | 'lg';
  elapsedText?: string;
  isStageIdle?: boolean;
  isTaskDone?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  canStartWork?: boolean;
  isStartingWork?: boolean;
  onStartWork?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showChevron?: boolean;
  rightAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const VehicleCardHeader: React.FC<VehicleCardHeaderProps> = ({
  vehicle,
  size = 'md',
  elapsedText,
  isStageIdle = false,
  isTaskDone = false,
  isPinned = false,
  onTogglePin,
  canStartWork = false,
  isStartingWork = false,
  onStartWork,
  isExpanded,
  onToggleExpand,
  showChevron = true,
  rightAccessory,
  style,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {/* Left: License Plate & Vehicle Urgent/Service Note Pill */}
      <View style={styles.plateGroup}>
        <LicensePlate number={vehicle.vehicle_no} size={size} />
        <VehicleNotePill vehicle={vehicle} size={size === 'sm' ? 'sm' : 'md'} compact />
      </View>

      {/* Right: Timer, Start Work Arrow, Pin Bookmark, Optional Accessory, and Chevron */}
      <View style={styles.rightGroup}>
        {rightAccessory}

        {Boolean(elapsedText) && (
          <TimerPill
            elapsedText={elapsedText!}
            variant={isTaskDone ? 'green' : isStageIdle ? 'amber' : 'cyan'}
            isPaused={isStageIdle}
            size={size === 'sm' ? 'sm' : 'md'}
          />
        )}

        {/* Start Work Arrowhead Button (Only when idle in a station) */}
        {isStageIdle && Boolean(onStartWork) && (
          <TouchableOpacity
            style={[
              styles.startWorkBtn,
              { backgroundColor: colors.primary },
              Platform.OS === 'web'
                ? ({ boxShadow: `0 2px 6px ${colors.primary}55` } as any)
                : { shadowColor: colors.primary },
              (!canStartWork || isStartingWork) && { opacity: 0.6 }
            ]}
            onPress={(e) => {
              e.stopPropagation();
              if (canStartWork && !isStartingWork && onStartWork) onStartWork();
            }}
            activeOpacity={0.7}
            disabled={!canStartWork || isStartingWork}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            {isStartingWork ? (
              <ActivityIndicator size={12} color="#ffffff" />
            ) : (
              <Play size={12} color="#ffffff" fill="#ffffff" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        )}

        {/* Pin Bookmark Toggle Button */}
        {Boolean(onTogglePin) && (
          <TouchableOpacity
            style={styles.pinBtn}
            onPress={(e) => {
              e.stopPropagation();
              onTogglePin!();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Bookmark
              size={size === 'sm' ? 14 : 16}
              color={isPinned ? '#f59e0b' : colors.textMuted}
              fill={isPinned ? '#f59e0b' : 'transparent'}
            />
          </TouchableOpacity>
        )}

        {/* Expand/Collapse Chevron Indicator */}
        {showChevron && Boolean(onToggleExpand) && (
          <TouchableOpacity
            style={[
              styles.chevronWrapper,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.borderGlass
              }
            ]}
            onPress={onToggleExpand}
            activeOpacity={0.7}
          >
            {isExpanded ? (
              <ChevronUp size={size === 'sm' ? 16 : 20} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={size === 'sm' ? 16 : 20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  plateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startWorkBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)' } as any)
      : {
          shadowColor: '#0284c7',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 3,
        }),
  },
  pinBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
