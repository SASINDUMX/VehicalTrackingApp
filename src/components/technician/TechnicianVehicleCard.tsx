import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CheckSquare, Square, History, Lock } from 'lucide-react-native';
import { VehicleCardHeader } from '../shared/VehicleCardHeader';
import { CalloutBanner } from '../shared/CalloutBanner';
import { VehicleProgressBar } from '../shared/VehicleProgressBar';
import { calculateJobSheetProgress } from '../../utils/vehicleUtils';
import { computeVehicleBayStatus } from '../../utils/bayLogicUtils';
import { Vehicle, BayZone, TaskType } from '../../types/vehicle';
import { ThemeColors } from '../../constants/theme';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface TechnicianVehicleCardProps {
  vehicle: Vehicle;
  isExpanded: boolean;
  isPinned: boolean;
  elapsedText: string;
  activeBay: BayZone;
  activeTaskType: TaskType;
  currentRole: string;
  techName: string;
  canStartWork: boolean;
  canTransferVehicle: boolean;
  canMarkTaskDone: boolean;
  isDispatching: boolean;
  isStartingWork?: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onToggleExpand: () => void;
  onTogglePin: () => void;
  onStartWork: () => void;
  onToggleTask: (taskId: string) => void;
  onRequestTransfer: (targetZone: BayZone, targetZoneName: string, autoCompleteTaskName?: string | null) => void;
  onSelectAuditLog: () => void;
}

