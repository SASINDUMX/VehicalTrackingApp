import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Clock, History, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Navigation, Wrench } from 'lucide-react-native';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TransferConfirmModal } from '../shared/TransferConfirmModal';
import { VehicleCardSkeleton } from '../shared/VehicleCardSkeleton';
import { VehicleCardHeader } from '../shared/VehicleCardHeader';
import { VehicleProgressBar } from '../shared/VehicleProgressBar';
import { sortWorkshopVehicles, calculateJobSheetProgress, deduplicateTasks } from '../../utils/vehicleUtils';
import { matchesVehicleSearch } from '../../utils/searchUtils';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { Vehicle, BayZone } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

interface PendingTransferState {
  vehicleId: string;
  vehicleNo: string;
  targetZone: BayZone;
  targetZoneName: string;
}

export const WaitingAreaStationView: React.FC = React.memo(() => {
  const {
    vehicles,
    isLoading,
    searchQuery,
    showMyVehiclesOnly,
    transferVehicleZone,
    finishVehicleJobSheet,
    setSelectedVehicle,
  } = useVehicles();
  const { colors, isDark } = useTheme();
  const { canTransferVehicle, canFinishJob, displayName } = usePermissions();
  const { togglePin, isPinned } = usePinnedVehicles();

  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransferState | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const toggleExpand = useCallback((vehicleId: string) => {
    setExpandedCards(prev => ({
      ...prev,
      [vehicleId]: !prev[vehicleId],
    }));
  }, []);

  // Filter for vehicles currently sitting in the waiting area
  const waitingVehicles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const hasSearch = q.length > 0;

    return vehicles.filter(v => {
      if (v.current_zone !== 'waiting' || v.is_finished) return false;
      if (!hasSearch) return true;
      const tech = (v.assigned_tech || '').toLowerCase();
      const advisor = (v.assigned_advisor || '').toLowerCase();
      return matchesVehicleSearch(v.vehicle_no, searchQuery) || tech.includes(q) || advisor.includes(q);
    });
  }, [vehicles, searchQuery]);

  // Sort: pinned vehicles if filter active, then urgent first, FIFO entry time
  const sortedWaitingVehicles = useMemo(() => {
    const filtered = showMyVehiclesOnly ? waitingVehicles.filter(v => isPinned(v.id)) : waitingVehicles;
    return sortWorkshopVehicles(filtered, isPinned);
  }, [waitingVehicles, showMyVehiclesOnly, isPinned]);

  const handleRequestTransfer = useCallback((
    vehicleId: string,
    vehicleNo: string,
    targetZone: BayZone,
    targetZoneName: string
  ) => {
    if (!canTransferVehicle) return;
    setPendingTransfer({ vehicleId, vehicleNo, targetZone, targetZoneName });
  }, [canTransferVehicle]);

  const handleConfirmTransfer = useCallback(async () => {
    if (!pendingTransfer || isDispatching) return;
    setIsDispatching(true);
    try {
      if (pendingTransfer.targetZone === 'completed') {
        await finishVehicleJobSheet(pendingTransfer.vehicleId, displayName || 'Supervisor');
      } else {
        await transferVehicleZone(
          pendingTransfer.vehicleId,
          pendingTransfer.targetZone,
          pendingTransfer.targetZoneName,
          displayName || 'Waiting Area'
        );
      }
    } finally {
      setIsDispatching(false);
      setPendingTransfer(null);
    }
  }, [pendingTransfer, isDispatching, finishVehicleJobSheet, transferVehicleZone, displayName]);

  const renderVehicleItem = ({ item: vehicle }: { item: Vehicle }) => {
    const isExpanded = Boolean(expandedCards[vehicle.id]);
    const isPinnedVehicle = isPinned(vehicle.id);
    const isUrgent = Boolean(vehicle.is_urgent);
    const isPaused = Boolean(vehicle.is_paused);

    const dedupedTasks = deduplicateTasks(vehicle.tasks || []);
    const { completedCount, totalRequired, percent } = calculateJobSheetProgress(dedupedTasks);

    // Count past visits to determine pass number
    const waitingVisits = (vehicle.stage_logs || []).filter(l => l.to_zone === 'waiting');
    const visitCount = waitingVisits.length;

    // Check required stations for this vehicle
    const requiredTaskTypes = dedupedTasks.filter(t => t.is_required).map(t => t.task_type);
    const hasWorkshopTask = requiredTaskTypes.includes('general_service');
    const hasAlignmentTask = requiredTaskTypes.includes('wheel_alignment');
    const hasHoistTask = requiredTaskTypes.includes('hoist_service');

    return (
      <View
        style={[
          styles.vehicleCardWrapper,
          {
            backgroundColor: isPaused
              ? (isDark ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb')
              : isUrgent
              ? colors.cardUrgentBg
              : (isDark ? 'rgba(245, 158, 11, 0.04)' : '#fffdf7'),
            borderColor: isPaused
              ? '#f59e0b'
              : isUrgent
              ? colors.cardUrgentBorder
              : colors.bayWaitingBorder,
            borderLeftWidth: 5,
            borderLeftColor: isUrgent ? colors.danger : colors.bayWaiting,
          },
        ]}
      >
        {/* Header Card Area (Clickable to Expand / Collapse Card) */}
        <TouchableOpacity
          style={styles.cardHeaderArea}
          onPress={() => toggleExpand(vehicle.id)}
          activeOpacity={0.8}
        >
          <VehicleCardHeader
            vehicle={vehicle}
            size="md"
            isStageIdle={true}
            isTaskDone={false}
            isPinned={isPinnedVehicle}
            onTogglePin={() => togglePin(vehicle.id)}
            canStartWork={false} // No labor work button in waiting yard!
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(vehicle.id)}
            showChevron={true}
          />

          {/* Staging Notice Banner */}
          <View style={[styles.stagingBanner, { backgroundColor: colors.bayWaitingDim, borderColor: colors.bayWaitingBorder }]}>
            <View style={styles.stagingBannerLeft}>
              <Clock size={13} color={colors.bayWaitingLight} />
              <Text style={[styles.stagingBannerText, { color: colors.bayWaitingLight }]}>
                {visitCount > 1 ? `HOLDING YARD (VISIT #${visitCount})` : 'QUEUED IN HOLDING YARD'}
              </Text>
            </View>
            {Boolean(vehicle.assigned_advisor) && (
              <Text style={[styles.stagingAdvisorText, { color: colors.textMuted }]}>
                Advisor: <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{vehicle.assigned_advisor}</Text>
              </Text>
            )}
          </View>

          {/* Progress Bar */}
          {totalRequired > 0 && (
            <VehicleProgressBar
              completedCount={completedCount}
              totalRequired={totalRequired}
              percent={percent}
              isCurrentTaskDone={false}
              isStageIdle={true}
            />
          )}
        </TouchableOpacity>

        {/* EXPANDED CONTENT AREA */}
        {isExpanded && (
          <View style={[styles.expandedContent, { borderTopColor: colors.borderGlass }]}>
            {/* Dispatch Transfer Bar */}
            <View style={styles.dispatchSection}>
              <View style={styles.dispatchHeaderRow}>
                <Text style={[styles.dispatchLabel, { color: colors.textMuted }]}>
                  {APP_TERMINOLOGY.actions.dispatchTo}
                </Text>
                <TouchableOpacity
                  style={styles.auditLogLink}
                  onPress={() => setSelectedVehicle(vehicle)}
                  activeOpacity={0.7}
                >
                  <History size={12} color={colors.primaryLight} />
                  <Text style={[styles.auditLogLinkText, { color: colors.primaryLight }]}>
                    {APP_TERMINOLOGY.actions.auditLog}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dispatchBtnGroup}>
                {/* 1. Workshop Bay */}
                <TouchableOpacity
                  style={[
                    styles.dispatchBtn,
                    { backgroundColor: colors.bayWorkshopDim, borderColor: colors.bayWorkshopBorder },
                    !canTransferVehicle && styles.disabledBtn,
                  ]}
                  onPress={() => {
                    if (canTransferVehicle) {
                      handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'workshop', APP_TERMINOLOGY.stations.workshop.name);
                    }
                  }}
                  activeOpacity={canTransferVehicle ? 0.7 : 1}
                >
                  <Wrench size={13} color={colors.bayWorkshopLight} />
                  <Text style={[styles.dispatchBtnText, { color: colors.bayWorkshopLight }]}>
                    {APP_TERMINOLOGY.stations.workshop.dispatchBtn}
                    {hasWorkshopTask ? ' ★' : ''}
                  </Text>
                </TouchableOpacity>

                {/* 2. Wheel Alignment */}
                <TouchableOpacity
                  style={[
                    styles.dispatchBtn,
                    { backgroundColor: colors.bayAlignmentDim, borderColor: colors.bayAlignmentBorder },
                    !canTransferVehicle && styles.disabledBtn,
                  ]}
                  onPress={() => {
                    if (canTransferVehicle) {
                      handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'alignment', APP_TERMINOLOGY.stations.alignment.name);
                    }
                  }}
                  activeOpacity={canTransferVehicle ? 0.7 : 1}
                >
                  <Navigation size={13} color={colors.bayAlignmentLight} />
                  <Text style={[styles.dispatchBtnText, { color: colors.bayAlignmentLight }]}>
                    {APP_TERMINOLOGY.stations.alignment.dispatchBtn}
                    {hasAlignmentTask ? ' ★' : ''}
                  </Text>
                </TouchableOpacity>

                {/* 3. Hoist Bay */}
                <TouchableOpacity
                  style={[
                    styles.dispatchBtn,
                    { backgroundColor: colors.bayHoistDim, borderColor: colors.bayHoistBorder },
                    !canTransferVehicle && styles.disabledBtn,
                  ]}
                  onPress={() => {
                    if (canTransferVehicle) {
                      handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'hoist', APP_TERMINOLOGY.stations.hoist.name);
                    }
                  }}
                  activeOpacity={canTransferVehicle ? 0.7 : 1}
                >
                  <Wrench size={13} color={colors.bayHoistLight} />
                  <Text style={[styles.dispatchBtnText, { color: colors.bayHoistLight }]}>
                    {APP_TERMINOLOGY.stations.hoist.dispatchBtn}
                    {hasHoistTask ? ' ★' : ''}
                  </Text>
                </TouchableOpacity>

                {/* 4. Advisor Final Inspection */}
                <TouchableOpacity
                  style={[
                    styles.dispatchBtn,
                    { backgroundColor: colors.bayInspectionDim, borderColor: colors.bayInspectionBorder },
                    !canTransferVehicle && styles.disabledBtn,
                  ]}
                  onPress={() => {
                    if (canTransferVehicle) {
                      handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'inspection', APP_TERMINOLOGY.stations.inspection.name);
                    }
                  }}
                  activeOpacity={canTransferVehicle ? 0.7 : 1}
                >
                  <CheckCircle2 size={13} color={colors.bayInspectionLight} />
                  <Text style={[styles.dispatchBtnText, { color: colors.bayInspectionLight }]}>
                    {APP_TERMINOLOGY.stations.inspection.dispatchBtn}
                  </Text>
                </TouchableOpacity>

                {/* 5. Complete / Gate Pass (For vehicles already finished waiting for pickup) */}
                {canFinishJob && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      styles.completeBtn,
                      { backgroundColor: colors.successDim, borderColor: colors.successBorder },
                      !canFinishJob && styles.disabledBtn,
                    ]}
                    onPress={() => {
                      if (canFinishJob) {
                        handleRequestTransfer(vehicle.id, vehicle.vehicle_no, 'completed', 'Completed Handover');
                      }
                    }}
                    activeOpacity={canFinishJob ? 0.7 : 1}
                  >
                    <Sparkles size={13} color={colors.success} />
                    <Text style={[styles.dispatchBtnText, { color: colors.successLight }]}>
                      Finish / Handover ✓
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.content, { gap: 12 }]}>
        <VehicleCardSkeleton variant="full" count={3} />
      </View>
    );
  }

  if (sortedWaitingVehicles.length === 0) {
    return (
      <EmptyStateCard
        icon={Clock}
        title={
          showMyVehiclesOnly
            ? APP_TERMINOLOGY.emptyStates.noPinnedTitle
            : searchQuery.trim()
            ? APP_TERMINOLOGY.emptyStates.noSearchMatchTitle(searchQuery.trim())
            : 'Waiting Yard Currently Clear'
        }
        subtitle={
          showMyVehiclesOnly
            ? APP_TERMINOLOGY.emptyStates.noPinnedSubtitle
            : searchQuery.trim()
            ? APP_TERMINOLOGY.emptyStates.noSearchMatchSubtitle
            : 'No vehicles are currently queued in the holding yard. All vehicles are in active bays or completed.'
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedWaitingVehicles}
        keyExtractor={(item) => item.id}
        renderItem={renderVehicleItem}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        contentContainerStyle={[styles.content, { gap: 12 }]}
        showsVerticalScrollIndicator={false}
      />

      {/* CONFIRMATION MODAL BEFORE DISPATCHING */}
      <TransferConfirmModal
        visible={Boolean(pendingTransfer)}
        title={
          pendingTransfer?.targetZone === 'completed'
            ? APP_TERMINOLOGY.actions.confirmFinalHandover
            : APP_TERMINOLOGY.actions.confirmDispatch
        }
        icon={
          pendingTransfer?.targetZone === 'completed' ? (
            <Sparkles size={24} color={colors.success} />
          ) : (
            <AlertTriangle size={24} color={colors.warning} />
          )
        }
        bodyContent={
          pendingTransfer ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
                Are you sure you want to dispatch vehicle{' '}
                <Text style={[styles.confirmBoldPlate, { color: colors.warning }]}>
                  {pendingTransfer.vehicleNo}
                </Text>{' '}
                to{' '}
                <Text style={[styles.confirmBoldZone, { color: colors.primaryLight }]}>
                  {pendingTransfer.targetZoneName}
                </Text>
                ?
              </Text>
            </View>
          ) : null
        }
        confirmLabel={`${APP_TERMINOLOGY.actions.confirmDispatch} ✓`}
        cancelLabel="Cancel"
        isProcessing={isDispatching}
        processingLabel={APP_TERMINOLOGY.actions.dispatching}
        confirmButtonColor={
          pendingTransfer?.targetZone === 'completed' ? colors.success : colors.primary
        }
        onConfirm={handleConfirmTransfer}
        onCancel={() => {
          if (!isDispatching) setPendingTransfer(null);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  vehicleCardWrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.25)' } as any)
      : {
          elevation: 3,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
        }),
  },
  cardHeaderArea: {
    gap: 10,
  },
  stagingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  stagingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stagingBannerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stagingAdvisorText: {
    fontSize: 11,
  },
  expandedContent: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 10,
  },
  dispatchSection: {
    gap: 8,
  },
  dispatchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dispatchLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  auditLogLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  auditLogLinkText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dispatchBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  completeBtn: {
    marginLeft: 'auto',
  },
  dispatchBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.35,
    ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}),
  },
  confirmBodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  confirmBoldPlate: {
    fontWeight: '800',
  },
  confirmBoldZone: {
    fontWeight: '800',
  },
});
