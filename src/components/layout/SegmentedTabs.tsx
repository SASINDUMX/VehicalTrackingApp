import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { usePermissions } from '../../hooks/usePermissions';
import { FileText, ClipboardList, Info } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';
import { NavigationTab } from '../../types/vehicle';

export const SegmentedTabs: React.FC = () => {
  const {
    vehicles,
    activeTab,
    setActiveTab,
    isReportsModalOpen,
    activeReportsTab,
    setActiveReportsTab,
    setIsCalculationInfoOpen,
  } = useVehicles();
  const { canViewAuditLogs } = usePermissions();
  const { colors, isDark } = useTheme();

  const waitingCount = useMemo(() => {
    return vehicles.filter(v => v.current_zone === 'waiting' && !v.is_finished).length;
  }, [vehicles]);

  const tabs = useMemo<
    {
      id: NavigationTab;
      label: string;
      activeBg: string;
      activeBorder: string;
      activeColor: string;
      badge?: number;
    }[]
  >(
    () => [
      {
        id: 'overview',
        label: APP_TERMINOLOGY.navigation.overview,
        activeBg: colors.primaryDim,
        activeBorder: colors.primary,
        activeColor: isDark ? colors.primaryLight : colors.primary,
      },
      {
        id: 'waiting',
        label: APP_TERMINOLOGY.stations.waiting.tabLabel,
        activeBg: colors.bayWaitingDim,
        activeBorder: colors.bayWaiting,
        activeColor: isDark ? colors.bayWaitingLight : colors.bayWaiting,
        badge: waitingCount,
      },
      {
        id: 'workshop',
        label: APP_TERMINOLOGY.stations.workshop.tabLabel,
        activeBg: colors.bayWorkshopDim,
        activeBorder: colors.bayWorkshop,
        activeColor: isDark ? colors.bayWorkshopLight : colors.bayWorkshop,
      },
      {
        id: 'alignment',
        label: APP_TERMINOLOGY.stations.alignment.tabLabel,
        activeBg: colors.bayAlignmentDim,
        activeBorder: colors.bayAlignment,
        activeColor: isDark ? colors.bayAlignmentLight : colors.bayAlignment,
      },
      {
        id: 'hoist',
        label: APP_TERMINOLOGY.stations.hoist.tabLabel,
        activeBg: colors.bayHoistDim,
        activeBorder: colors.bayHoist,
        activeColor: isDark ? colors.bayHoistLight : colors.bayHoist,
      },
      {
        id: 'inspection',
        label: APP_TERMINOLOGY.stations.inspection.tabLabel,
        activeBg: colors.bayInspectionDim,
        activeBorder: colors.bayInspection,
        activeColor: isDark ? colors.bayInspectionLight : colors.bayInspection,
      },
    ],
    [colors, isDark, waitingCount]
  );

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

  return (
    <View
      style={[
        styles.segmentedContainer,
        { backgroundColor: colors.surface, borderBottomColor: colors.borderGlass },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollWrapper}
      >
        <View
          style={[
            styles.unifiedRail,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: colors.borderGlass,
            },
          ]}
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const isPrevActive = index > 0 && activeTab === tabs[index - 1].id;
            const showDivider = index > 0 && !isActive && !isPrevActive;

            return (
              <React.Fragment key={tab.id}>
                {showDivider && (
                  <View style={[styles.railDivider, { backgroundColor: colors.borderGlass }]} />
                )}
                <TouchableOpacity
                  style={[
                    styles.railItem,
                    isActive && {
                      backgroundColor: tab.activeBg,
                      borderColor: tab.activeBorder,
                    },
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tabContentRow}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.railItemText,
                        {
                          color: isActive ? tab.activeColor : colors.textSecondary,
                          fontWeight: isActive ? '800' : '600',
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {Boolean(tab.badge && tab.badge > 0) && (
                      <View
                        style={[
                          styles.counterPill,
                          {
                            backgroundColor: isActive ? tab.activeBorder : colors.bayWaiting,
                          },
                        ]}
                      >
                        <Text style={styles.counterPillText}>{tab.badge}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  segmentedContainer: {
    borderBottomWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  scrollWrapper: {
    width: '100%',
  },
  scrollContent: {
    minWidth: '100%',
  },
  unifiedRail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 33,
    borderRadius: 9,
    borderWidth: 1,
    padding: 2,
    minWidth: '100%',
  },
  railItem: {
    flex: 1,
    minWidth: 50,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  railDivider: {
    width: 1,
    height: 12,
    alignSelf: 'center',
  },
  stageDivider: {
    width: 1,
    height: 12,
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
  },
  railItemText: {
    fontSize: 11,
    letterSpacing: 0,
  },
  counterPill: {
    borderRadius: 7,
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterPillText: {
    color: '#000000',
    fontSize: 8.5,
    fontWeight: '900',
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
