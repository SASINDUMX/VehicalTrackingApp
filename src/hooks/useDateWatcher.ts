import { useEffect, useRef } from 'react';

/**
 * useDateWatcher
 * Fires a callback when the calendar date changes (i.e., midnight crosses).
 * Polls every 30 seconds — efficient enough for a floor app running all day.
 */
export const useDateWatcher = (onDateChange: () => void) => {
  const lastDateRef = useRef<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().split('T')[0];
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        onDateChange();
      }
    }, 30_000); // check every 30 seconds

    return () => clearInterval(interval);
  }, [onDateChange]);
};
