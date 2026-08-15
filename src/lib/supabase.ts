import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Read from Expo environment variables (EXPO_PUBLIC_ prefix)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const getStoredCredentials = () => {
  let localUrl = '';
  let localKey = '';

  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localUrl = localStorage.getItem('um_supabase_url') || '';
    localKey = localStorage.getItem('um_supabase_key') || '';
  }

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
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem('um_supabase_url', url.trim());
    localStorage.setItem('um_supabase_key', key.trim());
    window.location.reload();
  }
};

export const clearSupabaseCredentials = () => {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.removeItem('um_supabase_url');
    localStorage.removeItem('um_supabase_key');
    window.location.reload();
  }
};
