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
      <View style={[styles.leftBar, isSm && styles.leftBarSm, isLg && styles.leftBarLg]}>
        <Text style={[styles.flagText, isSm && styles.flagSm]}>🇱🇰</Text>
        <Text style={[styles.countryCode, isSm && styles.countryCodeSm]}>LK</Text>
      </View>
      <View style={[styles.rightArea, isSm && styles.rightAreaSm, isLg && styles.rightAreaLg]}>
        <Text style={[styles.plateNumberText, isSm && styles.plateTextSm, isLg && styles.plateTextLg]}>
          {number}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  plateContainer: {
    flexDirection: "row",
    backgroundColor: "#facc15",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#eab308",
    overflow: "hidden",
  },
  plateSm: {
    borderRadius: 3,
  },
  plateLg: {
    borderRadius: 6,
    borderWidth: 1.5,
  },
  leftBar: {
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  leftBarSm: {
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  leftBarLg: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  flagText: {
    fontSize: 10,
    lineHeight: 10,
  },
  flagSm: {
    fontSize: 8,
    lineHeight: 8,
  },
  countryCode: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "800",
  },
  countryCodeSm: {
    fontSize: 7,
  },
  rightArea: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    justifyContent: "center",
  },
  rightAreaSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rightAreaLg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
