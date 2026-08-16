import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Car, FileCheck, CheckCircle } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';
import { calculateJobSheetProgress, getTaskTypeForBay } from '../../utils/vehicleUtils';
import { useFloorPlan } from '../../hooks/useFloorPlan';

export const FloorPlan2D: React.FC = React.memo(() => {
  const {
    bays,
    elapsedTimes,
    isLoading,
    searchQuery,
    isSearchActive,
    totalMatchingVehicles,
    setSelectedVehicle,
    getVehiclesInZone,
  } = useFloorPlan();

  return (
    <View style={styles.container}>
      {/* Main 2D Workshop Floor Map Area */}
      <ScrollView
        style={styles.mainLeftArea}
          contentContainerStyle={styles.canvasContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {/* Spatial 2D Workshop Bays */}
          <View style={styles.spatialGrid}>
            {isSearchActive && totalMatchingVehicles === 0 ? (
              <EmptyStateCard
                icon={FileCheck}
                title={`No matching vehicles for "${searchQuery}"`}
                subtitle="Try searching another license plate number."
              />
            ) : (
              bays.map((bay) => {
                const IconComp = bay.icon;
                const bayVehicles = getVehiclesInZone(bay.id);

                // If searching, hide bays that have 0 matching vehicles!
                if (searchQuery.trim() !== '' && bayVehicles.length === 0) {
                  return null;
                }

                return (
                  <View key={bay.id} style={[styles.spatialBayBox, { borderColor: `${bay.color}50` }]}>
                    <View style={[styles.spatialBayHeader, { backgroundColor: `${bay.color}15`, borderBottomColor: `${bay.color}40` }]}>
                      <View style={styles.spatialBayTitleRow}>
                        <IconComp size={16} color={bay.color} />
                        <Text style={styles.spatialBayName}>{bay.name}</Text>
                      </View>
                      <View style={[styles.vehicleCountPill, { backgroundColor: `${bay.color}18`, borderColor: `${bay.color}50` }]}>
                        <Car size={13} color={bay.color} />
                        <Text style={[styles.vehicleCountPillText, { color: bay.color }]}>{bayVehicles.length}</Text>
                      </View>
                    </View>

                    <View style={styles.spatialBayFloor}>
                      {isLoading ? (
                        <View style={styles.bayEmptySpot}>
                          <ActivityIndicator size="small" color={bay.color} />
                          <Text style={styles.bayEmptyText}>SYNCING TELEMETRY...</Text>
                        </View>
                      ) : bayVehicles.length === 0 ? (
                        <View style={styles.bayEmptySpot}>
                          <Car size={28} color="#334155" />
                          <Text style={styles.bayEmptyText}>BAY CLEAR</Text>
                        </View>
                      ) : (
                        <View style={styles.bayVehicleContainer}>
                          {bayVehicles.map((vehicle) => {
                            const { completedCount, totalRequired: totalReq, percent } = calculateJobSheetProgress(vehicle.tasks);
                            const currentBayTaskType = getTaskTypeForBay(vehicle.current_zone);
                            const currentTask = vehicle.tasks.find(t => t.task_type === currentBayTaskType);
                            const isCurrentTaskDone = Boolean(currentTask && currentTask.is_completed);

                            return (
                              <TouchableOpacity
                                key={vehicle.id}
                                style={styles.spatialVehicleCard}
                                onPress={() => setSelectedVehicle(vehicle)}
                                activeOpacity={0.8}
                              >
                              <View style={styles.cardHeaderTopRow}>
                                <LicensePlate number={vehicle.vehicle_no} size="sm" />
                                <TimerPill elapsedText={elapsedTimes[vehicle.id] || '0m 00s'} variant="cyan" size="sm" />
                              </View>

                              <View style={styles.spatialProgressBar}>
                                <View
                                  style={[
                                    styles.spatialProgressFill,
                                    { width: `${percent}%`, backgroundColor: bay.color },
                                  ]}
                                />
                              </View>
                              
                              <View style={styles.spatialProgressRow}>
                                <Text style={styles.spatialProgressText}>
                                  {completedCount}/{totalReq} Tasks Done ({percent}%)
                                </Text>
                                {isCurrentTaskDone && (
                                  <View style={styles.tinyDoneIconGroup}>
                                    <CheckCircle size={12} color="#10b981" />
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              );
            }))}
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
  topHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  entranceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  entranceText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  controlsGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
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
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bayVehicleContainer: {
    gap: 10,
  },
  spatialVehicleCard: {
    position: 'relative',
    backgroundColor: '#182234',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 10,
    gap: 6,
    ...(Platform.OS === 'web' ? { transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' } as any : {}),
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
  },
  spatialProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  tinyDoneIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 10,
    padding: 2,
  },
  plateWrapper: {
    flexDirection: 'row',
    backgroundColor: '#facc15',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#eab308',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  plateLeftBar: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateFlag: {
    fontSize: 9,
    lineHeight: 9,
  },
  plateCountryCode: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '700',
  },
  plateRightArea: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  plateText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.5,
  },
  spatialTimerPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  spatialTimerText: {
    color: '#22d3ee',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  spatialTechText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  spatialProgressBar: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  spatialProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  spatialProgressText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '600',
  },
  searchBoxContainer: {
    flex: 1,
    minWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  radarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  radarBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  addVehicleBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  noSearchMatchCard: {
    width: '100%',
    padding: 40,
    backgroundColor: '#121a2b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noSearchMatchTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  noSearchMatchSub: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
});



