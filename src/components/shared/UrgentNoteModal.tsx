import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { AlertOctagon, X, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { LicensePlate } from './LicensePlate';

interface UrgentNoteModalProps {
  visible: boolean;
  vehicleNo: string;
  note: string;
  onClose: () => void;
}

export const UrgentNoteModal: React.FC<UrgentNoteModalProps> = ({
  visible,
  vehicleNo,
  note,
  onClose,
}) => {
  const { colors, isDark } = useTheme();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Dark Backdrop */}
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Modal Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: 'rgba(239, 68, 68, 0.4)',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badgeRow}>
              <View style={styles.iconCircle}>
                <AlertOctagon size={20} color="#ef4444" />
              </View>
              <View>
                <Text style={styles.urgencyLabel}>PRIORITY ALERT</Text>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Urgent Vehicle Instructions
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Target Vehicle Plate */}
          <View style={[styles.plateRow, { borderBottomColor: colors.borderGlass, borderTopColor: colors.borderGlass }]}>
            <Text style={[styles.plateLabel, { color: colors.textMuted }]}>TARGET VEHICLE:</Text>
            <LicensePlate number={vehicleNo} size="md" />
          </View>

          {/* Urgent Note Body */}
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>SUPERVISOR NOTE / REMARKS:</Text>
            <View style={styles.noteContentBox}>
              <Text style={styles.noteText}>
                {note && note.trim() ? note.trim() : 'Marked as urgent with no additional instructions provided.'}
              </Text>
            </View>
          </View>

          {/* Action Footer */}
          <TouchableOpacity
            style={styles.ackBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Check size={16} color="#ffffff" />
            <Text style={styles.ackBtnText}>Acknowledge & Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 20,
    gap: 16,
    zIndex: 10000,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        } as any)
      : {
          shadowColor: '#ef4444',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
          elevation: 10,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyLabel: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  noteContainer: {
    gap: 8,
  },
  noteLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  noteContentBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 14,
  },
  noteText: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  ackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  ackBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
