import { safeStorage } from '../lib/supabase';
import { vehicleService } from './vehicleService';
import { BayZone, TaskType, VehicleTask } from '../types/vehicle';

export type OutboxMutationType =
  | 'START_STAGE_WORK'
  | 'TOGGLE_TASK'
  | 'TRANSFER_ZONE'
  | 'TOGGLE_PAUSE'
  | 'UPDATE_PLATE'
  | 'UPDATE_JOB_ORDER'
  | 'FINISH_JOB';

export interface OutboxMutation {
  id: string;
  type: OutboxMutationType;
  payload: any;
  branchId: string;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
}

type OutboxListener = (pendingCount: number, isSyncing: boolean) => void;

class OutboxService {
  private static readonly STORAGE_KEY = 'um_offline_outbox';
  private static readonly MAX_RETRIES = 5;

  private queue: OutboxMutation[] = [];
  private listeners = new Set<OutboxListener>();
  private isDraining = false;

  constructor() {
    this.hydrateFromStorage();
  }

  private hydrateFromStorage() {
    try {
      const raw = safeStorage.getItem(OutboxService.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Reset any items that were stuck in 'syncing' back to 'pending' on app boot
          this.queue = parsed.map(item => ({
            ...item,
            status: item.status === 'syncing' ? 'pending' : item.status,
          }));
        }
      }
    } catch {
      this.queue = [];
    }
  }

  private persist() {
    try {
      safeStorage.setItem(OutboxService.STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      /* ignore storage quota errors */
    }
    this.notify();
  }

  private notify() {
    const pendingCount = this.getPendingCount();
    this.listeners.forEach(listener => {
      try {
        listener(pendingCount, this.isDraining);
      } catch {
        /* ignore callback errors */
      }
    });
  }

  public subscribe(listener: OutboxListener): () => void {
    this.listeners.add(listener);
    listener(this.getPendingCount(), this.isDraining);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getPendingCount(): number {
    return this.queue.filter(m => m.status === 'pending' || m.status === 'syncing').length;
  }

  public getQueue(): ReadonlyArray<OutboxMutation> {
    return this.queue;
  }

  /**
   * Enqueue a new mutation into the persistent offline outbox
   */
  public enqueue(
    type: OutboxMutationType,
    payload: any,
    branchId: string
  ): OutboxMutation {
    const mutation: OutboxMutation = {
      id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      payload,
      branchId,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    // Deduplication / Coalescing for frequent single-property updates:
    if (type === 'TOGGLE_TASK') {
      // If the same task is already in queue, supersede it with the latest state
      const existingIdx = this.queue.findIndex(
        m => m.type === 'TOGGLE_TASK' && m.payload.taskId === payload.taskId && m.status === 'pending'
      );
      if (existingIdx !== -1) {
        this.queue[existingIdx] = mutation;
        this.persist();
        return mutation;
      }
    } else if (type === 'UPDATE_PLATE') {
      const existingIdx = this.queue.findIndex(
        m => m.type === 'UPDATE_PLATE' && m.payload.vehicleId === payload.vehicleId && m.status === 'pending'
      );
      if (existingIdx !== -1) {
        this.queue[existingIdx] = mutation;
        this.persist();
        return mutation;
      }
    }

    this.queue.push(mutation);
    this.persist();
    return mutation;
  }

  /**
   * Drain the queue in FIFO order, executing against vehicleService
   */
  public async drainQueue(): Promise<{ successCount: number; failureCount: number }> {
    if (this.isDraining) return { successCount: 0, failureCount: 0 };
    if (this.getPendingCount() === 0) return { successCount: 0, failureCount: 0 };

    this.isDraining = true;
    this.notify();

    let successCount = 0;
    let failureCount = 0;

    try {
      // Snapshot pending queue in FIFO order
      const pendingItems = this.queue.filter(m => m.status === 'pending');

      for (const mutation of pendingItems) {
        mutation.status = 'syncing';
        this.persist();

        try {
          await this.executeMutation(mutation);
          // Success: remove from queue
          this.queue = this.queue.filter(m => m.id !== mutation.id);
          successCount++;
          this.persist();
        } catch (err) {
          console.warn(`[outboxService] Failed to replay mutation ${mutation.id}:`, err);
          mutation.retryCount++;
          if (mutation.retryCount >= OutboxService.MAX_RETRIES) {
            mutation.status = 'failed';
          } else {
            mutation.status = 'pending';
          }
          failureCount++;
          this.persist();
          // On network failure during drain, stop immediately to maintain FIFO order
          break;
        }
      }
    } finally {
      this.isDraining = false;
      this.notify();
    }

    return { successCount, failureCount };
  }

  private async executeMutation(mutation: OutboxMutation): Promise<void> {
    const { type, payload } = mutation;
    const now = new Date().toISOString();

    switch (type) {
      case 'START_STAGE_WORK':
        await vehicleService.startWork(payload.vehicleId, payload.startedBy, now, null, null);
        break;

      case 'TOGGLE_TASK':
        await vehicleService.toggleTask(payload.taskId, payload.nextCompleted, payload.completedBy);
        break;

      case 'TRANSFER_ZONE':
        await vehicleService.transferZone(
          payload.vehicleId,
          payload.toZone,
          payload.toZone,
          undefined,
          now,
          null,
          null,
          null,
          undefined,
          payload.movedBy
        );
        break;

      case 'TOGGLE_PAUSE':
        await vehicleService.togglePauseVehicle(payload.vehicleId, payload.isPaused, payload.reason);
        break;

      case 'UPDATE_PLATE':
        await vehicleService.updateVehiclePlate(payload.vehicleId, payload.newPlate);
        break;

      case 'UPDATE_JOB_ORDER':
        await vehicleService.updateJobOrder(
          payload.vehicleId,
          payload.currentTasks,
          payload.finalTaskTypes,
          payload.updatedRemarks,
          payload.urgencyData,
          payload.metadata
        );
        break;

      case 'FINISH_JOB':
        await vehicleService.finishJob(
          payload.vehicleId,
          payload.advisorName,
          now,
          null,
          null,
          null
        );
        break;

      default:
        console.warn('[outboxService] Unknown mutation type:', type);
    }
  }

  /**
   * Clears all failed or pending mutations (useful for troubleshooting/resets)
   */
  public clearQueue() {
    this.queue = [];
    this.persist();
  }
}

export const outboxService = new OutboxService();
