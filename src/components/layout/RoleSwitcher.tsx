import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, ScrollView } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { UserRole } from '../../types/vehicle';
import { Compass, Wrench, Shield, UserCheck, CheckCircle2, Search, X, ChevronLeft, ChevronRight, Plus, Car } from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';

export const SearchBarRow: React.FC = () => {
  const { searchQuery, setSearchQuery, setIsAddModalOpen, currentRole, vehicles } = useVehicles();
  const { canAddVehicle } = usePermissions();
  const { colors, isDark } = useTheme();
  const [localSearch, setLocalSearch] = React.useState<string>(searchQuery);

  // 300ms Debounce search input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);

    return () => clearTimeout(handler);
  }, [localSearch]);

  // Sync if searchQuery cleared elsewhere
  React.useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Active vehicle count calculation for current page view
  const activeCount = React.useMemo(() => {
    switch (currentRole) {
      case 'supervisor':
        return vehicles.filter(v => !v.is_finished).length;
      case 'tech_workshop':
        return vehicles.filter(v => v.current_zone === 'workshop' && !v.is_finished).length;
      case 'tech_alignment':
        return vehicles.filter(v => v.current_zone === 'alignment' && !v.is_finished).length;
      case 'tech_hoist':
        return vehicles.filter(v => v.current_zone === 'hoist' && !v.is_finished).length;
      case 'advisor':
        return vehicles.filter(v => v.current_zone === 'inspection' && !v.is_finished).length;
      default:
        return vehicles.length;
    }
  }, [vehicles, currentRole]);

  return (
    <View style={[styles.topSearchContainer, { backgroundColor: colors.background, borderBottomColor: colors.borderGlass }]}>
      <View style={styles.searchBarRow}>
        <View style={[
          styles.searchBoxContainer,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
            borderColor: colors.primaryBorder
          }
        ]}>
          <View style={styles.searchIconWrapper}>
            <Search size={16} color={colors.primaryLight} />
          </View>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search Vehicle"
            placeholderTextColor={colors.textMuted}
            value={localSearch}
            onChangeText={setLocalSearch}
            autoCapitalize="characters"
          />
          {localSearch.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setLocalSearch('');
                setSearchQuery('');
              }}
              style={[
                styles.clearSearchBtn,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' }
              ]}
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Dynamic Vehicle Count Badge */}
        <View style={[styles.vehicleCountPill, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
          <Car size={14} color={colors.primaryLight} />
          <Text style={[styles.vehicleCountPillText, { color: colors.primaryLight }]}>{activeCount}</Text>
        </View>

        {canAddVehicle && currentRole === 'supervisor' && (
          <TouchableOpacity style={[styles.addVehicleBtn, { backgroundColor: colors.primary }]} onPress={() => setIsAddModalOpen(true)}>
            <Plus size={16} color="#ffffff" />
            <Text style={styles.addVehicleBtnText}>Add vehicle</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export const SegmentedTabs: React.FC = () => {
  const { currentRole, setCurrentRole } = useVehicles();
  const { colors, isDark } = useTheme();
  const isOverviewActive = currentRole === 'supervisor';
  const isWorkshopActive = currentRole === 'tech_workshop';
  const isAlignmentActive = currentRole === 'tech_alignment';
  const isHoistActive = currentRole === 'tech_hoist';
  const isAdvisorActive = currentRole === 'advisor';

  return (
    <View style={[styles.segmentedContainer, { backgroundColor: colors.surface, borderBottomColor: colors.borderGlass }]}>
      <View style={styles.segmentedRow}>
        {/* 1. Floor Overview Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            {
              backgroundColor: isOverviewActive 
                ? colors.primaryDim 
                : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
              borderColor: isOverviewActive ? colors.primary : colors.borderGlass,
            }
          ]}
          onPress={() => setCurrentRole('supervisor')}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.segmentBtnText,
            { color: isOverviewActive ? (isDark ? '#ffffff' : colors.primary) : colors.textSecondary },
            isOverviewActive && styles.activeBtnText
          ]}>
            Overview
          </Text>
        </TouchableOpacity>

        {/* 2. 3 Workshop Station Stages (Grouped Box: General | Alignment | Hoist) */}
        <View style={[
          styles.groupedStagesBox,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)',
            borderColor: colors.borderGlass
          }
        ]}>
          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isWorkshopActive && {
                backgroundColor: colors.primaryDim,
                borderColor: colors.primary,
              }
            ]}
            onPress={() => setCurrentRole('tech_workshop')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentBtnText,
              { color: isWorkshopActive ? (isDark ? '#ffffff' : colors.primary) : colors.textSecondary },
              isWorkshopActive && styles.activeBtnText
            ]}>
              General
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isAlignmentActive && {
                backgroundColor: colors.successDim,
                borderColor: colors.success,
              }
            ]}
            onPress={() => setCurrentRole('tech_alignment')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentBtnText,
              { color: isAlignmentActive ? (isDark ? '#ffffff' : colors.success) : colors.textSecondary },
              isAlignmentActive && styles.activeBtnText
            ]}>
              Alignment
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isHoistActive && {
                backgroundColor: colors.warningDim,
                borderColor: colors.warning,
              }
            ]}
            onPress={() => setCurrentRole('tech_hoist')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentBtnText,
              { color: isHoistActive ? (isDark ? '#ffffff' : colors.warning) : colors.textSecondary },
              isHoistActive && styles.activeBtnText
            ]}>
              Hoist
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Ready Handover Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            {
              backgroundColor: isAdvisorActive 
                ? colors.purpleDim 
                : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
              borderColor: isAdvisorActive ? colors.purple : colors.borderGlass,
            }
          ]}
          onPress={() => setCurrentRole('advisor')}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.segmentBtnText,
            { color: isAdvisorActive ? (isDark ? '#ffffff' : colors.purple) : colors.textSecondary },
            isAdvisorActive && styles.activeBtnText
          ]}>
            Ready
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const RoleSwitcher: React.FC = () => {
  return <SegmentedTabs />;
};

const styles = StyleSheet.create({
  segmentedContainer: {
    backgroundColor: '#070b14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  segmentSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  activeSingleBtn: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderColor: '#0ea5e9',
  },
  activeAdvisorBtn: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#a855f7',
  },
  groupedStagesBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 3,
  },
  groupedStageItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: '100%',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeWorkshopStage: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  activeAlignmentStage: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  activeHoistStage: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  stageDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  segmentBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  activeBtnText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  topSearchContainer: {
    backgroundColor: '#070b14',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  footerContainer: {
    backgroundColor: '#070b14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
  },
  swiperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledArrowBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  pageInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pageTitleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  pageBadge: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pageBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '800',
  },
  youBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  youText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    flexShrink: 0,
  },
  vehicleCountPillText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  searchBoxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 0,
  },
  searchIconWrapper: {
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    padding: 0,
    minWidth: 0,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  clearSearchBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    flexShrink: 0,
  },
  addVehicleBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