export const TechnicianVehicleCard: React.FC<TechnicianVehicleCardProps> = React.memo((props) => {
  const {
    vehicle,
    isExpanded,
    isPinned,
    elapsedText,
    activeBay,
    activeTaskType,
    currentRole,
    canStartWork: canStart,
    canTransferVehicle,
    canMarkTaskDone,
    isDispatching,
    isStartingWork = false,
    colors,
    isDark,
    onToggleExpand,
    onTogglePin,
    onStartWork,
    onToggleTask,
    onRequestTransfer,
    onSelectAuditLog,
  } = props;

  const { completedCount, totalRequired: totalReq, percent } = calculateJobSheetProgress(vehicle.tasks);
  const isUrgent = Boolean(vehicle.is_urgent);
  const isReadOnlyRole = currentRole === 'workshop_manager' || currentRole === 'advisor';

  const {
    isCurrentTaskDone,
    isStageIdle,
    isTaskRequiredForBay,
    canShowAlignmentBtn,
    canShowHoistBtn,
    canShowWorkshopBtn,
    canShowAdvisorBtn,
    hasAnyDispatchBtn,
    isCanDispatch,
  } = computeVehicleBayStatus(vehicle, activeBay, activeTaskType, canTransferVehicle, isDispatching);

  // If departing bay has an incomplete task, auto-complete it upon direct dispatch
  const currentBayTask = vehicle.tasks.find(
    t => t.task_type === activeTaskType && t.is_required && !t.is_completed
  );
  const autoCompleteTaskName = currentBayTask ? currentBayTask.task_name : null;

  // Work can only be started if this bay actually has a required task to perform
  const canStartBayWork = canStart && isTaskRequiredForBay;
  const isCardIdle = isStageIdle && isTaskRequiredForBay;

  return (
    <View
      style={[
        styles.vehicleCardWrapper,
        {
          backgroundColor: isUrgent
            ? colors.cardUrgentBg
            : isCurrentTaskDone
            ? colors.cardDoneBg
            : isCardIdle
            ? colors.cardIdleBg
            : colors.cardActiveBg,
          borderColor: isUrgent
            ? colors.cardUrgentBorder
            : isCurrentTaskDone
            ? colors.cardDoneBorder
            : isCardIdle
            ? colors.cardIdleBorder
            : colors.cardActiveBorder,
          borderLeftWidth: 4,
          borderLeftColor: isUrgent
            ? colors.danger
            : isCurrentTaskDone
            ? colors.success
            : isCardIdle
            ? colors.warning
            : colors.primary,
        },
      ]}
    >
      {/* Header Card Area (Clickable to Expand / Collapse Card) */}
      <TouchableOpacity
        style={styles.cardHeaderArea}
        onPress={onToggleExpand}
        activeOpacity={0.8}
      >
        <VehicleCardHeader
          vehicle={vehicle}
          size="md"
          elapsedText={elapsedText}
          isStageIdle={isCardIdle}
          isTaskDone={isCurrentTaskDone}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
          canStartWork={canStartBayWork}
          isStartingWork={isStartingWork}
          onStartWork={() => {
            if (canStartBayWork && !isStartingWork) onStartWork();
          }}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          showChevron={true}
        />

        {/* Task Progress Bar */}
        <VehicleProgressBar
          completedCount={completedCount}
          totalRequired={totalReq}
          percent={percent}
          isCurrentTaskDone={isCurrentTaskDone}
          isStageIdle={isCardIdle}
        />
      </TouchableOpacity>

      {/* EXPANDED CONTENT AREA */}
      {isExpanded && (
        <>
          {/* Priority Alert Callout Banner if Urgent */}
          {isUrgent && (
            <CalloutBanner
              variant="urgent"
              title="PRIORITY / URGENT VEHICLE"
              message={vehicle.urgent_note}
            />
          )}

          {/* Vehicle Remarks / Special Instructions Box (Before Job Sheet Tasks) */}
          {Boolean(vehicle.remarks && vehicle.remarks.trim()) && (
            <CalloutBanner
              variant="remarks"
              title="REMARKS / SPECIAL INSTRUCTIONS"
              message={vehicle.remarks}
            />
          )}

          {/* Station Assigned Task Checklist */}
          <View style={[styles.tasksSection, { borderTopColor: colors.borderGlass }]}>
            <View style={styles.tasksSectionHeaderRow}>
              <Text style={[styles.sectionHeaderLabel, { color: colors.textMuted }]}>
                JOB SHEET TASKS ({vehicle.tasks.filter(t => t.is_required).length}):
              </Text>
              {isCardIdle && (
                <View style={[styles.idleNoticeBadge, { backgroundColor: colors.warningDim, borderColor: colors.warningBorder }]}>
                  <Lock size={10} color={colors.warning} />
                  <Text style={[styles.idleNoticeText, { color: colors.warningLight }]}>START WORK FIRST</Text>
                </View>
              )}
            </View>
            {vehicle.tasks.filter(t => t.is_required).map(task => {
              const isVehicleInInspectionOrFinished = vehicle.current_zone === 'inspection' || vehicle.is_finished;
              const isMyBayTask = task.task_type === activeTaskType;
              const isEditable = isMyBayTask && canMarkTaskDone && !isVehicleInInspectionOrFinished && !isStageIdle;

              return (
                <TouchableOpacity
                  key={task.id}
                  style={[
                    styles.taskRow,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: colors.borderGlass,
                    },
                    (!isMyBayTask || isVehicleInInspectionOrFinished) && styles.otherBayTaskRow,
                    !isEditable && styles.disabledTaskRow,
                    Platform.OS === 'web' && !isEditable && ({ cursor: 'not-allowed' } as any),
                  ]}
                  activeOpacity={isEditable ? 0.7 : 1}
                  onPress={() => {
                    if (isEditable) onToggleTask(task.id);
                  }}
                >
                  <View style={styles.taskLeft}>
                    {task.is_completed ? (
                      <CheckSquare size={18} color={colors.success} />
                    ) : (
                      <Square size={18} color={isEditable ? colors.textSecondary : colors.textMuted} />
                    )}
                    <Text style={[
                      styles.taskName,
                      { color: colors.textPrimary },
                      task.is_completed && styles.completedTaskName,
                      (!isMyBayTask || isVehicleInInspectionOrFinished) && { color: colors.textMuted },
                    ]}>
                      {task.task_name}
                    </Text>
                  </View>

                  {isEditable ? (
                    <View
                      style={[
                        styles.taskDoneBtn,
                        { backgroundColor: colors.primary },
                        task.is_completed && { backgroundColor: colors.success },
                      ]}
                    >
                      <Text style={[styles.taskDoneBtnText, { color: colors.textDark }]}>
                        {task.is_completed ? 'DONE ✓' : 'MARK DONE'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[
                      styles.lockedTaskBadge,
                      (isStageIdle && isMyBayTask) && styles.idleLockedBadge,
                      isReadOnlyRole && styles.readOnlyLockedBadge,
                    ]}>
                      <Lock
                        size={12}
                        color={
                          task.is_completed
                            ? colors.success
                            : (isStageIdle && isMyBayTask)
                            ? colors.warning
                            : isReadOnlyRole
                            ? colors.primaryLight
                            : colors.textMuted
                        }
                      />
                      <Text style={[
                        styles.lockedTaskBadgeText,
                        { color: colors.textMuted },
                        task.is_completed && { color: colors.success },
                        (isStageIdle && isMyBayTask && !task.is_completed) && { color: colors.warning },
                        isReadOnlyRole && { color: colors.primaryLight },
                      ]}>
                        {task.is_completed
                          ? 'DONE ✓'
                          : isVehicleInInspectionOrFinished
                          ? 'LOCKED'
                          : (isStageIdle && isMyBayTask)
                          ? 'LOCKED'
                          : isReadOnlyRole
                          ? 'READ-ONLY'
                          : APP_TERMINOLOGY.tasks[task.task_type]?.stationId
                          ? `${APP_TERMINOLOGY.stations[APP_TERMINOLOGY.tasks[task.task_type].stationId].shortName.toUpperCase()} ONLY`
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
                <Text style={[styles.dispatchLabel, { color: colors.textMuted }]}>{APP_TERMINOLOGY.actions.dispatchTo}</Text>
              ) : (
                <View />
              )}
              <TouchableOpacity
                style={styles.auditLogLink}
                onPress={onSelectAuditLog}
              >
                <History size={12} color={colors.primaryLight} />
                <Text style={[styles.auditLogLinkText, { color: colors.primaryLight }]}>{APP_TERMINOLOGY.actions.auditLog}</Text>
              </TouchableOpacity>
            </View>

            {hasAnyDispatchBtn && (
              <View style={styles.dispatchBtnGroup}>
                {/* 1. Workshop */}
                {canShowWorkshopBtn && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshopBorder },
                      !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) },
                    ]}
                    onPress={() => {
                      if (isCanDispatch) onRequestTransfer('workshop', APP_TERMINOLOGY.stations.workshop.name, autoCompleteTaskName);
                    }}
                    activeOpacity={isCanDispatch ? 0.7 : 1}
                  >
                    <Text style={[styles.dispatchBtnText, { color: colors.bayWorkshopLight }]}>{APP_TERMINOLOGY.stations.workshop.dispatchBtn}</Text>
                  </TouchableOpacity>
                )}

                {/* 2. Alignment */}
                {canShowAlignmentBtn && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignmentBorder },
                      !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) },
                    ]}
                    onPress={() => {
                      if (isCanDispatch) onRequestTransfer('alignment', APP_TERMINOLOGY.stations.alignment.name, autoCompleteTaskName);
                    }}
                    activeOpacity={isCanDispatch ? 0.7 : 1}
                  >
                    <Text style={[styles.dispatchBtnText, { color: colors.bayAlignmentLight }]}>{APP_TERMINOLOGY.stations.alignment.dispatchBtn}</Text>
                  </TouchableOpacity>
                )}

                {/* 3. Hoist */}
                {canShowHoistBtn && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      { backgroundColor: colors.bayHoistDim, borderColor: colors.bayHoistBorder },
                      !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) },
                    ]}
                    onPress={() => {
                      if (isCanDispatch) onRequestTransfer('hoist', APP_TERMINOLOGY.stations.hoist.name, autoCompleteTaskName);
                    }}
                    activeOpacity={isCanDispatch ? 0.7 : 1}
                  >
                    <Text style={[styles.dispatchBtnText, { color: colors.bayHoistLight }]}>{APP_TERMINOLOGY.stations.hoist.dispatchBtn}</Text>
                  </TouchableOpacity>
                )}

                {/* 4. Final Inspection */}
                {canShowAdvisorBtn && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      { backgroundColor: colors.bayInspectionDim, borderColor: colors.bayInspectionBorder, marginLeft: 'auto' },
                      !isCanDispatch && { opacity: 0.35, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) },
                    ]}
                    onPress={() => {
                      if (isCanDispatch) onRequestTransfer('inspection', APP_TERMINOLOGY.stations.inspection.name, autoCompleteTaskName);
                    }}
                    activeOpacity={isCanDispatch ? 0.7 : 1}
                  >
                    <Text style={[styles.dispatchBtnText, { color: colors.bayInspectionLight }]}>{APP_TERMINOLOGY.stations.inspection.dispatchBtn}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  vehicleCardWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.25)' } as any)
      : { shadowColor: 'rgba(0, 0, 0, 1)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 }),
  },
  cardHeaderArea: { gap: 8 },
  sectionHeaderLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  dispatchHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLogLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 2 },
  auditLogLinkText: { fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },

  tasksSection: { gap: 6, borderTopWidth: 1, paddingTop: 8 },
  tasksSectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  idleNoticeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  idleNoticeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  taskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  otherBayTaskRow: { backgroundColor: 'rgba(255, 255, 255, 0.01)', borderColor: 'rgba(255, 255, 255, 0.04)' },
  disabledTaskRow: { opacity: 0.5 },
  taskLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  taskName: { fontSize: 12.5, fontWeight: '600' },
  completedTaskName: { textDecorationLine: 'line-through' },
  taskDoneBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  taskDoneBtnText: { fontSize: 10.5, fontWeight: '700' },
  lockedTaskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  readOnlyLockedBadge: { backgroundColor: 'rgba(14, 165, 233, 0.12)', borderColor: 'rgba(14, 165, 233, 0.3)' },
  idleLockedBadge: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' },
  lockedTaskBadgeText: { fontSize: 9.5, fontWeight: '800' },
  dispatchRow: { gap: 6, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', paddingTop: 8 },
  dispatchLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  dispatchBtnGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dispatchBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dispatchBtnText: { fontSize: 10.5, fontWeight: '700' },
});
