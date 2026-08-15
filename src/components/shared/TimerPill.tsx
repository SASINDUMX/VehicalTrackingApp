import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Clock } from "lucide-react-native";

interface TimerPillProps {
  elapsedText: string;
  variant?: "cyan" | "amber";
  size?: "sm" | "md";
}

export const TimerPill: React.FC<TimerPillProps> = ({
  elapsedText,
  variant = "cyan",
  size = "md",
}) => {
  const isAmber = variant === "amber";
  const isSm = size === "sm";

  return (
    <View
      style={[
        styles.pillContainer,
        isAmber ? styles.amberBg : styles.cyanBg,
        isSm && styles.smPill,
      ]}
    >
      <Clock size={isSm ? 11 : 13} color={isAmber ? "#fbbf24" : "#38bdf8"} />
      <Text
        style={[
          styles.pillText,
          isAmber ? styles.amberText : styles.cyanText,
          isSm && styles.smText,
        ]}
      >
        {elapsedText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  smPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cyanBg: {
    backgroundColor: "rgba(14, 165, 233, 0.15)",
    borderColor: "rgba(14, 165, 233, 0.3)",
  },
  amberBg: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  smText: {
    fontSize: 10,
  },
  cyanText: {
    color: "#38bdf8",
  },
  amberText: {
    color: "#fbbf24",
  },
});
