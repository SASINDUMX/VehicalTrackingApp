import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { BayZone, TaskType, Vehicle } from '../../types/vehicle';
import { 
  Wrench, Navigation, Pencil, Save, 
  Clock, CheckCircle2, Trash2, AlertTriangle,
  PauseCircle, PlayCircle, CheckSquare, Square
} from 'lucide-react-native';

import { isValidVehicleNo, formatVehicleNoInput } from '../../utils/vehicleNumberUtils';
import { LicensePlate } from './LicensePlate';
import { StatusPill } from './StatusPill';
import { BaseModal } from './BaseModal';
import { ConfirmModal } from './ConfirmModal';
import { VehicleNotePill } from './VehicleNotePill';
import { TaskSelectorChips } from './TaskSelectorChips';
import { UrgentToggleInput } from './UrgentToggleInput';
import { computeVehicleModalTimers, getBayForTaskType } from '../../utils/vehicleUtils';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';
import { VehicleTimelineView } from './VehicleTimelineView';

const calculateTimers = (vehicle: Vehicle) => computeVehicleModalTimers(vehicle);

export const VehicleDetailsModal: React.FC = () => {
  const { 
    selectedVehicle, 
    setSelectedVehicle, 
    transferVehicleZone, 
    updateVehicleJobOrder, 
    updateVehiclePlate,
    toggleVehiclePause,
    deleteVehicle, 
    updateUrgency 
  } = useVehicles();
  const { canRelocateVehicle, canAddVehicle, canDeleteVehicle, canEditRemarks, canSetUrgent, displayName } = usePermissions();
  const { colors, isDark } = useTheme();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editPlate, setEditPlate] = useState<string>(() => selectedVehicle?.vehicle_no || '');
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>(() =>
    selectedVehicle ? selectedVehicle.tasks.filter(t => t.is_required).map(t => t.task_type) : []
  );
  const [remarks, setRemarks] = useState<string>(() => selectedVehicle?.remarks || '');
  const [technicianName, setTechnicianName] = useState<string>(() => selectedVehicle?.technician_name || '');
  const [isBooking, setIsBooking] = useState<boolean>(() => Boolean(selectedVehicle?.is_booking));
  const [hasAdditionalRepairs, setHasAdditionalRepairs] = useState<boolean>(() => Boolean(selectedVehicle?.has_additional_repairs));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showHoldConfirm, setShowHoldConfirm] = useState<boolean>(false);

  const initialTimers = useMemo(() => {
    if (!selectedVehicle) return { totalElapsedStr: '0m 00s', grossElapsedStr: '0m 00s', activeStageDuration: '0m 00s', activeStageDurationRaw: '0m 00s' };
    return calculateTimers(selectedVehicle);
  }, [selectedVehicle?.id]);

  const [activeStageDuration, setActiveStageDuration] = useState<string>(initialTimers.activeStageDuration);
  const [activeStageDurationRaw, setActiveStageDurationRaw] = useState<string>(initialTimers.activeStageDurationRaw);
  const [totalElapsedStr, setTotalElapsedStr] = useState<string>(initialTimers.totalElapsedStr);
  const [grossElapsedStr, setGrossElapsedStr] = useState<string>(initialTimers.grossElapsedStr);
  const [localIsUrgent, setLocalIsUrgent] = useState<boolean>(() => selectedVehicle?.is_urgent || false);
  const [localUrgentNote, setLocalUrgentNote] = useState<string>(() => selectedVehicle?.urgent_note || '');

  useEffect(() => {
    if (selectedVehicle) {
      const activeTaskTypes = selectedVehicle.tasks
        .filter(t => t.is_required)
        .map(t => t.task_type);
      setEditPlate(selectedVehicle.vehicle_no);
      setSelectedTasks(activeTaskTypes);
      setRemarks(selectedVehicle.remarks || '');
      setTechnicianName(selectedVehicle.technician_name || '');
      setIsBooking(Boolean(selectedVehicle.is_booking));
      setHasAdditionalRepairs(Boolean(selectedVehicle.has_additional_repairs));
      setIsEditing(false);
      setLocalIsUrgent(selectedVehicle.is_urgent || false);
      setLocalUrgentNote(selectedVehicle.urgent_note || '');

      const current = calculateTimers(selectedVehicle);
      setActiveStageDuration(current.activeStageDuration);
      setActiveStageDurationRaw(current.activeStageDurationRaw);
      setTotalElapsedStr(current.totalElapsedStr);
      setGrossElapsedStr(current.grossElapsedStr);
    }
  }, [selectedVehicle?.id]);

  // Helper for Sri Lanka Standard Time (SLST) 12-hour AM/PM format
  const formatSLSTime = (dateStr?: string | null) => {
    if (!dateStr) return '--:--';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '--:--';
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
      setActiveStageDurationRaw(timers.activeStageDurationRaw);
    };

    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [selectedVehicle?.id]);

  const currentZone = selectedVehicle?.current_zone;


  if (!selectedVehicle) return null;

  const completedTaskTypes = selectedVehicle.tasks
    .filter(t => t.is_completed)
    .map(t => t.task_type);

  // A task is locked if completed OR already started (stage log has work_started_at)
  const startedTaskTypes = selectedVehicle.tasks
    .filter(t => {
      if (t.is_completed) return false;
      const bay = getBayForTaskType(t.task_type);
      return selectedVehicle.stage_logs.some(l => l.to_zone === bay && Boolean(l.work_started_at));
    })
    .map(t => t.task_type);

  const lockedTaskTypes = [...completedTaskTypes, ...startedTaskTypes];

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
    if (lockedTaskTypes.includes(type)) return;
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
      // If plate changed and is valid, update plate
      const cleanPlate = editPlate.trim().toUpperCase();
      if (cleanPlate && cleanPlate !== selectedVehicle.vehicle_no) {
        if (isValidVehicleNo(cleanPlate)) {
          await updateVehiclePlate(selectedVehicle.id, cleanPlate);
        }
      }

      // Only Master Access can alter job order tasks
      // Non-master roles retain the original required tasks while saving remarks/urgency
      const tasksToSave = canAddVehicle 
        ? selectedTasks 
        : selectedVehicle.tasks.filter(t => t.is_required).map(t => t.task_type);

      const remarksToSave = canEditRemarks ? remarks : (selectedVehicle.remarks || '');

      const urgencyData = canSetUrgent
        ? { is_urgent: localIsUrgent, urgent_note: localIsUrgent ? (localUrgentNote?.trim() || null) : null }
        : undefined;

      const metadataToSave = {
        vehicle_no: cleanPlate,
        technician_name: technicianName.trim() || null,
        is_booking: isBooking,
        has_additional_repairs: hasAdditionalRepairs,
      };

      // Single consolidated save: updates remarks, urgency, metadata, and only changed tasks in 1 batch
      await updateVehicleJobOrder(selectedVehicle.id, tasksToSave, remarksToSave, urgencyData, metadataToSave);

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
                <Clock size={16} color={colors.primaryLight} />
                <View style={styles.totalTimeTextCol}>
                  <Text style={[styles.totalTimeText, { color: colors.primaryLight }]}>
                    Net Work: <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{totalElapsedStr}</Text>
                  </Text>
                  <Text style={[styles.grossTimeSubText, { color: colors.textSecondary }]}>
                    Total Stay: <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{grossElapsedStr}</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.footerRightButtons}>
                {/* Hold / Pause for Major Repair Button */}
                {!selectedVehicle.is_finished && (
                  <TouchableOpacity
                    style={[
                      styles.deleteBtn,
                      {
                        backgroundColor: selectedVehicle.is_paused ? colors.successDim : colors.warningDim,
                        borderColor: selectedVehicle.is_paused ? colors.success : colors.warning,
                      }
                    ]}
                    onPress={() => setShowHoldConfirm(true)}
                    activeOpacity={0.7}
                  >
                    {selectedVehicle.is_paused ? (
                      <>
                        <PlayCircle size={14} color={colors.success} />
                        <Text style={[styles.deleteBtnText, { color: colors.success }]}>Resume Work</Text>
                      </>
                    ) : (
                      <>
                        <PauseCircle size={14} color={colors.warning} />
                        <Text style={[styles.deleteBtnText, { color: colors.warning }]}>Hold / Major Repair</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

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
                {/* Plate Editing Input with Sri Lankan Validation */}
                <View style={styles.remarksEditGroup}>
                  <Text style={[styles.editSectionTitle, { color: colors.textSecondary }]}>VEHICLE REGISTRATION / LICENSE PLATE:</Text>
                  <TextInput
                    style={[
                      styles.textAreaInput,
                      {
                        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                        borderColor: isValidVehicleNo(editPlate) ? colors.success : colors.borderGlass,
                        color: colors.textPrimary,
                        height: 44,
                        paddingVertical: 10,
                        fontWeight: '800',
                        fontSize: 16,
                      }
                    ]}
                    placeholder="e.g. CAB-7712, 300-4234, or WP-1234"
                    placeholderTextColor={colors.textMuted}
                    value={editPlate}
                    onChangeText={(t) => setEditPlate(formatVehicleNoInput(t, editPlate))}
                    autoCapitalize="characters"
                    maxLength={8}
                  />
                  <Text style={{ fontSize: 11, color: isValidVehicleNo(editPlate) ? colors.success : colors.danger, marginTop: 4 }}>
                    {isValidVehicleNo(editPlate) ? '✓ Valid Sri Lankan registration' : '✕ Format: CAB-1234, 300-4234, or 14-1234'}
                  </Text>
                </View>

                {canAddVehicle && (
                  <TaskSelectorChips
                    selectedTasks={selectedTasks}
                    onToggleTask={toggleTask}
                    completedTasks={completedTaskTypes}
                    startedTasks={startedTaskTypes}
                    title="EDIT WORKSHOP TASKS:"
                    subTitle="Tasks started or completed by technicians are locked and preserved."
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

                {/* Technician Name (Actual mechanic) */}
                <View style={styles.remarksEditGroup}>
                  <Text style={[styles.editSectionTitle, { color: colors.textSecondary }]}>ASSIGNED TECHNICIAN (ACTUAL MECHANIC):</Text>
                  <TextInput
                    style={[
                      styles.textAreaInput,
                      {
                        backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)',
                        borderColor: colors.borderGlass,
                        color: colors.textPrimary,
                        height: 44,
                        paddingVertical: 10,
                      }
                    ]}
                    placeholder="e.g. Kasun Fernando, Sunil Shantha..."
                    placeholderTextColor={colors.textMuted}
                    value={technicianName}
                    onChangeText={setTechnicianName}
                  />
                </View>

                {/* Prior Booking & Additional Repairs Checkboxes */}
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      minWidth: 180,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      backgroundColor: isBooking ? colors.primaryDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                      borderColor: isBooking ? colors.primary : colors.borderGlass,
                    }}
                    onPress={() => setIsBooking(!isBooking)}
                  >
                    {isBooking ? <CheckSquare size={16} color={colors.primary} /> : <Square size={16} color={colors.textMuted} />}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isBooking ? colors.textPrimary : colors.textSecondary }}>
                      PRIOR BOOKING
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      minWidth: 180,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      backgroundColor: hasAdditionalRepairs ? colors.warningDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                      borderColor: hasAdditionalRepairs ? colors.warning : colors.borderGlass,
                    }}
                    onPress={() => setHasAdditionalRepairs(!hasAdditionalRepairs)}
                  >
                    {hasAdditionalRepairs ? <CheckSquare size={16} color={colors.warning} /> : <Square size={16} color={colors.textMuted} />}
                    <Text style={{ fontSize: 12, fontWeight: '700', color: hasAdditionalRepairs ? colors.textPrimary : colors.textSecondary }}>
                      ADDITIONAL REPAIRS
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* --- HIGH-TECH STEPPER TIMELINE STAGE AUDIT MODE --- */
              <VehicleTimelineView
                vehicle={selectedVehicle}
                activeStageDurationRaw={activeStageDurationRaw}
              />
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

      {/* Hold / Major Repair Confirmation Dialog */}
      <ConfirmModal
        visible={showHoldConfirm}
        title={selectedVehicle.is_paused ? 'Resume Vehicle Work' : 'Hold / Pause for Major Repair'}
        subtitle={selectedVehicle.is_paused ? 'Resume Operation' : 'Pause Operational Timers'}
        confirmVariant={selectedVehicle.is_paused ? 'primary' : 'warning'}
        icon={selectedVehicle.is_paused ? <PlayCircle size={20} color={colors.success} /> : <PauseCircle size={20} color={colors.warning} />}
        description={
          <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
            {selectedVehicle.is_paused ? (
              <>
                Resume work on vehicle{' '}
                <Text style={[styles.confirmBoldPlate, { color: colors.primaryLight }]}>
                  {selectedVehicle.vehicle_no}
                </Text>
                ?{'\n\n'}The floor timers will restart and the vehicle will return to active status.
              </>
            ) : (
              <>
                Put vehicle{' '}
                <Text style={[styles.confirmBoldPlate, { color: colors.warningLight }]}>
                  {selectedVehicle.vehicle_no}
                </Text>
                {' '}on hold for major repairs / spare parts?{'\n\n'}
                • Floor timers will freeze.{'\n'}
                • The vehicle will be strictly protected from midnight auto-deletion.{'\n'}
                • Hold time is excluded from benchmark average turnaround metrics.
              </>
            )}
          </Text>
        }
        confirmLabel={selectedVehicle.is_paused ? 'Resume Work' : 'Place On Hold'}
        onConfirm={async () => {
          setShowHoldConfirm(false);
          const nextPaused = !selectedVehicle.is_paused;
          await toggleVehiclePause(selectedVehicle.id, nextPaused, nextPaused ? 'major_repair' : undefined);
        }}
        onCancel={() => setShowHoldConfirm(false)}
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



