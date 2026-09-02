import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

const getPinKey = () => `um_pins_${new Date().toISOString().split('T')[0]}`;

const loadPins = (): Set<string> => {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(getPinKey());
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    }
    return new Set<string>();
  } catch {
    return new Set<string>();
  }
};

const savePins = (pins: Set<string>) => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(getPinKey(), JSON.stringify([...pins]));
    }
  } catch { /* ignore */ }
};

export const usePinnedVehicles = () => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPins);

  const togglePin = useCallback((vehicleId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(vehicleId)) {
        next.delete(vehicleId);
      } else {
        next.add(vehicleId);
      }
      savePins(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((vehicleId: string) => pinnedIds.has(vehicleId), [pinnedIds]);

  return { pinnedIds, togglePin, isPinned };
};
