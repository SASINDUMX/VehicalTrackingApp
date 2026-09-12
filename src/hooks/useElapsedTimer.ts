import { useState, useEffect } from "react";
import { getNetWorkingSeconds, getCurrentActiveBreak } from "../utils/workshopHoursUtils";

export const formatDurationSec = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0m 00s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const padS = s < 10 ? `0${s}` : `${s}`;
  return h > 0 ? `${h}h ${m}m ${padS}s` : `${m}m ${padS}s`;
};

// Module-level synchronized 1Hz clock pulse for all workshop cards
type ClockListener = (now: Date) => void;
const clockListeners = new Set<ClockListener>();
let globalClockInterval: NodeJS.Timeout | null = null;

const startClockIfNecessary = () => {
  if (globalClockInterval === null && clockListeners.size > 0) {
    globalClockInterval = setInterval(() => {
      const now = new Date();
      clockListeners.forEach(listener => {
        try {
          listener(now);
        } catch { /* ignore individual listener error */ }
      });
    }, 1000);
  }
};

const stopClockIfEmpty = () => {
  if (clockListeners.size === 0 && globalClockInterval !== null) {
    clearInterval(globalClockInterval);
    globalClockInterval = null;
  }
};

const subscribeToClock = (listener: ClockListener): (() => void) => {
  clockListeners.add(listener);
  startClockIfNecessary();
  return () => {
    clockListeners.delete(listener);
    stopClockIfEmpty();
  };
};

export const useElapsedTimer = (startDateStr?: string | null): string => {
  const computeCurrent = (now: Date = new Date()): string => {
    if (!startDateStr) return "0m 00s";
    const netSec = getNetWorkingSeconds(startDateStr, now);
    const timeStr = formatDurationSec(netSec);
    const activeBreak = getCurrentActiveBreak(now);
    if (activeBreak) {
      return `⏸ ${timeStr}`;
    }
    return timeStr;
  };

  const [elapsedStr, setElapsedStr] = useState<string>(() => computeCurrent());

  useEffect(() => {
    if (!startDateStr) {
      setElapsedStr("0m 00s");
      return;
    }

    setElapsedStr(computeCurrent());

    // Subscribe to unified 1Hz clock pulse (eliminates N-interval CPU and battery throttling)
    const unsubscribe = subscribeToClock((now) => {
      setElapsedStr(computeCurrent(now));
    });

    return unsubscribe;
  }, [startDateStr]);

  return elapsedStr;
};

/**
 * High-performance, zero-rerender vehicle stage timer hook.
 * Computes live stage duration text and subscribes to the unified 1Hz clock.
 * Disconnects immediately when vehicle is finished or in inspection (0 intervals).
 */
export const useVehicleTimer = (vehicle?: import('../types/vehicle').Vehicle | null): string => {
  const computeCurrent = (now: Date = new Date()): string => {
    if (!vehicle) return '0m 00s';
    if (vehicle.is_finished) return 'COMPLETED';
    if (vehicle.current_zone === 'inspection') return 'READY';

    const lastLog = vehicle.stage_logs[vehicle.stage_logs.length - 1];
    if (!lastLog || lastLog.exited_at) return '0m 00s';

    const activeBreak = getCurrentActiveBreak(now);

    if (!lastLog.work_started_at) {
      // IDLE state
      const enterMs = new Date(lastLog.entered_at).getTime();
      const idleSec = Number.isNaN(enterMs) ? 0 : Math.max(0, Math.floor((now.getTime() - enterMs) / 1000));
      return formatDurationSec(idleSec);
    }

    // Work started
    const bayTaskType = vehicle.current_zone === 'workshop'
      ? 'general_service'
      : vehicle.current_zone === 'hoist'
      ? 'hoist_service'
      : 'wheel_alignment';

    const currentTask =
      vehicle.tasks.find(t => t.task_type === bayTaskType && t.is_required) ||
      vehicle.tasks.find(t => t.task_type === bayTaskType);

    if (currentTask && currentTask.is_completed && currentTask.completed_at) {
      const completedMs = new Date(currentTask.completed_at).getTime();
      const queueOutSec = Number.isNaN(completedMs) ? 0 : Math.max(0, Math.floor((now.getTime() - completedMs) / 1000));
      return formatDurationSec(queueOutSec);
    }

    const workStartMs = new Date(lastLog.work_started_at).getTime();
    const activeSec = Number.isNaN(workStartMs) ? 0 : Math.max(0, Math.floor((now.getTime() - workStartMs) / 1000));
    const timeStr = formatDurationSec(activeSec);

    if (activeBreak) {
      return `⏸ ${timeStr}`;
    }
    return timeStr;
  };

  const [timerStr, setTimerStr] = useState<string>(() => computeCurrent());

  useEffect(() => {
    if (!vehicle || vehicle.is_finished || vehicle.current_zone === 'inspection') {
      setTimerStr(vehicle?.is_finished ? 'COMPLETED' : (vehicle?.current_zone === 'inspection' ? 'READY' : '0m 00s'));
      return;
    }

    setTimerStr(computeCurrent());
    const unsubscribe = subscribeToClock((now) => {
      setTimerStr(computeCurrent(now));
    });

    return unsubscribe;
  }, [vehicle]);

  return timerStr;
};

