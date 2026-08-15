import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Vehicle } from '../../types/vehicle';
import { ShieldCheck, Clock, FileCheck, Sparkles, CheckCircle2, Clock3, ChevronDown, ChevronUp, History, XCircle } from 'lucide-react-native';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';

export const AdvisorInspectionView: React.FC = () => {
  const { vehicles, finishVehicleJobSheet, setSelectedVehicle, searchQuery } = useVehicles();
  const { canFinishJob } = usePermissions();
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const normalizeStr = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const readyVehicles = vehicles
    .filter(v => {
      const isReady = v.current_zone === 'inspection' || v.is_finished;
      if (!searchQuery.trim()) return isReady;
      const q = normalizeStr(searchQuery);
      return isReady && (
        normalizeStr(v.vehicle_no).includes(q) ||
        normalizeStr(v.model).includes(q)
      );
    });

  const calculateTotalTAT = (vehicle: Vehicle) => {
    const start = new Date(vehicle.intake_at).getTime();
    const end = vehicle.completed_at ? new Date(vehicle.completed_at).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));

    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);

    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDurationStr = (sec: number) => {
    if (!sec || sec <= 0) return '0m 00s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const padS = s < 10 ? `0${s}` : `${s}`;
    return h > 0 ? `${h}h ${m}m ${padS}s` : `${m}m ${padS}s`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    >
      {readyVehicles.length === 0 ? (
        <EmptyStateCard
          icon={FileCheck}
          title={searchQuery.trim() ? `No matching vehicles for "${searchQuery}"` : 'All Job Sheets Cleared'}
          subtitle={searchQuery.trim() ? 'Try searching another license plate number.' : 'No vehicles currently pending advisor final inspection or delivery.'}
        />
      ) : (
        <View style={styles.cardsGrid}>
          {readyVehicles.map((vehicle) => {
            const isExpanded = Boolean(expandedCards[vehicle.id]);

            return (
              <View key={vehicle.id} style={styles.mainCard}>
                {/* Clickable Header Area to Expand / Collapse */}
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => toggleExpand(vehicle.id)}
                  activeOpacity={0.8}
                >
                  <LicensePlate number={vehicle.vehicle_no} size="md" />

                  <View style={styles.headerRightGroup}>
                    <View style={styles.tatBox}>
                      <View style={styles.tatRow}>
                        <Clock3 size={14} color="#fbbf24" />
                        <Text style={styles.tatText}>{calculateTotalTAT(vehicle)}</Text>
                      </View>
                    </View>

                    <View style={styles.chevronWrapper}>
                      {isExpanded ? <ChevronUp size={20} color="#94a3b8" /> : <ChevronDown size={20} color="#94a3b8" />}
                    </View>
                  </View>
                </TouchableOpacity>

                {/* EXPANDED DETAILS CONTENT */}
                {isExpanded && (
                  <>
                    {/* Task Audit Summary */}
                    <View style={styles.section}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>TASK AUDIT LOG</Text>
                        <TouchableOpacity
                          style={styles.auditLogLink}
                          onPress={() => setSelectedVehicle(vehicle)}
                        >
                          <History size={12} color="#38bdf8" />
                          <Text style={styles.auditLogLinkText}>Full Audit Log</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.auditList}>
                        {vehicle.tasks.map(t => (
                          <View key={t.id} style={styles.taskAuditRow}>
                            <Text style={[styles.taskName, !t.is_completed && styles.taskNameCancelled]}>
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
                      style={[styles.deliverBtn, !canFinishJob && { opacity: 0.4 }]}
                      onPress={() => {
                        if (canFinishJob) finishVehicleJobSheet(vehicle.id, 'Service Advisor');
                      }}
                      disabled={!canFinishJob}
                    >
                      <Sparkles size={18} color="#ffffff" />
                      <Text style={styles.deliverText}>
                        {canFinishJob ? 'FINISH JOB & HANDOVER VEHICLE ✓' : 'ADVISOR ACCESS REQUIRED'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

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
  mainCard: { backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', padding: 20, gap: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
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
  deliverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10b981', padding: 16, borderRadius: 12, shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  deliverText: { color: '#ffffff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
});

