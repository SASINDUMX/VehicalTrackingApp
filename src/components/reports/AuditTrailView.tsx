import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  Shield,
  Search,
  Download,
  Calendar,
  Filter,
  User,
  MapPin,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  X,
  Layers,
  CloudOff,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { auditService } from '../../services/auditService';
import { AuditLogEntry, AuditActionType, AuditActionCategory } from '../../types/audit';
import { DateFilterPreset, getDatePresetRangeDescription } from '../../utils/reportExportUtils';
import { getSriLankaTodayString, getSriLankaDateString, getSriLankaDayStartISO, getSriLankaDayEndISO } from '../../utils/workshopHoursUtils';
import { LicensePlate } from '../shared/LicensePlate';
import { EmptyStateCard } from '../shared/EmptyStateCard';
import { ThemeDatePicker } from '../shared/ThemeDatePicker';

const AUDIT_PAGE_SIZE = 25;

const DATE_PRESETS: { id: DateFilterPreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'Last 7 Days' },
  { id: 'month', label: 'This Month' },
  { id: '3months', label: 'Last 3 Months' },
];

const ACTION_CATEGORIES: { id: AuditActionCategory; label: string; iconLabel: string }[] = [
  { id: 'all', label: 'All Actions', iconLabel: '🌟' },
  { id: 'holds', label: 'Holds & Resumes', iconLabel: '🛑' },
  { id: 'urgency', label: 'Priority & Urgency', iconLabel: '⚡' },
  { id: 'plate', label: 'Plate Changes', iconLabel: '🔢' },
  { id: 'remarks', label: 'Remarks & Notes', iconLabel: '📝' },
  { id: 'transfers', label: 'Transfers & Staff', iconLabel: '🔄' },
  { id: 'intake_delete', label: 'Intakes & Deletes', iconLabel: '➕' },
  { id: 'completions', label: 'Completions', iconLabel: '✅' },
  { id: 'users', label: 'User Roles', iconLabel: '👤' },
];

import { ThemeColors } from '../../constants/theme';

const getActionConfig = (action: string, colors: ThemeColors) => {
  switch (action) {
    case 'VEHICLE_CREATED':
      return { label: 'Vehicle Intake / Checked In', color: colors.success, bg: colors.successDim };
    case 'PLATE_MODIFIED':
      return { label: 'License Plate Modified', color: colors.warning, bg: colors.warningDim };
    case 'REMARKS_MODIFIED':
      return { label: 'Remarks / Notes Edited', color: colors.primaryLight, bg: colors.primaryDim };
    case 'HOLD_OVERRIDE_PAUSED':
      return { label: 'Hold Overridden (Paused)', color: colors.danger, bg: colors.dangerDim };
    case 'HOLD_OVERRIDE_RESUMED':
      return { label: 'Hold Overridden (Resumed)', color: colors.success, bg: colors.successDim };
    case 'URGENCY_MODIFIED':
      return { label: 'Priority / Urgency Changed', color: colors.purple, bg: colors.purpleDim };
    case 'BAY_TRANSFERRED':
    case 'SECTION_TRANSFER':
      return { label: 'Bay / Zone Relocation', color: colors.primaryCyan, bg: colors.primaryDim };
    case 'TECH_REASSIGNED':
      return { label: 'Mechanic Reassigned', color: colors.warningLight, bg: colors.warningDim };
    case 'TASK_COMPLETED':
      return { label: 'Task Check-off Completed', color: colors.bayAlignment, bg: colors.bayAlignmentDim };
    case 'JOB_COMPLETED':
      return { label: 'Job Sheet Completed', color: colors.success, bg: colors.successDim };
    case 'DELETE_VEHICLE':
      return { label: 'Vehicle Record Deleted', color: colors.danger, bg: colors.dangerDim };
    case 'USER_ROLE_CHANGED':
      return { label: 'User Role Modified', color: colors.purpleLight, bg: colors.purpleDim };
    case 'BOOKING_TOGGLED':
    case 'BOOKING_METADATA_MODIFIED':
      return { label: 'Prior Booking Toggled', color: colors.bayHoist, bg: colors.bayHoistDim };
    case 'ADDITIONAL_REPAIRS_TOGGLED':
      return { label: 'Additional Repairs Flagged', color: colors.dangerLight, bg: colors.dangerDim };
    default:
      return { label: action.replace(/_/g, ' '), color: colors.textMuted, bg: colors.surfaceOverlay };
  }
};

