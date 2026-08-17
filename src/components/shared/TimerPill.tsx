import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Clock } from "lucide-react-native";
import { useTheme } from "../../context/ThemeContext";

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
  const { colors } = useTheme();
  const isAmber = variant === "amber";
  const isSm = size === "sm";

  const pillColor = isAmber ? colors.warningLight : colors.primaryLight;
  const pillBg = isAmber ? colors.warningDim : colors.primaryBorder ? colors.primaryDim : 'rgba(14, 165, 233, 0.12)';
  const pillBorder = isAmber ? colors.warningBorder : colors.primaryBorder;

  return (
    <View
      style={[
        styles.pillContainer,
        { backgroundColor: pillBg, borderColor: pillBorder },
        isSm && styles.smPill,
      ]}
    >
      <Clock size={isSm ? 11 : 13} color={pillColor} />
      <Text
        style={[
          styles.pillText,
          { color: pillColor },
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
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  smText: {
    fontSize: 10,
  },
});
