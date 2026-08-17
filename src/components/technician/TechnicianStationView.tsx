import React from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Save, CheckSquare, Square, Pencil, CheckCircle2, Clock, Car, ChevronDown, ChevronUp, History, AlertTriangle, Lock, MessageSquare } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';
import { calculateJobSheetProgress } from '../../utils/vehicleUtils';
import { useTechnicianStation } from '../../hooks/useTechnicianStation';
import { Vehicle, VehicleTask } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';

export const TechnicianStationView: React.FC = React.memo(() => {
  const {
    activeBay,
    techName,
    activeTaskType,
    bayVehicles,
    elapsedTimes,
    expandedCards,
    pendingTransfer,
    isLoading,
    searchQuery,
    currentRole,
    canMarkTaskDone,
    canTransferVehicle,
    toggleExpand,
    toggleTaskCompletion,
    setSelectedVehicle,
    setPendingTransfer,
    handleRequestTransfer,
    handleConfirmTransfer,
  } = useTechnicianStation();
  const { colors, isDark } = useTheme();

  const renderVehicleItem = ({ item: vehicle }: { item: Vehicle }) => {
    const { completedCount, totalRequired: totalReq, percent } = calculateJobSheetProgress(vehicle.tasks);
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
      <View key={vehicle.id} style={[styles.vehicleCardWrapper, { backgroundColor: colors.surface, borderColor: colors.borderGlass }]}>
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
                        <View style={[styles.chevronWrapper, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.borderGlass }]}>
                          {isExpanded ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
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
                          <Text style={[styles.remarksBodyText, { color: colors.textPrimary }]}>{vehicle.remarks}</Text>
                        </View>
                      )}

                      {/* Station Assigned Task Checklist */}
                      <View style={[styles.tasksSection, { borderTopColor: colors.borderGlass }]}>
                        <Text style={[styles.sectionHeaderLabel, { color: colors.textMuted }]}>JOB SHEET TASKS ({vehicle.tasks.filter(t => t.is_required).length}):</Text>
                        {vehicle.tasks.filter(t => t.is_required).map(task => {
                          const isVehicleInInspectionOrFinished = vehicle.current_zone === 'inspection' || vehicle.is_finished;
                          const isMyBayTask = task.task_type === activeTaskType;
                          const isEditable = isMyBayTask && canMarkTaskDone(activeBay) && !isVehicleInInspectionOrFinished;

                          return (
                            <TouchableOpacity
                              key={task.id}
                              style={[
                                styles.taskRow,
                                {
                                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                                  borderColor: colors.borderGlass
                                },
                                (!isMyBayTask || isVehicleInInspectionOrFinished) && styles.otherBayTaskRow,
                                !isEditable && styles.disabledTaskRow,
                                Platform.OS === 'web' && !isEditable && ({ cursor: 'not-allowed' } as any),
                              ]}
                              activeOpacity={isEditable ? 0.7 : 1}
                              onPress={() => {
                                if (isEditable) {
                                  toggleTaskCompletion(vehicle.id, task.id, techName);
                                }
                              }}
                            >
                              <View style={styles.taskLeft}>
                                {task.is_completed ? (
                                  <CheckSquare size={18} color="#10b981" />
                                ) : (
                                  <Square size={18} color={isEditable ? colors.textSecondary : colors.textMuted} />
                                )}
                                <Text style={[
                                  styles.taskName,
                                  { color: colors.textPrimary },
                                  task.is_completed && styles.completedTaskName,
                                  (!isMyBayTask || isVehicleInInspectionOrFinished) && { color: colors.textMuted }
                                ]}>
                                  {task.task_name}
                                </Text>
                              </View>

                              {isEditable ? (
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
                                <View style={[styles.lockedTaskBadge, currentRole === 'supervisor' && styles.supervisorLockedBadge]}>
                                  <Lock size={12} color={task.is_completed ? "#10b981" : currentRole === 'supervisor' ? "#38bdf8" : "#64748b"} />
                                  <Text style={[styles.lockedTaskBadgeText, task.is_completed && styles.lockedTaskDoneText, currentRole === 'supervisor' && styles.supervisorLockedText]}>
                                    {task.is_completed
                                      ? 'DONE ✓'
                                      : isVehicleInInspectionOrFinished
                                      ? 'LOCKED'
                                      : currentRole === 'supervisor'
                                      ? 'READ-ONLY'
                                      : task.task_type === 'general_service'
                                      ? 'TECH 1 ONLY'
                                      : task.task_type === 'wheel_alignment'
                                      ? 'TECH 2 ONLY'
                                      : task.task_type === 'hoist_service'
                                      ? 'TECH 3 ONLY'
                                      : 'OTHER TECH'}
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
                                style={[styles.dispatchBtn, styles.dispatchBtnAlignment, !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'alignment', 'Wheel Alignment Bay');
                                }}
                                activeOpacity={isCanDispatch ? 0.7 : 1}
                              >
                                <Text style={styles.dispatchBtnText}>Alignment</Text>
                              </TouchableOpacity>
                            )}

                            {canShowHoistBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnHoist, !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'hoist', 'Hoist Service Bay');
                                }}
                                activeOpacity={isCanDispatch ? 0.7 : 1}
                              >
                                <Text style={styles.dispatchBtnText}>Hoist</Text>
                              </TouchableOpacity>
                            )}

                            {canShowWorkshopBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnWorkshop, !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'workshop', 'General Workshop Bay');
                                }}
                                activeOpacity={isCanDispatch ? 0.7 : 1}
                              >
                                <Text style={styles.dispatchBtnText}>Workshop</Text>
                              </TouchableOpacity>
                            )}

                            {canShowAdvisorBtn && (
                              <TouchableOpacity
                                style={[styles.dispatchBtn, styles.dispatchBtnAdvisor, !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }]}
                                onPress={() => {
                                  if (isCanDispatch) handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'inspection', 'Advisor Inspection Zone');
                                }}
                                activeOpacity={isCanDispatch ? 0.7 : 1}
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
  };

  return (
    <View style={styles.rootView}>
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
        <FlatList
          data={bayVehicles}
          keyExtractor={(item) => item.id}
          renderItem={renderVehicleItem}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={[styles.content, { gap: 16 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

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
});

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
  vehicleCardWrapper: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 16, gap: 14, ...(Platform.OS === 'web' ? ({ boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }) },
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
  otherBayTaskRow: { backgroundColor: 'rgba(255, 255, 255, 0.01)', borderColor: 'rgba(255, 255, 255, 0.04)' },
  disabledTaskRow: { opacity: 0.5, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  taskLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskName: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  otherBayTaskName: { color: '#94a3b8' },
  completedTaskName: { color: '#94a3b8', textDecorationLine: 'line-through' },
  taskDoneBtn: { backgroundColor: '#0ea5e9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  taskDoneBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  lockedTaskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  supervisorLockedBadge: { backgroundColor: 'rgba(14, 165, 233, 0.12)', borderColor: 'rgba(14, 165, 233, 0.3)' },
  lockedTaskBadgeText: { color: '#64748b', fontSize: 10, fontWeight: '800' },
  supervisorLockedText: { color: '#38bdf8' },
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
  confirmCard: { width: '90%', maxWidth: 400, backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', padding: 20, gap: 16, zIndex: 1000, ...(Platform.OS === 'web' ? ({ boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.5)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 }) },
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
