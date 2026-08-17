import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { ThemeColors, DarkColors, LightColors } from '../constants/theme';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export type ThemeMode = 'system' | 'dark' | 'light';

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  // Attempt to read current user from AuthContext (if wrapped)
  let currentUserId: string | null = null;
  let profileThemePref: ThemeMode | undefined = undefined;
  try {
    const auth = useAuth();
    currentUserId = auth.userProfile?.id || auth.user?.id || null;
    profileThemePref = auth.userProfile?.theme_preference;
  } catch {
    currentUserId = null;
  }

  // Load user-specific theme mode on mount, when user changes, or when profile loads
  useEffect(() => {
    // 1. If profile from Supabase has a theme preference, honor it
    if (profileThemePref && (profileThemePref === 'light' || profileThemePref === 'dark' || profileThemePref === 'system')) {
      setThemeModeState(profileThemePref);
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const userKey = currentUserId ? `um_theme_mode_${currentUserId}` : 'um_theme_mode';
        localStorage.setItem(userKey, profileThemePref);
      }
      return;
    }

    // 2. Otherwise read from local storage
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const userKey = currentUserId ? `um_theme_mode_${currentUserId}` : 'um_theme_mode';
      const saved = (localStorage.getItem(userKey) || localStorage.getItem('um_theme_mode')) as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeModeState(saved);
      } else {
        setThemeModeState('system');
      }
    }
  }, [currentUserId, profileThemePref]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);

    // 1. Instant local persistence & HTML attribute update
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const userKey = currentUserId ? `um_theme_mode_${currentUserId}` : 'um_theme_mode';
      localStorage.setItem(userKey, mode);
      localStorage.setItem('um_theme_mode', mode); // global fallback
      const effectiveScheme = mode === 'system' ? (systemColorScheme === 'light' ? 'light' : 'dark') : mode;
      document.documentElement.setAttribute('data-theme', effectiveScheme);
    }

    // 2. Cloud backend sync to Supabase user_profiles (if authenticated)
    if (supabase && currentUserId) {
      (async () => {
        try {
          const { error } = await supabase
            .from('user_profiles')
            .update({ theme_preference: mode })
            .eq('id', currentUserId);
          if (error) {
            console.warn('Backend theme sync note:', error.message);
          }
        } catch (err) {
          console.warn('Backend theme sync error:', err);
        }
      })();
    }
  };

  const toggleTheme = () => {
    if (themeMode === 'system') {
      const nextExplicit: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
      setThemeMode(nextExplicit);
    } else {
      const nextMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
      setThemeMode(nextMode);
    }
  };

  // Determine effective theme
  const resolvedTheme: 'dark' | 'light' =
    themeMode === 'system'
      ? (systemColorScheme === 'light' ? 'light' : 'dark')
      : themeMode;

  const colors = resolvedTheme === 'light' ? LightColors : DarkColors;
  const isDark = resolvedTheme === 'dark';

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        isDark,
        colors,
        toggleTheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