export const AuditTrailView: React.FC = () => {
  const { colors, isDark } = useTheme();
  const { availableBranches } = useAuth();
  const { reportsRefreshTrigger } = useUI();

  const [datePreset, setDatePreset] = useState<DateFilterPreset>('today');
  const [customDate, setCustomDate] = useState<string>(() => getSriLankaTodayString());
  const [customEndDate, setCustomEndDate] = useState<string>(() => getSriLankaTodayString());
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [actionCategory, setActionCategory] = useState<AuditActionCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);

  const handleSelectPreset = (presetId: DateFilterPreset) => {
    const now = new Date();
    const todayStr = getSriLankaTodayString(now);

    if (presetId === 'today') {
      setCustomDate(todayStr);
      setCustomEndDate(todayStr);
    } else if (presetId === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yStr = getSriLankaDateString(yesterday);
      setCustomDate(yStr);
      setCustomEndDate(yStr);
    } else if (presetId === '7days') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setCustomDate(getSriLankaDateString(past7));
      setCustomEndDate(todayStr);
    } else if (presetId === 'month') {
      const slParts = todayStr.split('-').map(Number);
      const firstOfMonthStr = `${slParts[0]}-${String(slParts[1]).padStart(2, '0')}-01`;
      setCustomDate(firstOfMonthStr);
      setCustomEndDate(todayStr);
    } else if (presetId === '3months') {
      const slParts = todayStr.split('-').map(Number);
      const past3Mo = new Date(slParts[0], slParts[1] - 1 - 3, slParts[2]);
      setCustomDate(getSriLankaDateString(past3Mo));
      setCustomEndDate(todayStr);
    }
    setDatePreset(presetId);
    setPage(0);
  };

  const handleCustomDateChange = (fromStr: string) => {
    setCustomDate(fromStr);
    setDatePreset('custom');
    setPage(0);
  };

  const handleCustomEndDateChange = (toStr: string) => {
    setCustomEndDate(toStr);
    setDatePreset('custom');
    setPage(0);
  };

  // Compute ISO dates from customDate and customEndDate
  const { startDate, endDate } = useMemo(() => {
    let start: string | null = null;
    let end: string | null = null;

    const startStr = customDate.trim();
    const endStr = customEndDate.trim();

    if (startStr) {
      start = getSriLankaDayStartISO(startStr);
    }

    if (endStr) {
      end = getSriLankaDayEndISO(endStr);
    } else if (start) {
      end = getSriLankaDayEndISO(startStr);
    }

    return { startDate: start, endDate: end };
  }, [customDate, customEndDate]);

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await auditService.fetchAuditLogs({
        branchId: branchFilter === 'all' ? undefined : branchFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: appliedSearch,
        category: actionCategory,
        limit: AUDIT_PAGE_SIZE,
        offset: page * AUDIT_PAGE_SIZE,
      });
      setAuditLogs(res.entries);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('[AuditTrailView] fetch error:', err);
      setAuditLogs([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter, startDate, endDate, appliedSearch, actionCategory, page]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs, reportsRefreshTrigger]);

  // Debounced search input matching main SearchBarRow pattern
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchQuery.trim();
      if (trimmed !== appliedSearch) {
        setAppliedSearch(trimmed);
        setPage(0);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery, appliedSearch]);

  const handleSearchSubmit = () => {
    setPage(0);
    setAppliedSearch(searchQuery.trim());
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setAppliedSearch('');
    setPage(0);
  };

  const handleExportCSV = () => {
    auditService.exportAuditLogsToCSV(
      auditLogs,
      `UnitedMotors_ActivityAuditLog_${branchFilter.toUpperCase()}`
    );
  };

  const totalPages = Math.ceil(totalCount / AUDIT_PAGE_SIZE);
  const dateRangeInfo = getDatePresetRangeDescription(datePreset, customDate, customEndDate);

  return (
    <View style={styles.container}>
      {/* Filter Section */}
      <View style={[styles.filterCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', borderColor: colors.borderGlass }]}>
        {/* Date Filter Row */}
        <View style={styles.filterRow}>
          <View style={styles.filterLabelGroup}>
            <Calendar size={13} color={colors.primaryLight} />
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>TIMEFRAME:</Text>
            <View style={[styles.rangeBadge, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
              <Text style={[styles.rangeBadgeText, { color: colors.primaryLight }]}>{dateRangeInfo.rangeStr}</Text>
            </View>
          </View>
          <View style={styles.pillsWrap}>
            {DATE_PRESETS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.filterPill,
                  datePreset === p.id && { backgroundColor: colors.primaryDim, borderColor: colors.primary },
                ]}
                onPress={() => handleSelectPreset(p.id)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: datePreset === p.id ? colors.primaryLight : colors.textMuted },
                    datePreset === p.id && styles.activePillText,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Permanent Theme Date Pickers (From / To) */}
        <View style={[styles.datePickerRow, { borderTopColor: colors.borderGlass }]}>
          <ThemeDatePicker
            label="FROM:"
            value={customDate}
            onChange={handleCustomDateChange}
            maxDate={customEndDate || undefined}
          />

          <ThemeDatePicker
            label="TO:"
            value={customEndDate}
            onChange={handleCustomEndDateChange}
            minDate={customDate || undefined}
          />
        </View>

        {/* Facility Filter Row */}
        <View style={[styles.facilityFilterRow, { borderTopColor: colors.borderGlass }]}>
          <View style={styles.filterLabelGroup}>
            <MapPin size={13} color={colors.primaryLight} />
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>FACILITY:</Text>
          </View>
          <View style={styles.pillsWrap}>
            <TouchableOpacity
              style={[
                styles.branchPill,
                branchFilter === 'all' && { backgroundColor: colors.primaryDim, borderColor: colors.primary },
              ]}
              onPress={() => {
                setBranchFilter('all');
                setPage(0);
              }}
            >
              <Text style={[styles.branchPillText, { color: branchFilter === 'all' ? colors.primaryLight : colors.textMuted }]}>
                All Branches
              </Text>
            </TouchableOpacity>
            {availableBranches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[
                  styles.branchPill,
                  branchFilter === b.id && { backgroundColor: colors.primaryDim, borderColor: colors.primary },
                ]}
                onPress={() => {
                  setBranchFilter(b.id);
                  setPage(0);
                }}
              >
                <Text style={[styles.branchPillText, { color: branchFilter === b.id ? colors.primaryLight : colors.textMuted }]}>
                  {b.code}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Action Category Filter Row */}
        <View style={[styles.categoryFilterRow, { borderTopColor: colors.borderGlass }]}>
          <View style={styles.filterLabelGroup}>
            <Filter size={13} color={colors.primaryLight} />
            <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>ACTION CATEGORY:</Text>
          </View>
          <View style={styles.categoryPillsWrap}>
            {ACTION_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryPill,
                  { borderColor: colors.borderGlass },
                  actionCategory === cat.id && { backgroundColor: colors.primaryDim, borderColor: colors.primary },
                ]}
                onPress={() => {
                  setActionCategory(cat.id);
                  setPage(0);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIconText}>{cat.iconLabel}</Text>
                <Text
                  style={[
                    styles.categoryPillText,
                    { color: actionCategory === cat.id ? colors.primaryLight : colors.textMuted },
                    actionCategory === cat.id && styles.activePillText,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Action Header: Search Bar with Integrated Count, and CSV Export */}
      <View style={styles.actionHeaderBar}>
        <View
          style={[
            styles.searchBoxContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: colors.primaryBorder,
            },
          ]}
        >
          <View style={styles.searchIconWrapper}>
            <Search size={15} color={colors.primaryLight} />
          </View>
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search plate, action, staff..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.clearSearchBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Integrated Traceable Events Count */}
          <Text style={[styles.searchCountText, { color: colors.textMuted }]}>
            {totalCount}
          </Text>
        </View>

        {Platform.OS === 'web' && (
          <TouchableOpacity
            style={[
              styles.exportBtn,
              {
                backgroundColor: totalCount === 0 ? (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)') : colors.primary,
                borderColor: totalCount === 0 ? colors.borderGlass : 'transparent',
                borderWidth: 1,
                opacity: totalCount === 0 ? 0.45 : 1,
              },
            ]}
            disabled={totalCount === 0 || isLoading}
            onPress={handleExportCSV}
            activeOpacity={0.8}
          >
            <Download size={13} color={totalCount === 0 ? colors.textMuted : '#ffffff'} />
            <Text style={[styles.exportBtnText, totalCount === 0 && { color: colors.textMuted }]}>
              Export Audit Trail (CSV)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content Area */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Querying immutable PostgreSQL audit records...
          </Text>
        </View>
      ) : auditLogs.length === 0 ? (
        <EmptyStateCard
          icon={AlertCircle}
          title="No Audit Records Found"
          subtitle="No administrative alterations or supervisor overrides match the chosen timeframe or filter criteria."
        />
      ) : (
        <View style={styles.listContainer}>
          {auditLogs.map(entry => {
            const config = getActionConfig(entry.action, colors);
            const displayIso = entry.action_timestamp || entry.created_at;
            const dateObj = new Date(displayIso);
            const formattedTime = !Number.isNaN(dateObj.getTime())
              ? dateObj.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })
              : displayIso;

            const changeEntries = Object.entries(entry.changed_fields || {});

            return (
              <View
                key={entry.id}
                style={[
                  styles.auditCard,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff', borderColor: colors.borderGlass },
                ]}
              >
                {/* Header row of the card */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderLeft}>
                    {/* Branch Code */}
                    <View style={[styles.facilityPill, { backgroundColor: colors.primaryDim, borderColor: colors.primaryBorder }]}>
                      <MapPin size={10} color={colors.primaryLight} />
                      <Text style={[styles.facilityPillText, { color: colors.primaryLight }]}>
                        {availableBranches.find(b => b.id === entry.branch_id)?.code || entry.branch_id.toUpperCase()}
                      </Text>
                    </View>

                    {/* License Plate */}
                    {entry.vehicle_no ? (
                      <LicensePlate number={entry.vehicle_no} size="sm" />
                    ) : null}

                    {/* Action Pill */}
                    <View style={[styles.actionPill, { backgroundColor: config.bg, borderColor: config.color }]}>
                      <Text style={[styles.actionPillText, { color: config.color }]}>{config.label}</Text>
                    </View>
                  </View>

                  <View style={styles.cardHeaderRight}>
                    {Boolean(entry.is_offline_sync) && (
                      <View style={[styles.offlineSyncBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7', borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde68a' }]}>
                        <CloudOff size={10} color={isDark ? '#fbbf24' : '#d97706'} />
                        <Text style={[styles.offlineSyncBadgeText, { color: isDark ? '#fbbf24' : '#d97706' }]}>Synced Offline</Text>
                      </View>
                    )}
                    <Clock size={11} color={colors.textMuted} />
                    <Text style={[styles.timestampText, { color: colors.textMuted }]}>{formattedTime}</Text>
                  </View>
                </View>

                {/* Actor Attribution Row */}
                <View style={[styles.actorRow, { borderBottomColor: colors.borderGlass }]}>
                  <View style={styles.actorItem}>
                    <User size={12} color={colors.textSecondary} />
                    <Text style={[styles.actorLabel, { color: colors.textMuted }]}>Modified By:</Text>
                    <Text style={[styles.actorName, { color: colors.textPrimary }]}>
                      {entry.actor_name || 'Staff User'}
                    </Text>
                    {entry.actor_role && (
                      <View style={[styles.roleChip, { backgroundColor: colors.primaryDim }]}>
                        <Text style={[styles.roleChipText, { color: colors.primaryLight }]}>
                          {entry.actor_role.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  {entry.actor_email && (
                    <Text style={[styles.actorEmail, { color: colors.textMuted }]}>{entry.actor_email}</Text>
                  )}
                </View>

                {/* Changed Fields / Diff Visualization */}
                {changeEntries.length > 0 ? (
                  <View style={styles.diffContainer}>
                    {changeEntries.map(([fieldKey, diff]) => {
                      const oldDisplay =
                        diff?.old === null || diff?.old === undefined || diff?.old === ''
                          ? '(empty)'
                          : typeof diff.old === 'boolean'
                          ? diff.old
                            ? 'true'
                            : 'false'
                          : String(diff.old);

                      const newDisplay =
                        diff?.new === null || diff?.new === undefined || diff?.new === ''
                          ? '(empty)'
                          : typeof diff.new === 'boolean'
                          ? diff.new
                            ? 'true'
                            : 'false'
                          : String(diff.new);

                      return (
                        <View
                          key={fieldKey}
                          style={[
                            styles.diffRow,
                            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#f8fafc', borderColor: colors.borderGlass },
                          ]}
                        >
                          <Text style={[styles.diffKeyText, { color: colors.textSecondary }]}>
                            {fieldKey.replace(/_/g, ' ').toUpperCase()}:
                          </Text>
                          <View style={styles.diffValuesBox}>
                            <View style={[styles.valChip, styles.oldValChip]}>
                              <Text style={styles.oldValText} numberOfLines={2}>
                                {oldDisplay}
                              </Text>
                            </View>
                            <ArrowRight size={12} color={colors.textMuted} />
                            <View style={[styles.valChip, styles.newValChip]}>
                              <Text style={styles.newValText} numberOfLines={2}>
                                {newDisplay}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.diffContainer}>
                    <Text style={[styles.emptyDiffText, { color: colors.textMuted }]}>
                      Full record state snapshotted in audit archive.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <View style={[styles.paginationFooter, { borderColor: colors.borderGlass }]}>
          <TouchableOpacity
            style={[styles.pageBtn, { borderColor: colors.borderGlass }, page === 0 && styles.pageBtnDisabled]}
            disabled={page === 0}
            onPress={() => setPage(p => Math.max(0, p - 1))}
          >
            <ChevronLeft size={14} color={page === 0 ? colors.textMuted : colors.textPrimary} />
            <Text style={[styles.pageBtnText, { color: page === 0 ? colors.textMuted : colors.textPrimary }]}>
              Previous
            </Text>
          </TouchableOpacity>

          <Text style={[styles.pageInfoText, { color: colors.textMuted }]}>
            Page {page + 1} of {totalPages} ({totalCount} total entries)
          </Text>

          <TouchableOpacity
            style={[
              styles.pageBtn,
              { borderColor: colors.borderGlass },
              page >= totalPages - 1 && styles.pageBtnDisabled,
            ]}
            disabled={page >= totalPages - 1}
            onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            <Text
              style={[
                styles.pageBtnText,
                { color: page >= totalPages - 1 ? colors.textMuted : colors.textPrimary },
              ]}
            >
              Next
            </Text>
            <ChevronRight size={14} color={page >= totalPages - 1 ? colors.textMuted : colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  filterCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  filterRow: {
    gap: 8,
  },
  filterLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  rangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  rangeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activePillText: {
    fontWeight: '800',
  },
  datePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  facilityFilterRow: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  branchPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  branchPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  categoryFilterRow: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  categoryPillsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  categoryIconText: {
    fontSize: 11,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  searchBoxContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    minWidth: 0,
    borderWidth: 1,
  },
  searchIconWrapper: {
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
    minWidth: 0,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  clearSearchBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 4,
  },
  searchCountText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 6,
    marginRight: 2,
    flexShrink: 0,
    opacity: 0.9,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexShrink: 0,
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    gap: 10,
  },
  auditCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offlineSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  offlineSyncBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  facilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  facilityPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  actionPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  timestampText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    paddingBottom: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  actorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actorLabel: {
    fontSize: 11,
  },
  actorName: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  roleChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  roleChipText: {
    fontSize: 9,
    fontWeight: '800',
  },
  actorEmail: {
    fontSize: 10.5,
  },
  diffContainer: {
    gap: 6,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  diffKeyText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    minWidth: 120,
  },
  diffValuesBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  valChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    maxWidth: 260,
  },
  oldValChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  newValChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  oldValText: {
    color: '#ef4444',
    fontSize: 10.5,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  newValText: {
    color: '#10b981',
    fontSize: 10.5,
    fontWeight: '700',
  },
  emptyDiffText: {
    fontSize: 10.5,
    fontStyle: 'italic',
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pageInfoText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
