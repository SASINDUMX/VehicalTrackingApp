import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getRoleBay, getTechName } from '../../constants/bays';
import { Save, CheckSquare, Square, Pencil, CheckCircle2, Clock, Car, ChevronDown, ChevronUp, History, AlertTriangle, Lock, MessageSquare } from 'lucide-react-native';
import { BayZone } from '../../types/vehicle';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';

interface PendingTransfer {
  vehicleId: string;
  vehicleNo: string;
  targetZone: BayZone;
  targetZoneName: string;
}

export const TechnicianStationView: React.FC = () => {
  const { vehicles, currentRole, toggleTaskCompletion, transferVehicleZone, isLoading, searchQuery, setSelectedVehicle } = useVehicles();
  const { canMarkTaskDone, canTransferVehicle } = usePermissions();
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);

  const activeBay = getRoleBay(currentRole);
  const techName = getTechName(currentRole);
  const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const getBayTaskType = (bayZone: string) => {
    switch (bayZone) {
      case 'workshop': return 'general_service';
      case 'hoist': return 'hoist_service';
      case 'alignment': return 'wheel_alignment';
      default: return 'general_service';
    }
  };
  const activeTaskType = getBayTaskType(activeBay);

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRequestTransfer = (vehicleId: string, vehicleNo: string, targetZone: BayZone, targetZoneName: string) => {
    setPendingTransfer({ vehicleId, vehicleNo, targetZone, targetZoneName });
  };

  const handleConfirmTransfer = () => {
    if (pendingTransfer) {
      transferVehicleZone(pendingTransfer.vehicleId, pendingTransfer.targetZone, techName);
      setPendingTransfer(null);
    }
  };

  const bayVehicles = vehicles
    .filter(v => {
      const matchesBay = v.current_zone === activeBay && !v.is_finished;
      if (!searchQuery.trim()) return matchesBay;
      const normQ = normalizeStr(searchQuery);
      const matchesPlate = normalizeStr(v.vehicle_no).includes(normQ) || v.vehicle_no.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesBay && matchesPlate;
    })
    .sort((a, b) => {
      const lastLogA = a.stage_logs[a.stage_logs.length - 1];
      const lastLogB = b.stage_logs[b.stage_logs.length - 1];
      const timeA = lastLogA?.entered_at ? new Date(lastLogA.entered_at).getTime() : new Date(a.intake_at).getTime();
      const timeB = lastLogB?.entered_at ? new Date(lastLogB.entered_at).getTime() : new Date(b.intake_at).getTime();
      return timeA - timeB; // Earliest station arrival first (FIFO)
    });

  // Live timer tick for each vehicle in the bay
  useEffect(() => {
    const interval = setInterval(() => {
      const updated: Record<string, string> = {};
      const now = Date.now();

      bayVehicles.forEach((v) => {
        const lastLog = v.stage_logs[v.stage_logs.length - 1];
        if (lastLog && !lastLog.exited_at) {
          const start = new Date(lastLog.entered_at).getTime();
          const diffSec = Math.max(0, Math.floor((now - start) / 1000));
          const hours = Math.floor(diffSec / 3600);
          const mins = Math.floor((diffSec % 3600) / 60);
          const secs = diffSec % 60;
          const padSec = secs < 10 ? `0${secs}` : `${secs}`;
          updated[v.id] = hours > 0 ? `${hours}h ${mins}m ${padSec}s` : `${mins}m ${padSec}s`;
        } else {
          updated[v.id] = '0m 00s';
        }
      });

      setElapsedTimes(updated);
    }, 1000);

    return () => clearInterval(interval);
  }, [bayVehicles]);

  return (
    <View style={styles.rootView}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="small" color="#06b6d4" />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>Syncing Workshop Telemetry...</Text>
          </View>
        ) : bayVehicles.length === 0 ? (
          <EmptyStateCard
            icon={Car}
            title={searchQuery.trim() ? `No matching vehicles for "${searchQuery}"` : 'Bay Currently Clear'}
            subtitle={searchQuery.trim() ? 'Try searching another license plate number.' : 'No vehicles currently assigned to this station.'}
          />
        ) : (
          <View style={styles.cardsGrid}>
            {bayVehicles.map((vehicle) => {
              const completedCount = vehicle.tasks.filter(t => t.is_completed).length;
              const totalReq = vehicle.tasks.filter(t => t.is_required).length;
              const percent = totalReq ? Math.round((completedCount / totalReq) * 100) : 0;
              const isExpanded = Boolean(expandedCards[vehicle.id]);

              // Filter ONLY the task assigned to this active bay
              const bayTask = vehicle.tasks.find(t => t.task_type === activeTaskType && t.is_required) || vehicle.tasks.find(t => t.task_type === activeTaskType);
              const isCurrentTaskDone = Boolean(bayTask && bayTask.is_completed);

              // Required tasks for this vehicle's job sheet
              const requiredTaskTypes = vehicle.tasks.filter(t => t.is_required).map(t => t.task_type);
              const isHoistRequired = requiredTaskTypes.includes('hoist_service');
              const isAlignmentRequired = requiredTaskTypes.includes('wheel_alignment');
              const isWorkshopRequired = requiredTaskTypes.includes('general_service');

              // Completed status for each bay task
              const isWorkshopDone = Boolean(vehicle.tasks.find(t => t.task_type === 'general_service')?.is_completed);
              const isHoistDone = Boolean(vehicle.tasks.find(t => t.task_type === 'hoist_service')?.is_completed);
              const isAlignmentDone = Boolean(vehicle.tasks.find(t => t.task_type === 'wheel_alignment')?.is_completed);

              const isCanDispatch = canTransferVehicle && isCurrentTaskDone;

              const canShowAlignmentBtn = activeBay !== 'alignment' && isAlignmentRequired && !isAlignmentDone;
              const canShowHoistBtn = activeBay !== 'hoist' && isHoistRequired && !isHoistDone;
              const canShowWorkshopBtn = activeBay !== 'workshop' && isWorkshopRequired && !isWorkshopDone;
              const canShowAdvisorBtn = activeBay !== 'inspection' && !vehicle.is_finished;
              const hasAnyDispatchBtn = canShowAlignmentBtn || canShowHoistBtn || canShowWorkshopBtn || canShowAdvisorBtn;

              return (
                <View key={vehicle.id} style={styles.vehicleCardWrapper}>
                  {/* Header Card Area (Clickable to Expand / Collapse Card) */}
                  <TouchableOpacity
                    style={styles.cardHeaderArea}
                    onPress={() => toggleExpand(vehicle.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.cardTopRow}>
                      {/* Sri Lankan License Plate Badge */}
                      <LicensePlate number={vehicle.vehicle_no} size="md" />

                      <View style={styles.headerRightGroup}>
                        {/* Live Station Timer Pill */}
                        <TimerPill elapsedText={elapsedTimes[vehicle.id] || '0m 00s'} variant="cyan" size="md" />

                        {/* Expand / Collapse Chevron Icon */}
                        <View style={styles.chevronWrapper}>
                          {isExpanded ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                        </View>
                      </View>
                    </View>

                    {/* Task Progress Bar */}
                    <View style={styles.progressContainer}>
                      <View style={styles.progressLabelRow}>
                        <Text style={styles.progressLabelText}>JOB SHEET PROGRESS</Text>
                        <View style={styles.progressPercentGroup}>
                          <Text style={styles.progressPercentText}>{completedCount}/{totalReq} Tasks ({percent}%)</Text>
                          {isCurrentTaskDone && (
                            <View style={styles.tinyDoneIconGroup}>
                              <CheckCircle2 size={12} color="#10b981" />
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
                      </View>
                    </View>
                  </TouchableOpacity>

                  {/* EXPANDED CONTENT AREA */}
                  {isExpanded && (
                    <>
                      {/* Vehicle Remarks / Special Instructions Box (Before Job Sheet Tasks) */}
                      {Boolean(vehicle.remarks && vehicle.remarks.trim()) && (
                        <View style={styles.remarksSection}>
                          <View style={styles.remarksHeaderRow}>
                            <MessageSquare size={14} color="#f59e0b" />
                            <Text style={styles.remarksSectionLabel}>REMARKS / SPECIAL INSTRUCTIONS:</Text>
                          </View>
                          <Text style={styles.remarksBodyText}>{vehicle.remarks}</Text>
                        </View>
                      )}

                      {/* Station Assigned Task Checklist */}
                      <View style={styles.tasksSection}>
                        <Text style={styles.sectionHeaderLabel}>JOB SHEET TASKS ({vehicle.tasks.filter(t => t.is_required).length}):</Text>
                        {vehicle.tasks.filter(t => t.is_required).map(task => {
                          const isVehicleInInspectionOrFinished = vehicle.current_zone === 'inspection' || vehicle.is_finished;
                          const isMyBayTask = task.task_type === activeTaskType;
                          const isEditable = isMyBayTask && canMarkTaskDone(activeBay) && !isVehicleInInspectionOrFinished;

                          return (
                            <TouchableOpacity
                              key={task.id}
                              style={[styles.taskRow, (!isMyBayTask || isVehicleInInspectionOrFinished) && styles.otherBayTaskRow]}
                              activeOpacity={isEditable ? 0.7 : 1}
                              onPress={() => {
                                if (isEditable) {
                                  toggleTaskCompletion(vehicle.id, task.id, techName);
                                }
                              }}
                              disabled={!isEditable}
                            >
                              <View style={styles.taskLeft}>
                                {task.is_completed ? (
                                  <CheckSquare size={18} color="#10b981" />
                                ) : (
                                  <Square size={18} color={isEditable ? "#64748b" : "#475569"} />
                                )}
                                <Text style={[styles.taskName, task.is_completed && styles.completedTaskName, (!isMyBayTask || isVehicleInInspectionOrFinished) && styles.otherBayTaskName]}>
                                  {task.task_name}
                                </Text>
                              </View>

                              {isMyBayTask && !isVehicleInInspectionOrFinished ? (
                                <View
                                  style={[
                                    styles.taskDoneBtn,
                                    task.is_completed && styles.taskRestoreBtn,
                                  ]}
                                >
                                  <Text style={[styles.taskDoneBtnText, task.is_completed && styles.taskRestoreBtnText]}>
                                    {task.is_completed ? 'Restore (Undo)' : 'Done ✓'}
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.lockedTaskBadge}>
                                  <Lock size={12} color={task.is_completed ? "#10b981" : "#64748b"} />
                                  <Text style={[styles.lockedTaskBadgeText, task.is_completed && styles.lockedTaskDoneText]}>
                                    {isVehicleInInspectionOrFinished ? (task.is_completed ? 'DONE ✓' : 'LOCKED') : (task.is_completed ? 'DONE ✓' : 'OTHER BAY')}
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Dispatch Transfer Bar & Timeline Audit Link */}
                      <View style={styles.dispatchRow}>
                        <View style={styles.dispatchHeaderRow}>
                          {hasAnyDispatchBtn ? (
                            <Text style={styles.dispatchLabel}>DISPATCH TO:</Text>
                          ) : (
                            <View />
                          )}
                          <TouchableOpacity
                            style={styles.auditLogLink}
                            onPress={() => setSelectedVehicle(vehicle)}
                          >
                            <History size={12} color="#38bdf8" />
                            <Text style={styles.auditLogLinkText}>Stage Timeline Audit Log</Text>
                          </TouchableOpacity>
                        </View>

                        {hasAnyDispatchBtn && (
                          <View style={styles.dispatchBtnGroup}>
                            {canShowAlignmentBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnAlignment, !isCanDispatch && { opacity: 0.35 }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'alignment', 'Wheel Alignment Bay');
                                }}
                                disabled={!isCanDispatch}
                              >
                                <Text style={styles.dispatchBtnText}>Alignment</Text>
                              </TouchableOpacity>
                            )}

                            {canShowHoistBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnHoist, !isCanDispatch && { opacity: 0.35 }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'hoist', 'Hoist Service Bay');
                                }}
                                disabled={!isCanDispatch}
                              >
                                <Text style={styles.dispatchBtnText}>Hoist</Text>
                              </TouchableOpacity>
                            )}

                            {canShowWorkshopBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnWorkshop, !isCanDispatch && { opacity: 0.35 }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'workshop', 'General Workshop Bay');
                                }}
                                disabled={!isCanDispatch}
                              >
                                <Text style={styles.dispatchBtnText}>Workshop</Text>
                              </TouchableOpacity>
                            )}

                            {canShowAdvisorBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnAdvisor, !isCanDispatch && { opacity: 0.35 }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'inspection', 'Advisor Inspection Zone');
                                }}
                                disabled={!isCanDispatch}
                              >
                                <Text style={styles.dispatchBtnText}>Final Inspection →</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* CONFIRMATION MODAL BEFORE DISPATCHING (Viewport Centered) */}
      {pendingTransfer && (
        <View style={styles.confirmOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdrop}
            activeOpacity={1}
            onPress={() => setPendingTransfer(null)}
          />
          <View style={styles.confirmCard}>
            <View style={styles.confirmHeader}>
              <AlertTriangle size={24} color="#f59e0b" />
              <Text style={styles.confirmTitle}>Confirm Station Dispatch</Text>
            </View>
            <Text style={styles.confirmBodyText}>
              Are you sure you want to dispatch vehicle <Text style={styles.confirmBoldPlate}>{pendingTransfer.vehicleNo}</Text> to <Text style={styles.confirmBoldZone}>{pendingTransfer.targetZoneName}</Text>?
            </Text>

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPendingTransfer(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDispatchBtn}
                onPress={handleConfirmTransfer}
              >
                <Text style={styles.confirmDispatchBtnText}>Confirm Dispatch ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  rootView: { flex: 1, position: 'relative' },
  container: { flex: 1 },
  content: { paddingBottom: 24, gap: 16 },
  stationHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  stationTitleText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  stationBadge: { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stationBadgeText: { color: '#38bdf8', fontSize: 12, fontWeight: '800' },
  emptyCard: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', padding: 40, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  emptySub: { color: '#64748b', fontSize: 13, textAlign: 'center' },
  cardsGrid: { gap: 16 },
  vehicleCardWrapper: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 16, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  cardHeaderArea: { gap: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plateWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#facc15', borderRadius: 6, borderWidth: 1, borderColor: '#eab308', overflow: 'hidden' },
  plateLeftBar: { backgroundColor: '#000000', paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  plateFlag: { fontSize: 10 },
  plateCountryCode: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  plateRightArea: { paddingHorizontal: 10, paddingVertical: 4 },
  plateText: { color: '#000000', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chevronWrapper: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  sectionHeaderLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  taskRestoreBtn: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)' },
  taskRestoreBtnText: { color: '#10b981' },
  dispatchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLogLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  auditLogLinkText: { color: '#38bdf8', fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14, 165, 233, 0.15)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  timerPillText: { color: '#38bdf8', fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  progressContainer: { gap: 4 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabelText: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  progressPercentGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tinyDoneIconGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 185, 129, 0.15)', borderRadius: 10, padding: 2 },
  progressPercentText: { color: '#38bdf8', fontSize: 11, fontWeight: '700' },
  progressBarBg: { height: 6, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#0ea5e9', borderRadius: 3 },
  remarksSection: { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)', borderRadius: 10, padding: 12, gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', marginTop: 4 },
  remarksHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  remarksSectionLabel: { color: '#fbbf24', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  remarksBodyText: { color: '#e2e8f0', fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  tasksSection: { gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', paddingTop: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  otherBayTaskRow: { backgroundColor: 'rgba(255, 255, 255, 0.01)', borderColor: 'rgba(255, 255, 255, 0.04)', opacity: 0.8 },
  taskLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskName: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  otherBayTaskName: { color: '#94a3b8' },
  completedTaskName: { color: '#94a3b8', textDecorationLine: 'line-through' },
  taskDoneBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  taskDoneBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  lockedTaskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  lockedTaskBadgeText: { color: '#64748b', fontSize: 10, fontWeight: '800' },
  lockedTaskDoneText: { color: '#10b981' },
  taskFinishedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  taskFinishedText: { color: '#10b981', fontSize: 10, fontWeight: '800' },
  dispatchRow: { gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', paddingTop: 12 },
  dispatchLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dispatchBtnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dispatchBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dispatchBtnAlignment: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' },
  dispatchBtnHoist: { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' },
  dispatchBtnWorkshop: { backgroundColor: 'rgba(14, 165, 233, 0.12)', borderColor: 'rgba(14, 165, 233, 0.3)' },
  dispatchBtnAdvisor: { backgroundColor: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.4)', marginLeft: 'auto' },
  dispatchBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },

  // Confirmation Modal Styles
  confirmOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  confirmBackdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}) },
  confirmCard: { width: '90%', maxWidth: 400, backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', padding: 20, gap: 16, zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  confirmBodyText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { color: '#facc15', fontWeight: '800' },
  confirmBoldZone: { color: '#38bdf8', fontWeight: '800' },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  cancelBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  confirmDispatchBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0ea5e9' },
  confirmDispatchBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
