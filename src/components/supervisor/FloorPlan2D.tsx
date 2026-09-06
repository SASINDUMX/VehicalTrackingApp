import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Car, FileCheck, Bookmark } from 'lucide-react-native';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { VehicleCardHeader } from '../shared/VehicleCardHeader';
import { VehicleProgressBar } from '../shared/VehicleProgressBar';
import { LoadingSpot } from '../shared/LoadingSpot';
import { computeSpatialVehicleStatus } from '../../utils/bayLogicUtils';
import { sortWorkshopVehicles } from '../../utils/vehicleUtils';
import { useFloorPlan } from '../../hooks/useFloorPlan';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export const FloorPlan2D: React.FC = React.memo(() => {
  const {
    bays,
    elapsedTimes,
    isLoading,
    searchQuery,
    showMyVehiclesOnly,
    isSearchActive,
    totalMatchingVehicles,
    setSelectedVehicle,
    getVehiclesInZone,
  } = useFloorPlan();
  const { colors, isDark } = useTheme();
  const { togglePin, isPinned } = usePinnedVehicles();

  // Calculate total visible vehicles in bays for My Vehicles filter (Must be before conditional returns to satisfy React Rules of Hooks)
  const totalVisibleBays = React.useMemo(() => {
    if (!showMyVehiclesOnly) return 1; // Not filtering by pinned, no need to compute
    return bays.reduce((acc, bay) => {
      const rawVehicles = getVehiclesInZone(bay.id);
      const bayVehicles = rawVehicles.filter(v => isPinned(v.id));
      return acc + bayVehicles.length;
    }, 0);
  }, [bays, getVehiclesInZone, showMyVehiclesOnly, isPinned]);

  if (isSearchActive && totalMatchingVehicles === 0) {
    return (
      <EmptyStateCard
        icon={FileCheck}
        title={APP_TERMINOLOGY.emptyStates.noSearchMatchTitle(searchQuery)}
        subtitle={APP_TERMINOLOGY.emptyStates.noSearchMatchSubtitle}
      />
    );
  }

  if (showMyVehiclesOnly && totalVisibleBays === 0) {
    return (
      <EmptyStateCard
        icon={Bookmark}
        title={APP_TERMINOLOGY.emptyStates.noPinnedTitle}
        subtitle={APP_TERMINOLOGY.emptyStates.noPinnedSubtitle}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.mainLeftArea}
        contentContainerStyle={styles.canvasContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.spatialGrid}>
          {bays.map((bay) => {
                const IconComp = bay.icon;
                const rawVehicles = getVehiclesInZone(bay.id, isPinned);
                const bayVehicles = showMyVehiclesOnly ? rawVehicles.filter(v => isPinned(v.id)) : rawVehicles;

                // If searching or filtering My Vehicles, hide bays that have 0 matching vehicles!
                if ((searchQuery.trim() !== '' || showMyVehiclesOnly) && bayVehicles.length === 0) {
                  return null;
                }

                return (
                  <View key={bay.id} style={[styles.spatialBayBox, { backgroundColor: colors.surface, borderColor: `${bay.color}50` }]}>
                    <View style={[styles.spatialBayHeader, { backgroundColor: `${bay.color}15`, borderBottomColor: `${bay.color}40` }]}>
                      <View style={styles.spatialBayTitleRow}>
                        <IconComp size={16} color={bay.color} />
                        <Text style={[styles.spatialBayName, { color: colors.textPrimary }]}>{bay.name}</Text>
                      </View>
                      <View style={[styles.vehicleCountPill, { backgroundColor: `${bay.color}18`, borderColor: `${bay.color}50` }]}>
                        <Car size={13} color={bay.color} />
                        <Text style={[styles.vehicleCountPillText, { color: bay.color }]}>{bayVehicles.length}</Text>
                      </View>
                    </View>

                    <View style={[styles.spatialBayFloor, { backgroundColor: isDark ? colors.surface : colors.surfaceElevated }]}>
                      {isLoading ? (
                        <LoadingSpot color={bay.color} compact />
                      ) : bayVehicles.length === 0 ? (
                        <View style={[styles.bayEmptySpot, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)' }]}>
                          <Car size={28} color={colors.textMuted} />
                          <Text style={[styles.bayEmptyText, { color: colors.textMuted }]}>{APP_TERMINOLOGY.emptyStates.bayClearTitle.toUpperCase()}</Text>
                        </View>
                      ) : (
                        <View style={styles.bayVehicleContainer}>
                          {bayVehicles.map((vehicle) => {
                            const { isCurrentTaskDone, isStageIdle, progressPercent, completedCount, totalRequired } = computeSpatialVehicleStatus(vehicle);
                            const isUrgent = Boolean(vehicle.is_urgent);
                            const vehiclePinned = isPinned(vehicle.id);

                            return (
                              <TouchableOpacity
                                key={vehicle.id}
                                style={[
                                  styles.spatialVehicleCard,
                                  {
                                    backgroundColor: isUrgent
                                      ? colors.cardUrgentBg
                                      : isCurrentTaskDone
                                      ? colors.cardDoneBg
                                      : isStageIdle
                                      ? colors.cardIdleBg
                                      : colors.cardActiveBg,
                                    borderColor: isUrgent
                                      ? colors.cardUrgentBorder
                                      : isCurrentTaskDone
                                      ? colors.cardDoneBorder
                                      : isStageIdle
                                      ? colors.cardIdleBorder
                                      : colors.cardActiveBorder,
                                    borderLeftWidth: 3,
                                    borderLeftColor: isUrgent
                                      ? colors.danger
                                      : isCurrentTaskDone
                                      ? colors.success
                                      : isStageIdle
                                      ? colors.warning
                                      : colors.primary,
                                  }
                                ]}
                                onPress={() => setSelectedVehicle(vehicle)}
                                activeOpacity={0.8}
                              >
                              <VehicleCardHeader
                                vehicle={vehicle}
                                size="sm"
                                elapsedText={elapsedTimes[vehicle.id] || '0m 00s'}
                                isStageIdle={isStageIdle}
                                isTaskDone={isCurrentTaskDone}
                                isPinned={vehiclePinned}
                                onTogglePin={() => togglePin(vehicle.id)}
                                showChevron={false}
                                style={styles.cardHeaderTopRow}
                              />

                              <VehicleProgressBar
                                compact
                                completedCount={completedCount}
                                totalRequired={totalRequired}
                                percent={progressPercent}
                                isCurrentTaskDone={isCurrentTaskDone}
                                isStageIdle={isStageIdle}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  });

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainLeftArea: {
    flex: 1,
  },
  canvasContent: {
    paddingVertical: 4,
    gap: 16,
  },
  spatialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  spatialBayBox: {
    width: '48%',
    minWidth: 280,
    flexGrow: 1,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  spatialBayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  spatialBayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spatialBayName: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  vehicleCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  vehicleCountPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  spatialBayFloor: {
    backgroundColor: '#0b1220',
    padding: 10,
    minHeight: 140,
    justifyContent: 'center',
  },
  bayEmptySpot: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 24,
  },
  bayEmptyText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bayVehicleContainer: {
    gap: 8,
  },
  spatialVehicleCard: {
    position: 'relative',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    ...(Platform.OS === 'web' ? { transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' } as any : {}),
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 4,
    flexWrap: 'wrap',
  },
});



