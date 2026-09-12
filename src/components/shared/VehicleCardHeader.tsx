import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, ActivityIndicator, Platform } from 'react-native';
import { Play, Bookmark, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Vehicle } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';
import { LicensePlate } from './LicensePlate';
import { VehicleNotePill } from './VehicleNotePill';
import { TimerPill } from './TimerPill';
import { StatusPill } from './StatusPill';

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

  const hasBadges = Boolean(
    vehicle.is_paused ||
    vehicle.is_booking ||
    vehicle.has_additional_repairs ||
    vehicle.is_urgent ||
    (vehicle.remarks && vehicle.remarks.trim().length > 0)
  );

  return (
    <View style={[styles.wrapper, style]}>
      {/* Unified Single Header Row: Plate & Badges flowing on Left, Actions on Right */}
      <View style={styles.topRow}>
        <View style={styles.leftGroup}>
          <LicensePlate number={vehicle.vehicle_no} size={size} />

          {/* Inline Badges (flows seamlessly right after the license plate) */}
          {vehicle.is_paused && (
            <StatusPill variant="warning" label="⏸ ON HOLD" size={size === 'sm' ? 'sm' : 'md'} />
          )}
          {vehicle.is_booking && (
            <StatusPill variant="neutral" label="📅 BOOKED" size={size === 'sm' ? 'sm' : 'md'} />
          )}
          {vehicle.has_additional_repairs && (
            <StatusPill variant="warning" label="🔧 EXTRA" size={size === 'sm' ? 'sm' : 'md'} />
          )}
          <VehicleNotePill vehicle={vehicle} size={size === 'sm' ? 'sm' : 'md'} />
        </View>

        {/* Right Action Group: Timer, Start Button, Pin, Accessories & Chevron */}
        <View style={styles.rightGroup}>
          {rightAccessory}

          {(Boolean(elapsedText) || (vehicle && vehicle.current_zone !== 'inspection' && !vehicle.is_finished)) && (
            <TimerPill
              elapsedText={elapsedText}
              vehicle={elapsedText ? undefined : vehicle}
              variant={isTaskDone ? 'green' : isStageIdle ? 'amber' : 'cyan'}
              isPaused={isStageIdle}
              size={size === 'sm' ? 'sm' : 'md'}
            />
          )}

          {/* Start Work Action Button (Prominent when idle in a station) */}
          {isStageIdle && Boolean(onStartWork) && (
            <TouchableOpacity
              style={[
                styles.startWorkBtn,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primaryBorder,
                },
                Platform.OS === 'web'
                  ? ({ boxShadow: `0 0 10px ${colors.primary}66` } as any)
                  : { shadowColor: colors.primary },
                (!canStartWork || isStartingWork) && { opacity: 0.6 }
              ]}
              onPress={(e) => {
                e.stopPropagation();
                if (canStartWork && !isStartingWork && onStartWork) onStartWork();
              }}
              activeOpacity={0.7}
              disabled={!canStartWork || isStartingWork}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isStartingWork ? (
                <ActivityIndicator size={12} color="#ffffff" />
              ) : (
                <Play size={11} color="#ffffff" fill="#ffffff" style={{ marginLeft: 1 }} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  startWorkBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
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
