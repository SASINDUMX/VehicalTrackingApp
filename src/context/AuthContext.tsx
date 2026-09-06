import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { UserRole, ForemanSection } from '../types/vehicle';

export interface UserProfile {
  id: string;
  display_name: string;
  role: UserRole;
  section?: ForemanSection | string | null;
  branch_id?: string;
  theme_preference?: 'system' | 'dark' | 'light';
}

interface AuthContextType {
  user: any | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Module-level persistent cache for user profiles (synchronous across renders and callbacks)
const profileMemoryCache = new Map<string, UserProfile>();

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // In-flight request deduplication map to collapse simultaneous calls into 1 network roundtrip
  const inFlightProfileRef = useRef<Map<string, Promise<UserProfile | null>>>(new Map());

  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!supabase || !userId) return null;

    // 1. Fast synchronous cache check: if profile already fetched for this user ID, return immediately
    if (profileMemoryCache.has(userId)) {
      return profileMemoryCache.get(userId)!;
    }

    // 2. Coalesce in-flight requests: if another caller is already fetching this user profile, reuse its promise
    if (inFlightProfileRef.current.has(userId)) {
      return inFlightProfileRef.current.get(userId)!;
    }

    const fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          console.warn('Profile fetch error:', error.message);
          return null;
        }
        const profile = data as UserProfile;
        profileMemoryCache.set(userId, profile);
        return profile;
      } catch (err) {
        console.warn('Profile fetch failed:', err);
        return null;
      } finally {
        inFlightProfileRef.current.delete(userId);
      }
    })();

    inFlightProfileRef.current.set(userId, fetchPromise);
    return fetchPromise;
  }, []);

  useEffect(() => {
    if (!supabase || !isSupabaseConnected) {
      setIsAuthLoading(false);
      return;
    }

    // Check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        const profile = await fetchProfile(session.user.id);
        setUserProfile(profile);
      }
      setIsAuthLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const profile = await fetchProfile(session.user.id);
        setUserProfile(profile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        profileMemoryCache.clear();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!supabase) {
      return { error: 'Supabase is not connected. Check your configuration.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        const profile = await fetchProfile(data.user.id);
        if (!profile) {
          return { error: 'No user profile found. Contact your administrator.' };
        }
        setUserProfile(profile);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Sign in failed' };
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      if (supabase) {
        // scope: 'local' cleans up local storage immediately without throwing 403 if remote session was deleted
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (err) {
      console.warn('[AuthContext] Remote signOut error (clearing local state):', err);
    } finally {
      setUser(null);
      setUserProfile(null);
      profileMemoryCache.clear();
      if (typeof window !== 'undefined' && window.localStorage) {
        // Purge any lingering supabase auth keys from storage
        Object.keys(window.localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('auth-token')) {
            window.localStorage.removeItem(key);
          }
        });
      }
    }
  }, []);

  const value = useMemo(() => ({
    user,
    userProfile,
    isAuthenticated: Boolean(user && userProfile),
    isAuthLoading,
    signIn,
    signOut,
  }), [user, userProfile, isAuthLoading, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
