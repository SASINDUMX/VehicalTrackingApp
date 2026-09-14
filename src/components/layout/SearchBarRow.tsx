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

const styles = StyleSheet.create({
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
  searchBoxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    minWidth: 0,
    borderWidth: 1,
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
