import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { VehicleTask, StageLog } from '../types/vehicle';

export interface RealtimeVehicleCallbacks {
  onInsert: (newVehicleRecord: Record<string, unknown>) => void;
  onUpdate: (updatedVehicleRecord: Record<string, unknown>) => void;
  onDelete: (deletedVehicleId: string) => void;
  onTaskChange: (eventType: string, taskData: VehicleTask) => void;
  onStageLogChange: (eventType: string, logData: StageLog) => void;
  onStatusChange?: (isConnected: boolean) => void;
}

/**
 * Tier 3 Service: Encapsulates Supabase CDC WebSocket channels outside the UI tree.
 * Prevents channel teardown/re-subscription on component re-renders.
 */
class RealtimeVehicleService {
  private activeChannel: RealtimeChannel | null = null;
  private currentBranchId: string | null = null;

  public subscribeToBranch(branchId: string, callbacks: RealtimeVehicleCallbacks): () => void {
    const client = supabase;
    if (!client || !isSupabaseConnected) {
      callbacks.onStatusChange?.(false);
      return () => {};
    }

    // Clean up any existing channel before establishing a new one
    this.unsubscribe();

    this.currentBranchId = branchId;
    const channelName = `vehicle_changes_${branchId}`;

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicles', filter: `branch_id=eq.${branchId}` },
        payload => {
          if (payload.new) {
            const newV = payload.new as Record<string, unknown>;
            if (newV.branch_id && newV.branch_id !== branchId) return;
            callbacks.onInsert(newV);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vehicles', filter: `branch_id=eq.${branchId}` },
        payload => {
          if (payload.new) {
            const updated = payload.new as Record<string, unknown>;
            if (updated.branch_id && updated.branch_id !== branchId) return;
            callbacks.onUpdate(updated);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'vehicles' },
        payload => {
          if (payload.old) {
            const deletedId = (payload.old as { id: string }).id;
            if (deletedId) callbacks.onDelete(deletedId);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_tasks', filter: `branch_id=eq.${branchId}` },
        payload => {
          const taskData = (payload.new || payload.old) as VehicleTask | null;
          if (taskData?.vehicle_id && taskData?.id) {
            callbacks.onTaskChange(payload.eventType, taskData);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_logs', filter: `branch_id=eq.${branchId}` },
        payload => {
          const logData = (payload.new || payload.old) as StageLog | null;
          if (logData?.vehicle_id && logData?.id) {
            callbacks.onStageLogChange(payload.eventType, logData);
          }
        }
      )
      .subscribe(status => {
        const isConnected = status === 'SUBSCRIBED';
        callbacks.onStatusChange?.(isConnected);
      });

    this.activeChannel = channel;

    return () => {
      this.unsubscribe();
    };
  }

  public unsubscribe(): void {
    if (this.activeChannel) {
      try {
        supabase?.removeChannel(this.activeChannel);
      } catch {
        /* ignore cleanup errors */
      }
      this.activeChannel = null;
      this.currentBranchId = null;
    }
  }

  public getCurrentBranchId(): string | null {
    return this.currentBranchId;
  }
}

export const realtimeVehicleService = new RealtimeVehicleService();
