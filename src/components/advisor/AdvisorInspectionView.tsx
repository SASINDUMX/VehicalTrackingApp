import React from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ShieldCheck, Clock, FileCheck, Sparkles, CheckCircle2, Clock3, ChevronDown, ChevronUp, History, XCircle } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { TimerPill } from '../shared/TimerPill';
import { formatTotalTATString } from '../../utils/vehicleUtils';
import { useAdvisorInspection } from '../../hooks/useAdvisorInspection';
import { useTheme } from '../../context/ThemeContext';
import { Vehicle, VehicleTask } from '../../types/vehicle';

export const AdvisorInspectionView: React.FC = React.memo(() => {
  const {
    readyVehicles,
    expandedCards,
    searchQuery,
    canFinishJob,
    toggleExpand,
    finishVehicleJobSheet,
    setSelectedVehicle,
  } = useAdvisorInspection();
  const { colors, isDark } = useTheme();

  const renderVehicleCard = ({ item: vehicle }: { item: Vehicle }) => {
    const isExpanded = Boolean(expandedCards[vehicle.id]);

    return (
      <View key={vehicle.id} style={[styles.mainCard, { backgroundColor: colors.surface, borderColor: colors.borderGlass }]}>
        {/* Clickable Header Area to Expand / Collapse */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => toggleExpand(vehicle.id)}
          activeOpacity={0.8}
        >
          <LicensePlate number={vehicle.vehicle_no} size="md" />

          <View style={styles.headerRightGroup}>
            <TimerPill elapsedText={formatTotalTATString(vehicle)} variant="amber" size="md" />

            <View style={[styles.chevronWrapper, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', borderColor: colors.borderGlass }]}>
              {isExpanded ? <ChevronUp size={20} color={colors.textSecondary} /> : <ChevronDown size={20} color={colors.textSecondary} />}
            </View>
          </View>
        </TouchableOpacity>

        {/* EXPANDED DETAILS CONTENT */}
        {isExpanded && (
          <>
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
                    <Text style={[styles.taskName, { color: colors.textPrimary }, !t.is_completed && styles.taskNameCancelled]}>
                      {t.task_name}
                    </Text>
                    {t.is_completed ? (
                      <View style={[styles.statusPill, styles.statusDoneBg]}>
                        <CheckCircle2 size={12} color="#10b981" />
                        <Text style={[styles.statusText, styles.statusDone]}>DONE</Text>
                      </View>
                    ) : (
                      <View style={[styles.statusPill, styles.statusCancelledBg]}>
                        <XCircle size={12} color="#ef4444" />
                        <Text style={[styles.statusText, styles.statusCancelled]}>CANCELLED</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Finish & Deliver Action */}
            <TouchableOpacity
              style={[styles.deliverBtn, !canFinishJob && { opacity: 0.4, ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}) }]}
              onPress={() => {
                if (canFinishJob) finishVehicleJobSheet(vehicle.id, 'Service Advisor');
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

  if (readyVehicles.length === 0) {
    return (
      <EmptyStateCard
        icon={FileCheck}
        title={searchQuery.trim() ? `No matching vehicles for "${searchQuery}"` : 'All Job Sheets Cleared'}
        subtitle={searchQuery.trim() ? 'Try searching another license plate number.' : 'No vehicles currently pending advisor final inspection or delivery.'}
      />
    );
  }

  return (
    <FlatList
      data={readyVehicles}
      keyExtractor={(item) => item.id}
      renderItem={renderVehicleCard}
      initialNumToRender={8}
      maxToRenderPerBatch={10}
      windowSize={5}
      style={styles.container}
      contentContainerStyle={[styles.content, { gap: 16 }]}
      showsVerticalScrollIndicator={false}
    />
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  licensePlateContainer: { flexDirection: 'row', backgroundColor: '#facc15', borderRadius: 4, borderWidth: 1, borderColor: '#eab308', overflow: 'hidden' },
  plateLeftBar: { backgroundColor: '#1d4ed8', paddingHorizontal: 4, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  plateFlag: { fontSize: 10, lineHeight: 10 },
  plateCountryCode: { color: '#ffffff', fontSize: 8, fontWeight: '700', marginTop: 1 },
  plateRightArea: { paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
  plateText: { color: '#000000', fontWeight: '800', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 0.5 },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chevronWrapper: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
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
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDoneBg: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  statusPendingBg: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  statusCancelledBg: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusDone: { color: '#10b981' },
  statusPending: { color: '#fbbf24' },
  statusCancelled: { color: '#fca5a5' },
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
});

