import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { supabase, isSupabaseConnected } from '../lib/supabase';
import { UserRole, ForemanSection } from '../types/vehicle';
import { calculateTrialInfo, TrialInfo } from '../utils/trialUtils';

export interface WorkplaceRecord {
  id: string;
  name: string;
  code: string;
  city: string;
  is_trial?: boolean;
  trial_expires_at?: string | null;
}

export interface UserProfile {
  id: string;
  display_name: string;
  role: UserRole;
  section?: ForemanSection | string | null;
  branch_id?: string;
  theme_preference?: 'system' | 'dark' | 'light';
  is_trial?: boolean;
  trial_expires_at?: string | null;
  active_session_token?: string | null;
  max_parallel_sessions?: number;
  active_session_tokens?: string[] | null;
}

interface AuthContextType {
  user: any | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  trialInfo: TrialInfo;
  // Active branch (may differ from profile.branch_id for AGM/Manager who switch)
  activeBranchId: string;
  activeBranchName: string;
  activeBranchCode: string;
  availableBranches: WorkplaceRecord[];
  switchBranch: (branchId: string) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Module-level persistent cache for user profiles (synchronous across renders and callbacks)
export const DEFAULT_WORKPLACES: WorkplaceRecord[] = [
  { id: 'orugodawatta_sec5', code: 'SEC5', name: 'United Motors — Section 5 (Main)', city: 'Orugodawatta, Colombo' },
  { id: 'orugodawatta_sec2', code: 'SEC2', name: 'United Motors — Section 2', city: 'Colombo' },
  { id: 'kandy', code: 'KDY', name: 'United Motors — Kandy Branch', city: 'Kandy' },
  { id: 'galle', code: 'GLE', name: 'United Motors — Galle Branch', city: 'Galle' },
  { id: 'kurunegala', code: 'KRG', name: 'United Motors — Kurunegala Branch', city: 'Kurunegala' },
];

const CACHED_PROFILE_KEY = 'um_cached_user_profile';

const getCachedProfile = (): UserProfile | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(CACHED_PROFILE_KEY);
      if (stored) return JSON.parse(stored);
    }
  } catch (_) {}
  return null;
};

const setCachedProfile = (profile: UserProfile | null) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (profile) {
        window.localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
      } else {
        window.localStorage.removeItem(CACHED_PROFILE_KEY);
      }
    }
  } catch (_) {}
};

const profileMemoryCache = new Map<string, UserProfile>();

const DEVICE_SESSION_KEY = 'um_device_session_token';

const getDeviceSessionToken = (): string => {
  try {
    if (typeof window !== 'undefined') {
      const sessionVal = window.sessionStorage?.getItem(DEVICE_SESSION_KEY);
      if (sessionVal) return sessionVal;
      const localVal = window.localStorage?.getItem(DEVICE_SESSION_KEY);
      if (localVal) return localVal;
    }
  } catch (_) {}
  return '';
};

const rotateDeviceSessionToken = (): string => {
  const token = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem(DEVICE_SESSION_KEY, token);
      window.localStorage?.setItem(DEVICE_SESSION_KEY, token);
    }
  } catch (_) {}
  return token;
};

const setDeviceSessionToken = (token: string) => {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem(DEVICE_SESSION_KEY, token);
      window.localStorage?.setItem(DEVICE_SESSION_KEY, token);
    }
  } catch (_) {}
};

