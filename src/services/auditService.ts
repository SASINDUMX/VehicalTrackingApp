import { Platform } from 'react-native';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { AuditLogEntry, AuditLogQueryParams } from '../types/audit';

/**
 * Tier 3 Data Access Service for Administrative Audit Logs & Legal Compliance.
 * Pushes filtering, pagination, text search, and diffing directly down to PostgreSQL.
 */
export const auditService = {
  /**
   * Fetches paginated audit logs via PostgreSQL RPC get_audit_logs_paginated.
   * Only accessible to Super Admin via RLS.
   */
  async fetchAuditLogs(params: AuditLogQueryParams = {}): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
    const client = supabase;
    if (!client || !isSupabaseConnected) {
      return { entries: [], totalCount: 0 };
    }

    const {
      branchId,
      startDate,
      endDate,
      search,
      category,
      limit = 50,
      offset = 0,
    } = params;

    try {
      const { data, error } = await client.rpc('get_audit_logs_paginated', {
        p_branch_id: branchId && branchId !== 'all' ? branchId : null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_search: search && search.trim() ? search.trim() : null,
        p_category: category && category !== 'all' ? category : null,
        p_limit: limit,
        p_offset: offset,
      });

      if (!error && Array.isArray(data)) {
        const totalCount = data.length > 0 ? Number(data[0].total_count || data.length) : 0;
        const entries: AuditLogEntry[] = data.map((row: any) => ({
          id: row.id,
          created_at: row.created_at,
          branch_id: row.branch_id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          vehicle_no: row.vehicle_no,
          action: row.action,
          actor_id: row.actor_id,
          actor_email: row.actor_email,
          actor_name: row.actor_name,
          actor_role: row.actor_role,
          changed_fields: typeof row.changed_fields === 'object' ? row.changed_fields : {},
          old_values: typeof row.old_values === 'object' ? row.old_values : {},
          new_values: typeof row.new_values === 'object' ? row.new_values : {},
        }));
        return { entries, totalCount };
      }

      if (error) {
        console.warn('[auditService] RPC fallback to direct select:', error.message);
      }
    } catch (rpcEx) {
      console.warn('[auditService] RPC exception, falling back to direct table query:', rpcEx);
    }

    // Direct table fallback
    try {
      let query = client
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (branchId && branchId !== 'all') {
        query = query.eq('branch_id', branchId);
      }
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }
      if (category && category !== 'all') {
        const categoryActionMap: Record<string, string[]> = {
          holds: ['HOLD_OVERRIDE_PAUSED', 'HOLD_OVERRIDE_RESUMED'],
          urgency: ['URGENCY_MODIFIED'],
          plate: ['PLATE_MODIFIED'],
          remarks: ['REMARKS_MODIFIED'],
          transfers: ['BAY_TRANSFERRED', 'SECTION_TRANSFER', 'TECH_REASSIGNED'],
          intake_delete: ['VEHICLE_CREATED', 'DELETE_VEHICLE'],
          completions: ['JOB_COMPLETED', 'TASK_COMPLETED'],
          users: ['USER_ROLE_CHANGED', 'USER_UPDATED'],
        };
        const targetActions = categoryActionMap[category];
        if (targetActions && targetActions.length > 0) {
          query = query.in('action', targetActions);
        }
      }
      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`vehicle_no.ilike.%${s}%,action.ilike.%${s}%,actor_name.ilike.%${s}%`);
      }

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        entries: (data || []) as AuditLogEntry[],
        totalCount: count || (data || []).length,
      };
    } catch (err) {
      console.error('[auditService] fetchAuditLogs error:', err);
      return { entries: [], totalCount: 0 };
    }
  },

  /**
   * Generates a formal CSV audit report with UTF-8 BOM encoding for legal, warranty, and insurance audits.
   */
  exportAuditLogsToCSV(entries: AuditLogEntry[], filenamePrefix: string = 'UnitedMotors_ActivityAuditLog'): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const headers = [
      'Audit ID',
      'Timestamp (Local)',
      'Branch Facility',
      'License Plate',
      'Action Taken',
      'Authorized Actor',
      'Actor Role',
      'Actor Email',
      'Field Modifications Summary',
      'Raw Changes JSON',
    ];

    const rows: string[] = [];
    rows.push(headers.map(h => `"${h}"`).join(','));

    entries.forEach(entry => {
      const d = new Date(entry.created_at);
      const timeStr = !Number.isNaN(d.getTime())
        ? d.toLocaleString('en-US', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium' })
        : entry.created_at;

      // Format changes summary
      const changeKeys = Object.keys(entry.changed_fields || {});
      const summaryParts = changeKeys.map(k => {
        const item = entry.changed_fields[k];
        const oldStr = typeof item?.old === 'object' ? JSON.stringify(item.old) : String(item?.old ?? '--');
        const newStr = typeof item?.new === 'object' ? JSON.stringify(item.new) : String(item?.new ?? '--');
        return `${k}: [${oldStr}] -> [${newStr}]`;
      });
      const summaryStr = summaryParts.length > 0 ? summaryParts.join('; ') : 'Record created or general update';

      const row = [
        entry.id,
        timeStr,
        entry.branch_id.toUpperCase(),
        entry.vehicle_no || '--',
        entry.action,
        entry.actor_name || 'Staff',
        entry.actor_role || 'staff',
        entry.actor_email || '--',
        summaryStr,
        JSON.stringify(entry.changed_fields || {}).replace(/"/g, '""'),
      ];

      rows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
