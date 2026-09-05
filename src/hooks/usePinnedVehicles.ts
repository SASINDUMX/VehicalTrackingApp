import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const getPinKey = () => `um_pins_${new Date().toISOString().split('T')[0]}`;

const loadPins = (): Set<string> => {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(getPinKey());
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    }
    return new Set<string>();
  } catch {
    return new Set<string>();
  }
};

// Global in-memory cache and listeners for fast, synchronized updates across components
let inMemoryPins: Set<string> = loadPins();
const listeners = new Set<(pins: Set<string>) => void>();

const broadcastPins = (pins: Set<string>) => {
  inMemoryPins = pins;
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(getPinKey(), JSON.stringify([...pins]));
    }
  } catch { /* ignore */ }
  listeners.forEach(listener => listener(new Set(pins)));
};

export const usePinnedVehicles = () => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set(inMemoryPins));

  useEffect(() => {
    const handleUpdate = (updated: Set<string>) => {
      setPinnedIds(updated);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const togglePin = useCallback((vehicleId: string) => {
    const next = new Set(inMemoryPins);
    if (next.has(vehicleId)) {
      next.delete(vehicleId);
    } else {
      next.add(vehicleId);
    }
    broadcastPins(next);
  }, []);

  const isPinned = useCallback((vehicleId: string) => pinnedIds.has(vehicleId), [pinnedIds]);

  return { pinnedIds, togglePin, isPinned };
};
