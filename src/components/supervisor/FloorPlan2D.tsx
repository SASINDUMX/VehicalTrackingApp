import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, TextInput } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { BayZone } from '../../types/vehicle';
import { Wrench, ShieldAlert, Navigation, CheckCircle, Clock, Plus, Car, Radio, Search, X, FileCheck } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';

interface BayItem {
  id: BayZone;
  name: string;
  code: string;
  icon: any;
  color: string;
}

export const FloorPlan2D: React.FC = () => {
  const { vehicles, setSelectedVehicle, setIsAddModalOpen, isAddModalOpen, isLoading, searchQuery } = useVehicles();
  const { canAddVehicle } = usePermissions();
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});

  useEffect(() => {
    const updateTimers = () => {
      const newTimes: Record<string, string> = {};
      const now = Date.now();

      vehicles.forEach((v) => {
        const lastLog = v.stage_logs[v.stage_logs.length - 1];
        if (lastLog && !lastLog.exited_at) {
          const start = new Date(lastLog.entered_at).getTime();
          const diffSec = Math.max(0, Math.floor((now - start) / 1000));
          const hours = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const padSec = secs < 10 ? `0${secs}` : `${secs}`;
          newTimes[v.id] = hours > 0 ? `${hours}h ${mins}m ${padSec}s` : `${mins}m ${padSec}s`;
        } else {
          newTimes[v.id] = '0m 00s';
        }
      });
      setElapsedTimes(newTimes);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [vehicles]);

  const bays: BayItem[] = [
    { id: 'workshop', name: 'General Workshop Bay', code: 'BAY 01', icon: Wrench, color: '#06b6d4' },
    { id: 'alignment', name: 'Wheel Alignment Bay', code: 'BAY 02', icon: Navigation, color: '#10b981' },
    { id: 'hoist', name: 'Hoist Service Bay', code: 'BAY 03', icon: ShieldAlert, color: '#f59e0b' },
    { id: 'inspection', name: 'Advisor Inspection Zone', code: 'FINAL', icon: CheckCircle, color: '#a855f7' },
  ];

  const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const getVehiclesInZone = (zoneId: BayZone) => {
    const list = vehicles.filter(v => {
      const matchesZone = v.current_zone === zoneId && !v.is_finished;
      if (!searchQuery.trim()) return matchesZone;
      const q = searchQuery.trim();
      const normQ = normalizeStr(q);
      const matchesPlate = normalizeStr(v.vehicle_no).includes(normQ) || v.vehicle_no.toLowerCase().includes(q.toLowerCase());
      const matchesTech = v.assigned_tech.toLowerCase().includes(q.toLowerCase());
      return matchesZone && (matchesPlate || matchesTech);
    });

    // STRICT FIFO (First Come, First Served): Earliest arrival at current station comes FIRST!
    return list.sort((a, b) => {
      const lastLogA = a.stage_logs[a.stage_logs.length - 1];
      const lastLogB = b.stage_logs[b.stage_logs.length - 1];
      const timeA = lastLogA?.entered_at ? new Date(lastLogA.entered_at).getTime() : new Date(a.intake_at).getTime();
      const timeB = lastLogB?.entered_at ? new Date(lastLogB.entered_at).getTime() : new Date(b.intake_at).getTime();
      return timeA - timeB;
    });
  };

  const isSearchActive = searchQuery.trim() !== '';
  const normSearchQ = normalizeStr(searchQuery);

  const totalMatchingVehicles = vehicles.filter(v => {
    if (v.is_finished) return false;
    const matchesPlate = normalizeStr(v.vehicle_no).includes(normSearchQ) || v.vehicle_no.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesTech = v.assigned_tech.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesPlate || matchesTech;
  }).length;

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
                      <View style={[styles.spatialBayCodeBadge, { backgroundColor: `${bay.color}30` }]}>
                        <Text style={[styles.spatialBayCodeText, { color: bay.color }]}>
                          {bayVehicles.length} {bayVehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
                        </Text>
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
                            const completedCount = vehicle.tasks.filter(t => t.is_completed).length;
                            const totalReq = vehicle.tasks.filter(t => t.is_required).length;
                            const percent = totalReq ? Math.round((completedCount / totalReq) * 100) : 0;

                            const getBayTaskType = (zone: string) => {
                              switch (zone) {
                                case 'workshop': return 'general_service';
                                case 'hoist': return 'hoist_service';
                                case 'alignment': return 'wheel_alignment';
                                default: return 'general_service';
                              }
                            };
                            const currentBayTaskType = getBayTaskType(vehicle.current_zone);
                            const currentTask = vehicle.tasks.find(t => t.task_type === currentBayTaskType);
                            const isCurrentTaskDone = Boolean(currentTask && currentTask.is_completed);

                            return (
                              <TouchableOpacity
                                key={vehicle.id}
                                style={styles.spatialVehicleCard}
                                onPress={() => setSelectedVehicle(vehicle)}
                                activeOpacity={0.8}
                              >
                              <LicensePlate number={vehicle.vehicle_no} size="sm" />
                              <TimerPill elapsedText={elapsedTimes[vehicle.id] || '0m 00s'} variant="cyan" size="sm" />

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
};

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
  spatialBayCodeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  spatialBayCodeText: {
    fontSize: 10,
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



