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

const getStoredCredentials = () => {
  const localUrl = safeStorage.getItem('um_supabase_url') || '';
  const localKey = safeStorage.getItem('um_supabase_key') || '';

  return {
    url: localUrl || SUPABASE_URL,
    key: localKey || SUPABASE_ANON_KEY,
  };
};

const { url: supabaseUrl, key: supabaseAnonKey } = getStoredCredentials();

export const isSupabaseConnected = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.includes('supabase.co')
);

export const supabase: SupabaseClient | null = isSupabaseConnected
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const saveSupabaseCredentials = (url: string, key: string) => {
  safeStorage.setItem('um_supabase_url', url.trim());
  safeStorage.setItem('um_supabase_key', key.trim());
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
  }
};

export const clearSupabaseCredentials = () => {
  safeStorage.removeItem('um_supabase_url');
  safeStorage.removeItem('um_supabase_key');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.reload();
  }
};

export { safeStorage };
