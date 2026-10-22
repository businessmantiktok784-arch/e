import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { AccountUser, AuthCodeRequested, fetchAuthSession, requestAuthCode, signOutAuthSession, updateAccountProfile, verifyAuthCode } from '../services/api';

const SESSION_KEY = 'earth-talk-session-v1';
interface AuthValue {
  ready: boolean;
  token: string | null;
  user: AccountUser | null;
  restoreFailed: boolean;
  requestCode(phone: string): Promise<AuthCodeRequested>;
  verifyCode(phone: string, code: string): Promise<void>;
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
  updateDisplayName(name: string | null): Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);
const canStoreSecurely = Platform.OS !== 'web';

export function AuthProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);

  const refreshSession = useCallback(async () => {
    if (!canStoreSecurely) { setReady(true); return; }
    const saved = await SecureStore.getItemAsync(SESSION_KEY);
    if (!saved) { setToken(null); setUser(null); setRestoreFailed(false); setReady(true); return; }
    setToken(saved);
    try {
      const session = await fetchAuthSession(saved);
      if (session.authenticated && session.user) { setUser(session.user); setRestoreFailed(false); }
      else { await SecureStore.deleteItemAsync(SESSION_KEY); setToken(null); setUser(null); setRestoreFailed(false); }
    } catch { setUser(null); setRestoreFailed(true); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { void refreshSession().catch(() => { setRestoreFailed(true); setReady(true); }); }, [refreshSession]);

  const requestCode = useCallback(async (phone: string) => {
    return requestAuthCode(phone);
  }, []);
  const verifyCode = useCallback(async (phone: string, code: string) => {
    if (!canStoreSecurely) throw new Error('Sign-in is available in the native mobile app, not the web preview.');
    const result = await verifyAuthCode(phone, code);
    await SecureStore.setItemAsync(SESSION_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    setRestoreFailed(false);
  }, []);
  const signOut = useCallback(async () => {
    if (token) await signOutAuthSession(token);
    if (canStoreSecurely) await SecureStore.deleteItemAsync(SESSION_KEY);
    setToken(null);
    setUser(null);
    setRestoreFailed(false);
  }, [token]);
  const updateDisplayName = useCallback(async (name: string | null) => {
    if (!token) throw new Error('Sign in to update your profile.');
    const result = await updateAccountProfile(token, name);
    setUser(result.user);
  }, [token]);

  const value = useMemo(() => ({ ready, token, user, restoreFailed, requestCode, verifyCode, refreshSession, signOut, updateDisplayName }), [ready, token, user, restoreFailed, requestCode, verifyCode, refreshSession, signOut, updateDisplayName]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
