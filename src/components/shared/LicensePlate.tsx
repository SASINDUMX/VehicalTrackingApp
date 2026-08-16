import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

interface LicensePlateProps {
  number: string;
  size?: "sm" | "md" | "lg";
}

export const LicensePlate: React.FC<LicensePlateProps> = ({ number, size = "md" }) => {
  const isSm = size === "sm";
  const isLg = size === "lg";

  return (
    <View style={[styles.plateContainer, isSm && styles.plateSm, isLg && styles.plateLg]}>
      <Text style={[styles.plateNumberText, isSm && styles.plateTextSm, isLg && styles.plateTextLg]}>
        {number}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  plateContainer: {
    flexDirection: "row",
    backgroundColor: "#facc15",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#eab308",
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
  plateSm: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  plateLg: {
    borderRadius: 6,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  plateNumberText: {
    color: "#000000",
    fontWeight: "800",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: 0.5,
  },
  plateTextSm: {
    fontSize: 11,
  },
  plateTextLg: {
    fontSize: 16,
    letterSpacing: 1,
  },
});
