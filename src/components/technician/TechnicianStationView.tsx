import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Car, AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TransferConfirmModal } from '../shared/TransferConfirmModal';
import { LoadingSpot } from '../shared/LoadingSpot';
import { sortWorkshopVehicles } from '../../utils/vehicleUtils';
import { useTechnicianStation } from '../../hooks/useTechnicianStation';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { Vehicle } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';
import { getBayColor } from '../../constants/bays';
import { APP_TERMINOLOGY } from '../../constants/terminology';
import { TechnicianVehicleCard } from './TechnicianVehicleCard';

export const TechnicianStationView: React.FC = React.memo(() => {
  const {
    activeBay,
    techName,
    activeTaskType,
    bayVehicles,
    elapsedTimes,
    expandedCards,
    pendingTransfer,
    isDispatching,
    isLoading,
    searchQuery,
    showMyVehiclesOnly,
    currentRole,
    canMarkTaskDone,
    canTransferVehicle,
    canStartWork,
    startingWorkVehicleIds,
    toggleExpand,
    toggleTaskCompletion,
    startStageWork,
    handleStartWork,
    setSelectedVehicle,
    setPendingTransfer,
    handleRequestTransfer,
    handleConfirmTransfer,
  } = useTechnicianStation();
  const { colors, isDark } = useTheme();
  const { togglePin, isPinned } = usePinnedVehicles();

  // Filter and Sort: filter to pinned if showMyVehiclesOnly is active, then sort urgent first, pinned, then intake time
  const sortedBayVehicles = useMemo(() => {
    const filtered = showMyVehiclesOnly ? bayVehicles.filter(v => isPinned(v.id)) : bayVehicles;
    return sortWorkshopVehicles(filtered, isPinned);
  }, [bayVehicles, showMyVehiclesOnly, isPinned]);

  const renderVehicleItem = ({ item: vehicle }: { item: Vehicle }) => {
    return (
      <TechnicianVehicleCard
        key={vehicle.id}
        vehicle={vehicle}
        isExpanded={Boolean(expandedCards[vehicle.id])}
        isPinned={isPinned(vehicle.id)}
        elapsedText={elapsedTimes[vehicle.id] || '0m 00s'}
        activeBay={activeBay}
        activeTaskType={activeTaskType}
        currentRole={currentRole}
        techName={techName}
        canStartWork={canStartWork(activeBay)}
        isStartingWork={Boolean(startingWorkVehicleIds[vehicle.id])}
        canTransferVehicle={canTransferVehicle}
        canMarkTaskDone={canMarkTaskDone(activeBay)}
        isDispatching={isDispatching}
        colors={colors}
        isDark={isDark}
        onToggleExpand={() => toggleExpand(vehicle.id)}
        onTogglePin={() => togglePin(vehicle.id)}
        onStartWork={() => handleStartWork(vehicle.id)}
        onToggleTask={(taskId: string) => toggleTaskCompletion(vehicle.id, taskId, techName)}
        onRequestTransfer={(targetZone, targetZoneName, autoCompleteTaskName) => handleRequestTransfer(vehicle.id, vehicle.vehicle_no, targetZone, targetZoneName, autoCompleteTaskName)}
        onSelectAuditLog={() => setSelectedVehicle(vehicle)}
      />
    );
  };

  return (
    <View style={styles.rootView}>
      {isLoading ? (
        <LoadingSpot color={getBayColor(activeBay, colors)} />
      ) : sortedBayVehicles.length === 0 ? (
        <EmptyStateCard
          icon={Car}
          title={
            showMyVehiclesOnly
              ? APP_TERMINOLOGY.emptyStates.noPinnedTitle
              : searchQuery.trim()
              ? APP_TERMINOLOGY.emptyStates.noSearchMatchTitle(searchQuery.trim())
              : APP_TERMINOLOGY.emptyStates.bayClearTitle
          }
          subtitle={
            showMyVehiclesOnly
              ? APP_TERMINOLOGY.emptyStates.noPinnedSubtitle
              : searchQuery.trim()
              ? APP_TERMINOLOGY.emptyStates.noSearchMatchSubtitle
              : APP_TERMINOLOGY.emptyStates.bayClearSubtitle
          }
        />
      ) : (
        <FlatList
          data={sortedBayVehicles}
          keyExtractor={(item) => item.id}
          renderItem={renderVehicleItem}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={[styles.content, { gap: 12 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* CONFIRMATION MODAL BEFORE DISPATCHING (Viewport Centered) */}
      <TransferConfirmModal
        visible={Boolean(pendingTransfer)}
        title={APP_TERMINOLOGY.actions.confirmDispatch}
        icon={<AlertTriangle size={24} color={colors.warning} />}
        bodyContent={
          pendingTransfer ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
                Are you sure you want to dispatch vehicle <Text style={[styles.confirmBoldPlate, { color: colors.warning }]}>{pendingTransfer.vehicleNo}</Text> to <Text style={[styles.confirmBoldZone, { color: colors.primaryLight }]}>{pendingTransfer.targetZoneName}</Text>?
              </Text>
              {Boolean(pendingTransfer.autoCompleteTaskName) && (
                <View style={[styles.autoCompleteBadge, { backgroundColor: colors.successDim, borderColor: colors.successBorder }]}>
                  <CheckCircle2 size={13} color={colors.success} />
                  <Text style={[styles.autoCompleteText, { color: colors.successLight }]}>
                    Will automatically mark <Text style={{ fontWeight: '800', color: colors.success }}>{pendingTransfer.autoCompleteTaskName}</Text> as DONE
                  </Text>
                </View>
              )}
            </View>
          ) : null
        }
        confirmLabel={`${APP_TERMINOLOGY.actions.confirmDispatch} ✓`}
        cancelLabel="Cancel"
        isProcessing={isDispatching}
        processingLabel={APP_TERMINOLOGY.actions.dispatching}
        confirmButtonColor={colors.primary}
        onConfirm={handleConfirmTransfer}
        onCancel={() => {
          if (!isDispatching) setPendingTransfer(null);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  rootView: { flex: 1, position: 'relative' },
  content: { paddingBottom: 24, gap: 16 },
  confirmBodyText: { fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { fontWeight: '800' },
  confirmBoldZone: { fontWeight: '800' },
  autoCompleteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  autoCompleteText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
