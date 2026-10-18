import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Platform, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export interface VehicleCardSkeletonProps {
  variant?: 'compact' | 'full';
  count?: number;
  style?: StyleProp<ViewStyle>;
}

export const VehicleCardSkeleton: React.FC<VehicleCardSkeletonProps> = ({
  variant = 'compact',
  count = 1,
  style,
}) => {
  const { colors, isDark } = useTheme();
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const skeletonBlockColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const cardBg = isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.02)';
  const cardBorder = colors.borderGlass;

  const items = Array.from({ length: count });

  if (variant === 'compact') {
    return (
      <View style={[styles.container, style]}>
        {items.map((_, idx) => (
          <Animated.View
            key={idx}
            style={[
              styles.compactCard,
              {
                backgroundColor: cardBg,
                borderColor: cardBorder,
                opacity: pulseAnim,
              },
            ]}
          >
            {/* Top Row: Plate & Badge Placeholder */}
            <View style={styles.rowBetween}>
              <View style={[styles.block, { width: 92, height: 22, borderRadius: 5, backgroundColor: skeletonBlockColor }]} />
              <View style={[styles.block, { width: 48, height: 18, borderRadius: 9, backgroundColor: skeletonBlockColor }]} />
            </View>

            {/* Middle Row: Tech Name & Timer Placeholder */}
            <View style={[styles.rowBetween, { marginTop: 8 }]}>
              <View style={[styles.block, { width: '45%', height: 10, borderRadius: 4, backgroundColor: skeletonBlockColor }]} />
              <View style={[styles.block, { width: 40, height: 10, borderRadius: 4, backgroundColor: skeletonBlockColor }]} />
            </View>

            {/* Bottom Row: Progress Line */}
            <View style={[styles.block, { width: '100%', height: 4, borderRadius: 2, marginTop: 10, backgroundColor: skeletonBlockColor }]} />
          </Animated.View>
        ))}
      </View>
    );
  }

  // Full Variant for TechnicianStationView and AdvisorInspectionView
  return (
    <View style={[styles.container, style]}>
      {items.map((_, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.fullCard,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
              opacity: pulseAnim,
            },
          ]}
        >
          {/* Header Row: Plate, Status Pill, Pin */}
          <View style={styles.rowBetween}>
            <View style={styles.rowLeft}>
              <View style={[styles.block, { width: 110, height: 26, borderRadius: 6, backgroundColor: skeletonBlockColor }]} />
              <View style={[styles.block, { width: 70, height: 20, borderRadius: 10, backgroundColor: skeletonBlockColor }]} />
            </View>
            <View style={[styles.block, { width: 26, height: 26, borderRadius: 13, backgroundColor: skeletonBlockColor }]} />
          </View>

          {/* Details Row: Tech info + Timer badge */}
          <View style={[styles.rowBetween, { marginTop: 12 }]}>
            <View style={[styles.block, { width: '38%', height: 12, borderRadius: 4, backgroundColor: skeletonBlockColor }]} />
            <View style={[styles.block, { width: 76, height: 18, borderRadius: 6, backgroundColor: skeletonBlockColor }]} />
          </View>

          {/* Progress Bar Skeleton */}
          <View style={[styles.block, { width: '100%', height: 6, borderRadius: 3, marginTop: 14, backgroundColor: skeletonBlockColor }]} />

          {/* Action Buttons Row */}
          <View style={[styles.rowBetween, { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderGlass }]}>
            <View style={[styles.block, { width: 100, height: 32, borderRadius: 8, backgroundColor: skeletonBlockColor }]} />
            <View style={[styles.block, { width: 130, height: 32, borderRadius: 8, backgroundColor: skeletonBlockColor }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 10,
  },
  compactCard: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  fullCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  block: {
    overflow: 'hidden',
  },
});
