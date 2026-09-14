import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  User,
  Shield,
  Building2,
  ChevronDown,
  Moon,
  Sun,
  Monitor,
  Volume2,
  VolumeX,
  Smartphone,
  ChevronLeft,
  FileText,
  RefreshCw,
  CloudOff,
  LogOut,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface UserProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  userEmail?: string | null;
  currentRole: string;
  section?: string | null;
  canSwitchBranch: boolean;
  activeBranchName: string;
  onOpenBranchSwitcher: () => void;
  isDark: boolean;
  themeMode: string;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
  isAudioMuted: boolean;
  toggleAudio: () => void;
  isHapticsMuted: boolean;
  toggleHaptics: () => void;
  isReportsModalOpen: boolean;
  onToggleReports: () => void;
  outboxPendingCount: number;
  isOutboxSyncing: boolean;
  onDrainOutbox: () => void;
  onSignOut: () => void;
}

const getRoleBadge = (role: string, section?: string | null): string => {
  if (role === 'super_admin') return 'Super Admin · HQ';
  if (role === 'foreman' && section) return `Foreman · ${section.toUpperCase()}`;
  return (APP_TERMINOLOGY.roles as any)[role]?.badge || role;
};

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({
  isOpen,
  onClose,
  displayName,
  userEmail,
  currentRole,
  section,
  canSwitchBranch,
  activeBranchName,
  onOpenBranchSwitcher,
  isDark,
  themeMode,
  setThemeMode,
  toggleTheme,
  isAudioMuted,
  toggleAudio,
  isHapticsMuted,
  toggleHaptics,
  isReportsModalOpen,
  onToggleReports,
  outboxPendingCount,
  isOutboxSyncing,
  onDrainOutbox,
  onSignOut,
}) => {
  const { colors } = useTheme();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop to capture clicks outside popover */}
      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
      )}

      <View
        style={[styles.dropdownPopover, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlassBright }]}
        {...(Platform.OS === 'web' ? ({ id: 'profile-dropdown-menu' } as any) : {})}
      >
        {/* User Identity Info */}
        <View style={styles.dropdownUserHeader}>
          <View style={[styles.dropdownAvatarLarge, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
            <User size={22} color={colors.primaryLight} />
          </View>
          <View style={styles.dropdownTextGroup}>
            <Text style={[styles.dropdownDisplayName, { color: colors.textPrimary }]}>{displayName}</Text>
            <Text style={[styles.dropdownEmail, { color: colors.textMuted }]} numberOfLines={1}>{userEmail || 'authenticated user'}</Text>
            <View style={[styles.dropdownRoleChip, { backgroundColor: colors.primaryDim }]}>
              <Shield size={10} color={colors.primaryLight} />
              <Text style={[styles.dropdownRoleText, { color: colors.primaryLight }]}>{getRoleBadge(currentRole, section)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />

        {/* Branch info row */}
        <TouchableOpacity
          style={styles.dropdownItem}
          onPress={() => {
            if (canSwitchBranch) {
              onClose();
              onOpenBranchSwitcher();
            }
          }}
          activeOpacity={canSwitchBranch ? 0.7 : 1}
        >
          <Building2 size={16} color={colors.primaryLight} />
          <View style={styles.flexOne}>
            <Text style={[styles.dropdownItemText, { color: colors.textPrimary }]} numberOfLines={1}>
              {activeBranchName}
            </Text>
            {canSwitchBranch && (
              <Text style={[styles.subHintText, { color: colors.textMuted }]}>Tap to switch branch</Text>
            )}
          </View>
          {canSwitchBranch && <ChevronDown size={14} color={colors.textMuted} />}
        </TouchableOpacity>

        <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />

        {/* Theme Toggle Option */}
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

        {/* Audio Chime Toggle */}
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

        {/* Haptic Vibration Toggle */}
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

        {/* Service Reports Toggle */}
        <TouchableOpacity
          style={styles.dropdownItem}
          onPress={() => {
            onClose();
            onToggleReports();
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

        {/* Offline Actions Outbox Status */}
        {outboxPendingCount > 0 && (
          <TouchableOpacity
            style={[styles.dropdownItem, { backgroundColor: colors.warningDim }]}
            onPress={onDrainOutbox}
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
            onClose();
            onSignOut();
          }}
        >
          <LogOut size={16} color={colors.danger} />
          <Text style={[styles.dropdownSignOutText, { color: colors.danger }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  menuBackdrop: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 109,
    backgroundColor: 'transparent',
  },
  dropdownPopover: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 260,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    zIndex: 110,
    elevation: 8,
  },
  dropdownUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  dropdownAvatarLarge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dropdownTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  dropdownDisplayName: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  dropdownEmail: {
    fontSize: 11,
  },
  dropdownRoleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  dropdownRoleText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  dropdownDivider: {
    height: 1,
    marginVertical: 2,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  dropdownItemText: {
    fontSize: 12,
    fontWeight: '600',
  },
  flexOne: {
    flex: 1,
  },
  subHintText: {
    fontSize: 10,
    marginTop: 1,
  },
  dropdownThemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownThemeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  tinyAutoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tinyAutoText: {
    fontSize: 10,
  },
  dropdownSignOutItem: {
    marginTop: 2,
  },
  dropdownSignOutText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
