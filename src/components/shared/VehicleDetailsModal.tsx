import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { BayZone, TaskType, Vehicle } from '../../types/vehicle';
import { 
  Wrench, Navigation, Pencil, Save, 
  Clock, CheckCircle2, Trash2, AlertTriangle, Droplets
} from 'lucide-react-native';

import { LicensePlate } from './LicensePlate';
import { StatusPill } from './StatusPill';
import { BaseModal } from './BaseModal';
import { ConfirmModal } from './ConfirmModal';
import { VehicleNotePill } from './VehicleNotePill';
import { TaskSelectorChips } from './TaskSelectorChips';
import { UrgentToggleInput } from './UrgentToggleInput';
import { computeVehicleModalTimers } from '../../utils/vehicleUtils';
import { computeVehicleTimelineStages } from '../../utils/timelineUtils';
import { useTheme } from '../../context/ThemeContext';
import { getBayDefinitions } from '../../constants/bays';
import { APP_TERMINOLOGY } from '../../constants/terminology';

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

const calculateTimers = (vehicle: Vehicle) => computeVehicleModalTimers(vehicle);

export const VehicleDetailsModal: React.FC = () => {
  const { selectedVehicle, setSelectedVehicle, transferVehicleZone, updateVehicleJobOrder, deleteVehicle, updateUrgency } = useVehicles();
  const { canRelocateVehicle, canAddVehicle, canDeleteVehicle, canEditRemarks, canSetUrgent, displayName } = usePermissions();
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
    return computeVehicleTimelineStages(selectedVehicle, getStageOrder(colors), activeStageDuration);
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
      // Only Master Access can alter job order tasks
      // Non-master roles retain the original required tasks while saving remarks/urgency
      const tasksToSave = canAddVehicle 
        ? selectedTasks 
        : selectedVehicle.tasks.filter(t => t.is_required).map(t => t.task_type);

      const remarksToSave = canEditRemarks ? remarks : (selectedVehicle.remarks || '');

      const urgencyData = canSetUrgent
        ? { is_urgent: localIsUrgent, urgent_note: localIsUrgent ? (localUrgentNote?.trim() || null) : null }
        : undefined;

      // Single consolidated save: updates remarks, urgency, and only changed tasks in 1 batch
      await updateVehicleJobOrder(selectedVehicle.id, tasksToSave, remarksToSave, urgencyData);

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
          (canAddVehicle || canEditRemarks || canSetUrgent) && !isEditing ? (
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
                <Text style={styles.saveEditText}>{isSubmitting ? APP_TERMINOLOGY.actions.saving : APP_TERMINOLOGY.actions.saveJobOrder}</Text>
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
                {canAddVehicle && (
                  <TaskSelectorChips
                    selectedTasks={selectedTasks}
                    onToggleTask={toggleTask}
                    completedTasks={completedTaskTypes}
                    title="EDIT WORKSHOP TASKS:"
                    subTitle="Tasks completed by technicians are locked and preserved."
                  />
                )}

                {/* Urgency Section — Edit Mode (Advisors, Workshop Manager, Master Access) */}
                {canSetUrgent && (
                  <View style={styles.remarksEditGroup}>
                    <UrgentToggleInput
                      isUrgent={localIsUrgent}
                      onToggleUrgent={setLocalIsUrgent}
                      urgentNote={localUrgentNote}
                      onChangeUrgentNote={setLocalUrgentNote}
                      title={APP_TERMINOLOGY.urgency.sectionTitle}
                      placeholder={APP_TERMINOLOGY.urgency.placeholder}
                    />
                  </View>
                )}

                {/* Remarks Section — Edit Mode (Advisors, Workshop Manager, Foremen, Master Access) */}
                {canEditRemarks && (
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
                )}
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
                              <Text style={[styles.logSubText, { color: colors.textSecondary }]}>
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
                                    <Text style={[styles.logSubText, { color: colors.textSecondary }]}>
                                      {entryStartStr}
                                    </Text>
                                    {finishExitStr && (
                                      <Text style={[styles.logSubText, { color: colors.textSecondary }]}>
                                        {finishExitStr}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })}

                              {/* Break Deductions & Active/Idle Subtext */}
                              {breakNotes.map((note, nIdx) => (
                                <Text key={`bn-${nIdx}`} style={[styles.breakNoteSubText, { color: colors.warningLight }]}>
                                  {note}
                                </Text>
                              ))}

                              {queueNotes.map((note, qIdx) => {
                                const parts = note.split(' · ');
                                return (
                                  <View key={`qn-${qIdx}`} style={styles.queueNoteRow}>
                                    {parts.map((part, pIdx) => {
                                      const isActive = part.startsWith('Active:');
                                      const isIdle = part.startsWith('Idle:');
                                      return (
                                        <React.Fragment key={pIdx}>
                                          {pIdx > 0 && <Text style={{ color: colors.textMuted, fontSize: 11 }}> · </Text>}
                                          <Text
                                            style={[
                                              styles.queueNoteSubText,
                                              { color: isActive ? colors.primaryLight : isIdle ? colors.warningLight : colors.textSecondary }
                                            ]}
                                          >
                                            {part}
                                          </Text>
                                        </React.Fragment>
                                      );
                                    })}
                                  </View>
                                );
                              })}
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
        title={APP_TERMINOLOGY.actions.deleteJobSheet}
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
  headerLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerStandardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, width: '100%' },
  footerRightButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  deleteBtnText: { fontSize: 12, fontWeight: '700' },
  totalTimePill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  totalTimeTextCol: { gap: 1 },
  totalTimeText: { fontSize: 12, fontWeight: '700' },
  grossTimeSubText: { fontSize: 10.5, fontWeight: '500' },
  editPencilBtn: { borderWidth: 1, padding: 8, borderRadius: 20 },
  bodyContent: { gap: 16 },
  closeBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, flexShrink: 0 },
  closeText: { fontWeight: '700', fontSize: 13 },
  confirmBodyText: { fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { fontWeight: '800' },

  /* Stepper Timeline Audit Styles */
  stepperContainer: { gap: 16 },
  stepperTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timelineList: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 14 },
  timelineNodeColumn: { alignItems: 'center', width: 28, position: 'relative' },
  nodeCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  timelineLine: { width: 2, position: 'absolute', top: 28, bottom: 0, zIndex: 1 },
  timelineLineDone: { zIndex: 2 },
  timelineLineHalf: { height: '50%', zIndex: 2 },
  timelineContent: { flex: 1, paddingBottom: 24, gap: 4 },
  timelineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageNameText: { fontSize: 13, fontWeight: '600' },
  stageTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeTagText: { fontSize: 12, fontWeight: '500' },
  logSubRowContainer: { gap: 2, marginTop: 2 },
  logSubText: { fontSize: 11, lineHeight: 16 },
  queueNoteRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  queueNoteSubText: { fontSize: 11, fontWeight: '500' },
  breakNoteSubText: { fontSize: 11, marginTop: 2, fontWeight: '500' },

  /* Edit Mode Styles */
  editContainer: { gap: 14 },
  editSectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  remarksEditGroup: { gap: 6, marginTop: 10 },
  textAreaInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, height: 70, textAlignVertical: 'top' },
  editFooterRow: { flexDirection: 'row', gap: 10, width: '100%', justifyContent: 'flex-end' },
  cancelEditBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  cancelEditText: { fontSize: 13, fontWeight: '600' },
  saveEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  saveEditText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});



