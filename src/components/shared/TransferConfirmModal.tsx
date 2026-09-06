import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export interface TransferConfirmModalProps {
  visible: boolean;
  title: string;
  icon?: React.ReactNode;
  bodyContent: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  processingLabel?: string;
  confirmButtonColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TransferConfirmModal: React.FC<TransferConfirmModalProps> = ({
  visible,
  title,
  icon,
  bodyContent,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isProcessing = false,
  processingLabel = 'Processing...',
  confirmButtonColor,
  onConfirm,
  onCancel,
}) => {
  const { colors, isDark } = useTheme();

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      {/* Backdrop — Clicking is disabled while processing to prevent race conditions */}
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: colors.backdrop || 'rgba(0, 0, 0, 0.75)' }]}
        activeOpacity={1}
        onPress={() => {
          if (!isProcessing) onCancel();
        }}
      />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderGlassBright }]}>
        <View style={styles.header}>
          {icon}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        </View>

        <View style={styles.body}>
          {typeof bodyContent === 'string' ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{bodyContent}</Text>
          ) : (
            bodyContent
          )}
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[
              styles.cancelBtn,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.borderGlass },
              isProcessing && { opacity: 0.5, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }
            ]}
            disabled={isProcessing}
            onPress={() => {
              if (!isProcessing) onCancel();
            }}
          >
            <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>{cancelLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              { backgroundColor: confirmButtonColor || colors.primary },
              isProcessing && { opacity: 0.85, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }
            ]}
            disabled={isProcessing}
            onPress={onConfirm}
          >
            {isProcessing ? (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.confirmBtnText}>{processingLabel}</Text>
              </View>
            ) : (
              <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    zIndex: 10000,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          elevation: 10,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    marginBottom: 20,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
