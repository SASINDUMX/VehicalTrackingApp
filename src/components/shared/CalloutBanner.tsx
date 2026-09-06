import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { AlertOctagon, MessageSquare, Info } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export type CalloutVariant = 'urgent' | 'priority' | 'remarks' | 'warning' | 'info';

export interface CalloutBannerProps {
  variant?: CalloutVariant;
  title?: string;
  message?: string | null;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  messageStyle?: StyleProp<TextStyle>;
}

export const CalloutBanner: React.FC<CalloutBannerProps> = ({
  variant = 'info',
  title,
  message,
  icon: CustomIcon,
  style,
  titleStyle,
  messageStyle,
}) => {
  const { colors, isDark } = useTheme();

  // Resolve design tokens based on variant
  let defaultTitle = 'NOTICE';
  let DefaultIcon = Info;
  let bg = colors.primaryDim;
  let border = colors.primaryBorder;
  let titleColor = colors.primaryLight;
  let iconColor = colors.primary;
  let messageColor = colors.textPrimary;

  if (variant === 'urgent' || variant === 'priority') {
    defaultTitle = 'PRIORITY / URGENT VEHICLE';
    DefaultIcon = AlertOctagon;
    bg = colors.cardUrgentBg;
    border = colors.cardUrgentBorder;
    titleColor = colors.danger;
    iconColor = colors.danger;
    messageColor = isDark ? colors.dangerLight : colors.danger;
  } else if (variant === 'remarks' || variant === 'warning') {
    defaultTitle = 'REMARKS / SPECIAL INSTRUCTIONS';
    DefaultIcon = MessageSquare;
    bg = colors.warningDim;
    border = colors.warningBorder;
    titleColor = colors.warningLight;
    iconColor = colors.warning;
    messageColor = colors.textPrimary;
  }

  const activeTitle = title !== undefined ? title : defaultTitle;
  const IconComponent = CustomIcon || DefaultIcon;
  const hasMessage = Boolean(message && message.trim().length > 0);

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: bg,
          borderColor: border,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <IconComponent size={14} color={iconColor} />
        <Text style={[styles.title, { color: titleColor }, titleStyle]}>
          {activeTitle}
        </Text>
      </View>
      {hasMessage && (
        <Text style={[styles.message, { color: messageColor }, messageStyle]}>
          {message!.trim()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
