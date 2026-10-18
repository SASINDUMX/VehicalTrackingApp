import { useEffect, useRef } from 'react';
import { getSriLankaTodayString } from '../utils/workshopHoursUtils';

/**
 * useDateWatcher
 * Fires a callback when the calendar date changes (i.e., midnight crosses in Sri Lanka).
 * Polls every 30 seconds — efficient enough for a floor app running all day.
 */
export const useDateWatcher = (onDateChange: () => void) => {
  const lastDateRef = useRef<string>(getSriLankaTodayString());

  useEffect(() => {
    const checkDate = () => {
      const today = getSriLankaTodayString();
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        onDateChange();
      }
    };

    const interval = setInterval(checkDate, 30_000); // check every 30 seconds

    // Mobile / Tablet wake-up listener: instant date check when tab or screen unlocks
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkDate();
      }
    };

    const handleFocus = () => {
      checkDate();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
    };
  }, [onDateChange]);
};
