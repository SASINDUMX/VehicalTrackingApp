import { Platform } from 'react-native';
import { Vehicle, BayZone } from '../types/vehicle';
import { getBreakOverlap, getNetWorkingSeconds } from './workshopHoursUtils';

export interface ReportKPIs {
  totalVehicles: number;
  completedCount: number;
  inProgressCount: number;
  avgGrossSeconds: number;
  avgNetSeconds: number;
  totalNetSeconds: number;
  totalBreakSeconds: number;
}

export type DateFilterPreset = 'today' | 'yesterday' | '7days' | 'month' | 'all';
export type StatusFilterPreset = 'all' | 'completed' | 'in_progress';

export const formatDuration = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '0m 00s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
  }
  return `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
};

export const filterVehiclesForReport = (
  vehicles: Vehicle[],
  datePreset: DateFilterPreset = 'all',
  statusPreset: StatusFilterPreset = 'all'
): Vehicle[] => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return vehicles.filter(v => {
    // 1. Date Filter
    const intakeDate = new Date(v.intake_at || v.created_at);
    if (isNaN(intakeDate.getTime())) return true;

    if (datePreset === 'today' && intakeDate < startOfToday) return false;
    if (datePreset === 'yesterday' && (intakeDate < startOfYesterday || intakeDate >= startOfToday)) return false;
    if (datePreset === '7days' && intakeDate < startOf7Days) return false;
    if (datePreset === 'month' && intakeDate < startOfMonth) return false;

    // 2. Status Filter
    if (statusPreset === 'completed' && !v.is_finished) return false;
    if (statusPreset === 'in_progress' && v.is_finished) return false;

    return true;
  });
};

export const calculateReportKPIs = (filteredVehicles: Vehicle[]): ReportKPIs => {
  if (filteredVehicles.length === 0) {
    return {
      totalVehicles: 0,
      completedCount: 0,
      inProgressCount: 0,
      avgGrossSeconds: 0,
      avgNetSeconds: 0,
      totalNetSeconds: 0,
      totalBreakSeconds: 0,
    };
  }

  let totalGross = 0;
  let totalNet = 0;
  let totalBreaks = 0;
  let completed = 0;

  filteredVehicles.forEach(v => {
    if (v.is_finished) completed++;
    const start = new Date(v.intake_at || v.created_at);
    const end = v.completed_at ? new Date(v.completed_at) : new Date();
    const gross = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const net = getNetWorkingSeconds(start, end);
    const { breakSeconds } = getBreakOverlap(start, end);

    totalGross += gross;
    totalNet += net;
    totalBreaks += breakSeconds;
  });

  return {
    totalVehicles: filteredVehicles.length,
    completedCount: completed,
    inProgressCount: filteredVehicles.length - completed,
    avgGrossSeconds: Math.floor(totalGross / filteredVehicles.length),
    avgNetSeconds: Math.floor(totalNet / filteredVehicles.length),
    totalNetSeconds: totalNet,
    totalBreakSeconds: totalBreaks,
  };
};

export const getStageSecondsForZone = (v: Vehicle, zone: BayZone): number => {
  const logs = v.stage_logs.filter(l => l.to_zone === zone);
  let total = 0;
  logs.forEach(l => {
    if (l.duration_seconds && l.duration_seconds > 0) {
      total += l.duration_seconds;
    } else if (l.entered_at) {
      const enter = new Date(l.entered_at);
      const exit = l.exited_at ? new Date(l.exited_at) : new Date();
      total += Math.max(0, Math.floor((exit.getTime() - enter.getTime()) / 1000));
    }
  });
  return total;
};

/**
 * Generates an Excel-compatible CSV with UTF-8 BOM encoding.
 */
export const exportServiceLogsToCSV = (
  vehicles: Vehicle[],
  datePresetLabel: string = 'All Time'
) => {
  const headers = [
    'Vehicle Reg No',
    'Status',
    'Current Station',
    'Intake Date & Time',
    'Completion Date & Time',
    'Gross TAT (Total Time)',
    'Net Active Work Time',
    'Deducted Break Time',
    'General Workshop (Bay 01)',
    'Wheel Alignment (Bay 03)',
    'Hoist Service (Bay 02)',
    'Inspection Zone',
    'Tasks Completed',
    'Technician / Lead',
    'Remarks / Instructions',
  ];

  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows: string[] = [];
  // Title & Metadata
  rows.push(`"UNITED MOTORS - VEHICLE SERVICE LOGS REPORT"`);
  rows.push(`"Generated At: ${new Date().toLocaleString()}"`);
  rows.push(`"Filter Range: ${datePresetLabel}"`);
  rows.push(`"Total Records: ${vehicles.length}"`);
  rows.push(''); // Empty line

  // Column Headers
  rows.push(headers.map(h => `"${h}"`).join(','));

  // Data Rows
  vehicles.forEach(v => {
    const start = new Date(v.intake_at || v.created_at);
    const end = v.completed_at ? new Date(v.completed_at) : new Date();
    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const netSec = getNetWorkingSeconds(start, end);
    const { breakSeconds } = getBreakOverlap(start, end);

    const workshopSec = getStageSecondsForZone(v, 'workshop');
    const alignmentSec = getStageSecondsForZone(v, 'alignment');
    const hoistSec = getStageSecondsForZone(v, 'hoist');
    const inspectionSec = getStageSecondsForZone(v, 'inspection');

    const completedTasksStr = v.tasks
      .filter(t => t.is_completed)
      .map(t => `${t.task_name} (by ${t.completed_by || 'Tech'})`)
      .join('; ');

    const row = [
      escapeCSV(v.vehicle_no),
      escapeCSV(v.is_finished ? 'COMPLETED' : 'IN PROGRESS'),
      escapeCSV(v.is_finished ? 'Delivered' : v.current_zone.toUpperCase()),
      escapeCSV(start.toLocaleString()),
      escapeCSV(v.completed_at ? new Date(v.completed_at).toLocaleString() : 'Pending'),
      escapeCSV(formatDuration(grossSec)),
      escapeCSV(formatDuration(netSec)),
      escapeCSV(formatDuration(breakSeconds)),
      escapeCSV(formatDuration(workshopSec)),
      escapeCSV(formatDuration(alignmentSec)),
      escapeCSV(formatDuration(hoistSec)),
      escapeCSV(formatDuration(inspectionSec)),
      escapeCSV(completedTasksStr || 'None'),
      escapeCSV(v.assigned_tech || 'Unassigned'),
      escapeCSV(v.remarks || ''),
    ];

    rows.push(row.join(','));
  });

  const csvContent = '\uFEFF' + rows.join('\r\n'); // Add UTF-8 BOM for Microsoft Excel

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `UnitedMotors_Service_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

