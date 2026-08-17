import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../context/ThemeContext";

interface EmptyStateCardProps {
  icon: any;
  title: string;
  subtitle?: string;
  iconColor?: string;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  icon: IconComponent,
  title,
  subtitle,
  iconColor,
}) => {
  const { colors, isDark } = useTheme();
  const defaultIconColor = iconColor || (isDark ? '#475569' : '#94a3b8');

  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlass }]}>
      <IconComponent size={44} color={defaultIconColor} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {Boolean(subtitle) && <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  emptyCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
});
