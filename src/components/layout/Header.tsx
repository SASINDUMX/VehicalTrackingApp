import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { chimeService } from '../../lib/chime';
import { hapticService } from '../../lib/haptics';
import { Car, Plus, LogOut, User, Volume2, VolumeX, ChevronDown, Shield, Smartphone } from 'lucide-react-native';

import { getCurrentActiveBreak } from '../../utils/workshopHoursUtils';

const ROLE_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  tech_workshop: 'Tech 1 · Workshop',
  tech_alignment: 'Tech 2 · Alignment',
  tech_hoist: 'Tech 3 · Hoist',
  advisor: 'Advisor',
};

export const Header: React.FC = () => {
  const { setIsAddModalOpen, isRealtimeConnected } = useVehicles();
  const { signOut, user } = useAuth();
  const { canAddVehicle, displayName, currentRole } = usePermissions();
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
      const d = new Date();
      setTimeStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setActiveBreak(getCurrentActiveBreak(d));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isRealtimeConnected) {
      Animated.loop(
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
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRealtimeConnected, pulseAnim]);

  const menuRef = React.useRef<View>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && isMenuOpen) {
      const handleOutsideClick = (e: MouseEvent) => {
        if (menuRef.current) {
          const domNode = menuRef.current as any;
          if (domNode && domNode.contains && !domNode.contains(e.target)) {
            setIsMenuOpen(false);
          }
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
    <View style={styles.headerContainer}>
      <View style={styles.brandRow}>
        <View style={styles.logoBox}>
          <Car size={24} color="#ffffff" />
        </View>
        <View style={styles.brandTextContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.brandTitle}>UNITED MOTORS</Text>
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
          <Text style={styles.brandSub}>
            {timeStr}
            {activeBreak && (
              <Text style={styles.breakPillText}> · ☕ {activeBreak.name} (Until {activeBreak.endStr})</Text>
            )}
          </Text>
        </View>
      </View>

      <View style={styles.rightGroup} ref={menuRef}>
        {/* Minimal Clickable Avatar Circle Button */}
        <TouchableOpacity
          style={[styles.avatarCircleBtn, isMenuOpen && styles.avatarCircleBtnActive]}
          onPress={() => setIsMenuOpen(!isMenuOpen)}
          activeOpacity={0.7}
        >
          <User size={20} color="#38bdf8" />
        </TouchableOpacity>

        {/* Expanding Dropdown Popover Menu */}
        {isMenuOpen && (
          <View style={styles.dropdownPopover}>
            {/* User Info Header */}
            <View style={styles.dropdownUserHeader}>
              <View style={styles.dropdownAvatarLarge}>
                <User size={22} color="#38bdf8" />
              </View>
              <View style={styles.dropdownTextGroup}>
                <Text style={styles.dropdownDisplayName}>{displayName}</Text>
                <Text style={styles.dropdownEmail} numberOfLines={1}>{user?.email || 'authenticated user'}</Text>
                <View style={styles.dropdownRoleChip}>
                  <Shield size={10} color="#38bdf8" />
                  <Text style={styles.dropdownRoleText}>{ROLE_LABELS[currentRole] || currentRole}</Text>
                </View>
              </View>
            </View>

            <View style={styles.dropdownDivider} />

            {/* Sound & Chime Toggle Option */}
            <TouchableOpacity style={styles.dropdownItem} onPress={toggleAudio}>
              {isAudioMuted ? (
                <>
                  <VolumeX size={16} color="#64748b" />
                  <Text style={styles.dropdownItemText}>Audio Chimes: Muted</Text>
                </>
              ) : (
                <>
                  <Volume2 size={16} color="#38bdf8" />
                  <Text style={[styles.dropdownItemText, { color: '#38bdf8' }]}>Audio Chimes: Enabled</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Haptic Vibration Toggle Option */}
            <TouchableOpacity style={styles.dropdownItem} onPress={toggleHaptics}>
              {isHapticsMuted ? (
                <>
                  <Smartphone size={16} color="#64748b" />
                  <Text style={styles.dropdownItemText}>Haptic Feedback: Disabled</Text>
                </>
              ) : (
                <>
                  <Smartphone size={16} color="#38bdf8" />
                  <Text style={[styles.dropdownItemText, { color: '#38bdf8' }]}>Haptic Feedback: Enabled</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.dropdownDivider} />

            {/* Sign Out Option */}
            <TouchableOpacity
              style={[styles.dropdownItem, styles.dropdownSignOutItem]}
              onPress={() => {
                setIsMenuOpen(false);
                signOut();
              }}
            >
              <LogOut size={16} color="#ef4444" />
              <Text style={styles.dropdownSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
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
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
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
  brandSub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  breakPillText: {
    color: '#fbbf24',
    fontWeight: '700',
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  dropdownSignOutItem: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dropdownSignOutText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
