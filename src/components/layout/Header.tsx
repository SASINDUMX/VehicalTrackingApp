import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Image, Easing } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { chimeService } from '../../lib/chime';
import { hapticService } from '../../lib/haptics';
import { User, FileText, ChevronLeft, ChevronDown, MapPin, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentActiveBreak } from '../../utils/workshopHoursUtils';
import { BranchSelectorSheet } from './BranchSelectorSheet';
import { BreakAlertBanner } from './BreakAlertBanner';
import { UserProfileMenu } from './UserProfileMenu';

const appLogo = require('../../../assets/icon.png');

export const Header: React.FC = () => {
  const {
    isReportsModalOpen,
    setIsReportsModalOpen,
    triggerReportsRefresh,
    isRealtimeConnected,
    outboxPendingCount,
    isOutboxSyncing,
    drainOutbox,
    refreshVehicles,
  } = useVehicles();
  const { signOut, user, activeBranchCode, activeBranchName, availableBranches, switchBranch } = useAuth();
  const { displayName, currentRole, section, canSwitchBranch } = usePermissions();
  const { themeMode, isDark, colors, setThemeMode, toggleTheme } = useTheme();
  const [timeStr, setTimeStr] = useState<string>('');
  const [activeBreak, setActiveBreak] = useState<{ name: string; endStr: string } | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(chimeService.getMuted());
  const [isHapticsMuted, setIsHapticsMuted] = useState<boolean>(hapticService.getMuted());
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isBranchSwitcherOpen, setIsBranchSwitcherOpen] = useState<boolean>(false);

  // Pulse Animation for live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Spin Animation for manual refresh & outbox sync
  const [isRefreshing, setIsRefreshing] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Continuous spin loop when background outbox sync is in progress
  useEffect(() => {
    let loopAnim: Animated.CompositeAnimation | null = null;
    if (isOutboxSyncing) {
      loopAnim = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 750,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        })
      );
      loopAnim.start();
    } else if (!isRefreshing) {
      spinAnim.setValue(0);
    }
    return () => {
      if (loopAnim) {
        loopAnim.stop();
      }
    };
  }, [isOutboxSyncing, isRefreshing, spinAnim]);

  const handleRefresh = async () => {
    if (isRefreshing || isOutboxSyncing) return;
    setIsRefreshing(true);
    if (!isOutboxSyncing) {
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        if (!isOutboxSyncing) spinAnim.setValue(0);
      });
    }

    try {
      if (outboxPendingCount > 0 && drainOutbox) {
        await drainOutbox();
      }
      if (isReportsModalOpen && triggerReportsRefresh) {
        triggerReportsRefresh();
      }
      if (refreshVehicles) {
        await refreshVehicles();
      }
    } catch (err) {
      console.warn('Manual refresh/sync failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const spinRotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const toggleAudio = () => {
    const nextMuted = !isAudioMuted;
    chimeService.setMuted(nextMuted);
    setIsAudioMuted(nextMuted);
    if (!nextMuted) {
      chimeService.playArrivalChime();
    }
  };

  const toggleHaptics = () => {
    const nextMuted = !isHapticsMuted;
    hapticService.setMuted(nextMuted);
    setIsHapticsMuted(nextMuted);
    if (!nextMuted) {
      hapticService.triggerArrivalHaptic();
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      });
      setTimeStr(`${dateFormatter.format(now)} · ${timeFormatter.format(now)}`);
      setActiveBreak(getCurrentActiveBreak(now));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Heartbeat pulse animation
  useEffect(() => {
    if (isRealtimeConnected) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.5,
            duration: 1000,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isRealtimeConnected, pulseAnim]);

  // Click outside listener for web to close menu
  useEffect(() => {
    if (Platform.OS === 'web' && isMenuOpen) {
      const handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('#profile-menu-container')) {
          setIsMenuOpen(false);
        }
      };
      const timer = setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleOutsideClick);
      };
    }
  }, [isMenuOpen]);

  return (
    <>
      <View style={[styles.headerContainer, { backgroundColor: colors.surface, borderBottomColor: colors.borderGlass }]}>
        <View style={styles.brandRow}>
          <View style={[styles.logoBox, { borderColor: colors.borderGlass }]}>
            <Image
              source={appLogo}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.brandTextContainer}>
            <View style={styles.titleRow}>
              <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>UNITED MOTORS</Text>
              <View style={styles.statusContainer}>
                {isRealtimeConnected && (
                  <Animated.View
                    style={[
                      styles.dotPulse,
                      { transform: [{ scale: pulseAnim }], opacity: pulseAnim.interpolate({ inputRange: [1, 1.5], outputRange: [0.8, 0] }) }
                    ]}
                  />
                )}
                <View style={[styles.statusDot, isRealtimeConnected ? styles.dotOnline : styles.dotOffline]} />
              </View>
            </View>
            <View style={styles.brandSubRow}>
              {/* Branch / Section Badge — moved to left of row */}
              <TouchableOpacity
                onPress={() => canSwitchBranch && setIsBranchSwitcherOpen(true)}
                activeOpacity={canSwitchBranch ? 0.7 : 1}
                style={[
                  styles.branchPill,
                  {
                    backgroundColor: colors.primaryDim,
                    borderColor: colors.primaryBorder,
                  },
                ]}
              >
                <MapPin size={9} color={isDark ? colors.primaryLight : colors.primary} />
                <Text style={[styles.branchPillText, { color: isDark ? colors.primaryLight : colors.primary }]}>
                  {activeBranchCode}
                </Text>
                {canSwitchBranch && <ChevronDown size={9} color={isDark ? colors.primaryLight : colors.primary} />}
              </TouchableOpacity>
              <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>{timeStr}</Text>
            </View>
          </View>
        </View>

        <View
          style={styles.rightGroup}
          {...(Platform.OS === 'web' ? ({ id: 'profile-menu-container' } as any) : {})}
        >
          {/* Unified Refresh & Offline Sync Button */}
          <TouchableOpacity
            style={[
              styles.squareIconBtn,
              {
                backgroundColor: outboxPendingCount > 0
                  ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#fef3c7')
                  : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                borderColor: outboxPendingCount > 0
                  ? colors.warning
                  : (isRefreshing || isOutboxSyncing ? colors.primary : colors.borderGlass),
              },
            ]}
            onPress={handleRefresh}
            activeOpacity={0.7}
            disabled={isRefreshing || isOutboxSyncing}
            {...(Platform.OS === 'web'
              ? ({
                  title: outboxPendingCount > 0
                    ? `${outboxPendingCount} action(s) queued for sync. Click to sync and refresh.`
                    : 'Refresh workshop telemetry',
                } as any)
              : {})}
          >
            <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
              <RefreshCw
                size={14}
                color={
                  outboxPendingCount > 0
                    ? colors.warning
                    : isRefreshing || isOutboxSyncing
                    ? colors.primaryLight
                    : colors.textSecondary
                }
              />
            </Animated.View>

            {/* Offline Pending Actions Badge */}
            {outboxPendingCount > 0 && (
              <View
                style={[
                  styles.syncBadge,
                  {
                    backgroundColor: isOutboxSyncing ? colors.primary : colors.warning,
                    borderColor: isDark ? '#0f172a' : '#ffffff',
                  },
                ]}
              >
                <Text style={styles.syncBadgeText}>
                  {outboxPendingCount > 99 ? '99+' : outboxPendingCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Reports / Back Toggle Button (Square squircle matching profile) */}
          <TouchableOpacity
            style={[
              styles.squareIconBtn,
              isReportsModalOpen
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.borderGlass },
            ]}
            onPress={() => setIsReportsModalOpen(!isReportsModalOpen)}
            activeOpacity={0.8}
          >
            {isReportsModalOpen ? (
              <ChevronLeft size={16} color="#ffffff" />
            ) : (
              <FileText size={15} color={colors.primaryLight} />
            )}
          </TouchableOpacity>

          {/* User Profile Avatar Trigger (Square squircle) */}
          <TouchableOpacity
            style={[
              styles.squareIconBtn,
              { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder },
              isMenuOpen && styles.squareIconBtnActive,
            ]}
            onPress={() => setIsMenuOpen(!isMenuOpen)}
            activeOpacity={0.8}
          >
            <User size={17} color={colors.primaryLight} />
          </TouchableOpacity>

          {/* Profile Dropdown Popover */}
          <UserProfileMenu
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            displayName={displayName}
            userEmail={user?.email}
            currentRole={currentRole}
            section={section}
            canSwitchBranch={canSwitchBranch}
            activeBranchName={activeBranchName}
            onOpenBranchSwitcher={() => {
              setIsMenuOpen(false);
              setIsBranchSwitcherOpen(true);
            }}
            isDark={isDark}
            themeMode={themeMode}
            setThemeMode={setThemeMode}
            toggleTheme={toggleTheme}
            isAudioMuted={isAudioMuted}
            toggleAudio={toggleAudio}
            isHapticsMuted={isHapticsMuted}
            toggleHaptics={toggleHaptics}
            isReportsModalOpen={isReportsModalOpen}
            onToggleReports={() => setIsReportsModalOpen(!isReportsModalOpen)}
            outboxPendingCount={outboxPendingCount}
            isOutboxSyncing={isOutboxSyncing}
            onDrainOutbox={drainOutbox}
            onSignOut={() => {
              setIsMenuOpen(false);
              signOut();
            }}
          />
        </View>
      </View>

      {/* Slender Single-Line Shift Break Strip (Directly Beneath Header) */}
      <BreakAlertBanner activeBreak={activeBreak} />

      {/* Branch Switcher Sheet — Super Admin only */}
      {canSwitchBranch && (
        <BranchSelectorSheet
          isOpen={isBranchSwitcherOpen}
          onClose={() => setIsBranchSwitcherOpen(false)}
          availableBranches={availableBranches}
          activeBranchCode={activeBranchCode}
          onSelectBranch={switchBranch}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0b0f19',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 100,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#0b0f19',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.35)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 4,
        }),
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  brandTextContainer: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13.5,
    letterSpacing: 0.8,
  },
  sectionBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    marginTop: 1,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
  },
  branchPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  brandSub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    position: 'relative',
  },
  squareIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
  },
  squareIconBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 165, 233, 0.3)',
  },
  statusContainer: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOnline: {
    backgroundColor: '#10b981',
  },
  dotOffline: {
    backgroundColor: '#ef4444',
  },
  dotPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
  },
  syncBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
  },
  syncBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 11,
  },
});
