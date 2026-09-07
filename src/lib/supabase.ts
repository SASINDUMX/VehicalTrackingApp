import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Read from Expo environment variables (EXPO_PUBLIC_ prefix)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Safe localStorage wrapper — prevents SecurityError crashes in Safari Private Browsing
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch { /* Safari Private Browsing throws SecurityError */ }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch { /* silent fallback */ }
  },
  removeItem: (key: string): void => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch { /* silent fallback */ }
  },
};

const isValidSupabaseUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'https:' && parsed.hostname.endsWith('supabase.co')) ||
      (parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
};

export const isSupabaseConnected = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  isValidSupabaseUrl(SUPABASE_URL)
);

export const supabase: SupabaseClient | null = isSupabaseConnected
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export { safeStorage };

