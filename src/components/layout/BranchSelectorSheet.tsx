import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Building2, MapPin } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export interface BranchOption {
  id: string;
  code: string;
  name: string;
  city: string;
}

interface BranchSelectorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  availableBranches: BranchOption[];
  activeBranchCode: string;
  activeBranchId?: string;
  onSelectBranch: (branchId: string) => void;
}

export const BranchSelectorSheet: React.FC<BranchSelectorSheetProps> = ({
  isOpen,
  onClose,
  availableBranches,
  activeBranchCode,
  activeBranchId,
  onSelectBranch,
}) => {
  const { colors } = useTheme();

  if (!isOpen) return null;

  const branches = availableBranches && availableBranches.length > 0 ? availableBranches : [
    { id: 'orugodawatta_sec5', code: 'SEC5', name: 'United Motors — Section 5 (Main)', city: 'Orugodawatta, Colombo' },
    { id: 'orugodawatta_sec2', code: 'SEC2', name: 'United Motors — Section 2', city: 'Colombo' },
    { id: 'kandy', code: 'KDY', name: 'United Motors — Kandy Branch', city: 'Kandy' },
    { id: 'galle', code: 'GLE', name: 'United Motors — Galle Branch', city: 'Galle' },
    { id: 'kurunegala', code: 'KRG', name: 'United Motors — Kurunegala Branch', city: 'Kurunegala' },
  ];

  return (
    <TouchableOpacity
      style={styles.branchOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.branchSheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlassBright }]}
      >
        <View style={styles.branchSheetHeader}>
          <Building2 size={16} color={colors.primaryLight} />
          <Text style={[styles.branchSheetTitle, { color: colors.textPrimary }]}>Switch Branch</Text>
        </View>
        <View style={[styles.dropdownDivider, { backgroundColor: colors.borderGlass }]} />
        {branches.map(branch => {
          const cleanActive = (activeBranchCode || '').replace(/\s+/g, '').toUpperCase();
          const cleanBranchCode = (branch.code || '').replace(/\s+/g, '').toUpperCase();
          const isActive =
            (Boolean(activeBranchId) && branch.id === activeBranchId) ||
            cleanBranchCode === cleanActive ||
            branch.id.toLowerCase() === (activeBranchId || '').toLowerCase() ||
            branch.id.toLowerCase() === (activeBranchCode || '').toLowerCase().replace(/\s+/g, '');
          return (
            <TouchableOpacity
              key={branch.id}
              style={[
                styles.branchOption,
                isActive && { backgroundColor: colors.primaryDim, borderRadius: 8 }
              ]}
              onPress={() => {
                onSelectBranch(branch.id);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <MapPin size={14} color={isActive ? colors.primaryLight : colors.textMuted} />
              <View style={styles.branchTextWrapper}>
                <Text style={[styles.branchItemText, { color: isActive ? colors.primaryLight : colors.textPrimary }]}>
                  {branch.name}
                </Text>
                <Text style={[styles.branchSubText, { color: colors.textMuted }]}>{branch.city} · {branch.code}</Text>
              </View>
              {isActive && (
                <View style={[styles.activeDot, { backgroundColor: colors.primaryLight }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  branchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  branchSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    elevation: 8,
  },
  branchSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 4,
  },
  branchSheetTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  dropdownDivider: {
    height: 1,
    marginVertical: 4,
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  branchTextWrapper: {
    flex: 1,
  },
  branchItemText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  branchSubText: {
    fontSize: 10,
    marginTop: 1,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
