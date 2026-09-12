import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Search, X, Plus, Bookmark } from 'lucide-react-native';

import { useTheme } from '../../context/ThemeContext';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { APP_TERMINOLOGY } from '../../constants/terminology';
import { matchesVehicleSearch } from '../../utils/searchUtils';

export const SearchBarRow: React.FC = () => {
  const { searchQuery, setSearchQuery, showMyVehiclesOnly, setShowMyVehiclesOnly, setIsAddModalOpen, activeTab, vehicles } = useVehicles();
  const { canAddVehicle } = usePermissions();
  const { colors, isDark } = useTheme();
  const { isPinned } = usePinnedVehicles();
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

  // Active vehicle count calculation reflecting current view, tab, pinned toggle AND live search results
  const activeCount = React.useMemo(() => {
    const roleFiltered = vehicles.filter(v => {
      if (v.is_finished) return false;
      if (showMyVehiclesOnly && !isPinned(v.id)) return false;
      if (activeTab !== 'overview' && v.current_zone !== activeTab) return false;
      if (localSearch && localSearch.trim() && !matchesVehicleSearch(v.vehicle_no, localSearch)) return false;
      return true;
    });
    return roleFiltered.length;
  }, [vehicles, activeTab, showMyVehiclesOnly, isPinned, localSearch]);

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
              style={styles.clearSearchBtn}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Integrated Vehicle Count (clean right-aligned number without rounded wrapper) */}
          <Text style={[styles.searchCountText, { color: colors.textMuted }]}>
            {activeCount}
          </Text>
        </View>

        {/* My Vehicles Filter Button */}
        <TouchableOpacity
          style={[
            styles.singleFilterToggleBtn,
            {
              backgroundColor: showMyVehiclesOnly ? colors.primaryDim : 'transparent',
              borderColor: showMyVehiclesOnly ? colors.primary : colors.borderGlass,
            }
          ]}
          onPress={() => setShowMyVehiclesOnly(!showMyVehiclesOnly)}
          activeOpacity={0.7}
        >
          <Bookmark size={15} color={showMyVehiclesOnly ? colors.primaryLight : colors.textMuted} fill={showMyVehiclesOnly ? colors.primaryLight : 'transparent'} />
          <Text style={[styles.singleFilterToggleText, { color: showMyVehiclesOnly ? colors.primaryLight : colors.textMuted }]}>
            {showMyVehiclesOnly ? APP_TERMINOLOGY.navigation.myVehicles : APP_TERMINOLOGY.navigation.allVehicles}
          </Text>
        </TouchableOpacity>

        {canAddVehicle && (
          <TouchableOpacity style={[styles.addVehicleBtn, { backgroundColor: colors.primary }]} onPress={() => setIsAddModalOpen(true)}>
            <Plus size={15} color={colors.textDark} />
            <Text style={[styles.addVehicleBtnText, { color: colors.textDark }]}>Vehicle</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export const SegmentedTabs: React.FC = () => {
  const { activeTab, setActiveTab } = useVehicles();
  const { colors, isDark } = useTheme();
  const isOverviewActive = activeTab === 'overview';
  const isWorkshopActive = activeTab === 'workshop';
  const isAlignmentActive = activeTab === 'alignment';
  const isHoistActive = activeTab === 'hoist';
  const isAdvisorActive = activeTab === 'inspection';

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
          onPress={() => setActiveTab('overview')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            style={[
              styles.segmentBtnText,
              {
                color: isOverviewActive 
                  ? (isDark ? colors.primaryLight : colors.primary) 
                  : colors.textSecondary,
                fontWeight: isOverviewActive ? '800' : '600',
              }
            ]}
          >
            {APP_TERMINOLOGY.navigation.overview}
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
                backgroundColor: colors.bayWorkshopDim,
                borderColor: colors.bayWorkshop,
              }
            ]}
            onPress={() => setActiveTab('workshop')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isWorkshopActive 
                    ? (isDark ? colors.bayWorkshopLight : colors.bayWorkshop) 
                    : colors.textSecondary,
                  fontWeight: isWorkshopActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.workshop.tabLabel}
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isAlignmentActive && {
                backgroundColor: colors.bayAlignmentDim,
                borderColor: colors.bayAlignment,
              }
            ]}
            onPress={() => setActiveTab('alignment')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isAlignmentActive 
                    ? (isDark ? colors.bayAlignmentLight : colors.bayAlignment) 
                    : colors.textSecondary,
                  fontWeight: isAlignmentActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.alignment.tabLabel}
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isHoistActive && {
                backgroundColor: colors.bayHoistDim,
                borderColor: colors.bayHoist,
              }
            ]}
            onPress={() => setActiveTab('hoist')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isHoistActive 
                    ? (isDark ? colors.bayHoistLight : colors.bayHoist) 
                    : colors.textSecondary,
                  fontWeight: isHoistActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.hoist.tabLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Ready Handover Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            {
              backgroundColor: isAdvisorActive 
                ? colors.bayInspectionDim 
                : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
              borderColor: isAdvisorActive ? colors.bayInspection : colors.borderGlass,
            }
          ]}
          onPress={() => setActiveTab('inspection')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            style={[
              styles.segmentBtnText,
              {
                color: isAdvisorActive 
                  ? (isDark ? colors.bayInspectionLight : colors.bayInspection) 
                  : colors.textSecondary,
                fontWeight: isAdvisorActive ? '800' : '600',
              }
            ]}
          >
            {APP_TERMINOLOGY.stations.inspection.tabLabel}
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
    paddingHorizontal: 12,
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
  },
  segmentSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    width: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  groupedStagesBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 2,
  },
  groupedStageItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 2,
  },
  stageDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  segmentBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  topSearchContainer: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchCountText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 6,
    marginRight: 2,
    flexShrink: 0,
    opacity: 0.9,
  },
  singleFilterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  singleFilterToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  searchBoxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
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
    fontSize: 13,
    padding: 0,
    minWidth: 0,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  clearSearchBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 20,
    flexShrink: 0,
  },
  addVehicleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

