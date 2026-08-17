import React from "react";
import { View, Text, StyleSheet } from "react-native";

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
  iconColor = "#475569",
}) => {
  return (
    <View style={styles.emptyCard}>
      <IconComponent size={44} color={iconColor} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {Boolean(subtitle) && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  emptyCard: {
    width: "100%",
    backgroundColor: "#121a2b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  emptySubtitle: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
});
