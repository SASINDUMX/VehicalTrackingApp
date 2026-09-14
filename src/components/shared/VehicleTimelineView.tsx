import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { BayZone, Vehicle } from '../../types/vehicle';
import { StatusPill } from './StatusPill';
import { computeVehicleTimelineStages } from '../../utils/timelineUtils';
import { getBayDefinitions } from '../../constants/bays';
import { Wrench, Navigation } from 'lucide-react-native';

const STAGE_ICONS: Record<BayZone, any> = {
  workshop: Wrench,
  alignment: Navigation,
  hoist: Wrench,
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

export interface VehicleTimelineViewProps {
  vehicle: Vehicle;
  activeStageDurationRaw: string;
}

export const VehicleTimelineView: React.FC<VehicleTimelineViewProps> = ({
  vehicle,
  activeStageDurationRaw,
}) => {
  const { colors } = useTheme();

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

  const timelineStagesData = useMemo(() => {
    return computeVehicleTimelineStages(vehicle, getStageOrder(colors), activeStageDurationRaw);
  }, [vehicle, colors, activeStageDurationRaw]);

  return (
    <View style={styles.stepperContainer}>
      <Text style={[styles.stepperTitle, { color: colors.textMuted }]}>
        WORKSHOP STAGE TIMELINE & AUDIT LOG:
      </Text>

      {/* Vertical Stepper Timeline list */}
      <View style={styles.timelineList}>
        {timelineStagesData.map((node, nodeIdx) => {
          const {
            stageDef,
            status,
            connectorType,
            isCurrent,
            logsForZone,
            isLastInOrder,
            isInspection,
            spentStr,
            breakNotes,
            queueNotes,
            workCompletedAt,
          } = node;

          const isStrikethrough = status === 'skipped' || status === 'bypassed';
          const nodeTheme = {
            completed: {
              iconColor: colors.success,
              circleBorder: colors.success,
              circleBg: colors.successDim,
              pillVariant: 'DONE' as const,
              pillLabel: 'DONE',
            },
            bypassed: {
              iconColor: colors.danger,
              circleBorder: colors.danger,
              circleBg: colors.dangerDim,
              pillVariant: 'SKIPPED' as const,
              pillLabel: 'BYPASSED',
            },
            active: {
              iconColor: colors.primaryLight,
              circleBorder: colors.primary,
              circleBg: colors.primaryDim,
              pillVariant: 'ACTIVE' as const,
              pillLabel: 'ACTIVE',
            },
            idle: {
              iconColor: colors.warningLight,
              circleBorder: colors.warning,
              circleBg: colors.warningDim,
              pillVariant: 'IDLE' as const,
              pillLabel: 'IDLE',
            },
            ready: {
              iconColor: colors.success,
              circleBorder: colors.success,
              circleBg: colors.successDim,
              pillVariant: 'READY' as const,
              pillLabel: 'READY',
            },
            skipped: {
              iconColor: colors.danger,
              circleBorder: colors.danger,
              circleBg: colors.dangerDim,
              pillVariant: 'SKIPPED' as const,
              pillLabel: 'SKIPPED',
            },
            pending: {
              iconColor: colors.textMuted,
              circleBorder: colors.borderGlassBright,
              circleBg: colors.surfaceOverlay,
              pillVariant: 'PENDING' as const,
              pillLabel: 'PENDING',
            },
          }[status];

          const StageIconComponent = stageDef.icon || CheckCircle2;

          return (
            <View key={node.id || `${stageDef.zone}-${nodeIdx}`} style={styles.timelineItem}>
              <View style={styles.timelineNodeColumn}>
                <View
                  style={[
                    styles.nodeCircle,
                    { backgroundColor: nodeTheme.circleBg, borderColor: nodeTheme.circleBorder },
                  ]}
                >
                  <StageIconComponent size={16} color={nodeTheme.iconColor} />
                </View>
                {!isLastInOrder && (
                  <>
                    {/* Background track */}
                    <View
                      style={[styles.timelineLine, { backgroundColor: colors.borderGlassBright }]}
                    />
                    {/* Connector driven directly by state engine */}
                    {connectorType === 'completed' && (
                      <View
                        style={[
                          styles.timelineLine,
                          styles.timelineLineDone,
                          { backgroundColor: colors.success },
                        ]}
                      />
                    )}
                    {connectorType === 'bypassed' && (
                      <View
                        style={[
                          styles.timelineLine,
                          styles.timelineLineDone,
                          { backgroundColor: colors.danger },
                        ]}
                      />
                    )}
                    {connectorType === 'idle_done' && (
                      <View
                        style={[
                          styles.timelineLine,
                          styles.timelineLineDone,
                          { backgroundColor: colors.warning },
                        ]}
                      />
                    )}
                    {connectorType === 'working' && (
                      <View
                        style={[
                          styles.timelineLine,
                          styles.timelineLineHalf,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </>
                )}
              </View>

              <View style={styles.timelineContent}>
                <View style={styles.timelineHeaderRow}>
                  <Text
                    style={[
                      styles.stageNameText,
                      { color: colors.textPrimary },
                      isCurrent && { fontWeight: '800' },
                      isStrikethrough && {
                        color: colors.textMuted,
                        textDecorationLine: 'line-through',
                      },
                    ]}
                  >
                    {stageDef.name}
                  </Text>
                  <StatusPill
                    variant={nodeTheme.pillVariant}
                    label={nodeTheme.pillLabel}
                    size="sm"
                  />
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
                        <Clock size={12} color={nodeTheme.iconColor} />
                        <Text
                          style={[
                            styles.timeTagText,
                            { color: nodeTheme.iconColor },
                            isCurrent && { fontWeight: '700' },
                          ]}
                        >
                          {{
                            active: `Active: ${spentStr}`,
                            idle: `Idle: ${spentStr}`,
                            completed: `Spent: ${spentStr}`,
                            bypassed: 'Bypassed',
                            skipped: 'Skipped',
                            ready: 'Ready',
                            pending: 'Pending',
                          }[status] || 'Pending'}
                        </Text>
                      </View>
                    </View>

                    {/* Historical Log Timestamps (Entry/Start and Finish/Exit) */}
                    {logsForZone.map((l, lIdx) => {
                      const entryStartStr = `• Entered ${formatSLSTime(l.entered_at)}${
                        l.work_started_at ? ` · Started ${formatSLSTime(l.work_started_at)}` : ''
                      }`;
                      const finishExitParts: string[] = [];
                      if (workCompletedAt)
                        finishExitParts.push(`Finished ${formatSLSTime(workCompletedAt)}`);
                      if (l.exited_at) finishExitParts.push(`Exited ${formatSLSTime(l.exited_at)}`);
                      const finishExitStr =
                        finishExitParts.length > 0 ? `• ${finishExitParts.join(' · ')}` : null;

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
                      <Text
                        key={`bn-${nIdx}`}
                        style={[styles.breakNoteSubText, { color: colors.warningLight }]}
                      >
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
                                {pIdx > 0 && (
                                  <Text style={{ color: colors.textMuted, fontSize: 11 }}> · </Text>
                                )}
                                <Text
                                  style={[
                                    styles.queueNoteSubText,
                                    {
                                      color: isActive
                                        ? colors.primaryLight
                                        : isIdle
                                        ? colors.warningLight
                                        : colors.textSecondary,
                                    },
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
  );
};

const styles = StyleSheet.create({
  stepperContainer: { gap: 16 },
  stepperTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timelineList: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 14 },
  timelineNodeColumn: { alignItems: 'center', width: 28, position: 'relative' },
  nodeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineLine: { width: 2, position: 'absolute', top: 28, bottom: 0, zIndex: 1 },
  timelineLineDone: { zIndex: 2 },
  timelineLineHalf: { height: '50%', zIndex: 2 },
  timelineContent: { flex: 1, paddingBottom: 24, gap: 4 },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageNameText: { fontSize: 13, fontWeight: '600' },
  stageTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeTagText: { fontSize: 12, fontWeight: '500' },
  logSubRowContainer: { gap: 2, marginTop: 2 },
  logSubText: { fontSize: 11, lineHeight: 16 },
  queueNoteRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  queueNoteSubText: { fontSize: 11, fontWeight: '500' },
  breakNoteSubText: { fontSize: 11, marginTop: 2, fontWeight: '500' },
});
