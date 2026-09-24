export interface WorkshopBreak {
  id: string;
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  durationMinutes: number;
}

export const WORKSHOP_BREAKS: WorkshopBreak[] = [
  {
    id: 'morning_tea',
    name: 'Morning Tea',
    startHour: 9,
    startMinute: 45,
    endHour: 10,
    endMinute: 0,
    durationMinutes: 15,
  },
  {
    id: 'lunch',
    name: 'Lunch Break',
    startHour: 12,
    startMinute: 30,
    endHour: 13,
    endMinute: 0,
    durationMinutes: 30,
  },
  {
    id: 'evening_tea',
    name: 'Evening Tea',
    startHour: 14,
    startMinute: 45,
    endHour: 15,
    endMinute: 0,
    durationMinutes: 15,
  },
];

// Explicit offset for Sri Lanka Standard Time (UTC+05:30)
export const SRI_LANKA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Returns the currently active workshop break if the given time falls within one.
 * Uses exact Asia/Colombo (UTC+05:30) calendar time regardless of client device timezone.
 */
export const getCurrentActiveBreak = (now: Date = new Date()): { name: string; endStr: string } | null => {
  const nowMs = now.getTime();
  const slDate = new Date(nowMs + SRI_LANKA_OFFSET_MS);
  const hours = slDate.getUTCHours();
  const minutes = slDate.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;

  for (const b of WORKSHOP_BREAKS) {
    const startM = b.startHour * 60 + b.startMinute;
    const endM = b.endHour * 60 + b.endMinute;
    if (currentMinutes >= startM && currentMinutes < endM) {
      const endHourFormatted = b.endHour > 12 ? `${b.endHour - 12}` : `${b.endHour}`;
      const endMinFormatted = b.endMinute < 10 ? `0${b.endMinute}` : `${b.endMinute}`;
      const ampm = b.endHour >= 12 ? 'PM' : 'AM';
      return {
        name: b.name,
        endStr: `${endHourFormatted}:${endMinFormatted} ${ampm}`,
      };
    }
  }
  return null;
};

/**
 * Calculates total overlapping break seconds between two timestamps and returns the break names.
 * Accurately calculates break windows according to Asia/Colombo (UTC+05:30) working hours
 * regardless of the client machine or browser's configured timezone.
 */
export const getBreakOverlap = (
  startTime: string | Date,
  endTime: string | Date = new Date()
): { breakSeconds: number; breakNames: string[] } => {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { breakSeconds: 0, breakNames: [] };
  }

  const startMs = start.getTime();
  const endMs = end.getTime();

  // Convert to Sri Lanka (UTC+05:30) calendar date boundaries
  const startSL = new Date(startMs + SRI_LANKA_OFFSET_MS);
  const endSL = new Date(endMs + SRI_LANKA_OFFSET_MS);

  const startDayMs = Date.UTC(startSL.getUTCFullYear(), startSL.getUTCMonth(), startSL.getUTCDate());
  const endDayMs = Date.UTC(endSL.getUTCFullYear(), endSL.getUTCMonth(), endSL.getUTCDate());

  let totalBreakSeconds = 0;
  const breakNamesSet = new Set<string>();

  for (let day = startDayMs; day <= endDayMs; day += 86400000) {
    // Day start in UTC milliseconds
    const dayStartUTC = day - SRI_LANKA_OFFSET_MS;
    for (const b of WORKSHOP_BREAKS) {
      const bStartMs = dayStartUTC + (b.startHour * 3600 + b.startMinute * 60) * 1000;
      const bEndMs = dayStartUTC + (b.endHour * 3600 + b.endMinute * 60) * 1000;

      const oStart = Math.max(startMs, bStartMs);
      const oEnd = Math.min(endMs, bEndMs);

      if (oEnd > oStart) {
        totalBreakSeconds += Math.floor((oEnd - oStart) / 1000);
        breakNamesSet.add(b.name);
      }
    }
  }

  return {
    breakSeconds: totalBreakSeconds,
    breakNames: Array.from(breakNamesSet),
  };
};

/**
 * Returns net active working seconds between two timestamps after deducting break time.
 */
export const getNetWorkingSeconds = (
  startTime: string | Date,
  endTime: string | Date = new Date()
): number => {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  const grossSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  const { breakSeconds } = getBreakOverlap(start, end);
  return Math.max(0, grossSeconds - breakSeconds);
};