const clearDeviceSessionToken = () => {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(DEVICE_SESSION_KEY);
      window.localStorage?.removeItem(DEVICE_SESSION_KEY);
    }
  } catch (_) {}
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(() => getCachedProfile());
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const currentSessionTokenRef = useRef<string | null>(null);
  const isEvictingRef = useRef<boolean>(false);

  const setUserProfile = useCallback((profile: UserProfile | null) => {
    setUserProfileState(profile);
    setCachedProfile(profile);
  }, []);

  // Branch state — seeded from profile.branch_id, switchable by manager roles
  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    const cached = getCachedProfile();
    return cached?.branch_id || 'orugodawatta_sec5';
  });
  const [availableBranches, setAvailableBranches] = useState<WorkplaceRecord[]>(DEFAULT_WORKPLACES);

  // In-flight request deduplication map to collapse simultaneous calls into 1 network roundtrip
  const inFlightProfileRef = useRef<Map<string, Promise<UserProfile | null>>>(new Map());

  // Fetch all active workplaces once (used to populate branch switcher)
  // Uses select('*') so PostgREST dynamically adapts without throwing 400 errors if optional columns are absent
  const fetchWorkplaces = useCallback(async () => {
    if (!supabase || !isSupabaseConnected) return;
    try {
      const { data, error } = await supabase
        .from('workplaces')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        setAvailableBranches(data as WorkplaceRecord[]);
        setActiveBranchId(prev => (prev ? prev : data[0].id));
      }
    } catch (err) {
      console.warn('[AuthContext] workplaces fetch failed:', err);
    }
  }, []);

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
        setCachedProfile(profile);
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
      setActiveBranchId('orugodawatta_sec5');
      profileMemoryCache.clear();
      currentSessionTokenRef.current = null;
      clearDeviceSessionToken();
      if (typeof window !== 'undefined' && window.localStorage) {
        // Purge any lingering supabase auth keys from storage
        Object.keys(window.localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('auth-token')) {
            window.localStorage.removeItem(key);
          }
        });
      }
    }
  }, [setUserProfile]);

  const evictSession = useCallback(async (reasonMessage: string) => {
    if (isEvictingRef.current) return;
    isEvictingRef.current = true;
    try {
      console.warn('[AuthContext] Evicting session:', reasonMessage);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(reasonMessage);
      }
      await signOut();
    } finally {
      isEvictingRef.current = false;
    }
  }, [signOut]);

  useEffect(() => {
    if (!supabase || !isSupabaseConnected) {
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        console.warn('[AuthContext] Safety timeout reached, releasing isAuthLoading');
        setIsAuthLoading(false);
      }
    }, 3500);

    const client = supabase;
    // Check existing session
    client.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          // Fetch workplaces for the branch switcher only for authenticated sessions
          fetchWorkplaces();

          // Verify with Supabase Auth server: only sign out if server explicitly returns 401/403 (revoked/expired)
          try {
            const { data: { user: verifiedUser }, error: verifyError } = await client.auth.getUser();
            if (verifyError && (verifyError.status === 401 || verifyError.status === 403)) {
              console.warn('[AuthContext] Session invalid or revoked on server, signing out:', verifyError.message);
              await client.auth.signOut({ scope: 'local' });
              if (isMounted) {
                setUser(null);
                setUserProfile(null);
              }
              return;
            }
            if (verifiedUser) {
              setUser(verifiedUser);
            } else {
              setUser(session.user);
            }
          } catch (verifyErr) {
            console.warn('[AuthContext] Session verification check network warning (preserving session):', verifyErr);
            setUser(session.user);
          }

          try {
            const profile = await fetchProfile(session.user.id);
            if (isMounted && profile) {
              // Verify session exclusivity on startup
              const storedToken = getDeviceSessionToken();
              const validTokens: string[] = Array.isArray(profile.active_session_tokens)
                ? profile.active_session_tokens
                : profile.active_session_token ? [profile.active_session_token] : [];

              if (validTokens.length > 0) {
                if (storedToken && !validTokens.includes(storedToken)) {
                  console.warn('[AuthContext] Stale session on startup (local token not in active list). Evicting.');
                  await client.auth.signOut({ scope: 'local' });
                  if (isMounted) {
                    setUser(null);
                    setUserProfile(null);
                  }
                  return;
                } else if (!storedToken) {
                  // Adopt the newest active token if available
                  const tokenToAdopt = validTokens[0] || rotateDeviceSessionToken();
                  setDeviceSessionToken(tokenToAdopt);
                  currentSessionTokenRef.current = tokenToAdopt;
                } else {
                  currentSessionTokenRef.current = storedToken;
                }
              } else {
                // First session setup: register fresh token
                const freshToken = rotateDeviceSessionToken();
                currentSessionTokenRef.current = freshToken;
                try {
                  await client.rpc('register_active_session', { p_token: freshToken });
                } catch (_) {
                  await client.from('user_profiles').update({ active_session_token: freshToken }).eq('id', session.user.id);
                }
              }

              setUserProfile(profile);
              if (profile.branch_id) setActiveBranchId(profile.branch_id);
            }
          } catch (profileErr) {
            console.warn('[AuthContext] Profile fetch error:', profileErr);
          }
        }
      })
      .catch((err) => {
        console.warn('[AuthContext] getSession error:', err);
      })
      .finally(() => {
        if (isMounted) {
          clearTimeout(safetyTimer);
          setIsAuthLoading(false);
        }
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        fetchWorkplaces();
        const profile = await fetchProfile(session.user.id);
        if (isMounted) {
          setUserProfile(profile);
          if (profile?.branch_id) setActiveBranchId(profile.branch_id);
        }
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser(null);
          setUserProfile(null);
          setActiveBranchId('orugodawatta_sec5');
          profileMemoryCache.clear();
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchWorkplaces]);

  // Realtime single-session enforcement: evicts this session if another device/window logs in
  useEffect(() => {
    const client = supabase;
    if (!client || !isSupabaseConnected || !user?.id) return;

    if (!currentSessionTokenRef.current) {
      currentSessionTokenRef.current = getDeviceSessionToken();
    }

    const channelName = `session_guard_${user.id}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload: any) => {
          const myToken = currentSessionTokenRef.current;
          if (!myToken) return;

          const updatedTokens: string[] = Array.isArray(payload.new?.active_session_tokens)
            ? payload.new.active_session_tokens
            : payload.new?.active_session_token ? [payload.new.active_session_token] : [];

          // If the profile has active tokens registered and my token was evicted/popped off
          if (updatedTokens.length > 0 && !updatedTokens.includes(myToken)) {
            console.warn('[AuthContext] Session evicted (limit exceeded by newer logins). Active tokens:', updatedTokens, 'My token:', myToken);
            evictSession('You have been logged out because the maximum number of parallel logins for this account was reached on newer devices.');
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[AuthContext] Session guard active for user ${user.id}`);
        }
      });

    // Verification check on tab focus: ensures background tabs detect invalidation immediately
    const handleFocusCheck = async () => {
      const myToken = currentSessionTokenRef.current;
      if (!myToken || !client || !user?.id) return;
      try {
        const { data, error } = await client
          .from('user_profiles')
          .select('active_session_token, active_session_tokens')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          const currentTokens: string[] = Array.isArray(data.active_session_tokens)
            ? data.active_session_tokens
            : data.active_session_token ? [data.active_session_token] : [];

          if (currentTokens.length > 0 && !currentTokens.includes(myToken)) {
            console.warn('[AuthContext] Focus check: Session evicted by newer logins.');
            evictSession('You have been logged out because the maximum number of parallel logins for this account was reached on newer devices.');
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Session focus verification error:', err);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocusCheck);
    }

    return () => {
      client.removeChannel(channel);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocusCheck);
      }
    };
  }, [user?.id, evictSession]);

  const signIn = useCallback(async (emailInput: string, passwordInput: string): Promise<{ error: string | null }> => {
    if (!supabase) {
      return { error: 'Supabase is not connected. Check your configuration.' };
    }

    const email = emailInput.trim().toLowerCase();
    const password = passwordInput;

    try {
      // Direct Supabase authentication with the exact credentials entered
      const res = await supabase.auth.signInWithPassword({ email, password });

      if (res.error) {
        return { error: res.error.message };
      }

      if (res.data.user) {
        // 1. Generate new session token for this window/tab and claim via RPC
        const freshToken = rotateDeviceSessionToken();
        currentSessionTokenRef.current = freshToken;

        try {
          const { error: rpcErr } = await supabase.rpc('register_active_session', { p_token: freshToken });
          if (rpcErr) {
            // Fallback direct update if RPC not present
            await supabase
              .from('user_profiles')
              .update({ active_session_token: freshToken })
              .eq('id', res.data.user.id);
          }
        } catch (claimErr) {
          console.warn('[AuthContext] Failed to claim active_session_token in DB:', claimErr);
        }

        setUser(res.data.user);
        fetchWorkplaces();
        const profile = await fetchProfile(res.data.user.id);
        if (!profile) {
          return { error: 'No user profile found. Please ensure a profile exists in user_profiles.' };
        }
        setUserProfile(profile);
        setActiveBranchId(profile.branch_id || 'orugodawatta_sec5');
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Sign in failed' };
    }
  }, [fetchProfile, fetchWorkplaces]);

  // Derived branch display values from availableBranches list
  const activeBranch = availableBranches.find(b => b.id === activeBranchId);
  const activeBranchName = activeBranch?.name ?? 'United Motors - Orugodawatta (Section 5)';
  const activeBranchCode = activeBranch?.code ?? 'SEC 5';

  // Derived trial evaluation state
  const trialInfo = useMemo(() => {
    return calculateTrialInfo(activeBranch, userProfile);
  }, [activeBranch, userProfile]);

  // switchBranch: only called by Manager/AGM roles via header switcher
  const switchBranch = useCallback((branchId: string) => {
    setActiveBranchId(branchId);
  }, []);

  const value = useMemo(() => ({
    user,
    userProfile,
    isAuthenticated: Boolean(user && userProfile),
    isAuthLoading,
    trialInfo,
    activeBranchId,
    activeBranchName,
    activeBranchCode,
    availableBranches,
    switchBranch,
    signIn,
    signOut,
  }), [user, userProfile, isAuthLoading, trialInfo, activeBranchId, activeBranchName, activeBranchCode, availableBranches, switchBranch, signIn, signOut]);

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
