import React, { useState } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { ShieldCheck, Clock, FileCheck, Sparkles, CheckCircle2, Clock3, ChevronDown, ChevronUp, History, XCircle, Bookmark, AlertOctagon } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';
import { StatusPill } from '../shared/StatusPill';
import { VehicleNotePill } from '../shared/VehicleNotePill';
import { formatTotalTATString } from '../../utils/vehicleUtils';
import { useAdvisorInspection } from '../../hooks/useAdvisorInspection';
import { usePinnedVehicles } from '../../hooks/usePinnedVehicles';
import { useTheme } from '../../context/ThemeContext';
import { Vehicle, VehicleTask } from '../../types/vehicle';

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
  } = useAdvisorInspection();
  const { colors, isDark } = useTheme();
  const { togglePin, isPinned } = usePinnedVehicles();
  const [pendingHandover, setPendingHandover] = useState<{
    id: string;
    plate: string;
    incompleteCount: number;
  } | null>(null);

  const handleRequestHandover = (vehicle: Vehicle) => {
    const incomplete = vehicle.tasks.filter(t => t.is_required && !t.is_completed).length;
    setPendingHandover({
      id: vehicle.id,
      plate: vehicle.vehicle_no,
      incompleteCount: incomplete,
    });
  };

  const handleConfirmHandover = () => {
    if (pendingHandover && canFinishJob) {
      finishVehicleJobSheet(pendingHandover.id, 'Service Advisor');
      setPendingHandover(null);
    }
  };

  // Sort: urgent first, then pinned, then normal; optionally filter to pinned only
  const sortedVehicles = [...readyVehicles]
    .sort((a, b) => {
      if (a.is_urgent && !b.is_urgent) return -1;
      if (!a.is_urgent && b.is_urgent) return 1;
      if (isPinned(a.id) && !isPinned(b.id)) return -1;
      if (!isPinned(a.id) && isPinned(b.id)) return 1;
      return 0;
    });
  const displayVehicles = showMyVehiclesOnly ? sortedVehicles.filter(v => isPinned(v.id)) : sortedVehicles;

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
          <View style={styles.plateWithStatusGroup}>
            <LicensePlate number={vehicle.vehicle_no} size="md" />
            <VehicleNotePill vehicle={vehicle} size="md" compact />
          </View>

          <View style={styles.headerRightGroup}>
            <StatusPill
              variant="READY"
              label="READY"
              IconComponent={CheckCircle2}
              size="md"
            />

            {/* Pin toggle button */}
            <TouchableOpacity
              style={styles.pinBtn}
              onPress={() => togglePin(vehicle.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Bookmark
                size={16}
                color={isPinned(vehicle.id) ? '#f59e0b' : colors.textMuted}
                fill={isPinned(vehicle.id) ? '#f59e0b' : 'transparent'}
              />
            </TouchableOpacity>

            <View style={[styles.chevronWrapper, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.borderGlass }]}>
              {isExpanded ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
            </View>
          </View>
        </TouchableOpacity>

        {/* EXPANDED DETAILS CONTENT */}
        {isExpanded && (
          <>
            {/* Priority Alert Callout Banner if Urgent */}
            {isUrgent && (
              <View style={styles.urgentCalloutBox}>
                <View style={styles.urgentCalloutHeader}>
                  <AlertOctagon size={14} color="#ef4444" />
                  <Text style={styles.urgentCalloutTitle}>URGENT VEHICLE</Text>
                </View>
                {Boolean(vehicle.urgent_note) && (
                  <Text style={styles.urgentCalloutText}>{vehicle.urgent_note}</Text>
                )}
              </View>
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
                  <Text style={[styles.auditLogLinkText, { color: colors.primaryLight }]}>Full Audit Log</Text>
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
                !canFinishJob && { opacity: 0.4, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }
              ]}
              onPress={() => {
                if (canFinishJob) handleRequestHandover(vehicle);
              }}
              activeOpacity={canFinishJob ? 0.7 : 1}
            >
              <Sparkles size={16} color="#ffffff" />
              <Text style={styles.deliverText} numberOfLines={1}>
                {canFinishJob ? 'FINISH JOB & HANDOVER VEHICLE ✓' : 'ADVISOR ACCESS REQUIRED'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  if (displayVehicles.length === 0) {
    return (
      <EmptyStateCard
        icon={showMyVehiclesOnly ? Bookmark : FileCheck}
        title={showMyVehiclesOnly ? 'No Pinned Vehicles' : searchQuery.trim() ? `No matching vehicles for "${searchQuery}"` : 'All Job Sheets Cleared'}
        subtitle={showMyVehiclesOnly ? 'You do not have any pinned vehicles in the inspection zone.' : searchQuery.trim() ? 'Try searching another license plate number.' : 'No vehicles currently pending advisor final inspection or delivery.'}
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
      {pendingHandover && (
        <View style={styles.confirmOverlay}>
          <TouchableOpacity
            style={styles.confirmBackdrop}
            activeOpacity={1}
            onPress={() => setPendingHandover(null)}
          />
          <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: colors.borderGlassBright }]}>
            <View style={styles.confirmHeader}>
              <Sparkles size={22} color={colors.success} />
              <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>Confirm Final Handover</Text>
            </View>

            {pendingHandover.incompleteCount > 0 ? (
              <Text style={[styles.confirmBodyText, { color: '#fca5a5' }]}>
                ⚠️ Attention: <Text style={styles.confirmBoldPlate}>{pendingHandover.plate}</Text> has <Text style={{ fontWeight: '800', color: '#ef4444' }}>{pendingHandover.incompleteCount} incomplete task(s)</Text>. Are you sure you want to finish and handover?
              </Text>
            ) : (
              <Text style={[styles.confirmBodyText, { color: colors.textSecondary }]}>
                All required job sheet tasks are verified. Deliver vehicle <Text style={styles.confirmBoldPlate}>{pendingHandover.plate}</Text> to customer?
              </Text>
            )}

            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.borderGlass }]}
                onPress={() => setPendingHandover(null)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmHandoverBtn, { backgroundColor: colors.success }]}
                onPress={handleConfirmHandover}
              >
                <Text style={styles.confirmHandoverBtnText}>Confirm Handover ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  iconWrapper: { backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: 10, borderRadius: 10 },
  title: { color: '#ffffff', fontWeight: '800', fontSize: 18 },
  subtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  emptyCard: { backgroundColor: '#121a2b', borderRadius: 14, padding: 40, alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  emptySub: { color: '#64748b', fontSize: 13 },
  cardsGrid: { gap: 16 },
  mainCard: { backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 20, gap: 20, ...(Platform.OS === 'web' ? ({ boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.3)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', rowGap: 8 },
  plateWithStatusGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  licensePlateContainer: { flexDirection: 'row', backgroundColor: '#facc15', borderRadius: 4, borderWidth: 1, borderColor: '#eab308', overflow: 'hidden' },
  plateLeftBar: { backgroundColor: '#1d4ed8', paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  plateFlag: { fontSize: 10, lineHeight: 10 },
  plateCountryCode: { color: '#ffffff', fontSize: 8, fontWeight: '700', marginTop: 1 },
  plateRightArea: { paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  pinBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center', justifyContent: 'center' },
  chevronWrapper: { width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  tatBox: { alignItems: 'flex-end' },
  tatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  tatText: { color: '#fbbf24', fontSize: 16, fontWeight: '800' },
  section: { gap: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditLogLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  auditLogLinkText: { color: '#38bdf8', fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  sectionTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  stageTimingList: { gap: 8, backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  stageTimingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stageNameGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageTimingName: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  stageTimingVal: { color: '#38bdf8', fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  unvisitedVal: { color: '#64748b', fontWeight: '500', fontStyle: 'italic' },
  auditList: { gap: 8 },
  taskAuditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  taskName: { color: '#ffffff', fontSize: 14, fontWeight: '500' },
  taskNameCancelled: { color: '#94a3b8', textDecorationLine: 'line-through', opacity: 0.7 },
  deliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0px 4px 8px rgba(16, 185, 129, 0.4)' } as any) : { shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 }),
  },
  deliverText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13.5,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  filterBtnActive: { backgroundColor: 'rgba(14, 165, 233, 0.1)', borderColor: 'rgba(14, 165, 233, 0.3)' },
  filterBtnText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  filterBtnTextActive: { color: '#38bdf8' },
  urgentCalloutBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  urgentCalloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgentCalloutTitle: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  urgentCalloutText: {
    color: '#fca5a5',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  confirmOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  confirmBackdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}) },
  confirmCard: { width: '90%', maxWidth: 420, backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', padding: 20, gap: 16, zIndex: 1000, ...(Platform.OS === 'web' ? ({ boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.5)' } as any) : { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 }) },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  confirmBodyText: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  confirmBoldPlate: { color: '#facc15', fontWeight: '800' },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  cancelBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  confirmHandoverBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#10b981' },
  confirmHandoverBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});

