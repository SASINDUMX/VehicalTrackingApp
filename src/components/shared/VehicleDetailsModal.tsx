import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { BayZone, TaskType, Vehicle } from '../../types/vehicle';
import { 
  X, Wrench, Shield, Navigation, Pencil, Save, CheckSquare, Square, Lock, 
  Clock, CheckCircle2, Circle, ArrowRight, UserCheck, Calendar, Trash2, AlertTriangle, Droplets
} from 'lucide-react-native';

import { LicensePlate } from './LicensePlate';
import { StatusPill } from './StatusPill';
import { BaseModal } from './BaseModal';
import { ConfirmModal } from './ConfirmModal';
import { VehicleNotePill } from './VehicleNotePill';
import { getStageDurationBreakdown, formatDurationString, getActiveStageNetSeconds, getTaskTypeForBay, getVehicleEffectiveEndDate } from '../../utils/vehicleUtils';
import { getNetWorkingSeconds, getCurrentActiveBreak } from '../../utils/workshopHoursUtils';
import { useTheme } from '../../context/ThemeContext';
import { getBayDefinitions } from '../../constants/bays';

const STAGE_ICONS: Record<BayZone, any> = {
  workshop: Wrench,
  alignment: Navigation,
  hoist: Droplets,
  inspection: CheckCircle2,
  completed: CheckCircle2,
};

const getStageOrder = (colors?: any) =>
  getBayDefinitions(colors).map(bay => ({
    zone: bay.id,
    name: bay.name,
    icon: STAGE_ICONS[bay.id] || CheckCircle2,
    color: bay.color,
  }));

const calculateTimers = (vehicle: Vehicle) => {
  const now = new Date();
  const effectiveEnd = getVehicleEffectiveEndDate(vehicle);

  // Net & Gross Elapsed Time since Intake (stops when entering inspection zone or finished)
  const rawNetSec = getNetWorkingSeconds(vehicle.intake_at, effectiveEnd);
  const totalPausedSec = vehicle.stage_logs.reduce((sum, l) => sum + (l.paused_seconds || 0), 0) +
    (vehicle.is_paused && vehicle.paused_at ? Math.max(0, Math.floor((effectiveEnd.getTime() - new Date(vehicle.paused_at).getTime()) / 1000)) : (vehicle.paused_seconds || 0));
  const netSec = Math.max(0, rawNetSec - totalPausedSec);
  const grossSec = Math.max(0, Math.floor((effectiveEnd.getTime() - new Date(vehicle.intake_at).getTime()) / 1000));

  let stageDuration = '0m 00s';
  const lastLog = vehicle.stage_logs[vehicle.stage_logs.length - 1];

  if (vehicle.current_zone === 'inspection') {
    stageDuration = 'READY';
  } else if (lastLog && !lastLog.exited_at) {
    const bayTaskType = getTaskTypeForBay(vehicle.current_zone);
    const currentTask = vehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) || vehicle.tasks.find(t => t.task_type === bayTaskType);

    if (!lastLog.work_started_at) {
      const enterMs = new Date(lastLog.entered_at).getTime();
      const idleSec = Math.max(0, Math.floor((now.getTime() - enterMs) / 1000));
      stageDuration = `IDLE · ${formatDurationString(idleSec, true)}`;
    } else if (currentTask && currentTask.is_completed && currentTask.completed_at) {
      const completedMs = new Date(currentTask.completed_at).getTime();
      const postIdleSec = Math.max(0, Math.floor((now.getTime() - completedMs) / 1000));
      stageDuration = `IDLE · ${formatDurationString(postIdleSec, true)}`;
    } else {
      const workStartMs = new Date(lastLog.work_started_at).getTime();
      const activeSec = Math.max(0, Math.floor((now.getTime() - workStartMs) / 1000));
      const timeStr = formatDurationString(activeSec, true);
      const activeBreak = getCurrentActiveBreak(now);
      if (activeBreak) {
        stageDuration = `⏸ ${timeStr} (${activeBreak.name})`;
      } else {
        stageDuration = timeStr;
      }
    }
  }

  return {
    totalElapsedStr: formatDurationString(netSec, true),
    grossElapsedStr: formatDurationString(grossSec, true),
    activeStageDuration: stageDuration,
  };
};

