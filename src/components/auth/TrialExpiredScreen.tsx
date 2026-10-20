import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Linking, SafeAreaView, StatusBar } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ShieldAlert, Clock, Building2, LogOut, MessageSquare, ChevronDown } from 'lucide-react-native';
import { BranchSelectorSheet } from '../layout/BranchSelectorSheet';

const appLogo = require('../../../assets/icon.png');

export const TrialExpiredScreen: React.FC = () => {
  const {
    signOut,
    activeBranchId,
    activeBranchName,
    activeBranchCode,
    trialInfo,
    userProfile,
    availableBranches,
    switchBranch,
  } = useAuth();
  const { colors, isDark } = useTheme();
  const [isBranchSwitcherOpen, setIsBranchSwitcherOpen] = useState(false);

  const canSwitchBranch = userProfile?.role === 'super_admin';

  const formattedExpiry = trialInfo.expiresAt
    ? new Date(trialInfo.expiresAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Recently';

  const handleWhatsAppContact = () => {
    const text = encodeURIComponent(
      `Hello United Motors Team, our trial evaluation period for "${activeBranchName}" has concluded. We would like to upgrade to a permanent workshop license.`
    );
    const url = `https://wa.me/94757656427?text=${text}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleEmailContact = () => {
    const subject = encodeURIComponent(`License Upgrade Request - ${activeBranchName}`);
    const body = encodeURIComponent(
      `Hello United Motors Team,\n\nOur evaluation trial has concluded at branch "${activeBranchName}" (${activeBranchCode}).\nPlease contact us with commercial license and deployment details.\n\nThank you.`
    );
    const url = `mailto:mxsasindushalika@gmail.com?subject=${subject}&body=${body}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

      <View style={styles.centerWrapper}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderGlass,
            },
          ]}
        >
          {/* Header Branding */}
          <View style={styles.brandRow}>
            <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
            <View>
              <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>UNITED MOTORS</Text>
              <Text style={[styles.brandSub, { color: colors.textMuted }]}>VEHICLE TRACKING SUITE</Text>
            </View>
          </View>

          {/* Expired Status Icon */}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#fca5a5',
              },
            ]}
          >
            <ShieldAlert size={36} color={colors.danger} />
          </View>

          {/* Heading & Explanation */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Trial Evaluation Concluded</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            The evaluation period for this workshop has expired. All vehicle tracking records, stage logs, and floor
            telemetry are safely preserved.
          </Text>

          {/* Metadata Card */}
          <View
            style={[
              styles.metaBox,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                borderColor: colors.borderGlass,
              },
            ]}
          >
            <View style={styles.metaRow}>
              <View style={styles.metaLeft}>
                <Building2 size={15} color={colors.textMuted} />
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Workshop Branch:</Text>
              </View>
              <Text style={[styles.metaValue, { color: colors.textPrimary }]} numberOfLines={1}>
                {activeBranchName} ({activeBranchCode})
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaLeft}>
                <Clock size={15} color={colors.textMuted} />
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Expired On:</Text>
              </View>
              <Text style={[styles.metaValue, { color: colors.danger }]}>{formattedExpiry}</Text>
            </View>
          </View>

          {/* Primary Action: Contact via WhatsApp */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#22c55e' }]}
            onPress={handleWhatsAppContact}
            activeOpacity={0.85}
          >
            <MessageSquare size={17} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Upgrade License via WhatsApp</Text>
          </TouchableOpacity>

          {/* Secondary Action: Email Support */}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.borderGlass, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9' }]}
            onPress={handleEmailContact}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Contact Sales & Support Team</Text>
          </TouchableOpacity>

          {/* Bottom Actions: Switch Branch (Admins) & Sign Out */}
          <View style={styles.bottomRow}>
            {canSwitchBranch && (
              <TouchableOpacity
                style={styles.textActionBtn}
                onPress={() => setIsBranchSwitcherOpen(true)}
              >
                <Text style={[styles.textActionText, { color: colors.primary }]}>Switch Branch</Text>
                <ChevronDown size={14} color={colors.primary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.textActionBtn} onPress={signOut}>
              <LogOut size={14} color={colors.textMuted} />
              <Text style={[styles.textActionText, { color: colors.textMuted }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Branch Switcher Sheet for Super Admins */}
      {canSwitchBranch && (
        <BranchSelectorSheet
          isOpen={isBranchSwitcherOpen}
          onClose={() => setIsBranchSwitcherOpen(false)}
          availableBranches={availableBranches}
          activeBranchCode={activeBranchCode}
          activeBranchId={activeBranchId}
          onSelectBranch={switchBranch}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  centerWrapper: {
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandSub: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  metaBox: {
    width: '100%',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12.5,
    fontWeight: '700',
    maxWidth: 240,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  textActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  textActionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
