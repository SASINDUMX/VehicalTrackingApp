import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { AlertOctagon, FileText, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { LicensePlate } from './LicensePlate';
import { BaseModal } from './BaseModal';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface VehicleNoteModalProps {
  visible: boolean;
  vehicleNo: string;
  isUrgent?: boolean;
  urgentNote?: string | null;
  remarks?: string | null;
  onClose: () => void;
}

export const VehicleNoteModal: React.FC<VehicleNoteModalProps> = ({
  visible,
  vehicleNo,
  isUrgent = false,
  urgentNote,
  remarks,
  onClose,
}) => {
  const { colors, isDark } = useTheme();

  if (!visible) return null;

  const hasUrgent = Boolean(isUrgent);
  const hasRemarks = Boolean(remarks && remarks.trim().length > 0);

  // Dynamic titles and icons based on content
  const modalTitle = hasUrgent
    ? hasRemarks
      ? 'Priority Notice & Remarks'
      : APP_TERMINOLOGY.urgency.bannerTitle
    : 'Vehicle Remarks & Instructions';

  const modalSubtitle = hasUrgent
    ? 'PRIORITY ACTION REQUIRED'
    : 'CUSTOMER SERVICE INSTRUCTIONS';

  const borderColor = hasUrgent ? colors.dangerBorder : colors.primaryBorder;

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      maxWidth={480}
      scrollable={true}
      borderColor={borderColor}
      icon={
        hasUrgent ? (
          <View style={[styles.iconCircle, styles.urgentIconCircle, { backgroundColor: colors.dangerDim, borderColor: colors.dangerBorder }]}>
            <AlertOctagon size={20} color={colors.danger} />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
            <FileText size={20} color={colors.primaryLight} />
          </View>
        )
      }
      title={modalTitle}
      subtitle={modalSubtitle}
      footer={
        <TouchableOpacity
          style={[
            styles.ackBtn,
            { backgroundColor: hasUrgent ? colors.danger : colors.primary }
          ]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Check size={16} color="#ffffff" />
          <Text style={styles.ackBtnText}>
            {hasUrgent ? 'Acknowledge & Close' : 'Got it, Close'}
          </Text>
        </TouchableOpacity>
      }
    >
      <View style={styles.modalBody}>
        {/* Target Vehicle Plate */}
        <View style={[styles.plateRow, { borderBottomColor: colors.borderGlass, borderTopColor: colors.borderGlass }]}>
          <Text style={[styles.plateLabel, { color: colors.textMuted }]}>TARGET VEHICLE:</Text>
          <LicensePlate number={vehicleNo} size="md" />
        </View>

        {/* Section 1: Urgent Priority Alert (if urgent) */}
        {hasUrgent && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <AlertOctagon size={14} color={colors.danger} />
              <Text style={[styles.urgentLabel, { color: colors.danger }]}>PRIORITY / URGENT INSTRUCTIONS:</Text>
            </View>
            <View style={[styles.urgentContentBox, { backgroundColor: colors.cardUrgentBg, borderColor: colors.cardUrgentBorder }]}>
              <Text style={[styles.urgentText, { color: colors.dangerLight }]}>
                {urgentNote && urgentNote.trim()
                  ? urgentNote.trim()
                  : 'Marked as high priority. Immediate workshop attention requested.'}
              </Text>
            </View>
          </View>
        )}

        {/* Section 2: Customer Remarks & Instructions (if present) */}
        {hasRemarks && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <FileText size={14} color={colors.primaryLight} />
              <Text style={[styles.remarksLabel, { color: colors.primaryLight }]}>
                CUSTOMER REMARKS & SERVICE INSTRUCTIONS:
              </Text>
            </View>
            <View
              style={[
                styles.remarksContentBox,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderColor: colors.borderGlass,
                }
              ]}
            >
              <Text style={[styles.remarksText, { color: colors.textPrimary }]}>
                {remarks!.trim()}
              </Text>
            </View>
          </View>
        )}

        {/* Fallback if neither has meaningful text */}
        {!hasUrgent && !hasRemarks && (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No specific remarks or instructions attached to this vehicle.
            </Text>
          </View>
        )}
      </View>
    </BaseModal>
  );
};

const styles = StyleSheet.create({
  modalBody: {
    gap: 16,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentIconCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  plateLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionContainer: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgentLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  urgentContentBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 14,
  },
  urgentText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  remarksLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  remarksContentBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  remarksText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  ackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  ackBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
