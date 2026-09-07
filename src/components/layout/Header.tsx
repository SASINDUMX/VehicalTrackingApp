import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Image } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { chimeService } from '../../lib/chime';
import { hapticService } from '../../lib/haptics';
import { LogOut, User, Volume2, VolumeX, Shield, Smartphone, Sun, Moon, Monitor, FileText, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const appLogo = require('../../../assets/icon.png');

import { getCurrentActiveBreak } from '../../utils/workshopHoursUtils';
import { APP_TERMINOLOGY } from '../../constants/terminology';

const getHeaderRoleBadge = (role: string, section?: string): string => {
  if (role === 'foreman' && section) {
    return `Foreman · ${section.toUpperCase()}`;
  }
  return (APP_TERMINOLOGY.roles as any)[role]?.badge || role;
};

export const Header: React.FC = () => {
  const { isReportsModalOpen, setIsReportsModalOpen, isRealtimeConnected } = useVehicles();
  const { signOut, user } = useAuth();
  const { displayName, currentRole, section } = usePermissions();
  const { themeMode, isDark, colors, setThemeMode, toggleTheme } = useTheme();
  const [timeStr, setTimeStr] = useState<string>('');
  const [activeBreak, setActiveBreak] = useState<{ name: string; endStr: string } | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(chimeService.getMuted());
  const [isHapticsMuted, setIsHapticsMuted] = useState<boolean>(hapticService.getMuted());
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  
  // Pulse Animation
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

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
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      setTimeStr(now.toLocaleDateString('en-US', options));
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
              <Text style={[styles.brandSub, { color: colors.textMuted }]}>{timeStr}</Text>
            </View>
          </View>
        </View>

        <View
          style={styles.rightGroup}
          {...(Platform.OS === 'web' ? ({ id: 'profile-menu-container' } as any) : {})}
        >
          {/* Reports / Back Toggle Button */}
          <TouchableOpacity
            style={[
              styles.reportsBtn,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.borderGlass }
            ]}
            onPress={() => setIsReportsModalOpen(!isReportsModalOpen)}
            activeOpacity={0.8}
          >
            {isReportsModalOpen ? (
              <>
                <ChevronLeft size={15} color={colors.primaryLight} />
                <Text style={[styles.reportsBtnText, { color: colors.textPrimary }]}>{APP_TERMINOLOGY.navigation.back}</Text>
              </>
            ) : (
              <>
                <FileText size={15} color={colors.primaryLight} />
                <Text style={[styles.reportsBtnText, { color: colors.textPrimary }]}>{APP_TERMINOLOGY.navigation.reports}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* User Profile Avatar Trigger */}
          <TouchableOpacity
            style={[
              styles.avatarCircleBtn,
              { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder },
              isMenuOpen && styles.avatarCircleBtnActive,
            ]}
            onPress={() => setIsMenuOpen(!isMenuOpen)}
            activeOpacity={0.8}
          >
            <User size={20} color={colors.primaryLight} />
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
    </>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
  },
  logoBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
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
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  brandTextContainer: {
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1.2,
  },
  statusContainer: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: '#10b981',
  },
  dotOffline: {
    backgroundColor: '#ef4444',
  },
  dotPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
  },
  brandSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  brandSub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  breakStrip: {
    paddingVertical: 5,
    paddingHorizontal: 16,
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
    position: 'relative',
  },
  avatarCircleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(14, 165, 233, 0.5)',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 2px 6px rgba(14, 165, 233, 0.3)' } as any)
      : {
          shadowColor: '#0ea5e9',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 4,
        }),
  },
  avatarCircleBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 165, 233, 0.3)',
    transform: [{ scale: 1.05 }],
  },
  dropdownPopover: {
    position: 'absolute',
    top: 44,
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
  reportsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  reportsBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dropdownSignOutItem: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dropdownSignOutText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
