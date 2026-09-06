import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number | string;
  maxHeight?: number | string;
  scrollable?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideHeader?: boolean;
  closeOnBackdropPress?: boolean;
  borderColor?: string;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  headerLeft,
  headerRight,
  footer,
  children,
  maxWidth = 600,
  maxHeight = '90%',
  scrollable = true,
  cardStyle,
  bodyStyle,
  contentContainerStyle,
  hideHeader = false,
  closeOnBackdropPress = true,
  borderColor,
}) => {
  const { colors, isDark } = useTheme();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.backdrop }]}>
        {/* Backdrop touch to dismiss */}
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={closeOnBackdropPress ? onClose : undefined}
        />

        {/* Modal Card */}
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.surface,
              borderColor: borderColor || colors.borderGlass,
              maxWidth,
              maxHeight,
            },
            cardStyle,
          ]}
        >
          {/* Header */}
          {!hideHeader && (
            <View style={[styles.header, { borderBottomColor: colors.borderGlass }]}>
              <View style={styles.headerLeftCol}>
                {headerLeft ? (
                  headerLeft
                ) : (
                  <View style={styles.headerTitleRow}>
                    {icon && <View style={styles.iconWrap}>{icon}</View>}
                    <View style={styles.titleCol}>
                      {typeof title === 'string' ? (
                        <Text style={[styles.headerTitleText, { color: colors.textPrimary }]}>
                          {title}
                        </Text>
                      ) : (
                        title
                      )}
                      {subtitle && (
                        typeof subtitle === 'string' ? (
                          <Text style={[styles.headerSubtitleText, { color: colors.textMuted }]}>
                            {subtitle}
                          </Text>
                        ) : (
                          subtitle
                        )
                      )}
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.headerRightCol}>
                {headerRight}
                <TouchableOpacity
                  style={[
                    styles.closeBtn,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                      borderColor: colors.borderGlass,
                    },
                  ]}
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Body */}
          {scrollable ? (
            <ScrollView
              style={[styles.scrollBody, bodyStyle]}
              contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, bodyStyle, contentContainerStyle]}>
              {children}
            </View>
          )}

          {/* Footer */}
          {footer && (
            <View style={[styles.footer, { borderTopColor: colors.borderGlass, backgroundColor: colors.surfaceElevated }]}>
              {footer}
            </View>
          )}
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
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(4px)',
        } as any)
      : {}),
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.4)',
        } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 16,
          elevation: 10,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerLeftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
  },
  body: {
    flexShrink: 1,
    padding: 20,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
});
