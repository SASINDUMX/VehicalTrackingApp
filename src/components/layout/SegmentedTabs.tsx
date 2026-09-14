import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { FileText, ClipboardList, Info } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export const SegmentedTabs: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isReportsModalOpen,
    activeReportsTab,
    setActiveReportsTab,
    setIsCalculationInfoOpen,
  } = useVehicles();
  const { canViewAuditLogs } = usePermissions();
  const { colors, isDark } = useTheme();

  if (isReportsModalOpen) {
    return (
      <View style={[styles.segmentedContainer, { backgroundColor: colors.surface, borderBottomColor: colors.borderGlass }]}>
        <View style={styles.reportsHeaderRow}>
          {/* Left Title with Info Calculation Rules Icon */}
          <View style={styles.reportsTitleGroup}>
            <TouchableOpacity
              style={styles.reportsInfoBtn}
              onPress={() => setIsCalculationInfoOpen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Info size={18} color={colors.primaryLight} />
            </TouchableOpacity>
            <Text style={[styles.reportsHeaderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              SERVICE LOGS & REPORTS
            </Text>
          </View>

          {/* Right: Sub-tab switcher for Super Admins (KPIs vs Audit Trail) */}
          {canViewAuditLogs && (
            <View style={[
              styles.reportsSubTabsBox,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.borderGlass,
              }
            ]}>
              <TouchableOpacity
                style={[
                  styles.reportsSubTabItem,
                  activeReportsTab === 'kpi' && {
                    backgroundColor: colors.primaryDim,
                    borderColor: colors.primary,
                  }
                ]}
                onPress={() => setActiveReportsTab('kpi')}
                activeOpacity={0.7}
              >
                <FileText size={12} color={activeReportsTab === 'kpi' ? colors.primaryLight : colors.textMuted} />
                <Text
                  style={[
                    styles.reportsSubTabText,
                    {
                      color: activeReportsTab === 'kpi' ? colors.primaryLight : colors.textMuted,
                      fontWeight: activeReportsTab === 'kpi' ? '800' : '600',
                    }
                  ]}
                >
                  KPIs
                </Text>
              </TouchableOpacity>

              <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

              <TouchableOpacity
                style={[
                  styles.reportsSubTabItem,
                  activeReportsTab === 'audit' && {
                    backgroundColor: colors.primaryDim,
                    borderColor: colors.primary,
                  }
                ]}
                onPress={() => setActiveReportsTab('audit')}
                activeOpacity={0.7}
              >
                <ClipboardList size={12} color={activeReportsTab === 'audit' ? colors.primaryLight : colors.textMuted} />
                <Text
                  style={[
                    styles.reportsSubTabText,
                    {
                      color: activeReportsTab === 'audit' ? colors.primaryLight : colors.textMuted,
                      fontWeight: activeReportsTab === 'audit' ? '800' : '600',
                    }
                  ]}
                >
                  Audit Log
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  const isOverviewActive = activeTab === 'overview';
  const isWorkshopActive = activeTab === 'workshop';
  const isAlignmentActive = activeTab === 'alignment';
  const isHoistActive = activeTab === 'hoist';
  const isAdvisorActive = activeTab === 'inspection';

  return (
    <View style={[styles.segmentedContainer, { backgroundColor: colors.surface, borderBottomColor: colors.borderGlass }]}>
      <View style={styles.segmentedRow}>
        {/* 1. Floor Overview Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            {
              backgroundColor: isOverviewActive 
                ? colors.primaryDim 
                : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
              borderColor: isOverviewActive ? colors.primary : colors.borderGlass,
            }
          ]}
          onPress={() => setActiveTab('overview')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            style={[
              styles.segmentBtnText,
              {
                color: isOverviewActive 
                  ? (isDark ? colors.primaryLight : colors.primary) 
                  : colors.textSecondary,
                fontWeight: isOverviewActive ? '800' : '600',
              }
            ]}
          >
            {APP_TERMINOLOGY.navigation.overview}
          </Text>
        </TouchableOpacity>

        {/* 2. 3 Workshop Station Stages (Grouped Box: General | Alignment | Hoist) */}
        <View style={[
          styles.groupedStagesBox,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)',
            borderColor: colors.borderGlass
          }
        ]}>
          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isWorkshopActive && {
                backgroundColor: colors.bayWorkshopDim,
                borderColor: colors.bayWorkshop,
              }
            ]}
            onPress={() => setActiveTab('workshop')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isWorkshopActive 
                    ? (isDark ? colors.bayWorkshopLight : colors.bayWorkshop) 
                    : colors.textSecondary,
                  fontWeight: isWorkshopActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.workshop.tabLabel}
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isAlignmentActive && {
                backgroundColor: colors.bayAlignmentDim,
                borderColor: colors.bayAlignment,
              }
            ]}
            onPress={() => setActiveTab('alignment')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isAlignmentActive 
                    ? (isDark ? colors.bayAlignmentLight : colors.bayAlignment) 
                    : colors.textSecondary,
                  fontWeight: isAlignmentActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.alignment.tabLabel}
            </Text>
          </TouchableOpacity>

          <View style={[styles.stageDivider, { backgroundColor: colors.borderGlass }]} />

          <TouchableOpacity
            style={[
              styles.groupedStageItem,
              isHoistActive && {
                backgroundColor: colors.bayHoistDim,
                borderColor: colors.bayHoist,
              }
            ]}
            onPress={() => setActiveTab('hoist')}
            activeOpacity={0.7}
          >
            <Text 
              numberOfLines={1}
              style={[
                styles.segmentBtnText,
                {
                  color: isHoistActive 
                    ? (isDark ? colors.bayHoistLight : colors.bayHoist) 
                    : colors.textSecondary,
                  fontWeight: isHoistActive ? '800' : '600',
                }
              ]}
            >
              {APP_TERMINOLOGY.stations.hoist.tabLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Ready Handover Button */}
        <TouchableOpacity
          style={[
            styles.segmentSingleBtn,
            {
              backgroundColor: isAdvisorActive 
                ? colors.bayInspectionDim 
                : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.04)'),
              borderColor: isAdvisorActive ? colors.bayInspection : colors.borderGlass,
            }
          ]}
          onPress={() => setActiveTab('inspection')}
          activeOpacity={0.7}
        >
          <Text 
            numberOfLines={1}
            style={[
              styles.segmentBtnText,
              {
                color: isAdvisorActive 
                  ? (isDark ? colors.bayInspectionLight : colors.bayInspection) 
                  : colors.textSecondary,
                fontWeight: isAdvisorActive ? '800' : '600',
              }
            ]}
          >
            {APP_TERMINOLOGY.stations.inspection.tabLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  segmentedContainer: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
  },
  segmentSingleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    width: 72,
    borderWidth: 1,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  groupedStagesBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    padding: 2,
  },
  groupedStageItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 2,
  },
  stageDivider: {
    width: 1,
    height: 14,
  },
  segmentBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  // Reports Inline Navigation Header in place of Segmented Tabs
  reportsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 36,
    gap: 10,
  },
  reportsInfoBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  reportsTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  reportsHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  reportsSubTabsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    flexShrink: 0,
  },
  reportsSubTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: '100%',
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reportsSubTabText: {
    fontSize: 11,
  },
});