export const VehicleDetailsModal: React.FC = () => {
  const { selectedVehicle, setSelectedVehicle, transferVehicleZone, updateVehicleJobOrder, deleteVehicle, updateUrgency } = useVehicles();
  const { canRelocateVehicle, canAddVehicle, canDeleteVehicle, displayName } = usePermissions();
  const { colors, isDark } = useTheme();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>(() =>
    selectedVehicle ? selectedVehicle.tasks.filter(t => t.is_required).map(t => t.task_type) : []
  );
  const [remarks, setRemarks] = useState<string>(() => selectedVehicle?.remarks || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const initialTimers = useMemo(() => {
    if (!selectedVehicle) return { totalElapsedStr: '0m 00s', grossElapsedStr: '0m 00s', activeStageDuration: '0m 00s' };
    return calculateTimers(selectedVehicle);
  }, [selectedVehicle?.id]);

  const [activeStageDuration, setActiveStageDuration] = useState<string>(initialTimers.activeStageDuration);
  const [totalElapsedStr, setTotalElapsedStr] = useState<string>(initialTimers.totalElapsedStr);
  const [grossElapsedStr, setGrossElapsedStr] = useState<string>(initialTimers.grossElapsedStr);
  const [localIsUrgent, setLocalIsUrgent] = useState<boolean>(() => selectedVehicle?.is_urgent || false);
  const [localUrgentNote, setLocalUrgentNote] = useState<string>(() => selectedVehicle?.urgent_note || '');

  useEffect(() => {
    if (selectedVehicle) {
      const activeTaskTypes = selectedVehicle.tasks
        .filter(t => t.is_required)
        .map(t => t.task_type);
      setSelectedTasks(activeTaskTypes);
      setRemarks(selectedVehicle.remarks || '');
      setIsEditing(false);
      setLocalIsUrgent(selectedVehicle.is_urgent || false);
      setLocalUrgentNote(selectedVehicle.urgent_note || '');

      const current = calculateTimers(selectedVehicle);
      setActiveStageDuration(current.activeStageDuration);
      setTotalElapsedStr(current.totalElapsedStr);
      setGrossElapsedStr(current.grossElapsedStr);
    }
  }, [selectedVehicle?.id]);

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
      const timers = calculateTimers(selectedVehicle);
      setTotalElapsedStr(timers.totalElapsedStr);
      setGrossElapsedStr(timers.grossElapsedStr);
      setActiveStageDuration(timers.activeStageDuration);
    };

    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [selectedVehicle?.id]);

  const currentZone = selectedVehicle?.current_zone;

  // Memoize timeline stage calculation so it only recalculates when vehicle data or active stage duration changes
  // NOTE: must be declared BEFORE the early return to satisfy React Rules of Hooks
  const timelineStagesData = useMemo(() => {
    if (!selectedVehicle) return [];

    const requiredTaskTypes = selectedVehicle.tasks
      .filter(t => t.is_required)
      .map(t => t.task_type);

    const isWorkshopReq = requiredTaskTypes.includes('general_service');
    const isAlignmentReq = requiredTaskTypes.includes('wheel_alignment');
    const isHoistReq = requiredTaskTypes.includes('hoist_service');

    const isRequiredForZone = (zone: BayZone) => {
      if (zone === 'workshop') return isWorkshopReq;
      if (zone === 'alignment') return isAlignmentReq;
      if (zone === 'hoist') return isHoistReq;
      if (zone === 'inspection') return true;
      return false;
    };

    const masterStages = getStageOrder(colors).map(s => ({
      ...s,
      isRequired: isRequiredForZone(s.zone),
    }));

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

    const currentZoneInner = selectedVehicle.current_zone;
    relevantStages.forEach(s => {
      const isCurrent = currentZoneInner === s.zone;
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
      const isCurrent = currentZoneInner === stageDef.zone;
      const logsForZone = selectedVehicle.stage_logs.filter(l => l.to_zone === stageDef.zone);
      const hasVisited = logsForZone.length > 0;
      const hasExitedAll = hasVisited && logsForZone.every(l => Boolean(l.exited_at));
      const isCompleted = hasExitedAll && !isCurrent;
      const isLastInOrder = idx === orderedTimelineNodes.length - 1;

      const isInspection = stageDef.zone === 'inspection';

      // Inspection zone has zero labor machinery: short-circuit cleanly
      if (isInspection) {
        return {
          stageDef,
          isCurrent,
          logsForZone,
          isCompleted,
          isCancelled: false,
          isLastInOrder,
          isInspection: true,
          isStageIdle: false,
          spentStr: '',
          breakNotes: [],
          queueNotes: [],
          workCompletedAt: null,
        };
      }

      const bayTaskType = getTaskTypeForBay(stageDef.zone);
      const currentTask = selectedVehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) || selectedVehicle.tasks.find(t => t.task_type === bayTaskType);
      const workCompletedAt = currentTask?.is_completed ? currentTask.completed_at : null;

      const latestLog = logsForZone[logsForZone.length - 1];
      const isStageIdle = Boolean(
        isCurrent && latestLog && !latestLog.exited_at && (!latestLog.work_started_at || Boolean(workCompletedAt))
      );

      let totalNetSec = 0;
      const breakNotes: string[] = [];
      const queueNotes: string[] = [];

      logsForZone.forEach(l => {
        const breakdown = getStageDurationBreakdown(
          l.entered_at,
          l.exited_at,
          false,
          null,
          0,
          l.work_started_at,
          l.idle_seconds,
          workCompletedAt
        );
        totalNetSec += breakdown.netSec;
        if (breakdown.breakNote) breakNotes.push(breakdown.breakNote);
        if (breakdown.queueNote) queueNotes.push(breakdown.queueNote);
      });

      const spentStr = isCurrent ? activeStageDuration : formatDurationString(totalNetSec, true);
      const isCancelled = stageDef.zone !== 'inspection' && !isCurrent && !isCompleted && (currentZoneInner === 'inspection' || selectedVehicle.is_finished);

      return {
        stageDef,
        isCurrent,
        logsForZone,
        isCompleted,
        isCancelled,
        isLastInOrder,
        isInspection: false,
        isStageIdle,
        spentStr,
        breakNotes,
        queueNotes,
        workCompletedAt,
      };
    });
  }, [selectedVehicle, colors, activeStageDuration]);

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
      await updateUrgency(selectedVehicle.id, localIsUrgent, localIsUrgent ? localUrgentNote : null);
      setIsEditing(false);
      setSelectedVehicle(null);
    } catch (err) {
      console.error('Failed to update Job Order:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <BaseModal
        visible={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        maxWidth={680}
        scrollable={true}
        headerLeft={
          <View style={styles.headerLeftRow}>
            <LicensePlate number={selectedVehicle.vehicle_no} size="md" />
            <VehicleNotePill vehicle={selectedVehicle} size="md" />
          </View>
        }
        headerRight={
          canAddVehicle && !isEditing ? (
            <TouchableOpacity
              style={[styles.editPencilBtn, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}
              onPress={() => setIsEditing(true)}
              activeOpacity={0.7}
            >
              <Pencil size={16} color={colors.primaryLight} />
            </TouchableOpacity>
          ) : null
        }
        footer={
          isEditing ? (
            <View style={styles.editFooterRow}>
              <TouchableOpacity
                style={[styles.cancelEditBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]}
                onPress={() => {
                  setIsEditing(false);
                  setRemarks(selectedVehicle.remarks || '');
                  setLocalIsUrgent(selectedVehicle.is_urgent || false);
                  setLocalUrgentNote(selectedVehicle.urgent_note || '');
                }}
              >
                <Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveEditBtn,
                  { backgroundColor: colors.primary },
                  isSubmitting && { opacity: 0.5, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }
                ]}
                onPress={() => { if (!isSubmitting) handleSaveJobOrder(); }}
                activeOpacity={isSubmitting ? 1 : 0.7}
              >
                <Save size={16} color="#ffffff" />
                <Text style={styles.saveEditText}>{isSubmitting ? 'Saving...' : 'Save Job Order'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.footerStandardRow}>
              <View style={[styles.totalTimePill, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
                <Clock size={15} color={colors.primaryLight} />
                <View style={styles.totalTimeTextCol}>
                  <Text style={[styles.totalTimeText, { color: colors.primaryLight }]}>Net Work: {totalElapsedStr}</Text>
                  {grossElapsedStr !== totalElapsedStr && (
                    <Text style={[styles.grossTimeSubText, { color: colors.textMuted }]}>Total Shop: {grossElapsedStr}</Text>
                  )}
                </View>
              </View>

              <View style={styles.footerRightButtons}>
                {canDeleteVehicle && (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: colors.dangerDim, borderColor: colors.dangerBorder }]}
                    onPress={() => setShowDeleteConfirm(true)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={14} color={colors.danger} />
                    <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
                  onPress={() => setSelectedVehicle(null)}
                >
                  <Text style={[styles.closeText, { color: colors.textPrimary }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        }
      >
        <View style={styles.bodyContent}>
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
                        style={[
                          styles.taskChip,
                          {
                            backgroundColor: isSelected 
                              ? colors.bayWorkshopDim 
                              : isCompleted 
                              ? colors.successDim 
                              : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                            borderColor: isSelected 
                              ? colors.bayWorkshop 
                              : isCompleted 
                              ? colors.successBorder 
                              : colors.borderGlass
                          }
                        ]}
                        onPress={() => { if (!isCompleted) toggleTask('general_service'); }}
                        activeOpacity={isCompleted ? 1 : 0.7}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color={colors.success} />
                            <Text style={[styles.lockedTaskText, { color: colors.success }]}>General Service (Done ✓)</Text>
                            <Lock size={12} color={colors.success} />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color={colors.bayWorkshopLight} /> : <Square size={16} color={colors.textMuted} />}
                            <Text style={[styles.chipText, { color: isSelected ? colors.textPrimary : colors.textSecondary }]}>General Service</Text>
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
                        style={[
                          styles.taskChip,
                          {
                            backgroundColor: isSelected 
                              ? colors.bayAlignmentDim 
                              : isCompleted 
                              ? colors.successDim 
                              : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                            borderColor: isSelected 
                              ? colors.bayAlignment 
                              : isCompleted 
                              ? colors.successBorder 
                              : colors.borderGlass
                          }
                        ]}
                        onPress={() => { if (!isCompleted) toggleTask('wheel_alignment'); }}
                        activeOpacity={isCompleted ? 1 : 0.7}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color={colors.success} />
                            <Text style={[styles.lockedTaskText, { color: colors.success }]}>Wheel Alignment (Done ✓)</Text>
                            <Lock size={12} color={colors.success} />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color={colors.bayAlignmentLight} /> : <Square size={16} color={colors.textMuted} />}
                            <Text style={[styles.chipText, { color: isSelected ? colors.textPrimary : colors.textSecondary }]}>Wheel Alignment</Text>
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
                        style={[
                          styles.taskChip,
                          {
                            backgroundColor: isSelected 
                              ? colors.bayHoistDim 
                              : isCompleted 
                              ? colors.successDim 
                              : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                            borderColor: isSelected 
                              ? colors.bayHoist 
                              : isCompleted 
                              ? colors.successBorder 
                              : colors.borderGlass
                          }
                        ]}
                        onPress={() => { if (!isCompleted) toggleTask('hoist_service'); }}
                        activeOpacity={isCompleted ? 1 : 0.7}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare size={16} color={colors.success} />
                            <Text style={[styles.lockedTaskText, { color: colors.success }]}>Hoist Service (Done ✓)</Text>
                            <Lock size={12} color={colors.success} />
                          </>
                        ) : (
                          <>
                            {isSelected ? <CheckSquare size={16} color={colors.bayHoistLight} /> : <Square size={16} color={colors.textMuted} />}
                            <Text style={[styles.chipText, { color: isSelected ? colors.textPrimary : colors.textSecondary }]}>Hoist Service</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                </View>

                {/* Urgency Section — Edit Mode */}
                <View style={styles.remarksEditGroup}>
                  <Text style={[styles.editSectionTitle, { color: colors.textSecondary }]}>VEHICLE PRIORITY / URGENCY:</Text>
                  <TouchableOpacity
                    style={[
                      styles.urgencyToggleCard,
                      {
                        borderColor: localIsUrgent ? colors.dangerBorder : colors.borderGlass,
                        backgroundColor: localIsUrgent ? colors.dangerDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)')
                      }
                    ]}
                    onPress={() => setLocalIsUrgent(!localIsUrgent)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.urgencyToggleRow}>
                      <AlertTriangle size={16} color={localIsUrgent ? colors.danger : colors.textMuted} />
                      <Text style={[styles.urgencyToggleLabel, { color: localIsUrgent ? colors.danger : colors.textSecondary }]}>
                        {localIsUrgent ? '⚡ URGENT VEHICLE — Priority Flagged' : 'Mark as Urgent Vehicle'}
                      </Text>
                    </View>
                    {localIsUrgent && <CheckSquare size={16} color={colors.danger} />}
                  </TouchableOpacity>

                  {localIsUrgent && (
                    <TextInput
                      style={[
                        styles.textAreaInput,
                        {
                          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                          borderColor: 'rgba(239, 68, 68, 0.4)',
                          color: colors.textPrimary,
                        }
                      ]}
                      value={localUrgentNote}
                      onChangeText={setLocalUrgentNote}
                      placeholder="Add urgent note (e.g. Customer waiting in lounge, delivery by 11:30 AM)..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={3}
                    />
                  )}
                </View>

                <View style={styles.remarksEditGroup}>
                  <Text style={[styles.editSectionTitle, { color: colors.textSecondary }]}>UPDATE REMARKS / INSTRUCTIONS:</Text>
                  <TextInput
                    style={[
                      styles.textAreaInput,
                      {
                        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                        borderColor: colors.borderGlass,
                        color: colors.textPrimary,
                      }
                    ]}
                    placeholder="Enter updated customer requests or service notes..."
                    placeholderTextColor={colors.textMuted}
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
                <Text style={[styles.stepperTitle, { color: colors.textMuted }]}>WORKSHOP STAGE TIMELINE & AUDIT LOG:</Text>

                {/* Vertical Stepper Timeline list */}
                <View style={styles.timelineList}>
                  {timelineStagesData.map((node, nodeIdx) => {
                    const {
                      stageDef,
                      isCurrent,
                      logsForZone,
                      isCompleted,
                      isCancelled,
                      isLastInOrder,
                      isInspection,
                      isStageIdle,
                      spentStr,
                      breakNotes,
                      queueNotes,
                      workCompletedAt,
                    } = node;
                    const isTaskDone = Boolean(workCompletedAt);
                    // A stage is only fully finished/done if it has been exited (isCompleted), OR if the task is done and it is NOT idle (i.e. not in 2nd idle queue-out awaiting dispatch)
                    const isFullyFinishedOrDone = isCompleted;
                    const isSecondIdleDone = isCurrent && isTaskDone && isStageIdle;
                    // Inspection is the final ready/handover staging area - never color a working blue line from it
                    const isWorkingActive = isCurrent && !isStageIdle && !isTaskDone && !isInspection;

                    const nextNode = timelineStagesData[nodeIdx + 1];
                    const isNextCancelled = nextNode?.isCancelled;

                    // Icon color harmonizes with node state
                    const nodeIconColor = isCurrent && isInspection
                      ? colors.success
                      : isStageIdle && isCurrent
                      ? colors.warningLight
                      : isFullyFinishedOrDone
                      ? colors.success
                      : isWorkingActive
                      ? colors.primaryLight
                      : isCancelled
                      ? colors.danger
                      : colors.textMuted;

                    const StageIconComponent = stageDef.icon;

                    return (
                      <View key={stageDef.zone} style={styles.timelineItem}>
                        <View style={styles.timelineNodeColumn}>
                          <View style={[
                            styles.nodeCircle,
                            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderGlassBright },
                            isCurrent && isInspection && { borderColor: colors.success, backgroundColor: colors.successDim },
                            isCurrent && isStageIdle && { borderColor: colors.warning, backgroundColor: colors.warningDim },
                            !isStageIdle && isFullyFinishedOrDone && { borderColor: colors.success, backgroundColor: colors.successDim },
                            !isStageIdle && isWorkingActive && { borderColor: colors.primary, backgroundColor: colors.primaryDim },
                            isCancelled && { borderColor: colors.danger, backgroundColor: colors.dangerDim },
                            !isCurrent && !isCompleted && !isCancelled && { borderColor: colors.borderGlassBright, backgroundColor: colors.surfaceOverlay }
                          ]}>
                            <StageIconComponent size={16} color={nodeIconColor} />
                          </View>
                          {!isLastInOrder && (
                            <>
                              {/* Background empty line */}
                              <View style={[styles.timelineLine, { backgroundColor: colors.borderGlassBright }]} />
                              {/* Do not color the stepper line if this is the final inspection zone or leading to a skipped/cancelled stage */}
                              {!isInspection && !isNextCancelled && (
                                <>
                                  {/* 100% full green line when stage has completed and exited */}
                                  {isFullyFinishedOrDone && <View style={[styles.timelineLine, styles.timelineLineDone, { backgroundColor: colors.success }]} />}
                                  {/* 100% amber line when task finished but vehicle is in 2nd idle waiting for dispatch to next bay */}
                                  {isSecondIdleDone && <View style={[styles.timelineLine, styles.timelineLineDone, { backgroundColor: colors.warning }]} />}
                                  {/* 50% blue line when stage is actively in progress */}
                                  {isWorkingActive && <View style={[styles.timelineLine, styles.timelineLineHalf, { backgroundColor: colors.primary }]} />}
                                </>
                              )}
                              {/* When first arrived & idle (queue in): 0% line (only the amber circle is lit) */}
                            </>
                          )}
                        </View>

                        <View style={styles.timelineContent}>
                          <View style={styles.timelineHeaderRow}>
                            <Text style={[styles.stageNameText, { color: colors.textPrimary }, isCurrent && { fontWeight: '800' }, isCancelled && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                              {stageDef.name}
                            </Text>
                            {isCurrent ? (
                              isInspection ? (
                                <StatusPill variant="READY" label="READY" size="sm" />
                              ) : (
                                <StatusPill
                                  variant={isStageIdle ? 'IDLE' : 'ACTIVE'}
                                  label={isStageIdle ? 'IDLE' : 'ACTIVE'}
                                  size="sm"
                                />
                              )
                            ) : isCompleted ? (
                              <StatusPill variant="DONE" label="DONE" size="sm" />
                            ) : isCancelled ? (
                              <StatusPill variant="SKIPPED" label="SKIPPED" size="sm" />
                            ) : (
                              <StatusPill variant="PENDING" label="PENDING" size="sm" />
                            )}
                          </View>

                          {isInspection ? (
                            /* Final Inspection: Pure, minimal dispatch entry */
                            logsForZone[0] ? (
                              <Text style={styles.logSubText}>
                                • Entered {formatSLSTime(logsForZone[0].entered_at)}
                              </Text>
                            ) : null
                          ) : (
                            /* Service Bays: Active/Idle status, timestamps, breaks & queue notes */
                            <>
                              <View style={styles.stageTimeRow}>
                                <View style={styles.timeTag}>
                                  <Clock size={12} color={isCurrent ? (isStageIdle ? colors.warning : colors.primary) : isCancelled ? colors.danger : colors.textMuted} />
                                  <Text style={[styles.timeTagText, { color: isCurrent ? (isStageIdle ? colors.warningLight : colors.primaryLight) : colors.textSecondary }, isCurrent && { fontWeight: '700' }, isCancelled && { color: colors.danger }]}>
                                    {isCurrent ? (
                                      `${isStageIdle ? 'Idle' : 'Active'}: ${spentStr}`
                                    ) : isCompleted ? `Spent: ${spentStr}` : isCancelled ? 'Skipped' : 'Pending'}
                                  </Text>
                                </View>
                              </View>

                              {/* Historical Log Timestamps (2 Rows: Entry/Start and Finish/Exit) */}
                              {logsForZone.map((l, lIdx) => {
                                const entryStartStr = `• Entered ${formatSLSTime(l.entered_at)}${l.work_started_at ? ` · Started ${formatSLSTime(l.work_started_at)}` : ''}`;
                                const finishExitParts: string[] = [];
                                if (workCompletedAt) finishExitParts.push(`Finished ${formatSLSTime(workCompletedAt)}`);
                                if (l.exited_at) finishExitParts.push(`Exited ${formatSLSTime(l.exited_at)}`);
                                const finishExitStr = finishExitParts.length > 0 ? `• ${finishExitParts.join(' · ')}` : null;

                                return (
                                  <View key={lIdx} style={styles.logSubRowContainer}>
                                    <Text style={styles.logSubText}>
                                      {entryStartStr}
                                    </Text>
                                    {finishExitStr && (
                                      <Text style={styles.logSubText}>
                                        {finishExitStr}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })}

                              {/* Break Deductions & Active/Idle Subtext */}
                              {breakNotes.map((note, nIdx) => (
                                <Text key={`bn-${nIdx}`} style={styles.breakNoteSubText}>
                                  {note}
                                </Text>
                              ))}

                              {queueNotes.map((note, qIdx) => (
                                <Text key={`qn-${qIdx}`} style={styles.queueNoteSubText}>
                                  {note}
                                </Text>
                              ))}
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
        </View>
      </BaseModal>

      {/* Delete Confirmation Dialog */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete Job Sheet?"
        subtitle="Permanent Action"
        confirmVariant="danger"
        icon={<AlertTriangle size={20} color={colors.danger} />}
        description={
          <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
            Are you sure you want to permanently delete vehicle{' '}
            <Text style={[styles.confirmBoldPlate, { color: colors.warningLight }]}>
              {selectedVehicle.vehicle_no}
            </Text>
            ?{'\n\n'}This will remove the job sheet, task checklist, and all stage timing logs.
          </Text>
        }
        confirmLabel="Yes, Delete"
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await deleteVehicle(selectedVehicle.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', transition: 'opacity 100ms ease-out', animationDuration: '100ms' } as any : {}) },
  modalCard: { backgroundColor: '#0f172a', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxHeight: '90%', ...(Platform.OS === 'web' ? { boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.5)', transition: 'transform 100ms ease-out, opacity 100ms ease-out', animationDuration: '100ms' } as any : { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 }) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  headerLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  plateBadge: { backgroundColor: '#facc15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#eab308' },
  plateText: { color: '#000000', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  footerStandardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, width: '100%' },
  footerRightButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  deleteBtnText: { fontSize: 12, fontWeight: '700' },
  totalTimePill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(14, 165, 233, 0.12)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  totalTimeTextCol: { gap: 1 },
  totalTimeText: { color: '#38bdf8', fontSize: 12, fontWeight: '700' },
  grossTimeSubText: { color: '#94a3b8', fontSize: 10.5, fontWeight: '500' },
  editPencilBtn: { backgroundColor: 'rgba(14, 165, 233, 0.15)', borderWidth: 1, borderColor: 'rgba(14, 165, 233, 0.3)', padding: 8, borderRadius: 20 },
  closeBtnIcon: { backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 8, borderRadius: 20 },
  body: { padding: 20 },
  bodyContent: { gap: 16 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', width: '100%' },
  closeBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, flexShrink: 0 },
  closeText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  // Confirmation Modal Styles
  confirmOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 16 },
  confirmBackdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}) },
  confirmCard: { width: '100%', maxWidth: 420, borderRadius: 18, borderWidth: 1, padding: 20, gap: 16, zIndex: 10000, ...(Platform.OS === 'web' ? ({ boxShadow: '0px 12px 30px rgba(0, 0, 0, 0.6)' } as any) : { elevation: 12 }) },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmIconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  confirmTitleGroup: { flex: 1 },
  confirmTitle: { fontSize: 16, fontWeight: '800' },
  confirmSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  confirmBodyText: { fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { fontWeight: '800' },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  confirmCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  confirmCancelText: { fontSize: 13, fontWeight: '600' },
  confirmDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  confirmDeleteBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },

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
  activeStageControlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  stageTimerBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stageTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeTagText: { color: '#94a3b8', fontSize: 12, fontWeight: '500' },
  bayCodeText: { color: '#475569', fontSize: 10, fontWeight: '700' },
  logSubRowContainer: { gap: 2, marginTop: 2 },
  logSubText: { color: '#64748b', fontSize: 10.5, lineHeight: 15 },
  queueNoteSubText: { color: '#38bdf8', fontSize: 10.5, marginTop: 2 },
  breakNoteSubText: { color: '#fbbf24', fontSize: 10.5, marginTop: 2 },
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
  urgencyToggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1 },
  urgencyToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  urgencyToggleLabel: { fontSize: 13, fontWeight: '700' },
});



