import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { BayZone, TaskType } from '../../types/vehicle';
import { 
  X, Wrench, Shield, Navigation, Pencil, Save, CheckSquare, Square, Lock, 
  Clock, CheckCircle2, Circle, ArrowRight, UserCheck, Calendar
} from 'lucide-react-native';

import { LicensePlate } from './LicensePlate';

const STAGE_ORDER: { zone: BayZone; name: string; code: string; icon: any; color: string }[] = [
  { zone: 'workshop', name: 'General Workshop Bay', code: 'BAY 01', icon: Wrench, color: '#06b6d4' },
  { zone: 'alignment', name: 'Wheel Alignment Bay', code: 'BAY 03', icon: Navigation, color: '#10b981' },
  { zone: 'hoist', name: 'Hoist Service Bay', code: 'BAY 02', icon: Shield, color: '#f59e0b' },
  { zone: 'inspection', name: 'Advisor Inspection Zone', code: 'FINAL', icon: CheckCircle2, color: '#a855f7' },
];

export const VehicleDetailsModal: React.FC = () => {
  const { selectedVehicle, setSelectedVehicle, transferVehicleZone, updateVehicleJobOrder } = useVehicles();
  const { canRelocateVehicle, canAddVehicle } = usePermissions();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([]);
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeStageDuration, setActiveStageDuration] = useState<string>('0m 00s');
  const [totalElapsedStr, setTotalElapsedStr] = useState<string>('0m 00s');

  useEffect(() => {
    if (selectedVehicle) {
      const activeTaskTypes = selectedVehicle.tasks
        .filter(t => t.is_required)
        .map(t => t.task_type);
      setSelectedTasks(activeTaskTypes);
      setRemarks(selectedVehicle.remarks || '');
      setIsEditing(false);
    }
  }, [selectedVehicle]);

  // Helper for Sri Lanka Standard Time (SLST) 12-hour AM/PM format
  const formatSLSTime = (dateStr?: string | null) => {
    if (!dateStr) return '--:--';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Colombo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Live timer tick for active current stage duration & total elapsed time
  useEffect(() => {
    if (!selectedVehicle) return;

    const updateTimers = () => {
      const now = Date.now();

      // Total Elapsed Time since Intake
      const intakeStart = new Date(selectedVehicle.intake_at).getTime();
      const totalSec = Math.max(0, Math.floor((now - intakeStart) / 1000));
      const totalHrs = Math.floor(totalSec / 3600);
      const totalMins = Math.floor((totalSec % 3600) / 60);
      const totalSecs = totalSec % 60;
      const padTotalSec = totalSecs < 10 ? `0${totalSecs}` : `${totalSecs}`;
      setTotalElapsedStr(
        totalHrs > 0
          ? `${totalHrs}h ${totalMins}m ${padTotalSec}s`
          : `${totalMins}m ${padTotalSec}s`
      );

      // Active Stage Duration
      const lastLog = selectedVehicle.stage_logs[selectedVehicle.stage_logs.length - 1];
      if (lastLog && !lastLog.exited_at) {
        const stageStart = new Date(lastLog.entered_at).getTime();
        const stageSec = Math.max(0, Math.floor((now - stageStart) / 1000));
        const sHrs = Math.floor(stageSec / 3600);
        const sMins = Math.floor((stageSec % 3600) / 60);
        const sSecs = stageSec % 60;
        const padSSecs = sSecs < 10 ? `0${sSecs}` : `${sSecs}`;
        setActiveStageDuration(
          sHrs > 0
            ? `${sHrs}h ${sMins}m ${padSSecs}s`
            : `${sMins}m ${padSSecs}s`
        );
      } else {
        setActiveStageDuration('0m 00s');
      }
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [selectedVehicle]);

  if (!selectedVehicle) return null;

  const completedTaskTypes = selectedVehicle.tasks
    .filter(t => t.is_completed)
    .map(t => t.task_type);

  const formatSpentTime = (sec?: number) => {
    if (!sec || sec <= 0) return '0m 00s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const padS = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      return `${h}h ${m}m ${padS}s`;
    }
    return `${m}m ${padS}s`;
  };

  const toggleTask = (type: TaskType) => {
    if (completedTaskTypes.includes(type)) return;
    if (selectedTasks.includes(type)) {
      if (selectedTasks.length > 1) {
        setSelectedTasks(selectedTasks.filter(t => t !== type));
      }
    } else {
      setSelectedTasks([...selectedTasks, type]);
    }
  };

  const handleSaveJobOrder = async () => {
    setIsSubmitting(true);
    try {
      await updateVehicleJobOrder(selectedVehicle.id, selectedTasks, remarks);
      setIsEditing(false);
      setSelectedVehicle(null);
    } catch (err) {
      console.error('Failed to update Job Order:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentZone = selectedVehicle.current_zone;

  return (
    <Modal visible={Boolean(selectedVehicle)} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeftRow}>
              <LicensePlate number={selectedVehicle.vehicle_no} size="md" />
            </View>

            <View style={styles.headerRightRow}>
              {canAddVehicle && !isEditing && selectedVehicle.current_zone !== 'inspection' && !selectedVehicle.is_finished && (
                <TouchableOpacity
                  style={styles.editPencilBtn}
                  onPress={() => setIsEditing(true)}
                  activeOpacity={0.7}
                >
                  <Pencil size={16} color="#38bdf8" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeBtnIcon} onPress={() => setSelectedVehicle(null)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {isEditing ? (
              /* --- EDIT JOB ORDER FORM MODE --- */
              <View style={styles.editContainer}>
                <Text style={styles.editSectionTitle}>EDIT WORKSHOP TASKS:</Text>
                <Text style={styles.editSubText}>
                  Tasks completed by technicians are locked and preserved.
                </Text>

                <View style={styles.tasksRow}>
                  {/* General Service */}
                  {(() => {
                    const isCompleted = completedTaskTypes.includes('general_service');
                    const isSelected = selectedTasks.includes('general_service');
                    return (
                      <TouchableOpacity
                        style={[styles.taskChip, isSelected && styles.activeTaskChip, isCompleted && styles.completedLockedChip]}
                        onPress={() => toggleTask('general_service')}
                        disabled={isCompleted}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color="#10b981" />
                            <Text style={styles.lockedTaskText}>General Service (Done ✓)</Text>
                            <Lock size={12} color="#10b981" />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color="#0ea5e9" /> : <Square size={16} color="#64748b" />}
                            <Text style={[styles.chipText, isSelected && styles.activeChipText]}>General Service</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })()}

                  {/* Wheel Alignment */}
                  {(() => {
                    const isCompleted = completedTaskTypes.includes('wheel_alignment');
                    const isSelected = selectedTasks.includes('wheel_alignment');
                    return (
                      <TouchableOpacity
                        style={[styles.taskChip, isSelected && styles.activeTaskChip, isCompleted && styles.completedLockedChip]}
                        onPress={() => toggleTask('wheel_alignment')}
                        disabled={isCompleted}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color="#10b981" />
                            <Text style={styles.lockedTaskText}>Wheel Alignment (Done ✓)</Text>
                            <Lock size={12} color="#10b981" />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color="#10b981" /> : <Square size={16} color="#64748b" />}
                            <Text style={[styles.chipText, isSelected && styles.activeChipText]}>Wheel Alignment</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })()}

                  {/* Hoist Service */}
                  {(() => {
                    const isCompleted = completedTaskTypes.includes('hoist_service');
                    const isSelected = selectedTasks.includes('hoist_service');
                    return (
                      <TouchableOpacity
                        style={[styles.taskChip, isSelected && styles.activeTaskChip, isCompleted && styles.completedLockedChip]}
                        onPress={() => toggleTask('hoist_service')}
                        disabled={isCompleted}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color="#10b981" />
                            <Text style={styles.lockedTaskText}>Hoist Service (Done ✓)</Text>
                            <Lock size={12} color="#10b981" />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color="#f59e0b" /> : <Square size={16} color="#64748b" />}
                            <Text style={[styles.chipText, isSelected && styles.activeChipText]}>Hoist Service</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                </View>

                <View style={styles.remarksEditGroup}>
                  <Text style={styles.editSectionTitle}>UPDATE REMARKS / INSTRUCTIONS:</Text>
                  <TextInput
                    style={styles.textAreaInput}
                    placeholder="Enter updated customer requests or service notes..."
                    placeholderTextColor="#475569"
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            ) : (
              /* --- HIGH-TECH STEPPER TIMELINE STAGE AUDIT MODE --- */
              <View style={styles.stepperContainer}>
                <Text style={styles.stepperTitle}>WORKSHOP STAGE TIMELINE & AUDIT LOG:</Text>

                {/* Vertical Stepper Timeline list */}
                <View style={styles.timelineList}>
                  {/* Dynamic Nodes: Completed -> Active -> Upcoming (Pending) */}
                  {(() => {
                    const requiredTaskTypes = selectedVehicle.tasks
                      .filter(t => t.is_required)
                      .map(t => t.task_type);

                    const isWorkshopReq = requiredTaskTypes.includes('general_service');
                    const isAlignmentReq = requiredTaskTypes.includes('wheel_alignment');
                    const isHoistReq = requiredTaskTypes.includes('hoist_service');

                    const masterStages = [
                      { zone: 'workshop' as BayZone, name: 'General Workshop Bay', code: 'BAY 01', icon: Wrench, color: '#06b6d4', isRequired: isWorkshopReq },
                      { zone: 'alignment' as BayZone, name: 'Wheel Alignment Bay', code: 'BAY 03', icon: Navigation, color: '#10b981', isRequired: isAlignmentReq },
                      { zone: 'hoist' as BayZone, name: 'Hoist Service Bay', code: 'BAY 02', icon: Shield, color: '#f59e0b', isRequired: isHoistReq },
                      { zone: 'inspection' as BayZone, name: 'Advisor Inspection Zone', code: 'FINAL', icon: CheckCircle2, color: '#a855f7', isRequired: true }
                    ];

                    // Filter only required stages or stages already visited/active
                    const relevantStages = masterStages.filter(s => {
                      const hasLogs = selectedVehicle.stage_logs.some(l => l.to_zone === s.zone);
                      const isCurrent = selectedVehicle.current_zone === s.zone;
                      return s.isRequired || hasLogs || isCurrent;
                    });

                    // Strictly sort: 1. Completed (visited & exited) -> 2. Active Current -> 3. Upcoming (Pending)
                    const completedNodes: typeof relevantStages = [];
                    let activeNode: typeof relevantStages[0] | null = null;
                    const pendingNodes: typeof relevantStages = [];

                    relevantStages.forEach(s => {
                      const isCurrent = currentZone === s.zone;
                      const logsForZone = selectedVehicle.stage_logs.filter(l => l.to_zone === s.zone);
                      const hasExitedAll = logsForZone.length > 0 && logsForZone.every(l => Boolean(l.exited_at));

                      if (isCurrent) {
                        activeNode = s;
                      } else if (hasExitedAll && !isCurrent) {
                        completedNodes.push(s);
                      } else {
                        pendingNodes.push(s);
                      }
                    });

                    const orderedTimelineNodes = [...completedNodes];
                    if (activeNode) {
                      orderedTimelineNodes.push(activeNode);
                    }
                    orderedTimelineNodes.push(...pendingNodes);

                    return orderedTimelineNodes.map((stageDef, idx) => {
                      const StageIcon = stageDef.icon;
                      const isCurrent = currentZone === stageDef.zone;
                      const logsForZone = selectedVehicle.stage_logs.filter(l => l.to_zone === stageDef.zone);
                      const hasVisited = logsForZone.length > 0;
                      const hasExitedAll = hasVisited && logsForZone.every(l => Boolean(l.exited_at));
                      const isCompleted = hasExitedAll && !isCurrent;
                      const isLastInOrder = idx === orderedTimelineNodes.length - 1;

                      const totalSpentSec = logsForZone.reduce((acc, log) => {
                        if (log.duration_seconds) return acc + log.duration_seconds;
                        if (!log.exited_at) {
                          const start = new Date(log.entered_at).getTime();
                          return acc + Math.max(0, Math.floor((Date.now() - start) / 1000));
                        }
                        return acc;
                      }, 0);

                      const spentStr = isCurrent ? activeStageDuration : formatSpentTime(totalSpentSec);

                      const isInspectionOrFinished = currentZone === 'inspection' || selectedVehicle.is_finished;
                      const isCancelled = !isCurrent && !isCompleted && isInspectionOrFinished;

                      return (
                        <View key={stageDef.zone} style={styles.timelineItem}>
                          <View style={styles.timelineNodeColumn}>
                            <View style={[
                              styles.nodeCircle,
                              isCurrent && { borderColor: stageDef.color, backgroundColor: `${stageDef.color}25` },
                              isCompleted && styles.nodeCircleDone,
                              isCancelled && styles.nodeCircleCancelled,
                              !isCurrent && !isCompleted && !isCancelled && styles.nodeCircleUpcoming
                            ]}>
                              <StageIcon size={16} color={isCurrent ? stageDef.color : isCompleted ? '#10b981' : isCancelled ? '#ef4444' : '#475569'} />
                            </View>
                            {!isLastInOrder && (
                              <>
                                <View style={styles.timelineLine} />
                                {isCompleted && <View style={[styles.timelineLine, styles.timelineLineDone]} />}
                                {isCurrent && <View style={[styles.timelineLine, styles.timelineLineHalf, { backgroundColor: stageDef.color }]} />}
                              </>
                            )}
                          </View>

                          <View style={styles.timelineContent}>
                            <View style={styles.timelineHeaderRow}>
                              <Text style={[styles.stageNameText, isCurrent && { color: stageDef.color, fontWeight: '800' }, isCancelled && { color: '#94a3b8', textDecorationLine: 'line-through' }]}>
                                {stageDef.name}
                              </Text>
                              {isCurrent ? (
                                <View style={[styles.currentBadge, { backgroundColor: `${stageDef.color}25`, borderColor: stageDef.color }]}>
                                  <View style={[styles.pulsingDot, { backgroundColor: stageDef.color }]} />
                                  <Text style={[styles.currentBadgeText, { color: stageDef.color }]}>ACTIVE</Text>
                                </View>
                              ) : isCompleted ? (
                                <View style={styles.doneBadge}>
                                  <Text style={styles.doneBadgeText}>COMPLETED</Text>
                                </View>
                              ) : isCancelled ? (
                                <View style={styles.cancelledBadge}>
                                  <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
                                </View>
                              ) : (
                                <View style={styles.upcomingBadge}>
                                  <Text style={styles.upcomingBadgeText}>PENDING</Text>
                                </View>
                              )}
                            </View>

                            <View style={styles.stageTimeRow}>
                              <View style={styles.timeTag}>
                                <Clock size={12} color={isCurrent ? stageDef.color : isCancelled ? '#ef4444' : '#94a3b8'} />
                                <Text style={[styles.timeTagText, isCurrent && { color: stageDef.color, fontWeight: '700' }, isCancelled && { color: '#fca5a5' }]}>
                                  {isCurrent ? `Active: ${spentStr}` : isCompleted ? `Spent: ${spentStr}` : isCancelled ? 'Bypassed / Cancelled' : 'Pending'}
                                </Text>
                              </View>
                            </View>

                            {/* Historical Log Timestamps */}
                            {logsForZone.map((l, lIdx) => (
                              <Text key={lIdx} style={styles.logSubText}>
                                • Entered {formatSLSTime(l.entered_at)}
                                {l.exited_at ? ` → Exited ${formatSLSTime(l.exited_at)}` : ' (Current)'}
                              </Text>
                            ))}
                          </View>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {isEditing ? (
              <View style={styles.editFooterRow}>
                <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setIsEditing(false)}>
                  <Text style={styles.cancelEditText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveEditBtn, isSubmitting && { opacity: 0.5 }]}
                  onPress={handleSaveJobOrder}
                  disabled={isSubmitting}
                >
                  <Save size={16} color="#ffffff" />
                  <Text style={styles.saveEditText}>{isSubmitting ? 'Saving...' : 'Save Job Order'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.footerStandardRow}>
                <View style={styles.totalTimePill}>
                  <Clock size={14} color="#38bdf8" />
                  <Text style={styles.totalTimeText}>Total Spent: {totalElapsedStr}</Text>
                </View>

                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedVehicle(null)}>
                  <Text style={styles.closeText}>Close Window</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } as any : {}) },
  modalCard: { backgroundColor: '#0f172a', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateBadge: { backgroundColor: '#facc15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#eab308' },
  plateText: { color: '#000000', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  footerStandardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  totalTimePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(14, 165, 233, 0.12)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  totalTimeText: { color: '#38bdf8', fontSize: 12, fontWeight: '700' },
  editPencilBtn: { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', padding: 8, borderRadius: 20 },
  closeBtnIcon: { backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 8, borderRadius: 20 },
  body: { padding: 20 },
  bodyContent: { gap: 16 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', alignItems: 'flex-end' },
  closeBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  closeText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  /* Stepper Timeline Audit Styles */
  stepperContainer: { gap: 16 },
  remarksBox: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', padding: 12, borderRadius: 12, gap: 4 },
  remarksLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  remarksText: { color: '#e2e8f0', fontSize: 13, fontStyle: 'italic' },
  stepperTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timelineList: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 14 },
  timelineNodeColumn: { alignItems: 'center', width: 28, position: 'relative' },
  nodeCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#334155', backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  nodeCircleDone: { borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  nodeCircleCancelled: { borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  nodeCircleUpcoming: { borderColor: '#334155', backgroundColor: 'rgba(255, 255, 255, 0.02)' },
  timelineLine: { width: 2, position: 'absolute', top: 28, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.1)', zIndex: 1 },
  timelineLineDone: { backgroundColor: '#10b981', zIndex: 2 },
  timelineLineHalf: { height: '50%', zIndex: 2 },
  timelineContent: { flex: 1, paddingBottom: 24, gap: 4 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageNameText: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pulsingDot: { width: 6, height: 6, borderRadius: 3 },
  currentBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  doneBadge: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  doneBadgeText: { color: '#10b981', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cancelledBadge: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  cancelledBadgeText: { color: '#fca5a5', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  upcomingBadge: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  upcomingBadgeText: { color: '#64748b', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  stageTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeTagText: { color: '#94a3b8', fontSize: 12, fontWeight: '500' },
  bayCodeText: { color: '#475569', fontSize: 10, fontWeight: '700' },
  logSubText: { color: '#64748b', fontSize: 10, marginTop: 2 },
  sectionTitle: { color: '#94a3b8', fontWeight: '700', fontSize: 11, letterSpacing: 1, marginTop: 8 },
  btnRow: { flexDirection: 'row', gap: 10 },
  relocateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  btnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  /* Edit Mode Styles */
  editContainer: { gap: 14 },
  editSectionTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  editSubText: { color: '#64748b', fontSize: 11, marginTop: -8 },
  tasksRow: { gap: 10 },
  taskChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255, 255, 255, 0.02)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 12, borderRadius: 12 },
  activeTaskChip: { borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)' },
  completedLockedChip: { borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  chipText: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  activeChipText: { color: '#f8fafc', fontWeight: '600' },
  lockedTaskText: { color: '#34d399', fontSize: 13, fontWeight: '700', flex: 1 },
  remarksEditGroup: { gap: 6, marginTop: 10 },
  textAreaInput: { backgroundColor: 'rgba(0, 0, 0, 0.2)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#ffffff', fontSize: 13, height: 70, textAlignVertical: 'top' },
  editFooterRow: { flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'flex-end' },
  cancelEditBtn: { backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  cancelEditText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  saveEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0ea5e9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  saveEditText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});



