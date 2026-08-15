import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, ScrollView } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { UserRole } from '../../types/vehicle';
import { Compass, Wrench, Shield, UserCheck, CheckCircle2, Search, X, ChevronLeft, ChevronRight, Plus, Car } from 'lucide-react-native';

export const SearchBarRow: React.FC = () => {
  const { searchQuery, setSearchQuery, setIsAddModalOpen, currentRole, vehicles } = useVehicles();
  const { canAddVehicle } = usePermissions();
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
    <View style={styles.topSearchContainer}>
      <View style={styles.searchBarRow}>
        <View style={styles.searchBoxContainer}>
          <Search size={16} color="#06b6d4" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Vehicle NO (e.g. WP-CAB-9842)..."
            placeholderTextColor="#64748b"
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
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Dynamic Vehicle Count Badge */}
        <View style={styles.vehicleCountPill}>
          <Car size={14} color="#38bdf8" />
          <Text style={styles.vehicleCountPillText}>{activeCount}</Text>
        </View>

        {canAddVehicle && currentRole === 'supervisor' && (
          <TouchableOpacity style={styles.addVehicleBtn} onPress={() => setIsAddModalOpen(true)}>
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

  return (
    <View style={styles.segmentedContainer}>
      <View style={styles.segmentedRow}>
        {/* 1. Floor Overview Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            currentRole === 'supervisor' && styles.activeSingleBtn
          ]}
          onPress={() => setCurrentRole('supervisor')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, currentRole === 'supervisor' && styles.activeBtnText]}>
            Floor
          </Text>
        </TouchableOpacity>

        {/* 2. 3 Workshop Station Stages (Grouped Box: General | Alignment | Hoist) */}
        <View style={styles.groupedStagesBox}>
          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              currentRole === 'tech_workshop' && styles.activeWorkshopStage
            ]}
            onPress={() => setCurrentRole('tech_workshop')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentBtnText, currentRole === 'tech_workshop' && styles.activeBtnText]}>
              General
            </Text>
          </TouchableOpacity>

          <View style={styles.stageDivider} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              currentRole === 'tech_alignment' && styles.activeAlignmentStage
            ]}
            onPress={() => setCurrentRole('tech_alignment')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentBtnText, currentRole === 'tech_alignment' && styles.activeBtnText]}>
              Alignment
            </Text>
          </TouchableOpacity>

          <View style={styles.stageDivider} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              currentRole === 'tech_hoist' && styles.activeHoistStage
            ]}
            onPress={() => setCurrentRole('tech_hoist')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentBtnText, currentRole === 'tech_hoist' && styles.activeBtnText]}>
              Hoist
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Ready Handover Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            currentRole === 'advisor' && styles.activeAdvisorBtn
          ]}
          onPress={() => setCurrentRole('advisor')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, currentRole === 'advisor' && styles.activeBtnText]}>
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    paddingVertical: 5,
    borderRadius: 7,
  },
  activeWorkshopStage: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
  },
  activeAlignmentStage: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  activeHoistStage: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
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
    gap: 10,
  },
  vehicleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    padding: 0,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  clearSearchBtn: {
    padding: 2,
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addVehicleBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

