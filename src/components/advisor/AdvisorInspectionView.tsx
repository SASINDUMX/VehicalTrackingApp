import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { FileCheck, Sparkles, CheckCircle2, History, XCircle, Bookmark } from 'lucide-react-native';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { StatusPill } from '../shared/StatusPill';
import { VehicleCardHeader } from '../shared/VehicleCardHeader';
import { TransferConfirmModal } from '../shared/TransferConfirmModal';
import { CalloutBanner } from '../shared/CalloutBanner';
import { LoadingSpot } from '../shared/LoadingSpot';
import { sortWorkshopVehicles } from '../../utils/vehicleUtils';
import { useAdvisorInspection } from '../../hooks/useAdvisorInspection';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { useTheme } from '../../context/ThemeContext';
import { Vehicle, VehicleTask } from '../../types/vehicle';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export const AdvisorInspectionView: React.FC = React.memo(() => {
  const {
    readyVehicles,
    expandedCards,
    searchQuery,
    showMyVehiclesOnly,
    canFinishJob,
    toggleExpand,
    finishVehicleJobSheet,
    setSelectedVehicle,
    isLoading,
  } = useAdvisorInspection();
  const { colors, isDark } = useTheme();
  const { togglePin, isPinned } = usePinnedVehicles();
  const [pendingHandover, setPendingHandover] = useState<{
    id: string;
    plate: string;
    incompleteCount: number;
  } | null>(null);
  const [isHandingOver, setIsHandingOver] = useState(false);

  const handleRequestHandover = (vehicle: Vehicle) => {
    if (isHandingOver) return;
    const incomplete = vehicle.tasks.filter(t => t.is_required && !t.is_completed).length;
    setPendingHandover({
      id: vehicle.id,
      plate: vehicle.vehicle_no,
      incompleteCount: incomplete,
    });
  };

  const handleConfirmHandover = async () => {
    if (pendingHandover && canFinishJob && !isHandingOver) {
      setIsHandingOver(true);
      try {
        const success = await finishVehicleJobSheet(pendingHandover.id, 'Service Advisor');
        if (success) {
          setPendingHandover(null);
        }
      } finally {
        setIsHandingOver(false);
      }
    }
  };

  // Memoized Sort: urgent first, then pinned, then FIFO; optionally filter to pinned only
  const sortedVehicles = useMemo(() => {
    return sortWorkshopVehicles(readyVehicles, isPinned);
  }, [readyVehicles, isPinned]);

  const displayVehicles = useMemo(() => {
    return showMyVehiclesOnly ? sortedVehicles.filter(v => isPinned(v.id)) : sortedVehicles;
  }, [showMyVehiclesOnly, sortedVehicles, isPinned]);

  const renderVehicleCard = ({ item: vehicle }: { item: Vehicle }) => {
    const isExpanded = Boolean(expandedCards[vehicle.id]);
    const isUrgent = Boolean(vehicle.is_urgent);

    return (
      <View
        key={vehicle.id}
        style={[
          styles.mainCard,
          {
            backgroundColor: isUrgent ? colors.cardUrgentBg : colors.cardDoneBg,
            borderColor: isUrgent ? colors.cardUrgentBorder : colors.cardDoneBorder,
            borderLeftWidth: 4,
            borderLeftColor: isUrgent ? colors.danger : colors.success,
          }
        ]}
      >
        {/* Clickable Header Area to Expand / Collapse */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => toggleExpand(vehicle.id)}
          activeOpacity={0.8}
        >
          <VehicleCardHeader
            vehicle={vehicle}
            size="md"
            rightAccessory={
              <StatusPill
                variant="READY"
                label="READY"
                IconComponent={CheckCircle2}
                size="md"
              />
            }
            isPinned={isPinned(vehicle.id)}
            onTogglePin={() => togglePin(vehicle.id)}
            isExpanded={isExpanded}
            onToggleExpand={() => toggleExpand(vehicle.id)}
            showChevron={true}
          />
        </TouchableOpacity>

        {/* EXPANDED DETAILS CONTENT */}
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

            {/* Vehicle Remarks / Special Instructions Box */}
            {Boolean(vehicle.remarks && vehicle.remarks.trim()) && (
              <CalloutBanner
                variant="remarks"
                title="REMARKS / SPECIAL INSTRUCTIONS"
                message={vehicle.remarks}
              />
            )}

            {/* Task Audit Summary */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TASK AUDIT LOG</Text>
                <TouchableOpacity
                  style={styles.auditLogLink}
                  onPress={() => setSelectedVehicle(vehicle)}
                >
                  <History size={12} color={colors.primaryLight} />
                  <Text style={[styles.auditLogLinkText, { color: colors.primaryLight }]}>{APP_TERMINOLOGY.actions.fullAuditLog}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.auditList}>
                {vehicle.tasks.filter((t: VehicleTask) => t.is_required).map((t: VehicleTask) => (
                  <View key={t.id} style={[styles.taskAuditRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
                    <Text style={[styles.taskName, { color: colors.textPrimary }, !t.is_completed && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                      {t.task_name}
                    </Text>
                    {t.is_completed ? (
                      <StatusPill variant="DONE" label="DONE" IconComponent={CheckCircle2} size="sm" />
                    ) : (
                      <StatusPill variant="SKIPPED" label="SKIPPED" IconComponent={XCircle} size="sm" />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Finish & Deliver Action */}
            <TouchableOpacity
              style={[
                styles.deliverBtn,
                { backgroundColor: colors.success },
                (!canFinishJob || isHandingOver) && { opacity: 0.4, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }
              ]}
              disabled={!canFinishJob || isHandingOver}
              onPress={() => {
                if (canFinishJob && !isHandingOver) handleRequestHandover(vehicle);
              }}
              activeOpacity={canFinishJob && !isHandingOver ? 0.7 : 1}
            >
              <Sparkles size={16} color="#ffffff" />
              <Text style={styles.deliverText} numberOfLines={1}>
                {canFinishJob ? `${APP_TERMINOLOGY.actions.deliverVehicle} ✓` : 'ADVISOR ACCESS REQUIRED'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  if (isLoading) {
    return <LoadingSpot color={colors.bayInspection} />;
  }

  if (displayVehicles.length === 0) {
    return (
      <EmptyStateCard
        icon={showMyVehiclesOnly ? Bookmark : FileCheck}
        title={
          showMyVehiclesOnly
            ? APP_TERMINOLOGY.emptyStates.noPinnedTitle
            : searchQuery.trim()
            ? APP_TERMINOLOGY.emptyStates.noSearchMatchTitle(searchQuery.trim())
            : APP_TERMINOLOGY.emptyStates.allClearedTitle
        }
        subtitle={
          showMyVehiclesOnly
            ? APP_TERMINOLOGY.emptyStates.noPinnedSubtitle
            : searchQuery.trim()
            ? APP_TERMINOLOGY.emptyStates.noSearchMatchSubtitle
            : APP_TERMINOLOGY.emptyStates.allClearedSubtitle
        }
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={displayVehicles}
        keyExtractor={(item) => item.id}
        renderItem={renderVehicleCard}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        style={styles.container}
        contentContainerStyle={[styles.content, { gap: 16 }]}
        showsVerticalScrollIndicator={false}
      />

      {/* Confirmation Modal for Final Handover */}
      <TransferConfirmModal
        visible={Boolean(pendingHandover)}
        title={APP_TERMINOLOGY.actions.confirmFinalHandover}
        icon={<Sparkles size={22} color={colors.success} />}
        bodyContent={
          pendingHandover ? (
            pendingHandover.incompleteCount > 0 ? (
              <Text style={[styles.confirmBodyText, { color: colors.dangerLight }]}>
                ⚠️ Attention: <Text style={[styles.confirmBoldPlate, { color: colors.warning }]}>{pendingHandover.plate}</Text> has <Text style={{ fontWeight: '800', color: colors.danger }}>{pendingHandover.incompleteCount} incomplete task(s)</Text>. Are you sure you want to finish and handover?
              </Text>
            ) : (
              <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
                All required job sheet tasks are verified. Deliver vehicle <Text style={[styles.confirmBoldPlate, { color: colors.warning }]}>{pendingHandover.plate}</Text> to customer?
              </Text>
            )
          ) : null
        }
        confirmLabel={`${APP_TERMINOLOGY.actions.confirmHandover} ✓`}
        cancelLabel="Cancel"
        isProcessing={isHandingOver}
        processingLabel={APP_TERMINOLOGY.actions.handingOver}
        confirmButtonColor={colors.success}
        onConfirm={handleConfirmHandover}
        onCancel={() => {
          if (!isHandingOver) setPendingHandover(null);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  mainCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 3px 6px rgba(0, 0, 0, 0.25)' } as any)
      : { shadowColor: 'rgba(0, 0, 0, 1)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  section: { gap: 6 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLogLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  auditLogLinkText: { fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  sectionTitle: { fontWeight: '700', fontSize: 11, letterSpacing: 0.5 },
  auditList: { gap: 6 },
  taskAuditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  taskName: { fontSize: 13, fontWeight: '500' },
  deliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 4px 8px rgba(16, 185, 129, 0.4)' } as any) : { shadowColor: 'rgba(16, 185, 129, 1)', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 4 }),
  },
  deliverText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  confirmBodyText: { fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { fontWeight: '800' },
});

