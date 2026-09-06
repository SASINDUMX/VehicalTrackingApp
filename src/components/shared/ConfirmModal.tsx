import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export interface ConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  subtitle?: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary' | 'warning';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  title,
  subtitle,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  icon,
  isLoading: externalLoading,
}) => {
  const { colors, isDark } = useTheme();
  const [internalLoading, setInternalLoading] = useState(false);

  if (!visible) return null;

  const isLoading = externalLoading ?? internalLoading;

  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  const getVariantStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return {
          btnBg: colors.danger,
          iconBg: colors.dangerDim,
          borderColor: colors.dangerBorder,
          iconColor: colors.danger,
        };
      case 'warning':
        return {
          btnBg: colors.warning,
          iconBg: colors.warningDim,
          borderColor: colors.warningBorder,
          iconColor: colors.warning,
        };
      case 'primary':
      default:
        return {
          btnBg: colors.primary,
          iconBg: colors.primaryDim,
          borderColor: colors.primaryBorder,
          iconColor: colors.primary,
        };
    }
  };

  const variantStyle = getVariantStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={isLoading ? undefined : onCancel}
        />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: variantStyle.borderColor,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={[styles.iconCircle, { backgroundColor: variantStyle.iconBg }]}>
              {icon || <AlertTriangle size={20} color={variantStyle.iconColor} />}
            </View>
            <View style={styles.titleGroup}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
              {subtitle && (
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
              )}
            </View>
          </View>

          {/* Body / Description */}
          <View style={styles.body}>
            {typeof description === 'string' ? (
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                {description}
              </Text>
            ) : (
              description
            )}
          </View>

          {/* Actions */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                {
                  borderColor: colors.borderGlass,
                  backgroundColor: colors.surfaceOverlay,
                },
              ]}
              onPress={onCancel}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                {cancelLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                { backgroundColor: variantStyle.btnBg },
                isLoading && styles.btnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(8px)',
        } as any)
      : {}),
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    zIndex: 10000,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px 14px 35px rgba(0, 0, 0, 0.6)',
        } as any)
      : {
          elevation: 12,
        }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGroup: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    gap: 8,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 90,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
