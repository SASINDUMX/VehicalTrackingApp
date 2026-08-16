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

/**
 * Returns the currently active workshop break if the given time falls within one.
 */
export const getCurrentActiveBreak = (now: Date = new Date()): { name: string; endStr: string } | null => {
  // Convert to Sri Lanka / Local hours & minutes
  const hours = now.getHours();
  const minutes = now.getMinutes();
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
 */
export const getBreakOverlap = (
  startTime: string | Date,
  endTime: string | Date = new Date()
): { breakSeconds: number; breakNames: string[] } => {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { breakSeconds: 0, breakNames: [] };
  }

  let totalBreakSeconds = 0;
  const breakNamesSet = new Set<string>();

  // Iterate day by day between start and end date
  const currentDay = new Date(start);
  currentDay.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (currentDay <= endDay) {
    for (const b of WORKSHOP_BREAKS) {
      const breakStart = new Date(currentDay);
      breakStart.setHours(b.startHour, b.startMinute, 0, 0);

      const breakEnd = new Date(currentDay);
      breakEnd.setHours(b.endHour, b.endMinute, 0, 0);

      // Check overlap between [start, end] and [breakStart, breakEnd]
      const overlapStart = Math.max(start.getTime(), breakStart.getTime());
      const overlapEnd = Math.min(end.getTime(), breakEnd.getTime());

      if (overlapEnd > overlapStart) {
        const overlapSec = Math.floor((overlapEnd - overlapStart) / 1000);
        totalBreakSeconds += overlapSec;
        breakNamesSet.add(b.name);
      }
    }
    // Next day
    currentDay.setDate(currentDay.getDate() + 1);
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

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  const grossSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  const { breakSeconds } = getBreakOverlap(start, end);
  return Math.max(0, grossSeconds - breakSeconds);
};
