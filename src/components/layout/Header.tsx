import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Image, Easing } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { chimeService } from '../../lib/chime';
import { hapticService } from '../../lib/haptics';
import { LogOut, User, Volume2, VolumeX, Shield, Smartphone, Sun, Moon, Monitor, FileText, ChevronLeft, Building2, ChevronDown, MapPin, CloudOff, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const appLogo = require('../../../assets/icon.png');

import { getCurrentActiveBreak } from '../../utils/workshopHoursUtils';
import { APP_TERMINOLOGY } from '../../constants/terminology';

const getHeaderRoleBadge = (role: string, section?: string): string => {
  if (role === 'super_admin') {
    return 'Super Admin · HQ';
  }
  if (role === 'foreman' && section) {
    return `Foreman · ${section.toUpperCase()}`;
  }
  return (APP_TERMINOLOGY.roles as any)[role]?.badge || role;
};

export const Header: React.FC = () => {
  const {
    isReportsModalOpen,
    setIsReportsModalOpen,
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

  // Spin Animation for manual refresh button
  const [isRefreshing, setIsRefreshing] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      spinAnim.setValue(0);
    });

    try {
      if (refreshVehicles) {
        await refreshVehicles();
      }
    } catch (err) {
      console.warn('Manual refresh failed:', err);
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
            </View>
            <View style={styles.brandSubRow}>
              <Text style={[styles.brandSub, { color: colors.textMuted }]} numberOfLines={1}>{timeStr}</Text>
              {/* Branch Badge — tappable for AGM/Manager */}
              <TouchableOpacity
                onPress={() => canSwitchBranch && setIsBranchSwitcherOpen(true)}
                activeOpacity={canSwitchBranch ? 0.7 : 1}
                style={[
                  styles.branchPill,
                  {
                    backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : '#e0f2fe',
                    borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#bae6fd',
                  },
                ]}
              >
                <MapPin size={9} color={isDark ? '#38bdf8' : '#0284c7'} />
                <Text style={[styles.branchPillText, { color: isDark ? '#38bdf8' : '#0284c7' }]}>
                  {activeBranchCode}
                </Text>
                {canSwitchBranch && <ChevronDown size={9} color={isDark ? '#38bdf8' : '#0284c7'} />}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={styles.rightGroup}
          {...(Platform.OS === 'web' ? ({ id: 'profile-menu-container' } as any) : {})}
        >
          {/* Offline Outbox Queue Status Indicator */}
          {outboxPendingCount > 0 && (
            <TouchableOpacity
              style={[
                styles.outboxBadge,
                {
                  backgroundColor: isOutboxSyncing
                    ? (isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe')
                    : (isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7'),
                  borderColor: isOutboxSyncing
                    ? (isDark ? 'rgba(56, 189, 248, 0.4)' : '#7dd3fc')
                    : (isDark ? 'rgba(245, 158, 11, 0.4)' : '#fcd34d'),
                }
              ]}
              onPress={() => drainOutbox()}
              disabled={isOutboxSyncing}
              activeOpacity={0.7}
            >
              {isOutboxSyncing ? (
                <>
                  <RefreshCw size={11} color={isDark ? '#38bdf8' : '#0284c7'} />
                  <Text style={[styles.outboxBadgeText, { color: isDark ? '#38bdf8' : '#0284c7' }]}>
                    Syncing {outboxPendingCount}...
                  </Text>
                </>
              ) : (
                <>
                  <CloudOff size={11} color={isDark ? '#fbbf24' : '#d97706'} />
                  <Text style={[styles.outboxBadgeText, { color: isDark ? '#fbbf24' : '#d97706' }]}>
                    {outboxPendingCount} Queued
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Realtime Connection Status Dot Pill */}
          <View style={[
            styles.liveIndicatorPill,
            {
              backgroundColor: isRealtimeConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              borderColor: isRealtimeConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            }
          ]}>
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

          {/* Manual Refresh Button (Square squircle matching profile) */}
          <TouchableOpacity
            style={[
              styles.squareIconBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.borderGlass,
              },
              isRefreshing && { borderColor: colors.primary },
            ]}
            onPress={handleRefresh}
            activeOpacity={0.7}
            disabled={isRefreshing}
          >
            <Animated.View style={{ transform: [{ rotate: spinRotate }] }}>
              <RefreshCw size={14} color={isRefreshing ? colors.primaryLight : colors.textSecondary} />
            </Animated.View>
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
          {isMenuOpen && (
            <View style={[styles.dropdownPopover, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlassBright }]}>
              {/* User Identity Info */}
              <View style={styles.dropdownUserHeader}>
                <View style={[styles.dropdownAvatarLarge, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
                  <User size={22} color={colors.primaryLight} />
                </View>
                <View style={styles.dropdownTextGroup}>
                  <Text style={[styles.dropdownDisplayName, { color: colors.textPrimary }]}>{displayName}</Text>
                  <Text style={[styles.dropdownEmail, { color: colors.textMuted }]} numberOfLines={1}>{user?.email || 'authenticated user'}</Text>
                  <View style={[styles.dropdownRoleChip, { backgroundColor: colors.primaryDim }]}>
                    <Shield size={10} color={colors.primaryLight} />
                    <Text style={[styles.dropdownRoleText, { color: colors.primaryLight }]}>{getHeaderRoleBadge(currentRole, section)}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />

              {/* Branch info row (always visible) */}
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  if (canSwitchBranch) {
                    setIsMenuOpen(false);
                    setIsBranchSwitcherOpen(true);
                  }
                }}
                activeOpacity={canSwitchBranch ? 0.7 : 1}
              >
                <Building2 size={16} color={colors.primaryLight} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownItemText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {activeBranchName}
                  </Text>
                  {canSwitchBranch && (
                    <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>Tap to switch branch</Text>
                  )}
                </View>
                {canSwitchBranch && <ChevronDown size={14} color={colors.textMuted} />}
              </TouchableOpacity>

              <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />

              {/* Theme Toggle Option with tiny Auto button on the right */}
              <View style={styles.dropdownThemeRow}>
                <TouchableOpacity
                  style={styles.dropdownThemeLeft}
                  onPress={toggleTheme}
                  activeOpacity={0.7}
                >
                  {isDark ? (
                    <>
                      <Moon size={16} color={colors.purpleLight} />
                      <Text style={[styles.dropdownItemText, { color: colors.purpleLight }]}>
                        Theme: Dark
                      </Text>
                    </>
                  ) : (
                    <>
                      <Sun size={16} color={colors.warning} />
                      <Text style={[styles.dropdownItemText, { color: colors.warning }]}>
                        Theme: Light
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Tiny Auto Button on Right */}
                <TouchableOpacity
                  style={[
                    styles.tinyAutoBtn,
                    {
                      backgroundColor: themeMode === 'system'
                        ? colors.primaryDim
                        : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                      borderColor: themeMode === 'system' ? colors.primary : colors.borderGlass,
                    }
                  ]}
                  onPress={() => setThemeMode(themeMode === 'system' ? (isDark ? 'dark' : 'light') : 'system')}
                  activeOpacity={0.7}
                >
                  <Monitor size={11} color={themeMode === 'system' ? colors.primaryLight : colors.textMuted} />
                  <Text style={[
                    styles.tinyAutoText,
                    {
                      color: themeMode === 'system' ? colors.primaryLight : colors.textMuted,
                      fontWeight: themeMode === 'system' ? '800' : '600'
                    }
                  ]}>
                    Auto
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sound & Chime Toggle Option */}
              <TouchableOpacity style={styles.dropdownItem} onPress={toggleAudio}>
                {isAudioMuted ? (
                  <>
                    <VolumeX size={16} color={colors.textMuted} />
                    <Text style={[styles.dropdownItemText, { color: colors.textMuted }]}>Audio Chimes: Muted</Text>
                  </>
                ) : (
                  <>
                    <Volume2 size={16} color={colors.primaryLight} />
                    <Text style={[styles.dropdownItemText, { color: colors.primaryLight }]}>Audio Chimes: Enabled</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Haptic Vibration Toggle Option */}
              <TouchableOpacity style={styles.dropdownItem} onPress={toggleHaptics}>
                {isHapticsMuted ? (
                  <>
                    <Smartphone size={16} color={colors.textMuted} />
                    <Text style={[styles.dropdownItemText, { color: colors.textMuted }]}>Haptic Feedback: Disabled</Text>
                  </>
                ) : (
                  <>
                    <Smartphone size={16} color={colors.primaryLight} />
                    <Text style={[styles.dropdownItemText, { color: colors.primaryLight }]}>Haptic Feedback: Enabled</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Service Reports Toggle Option */}
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuOpen(false);
                  setIsReportsModalOpen(!isReportsModalOpen);
                }}
              >
                {isReportsModalOpen ? (
                  <>
                    <ChevronLeft size={16} color={colors.primaryLight} />
                    <Text style={[styles.dropdownItemText, { color: colors.textPrimary }]}>Back to Bays</Text>
                  </>
                ) : (
                  <>
                    <FileText size={16} color={colors.primaryLight} />
                    <Text style={[styles.dropdownItemText, { color: colors.textPrimary }]}>Service Reports & Exports</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Offline Actions Outbox Status in Dropdown */}
              {outboxPendingCount > 0 && (
                <TouchableOpacity
                  style={[styles.dropdownItem, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb' }]}
                  onPress={() => {
                    drainOutbox();
                  }}
                  disabled={isOutboxSyncing}
                  activeOpacity={0.7}
                >
                  {isOutboxSyncing ? (
                    <>
                      <RefreshCw size={16} color={colors.primaryLight} />
                      <Text style={[styles.dropdownItemText, { color: colors.primaryLight }]}>
                        Syncing {outboxPendingCount} offline actions...
                      </Text>
                    </>
                  ) : (
                    <>
                      <CloudOff size={16} color={colors.warning} />
                      <Text style={[styles.dropdownItemText, { color: colors.warning }]}>
                        Sync {outboxPendingCount} Offline Action{outboxPendingCount > 1 ? 's' : ''} Now
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />

              {/* Sign Out Option */}
              <TouchableOpacity
                style={[styles.dropdownItem, styles.dropdownSignOutItem]}
                onPress={() => {
                  setIsMenuOpen(false);
                  signOut();
                }}
              >
                <LogOut size={16} color={colors.danger} />
                <Text style={[styles.dropdownSignOutText, { color: colors.danger }]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Slender Single-Line Shift Break Strip (Directly Beneath Header) */}
      {activeBreak && (
        <View style={[styles.breakStrip, { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderBottomWidth: 1, borderBottomColor: '#f59e0b' }]}>
          <Text style={[styles.breakStripText, { color: '#fbbf24' }]} numberOfLines={1}>
            {activeBreak.name.toUpperCase()} BREAK: (UNTIL {activeBreak.endStr}) · TIMERS PAUSED
          </Text>
        </View>
      )}

      {/* Branch Switcher Sheet — Super Admin only */}
      {isBranchSwitcherOpen && canSwitchBranch && (
        <TouchableOpacity
          style={styles.branchOverlay}
          activeOpacity={1}
          onPress={() => setIsBranchSwitcherOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.branchSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlassBright }]}
          >
            <View style={styles.branchSheetHeader}>
              <Building2 size={16} color={colors.primaryLight} />
              <Text style={[styles.branchSheetTitle, { color: colors.textPrimary }]}>Switch Branch</Text>
            </View>
            <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />
            {availableBranches.map(branch => {
              const isActive = branch.id === activeBranchCode.toLowerCase() ||
                availableBranches.find(b => b.code === activeBranchCode)?.id === branch.id;
              return (
                <TouchableOpacity
                  key={branch.id}
                  style={[
                    styles.branchOption,
                    isActive && { backgroundColor: colors.primaryDim, borderRadius: 8 }
                  ]}
                  onPress={() => {
                    switchBranch(branch.id);
                    setIsBranchSwitcherOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <MapPin size={14} color={isActive ? colors.primaryLight : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownItemText, { color: isActive ? colors.primaryLight : colors.textPrimary }]}>
                      {branch.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{branch.city} · {branch.code}</Text>
                  </View>
                  {isActive && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryLight }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
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
  breakStrip: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: 99,
  },
  breakStripText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
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
  liveIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  liveIndicatorText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  dropdownPopover: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 260,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 12,
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.5)' } as any)
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
          elevation: 12,
        }),
    zIndex: 999,
  },
  dropdownUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  dropdownAvatarLarge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTextGroup: {
    flex: 1,
    gap: 2,
  },
  dropdownDisplayName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownEmail: {
    color: '#94a3b8',
    fontSize: 11,
  },
  dropdownRoleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  dropdownRoleText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 2,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dropdownItemText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownThemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dropdownThemeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  tinyAutoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tinyAutoText: {
    fontSize: 11,
  },
  dropdownSignOutItem: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dropdownSignOutText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
  branchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 998,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: 60,
    paddingLeft: 12,
  },
  branchSheet: {
    width: 300,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 8px 24px rgba(0,0,0,0.6)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.6,
          shadowRadius: 20,
          elevation: 16,
        }),
  },
  branchSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  branchSheetTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  outboxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  outboxBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
