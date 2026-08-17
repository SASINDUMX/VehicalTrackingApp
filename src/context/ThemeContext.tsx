import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { ThemeColors, DarkColors, LightColors } from '../constants/theme';

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

  useEffect(() => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('um_theme_mode') as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeModeState(saved);
      }
    }
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem('um_theme_mode', mode);
      const effectiveScheme = mode === 'system' ? (systemColorScheme === 'light' ? 'light' : 'dark') : mode;
      document.documentElement.setAttribute('data-theme', effectiveScheme);
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