/**
 * Triggers a printable corporate PDF document with executive styling.
 */
export const exportServiceLogsToPDF = (
  vehicles: Vehicle[],
  kpis: ReportKPIs,
  datePresetLabel: string = 'All Time'
) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const tableRowsHtml = vehicles.map((v, i) => {
    const start = new Date(v.intake_at || v.created_at);
    const end = v.completed_at ? new Date(v.completed_at) : new Date();
    const grossSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const netSec = getNetWorkingSeconds(start, end);
    const { breakSeconds } = getBreakOverlap(start, end);

    const workshopSec = getStageSecondsForZone(v, 'workshop');
    const alignmentSec = getStageSecondsForZone(v, 'alignment');
    const hoistSec = getStageSecondsForZone(v, 'hoist');
    const inspectionSec = getStageSecondsForZone(v, 'inspection');

    const completedTasksCount = v.tasks.filter(t => t.is_completed).length;
    const totalTasksCount = v.tasks.filter(t => t.is_required).length;

    return `
      <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 8px 10px; font-weight: 700; font-family: monospace; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${v.vehicle_no}
        </td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800; background: ${v.is_finished ? '#dcfce7; color: #15803d;' : '#e0f2fe; color: #0369a1;'}">
            ${v.is_finished ? 'COMPLETED' : 'IN PROGRESS'}
          </span>
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #0284c7; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(grossSec)}
        </td>
        <td style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #16a34a; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(netSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #d97706; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(breakSeconds)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(workshopSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(alignmentSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(hoistSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0;">
          ${formatDuration(inspectionSec)}
        </td>
        <td style="padding: 8px 10px; font-size: 11px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${completedTasksCount}/${totalTasksCount} done
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>United Motors - Service Logs Report</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px; }
          .brand-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #0284c7; margin: 0; }
          .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
          .meta-box { text-align: right; font-size: 11px; color: #64748b; }
          .meta-highlight { font-weight: 700; color: #0f172a; }
          .kpi-row { display: flex; gap: 12px; margin-bottom: 18px; }
          .kpi-card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
          .kpi-label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
          .kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
          .table-container { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
          .table-header { background: #0f172a; color: #ffffff; text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
          .table-header th { padding: 8px 10px; }
          .footer-sign { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
          .sign-line { width: 180px; border-top: 1px dashed #94a3b8; margin-top: 30px; text-align: center; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">UNITED MOTORS LANKA PLC</h1>
            <div class="brand-sub">Workshop Service & Telemetry Audit Log Report</div>
          </div>
          <div class="meta-box">
            <div>Report Filter: <span class="meta-highlight">${datePresetLabel}</span></div>
            <div>Generated: <span class="meta-highlight">${new Date().toLocaleString()}</span></div>
            <div>Total Vehicles: <span class="meta-highlight">${vehicles.length}</span></div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">Total Vehicles</div>
            <div class="kpi-val">${kpis.totalVehicles}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Completed Jobs</div>
            <div class="kpi-val" style="color: #16a34a;">${kpis.completedCount}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">In-Progress Jobs</div>
            <div class="kpi-val" style="color: #0284c7;">${kpis.inProgressCount}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Avg Gross TAT</div>
            <div class="kpi-val" style="color: #0284c7;">${formatDuration(kpis.avgGrossSeconds)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Avg Net Active Work</div>
            <div class="kpi-val" style="color: #16a34a;">${formatDuration(kpis.avgNetSeconds)}</div>
          </div>
        </div>

        <table class="table-container">
          <thead>
            <tr class="table-header">
              <th>Vehicle No</th>
              <th>Status</th>
              <th>Intake Time</th>
              <th>Gross TAT</th>
              <th>Net Active</th>
              <th>Breaks</th>
              <th>Bay 01 (Gen)</th>
              <th>Bay 03 (Align)</th>
              <th>Bay 02 (Hoist)</th>
              <th>Inspection</th>
              <th>Tasks</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div class="sign-line">Prepared by (Supervisor)</div>
          </div>
          <div>
            <div class="sign-line">Verified by (Service Advisor)</div>
          </div>
          <div>
            <div class="sign-line">Workshop General Manager</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
};
