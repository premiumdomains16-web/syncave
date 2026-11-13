// Who is logged in, shared by the public pages and the dashboard.
// Sign-in is Supabase Auth; the Syncave account (name, plan) comes from the API's /api/me.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Plan, User } from '@shared/types';
import { API_BASE, supabase } from '@/lib/supabase';

type Status = 'loading' | 'signedIn' | 'signedOut';

/** Auth failure with an HTTP-like status so pages can show a translated message. */
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Supabase Auth errors → the statuses the login page understands. */
function toAuthError(err: unknown): AuthError {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  const code = e?.code ?? '';
  const msg = e?.message ?? 'Request failed';
  if (e?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(msg)) return new AuthError(0, msg);
  if (code === 'email_not_confirmed') return new AuthError(403, msg);
  if (code === 'user_already_exists' || code === 'email_exists') return new AuthError(409, msg);
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429) return new AuthError(429, msg);
  if (code === 'weak_password') return new AuthError(422, msg);
  if (code === 'invalid_credentials' || e?.status === 400) return new AuthError(401, msg);
  return new AuthError(e?.status ?? 500, msg);
}

/** Loads the Syncave account for a token (creates it on first sign-in). */
async function fetchAccount(token: string): Promise<User> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new AuthError(0, 'Could not reach the server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(res.status, data.error || `Request failed (${res.status})`);
  return data.user as User;
}

interface AuthState {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  /** Resolves to 'confirm' when Supabase requires the email to be confirmed before signing in. */
  signup: (input: { name: string; email: string; password: string; plan?: Plan }) => Promise<'signedIn' | 'confirm'>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const lastToken = useRef<string | undefined>(undefined);

  const adopt = useCallback(async (token: string | undefined) => {
    if (!token) { lastToken.current = undefined; setUser(null); setStatus('signedOut'); return; }
    if (token === lastToken.current) return;
    lastToken.current = token;
    try {
      setUser(await fetchAccount(token));
      setStatus('signedIn');
    } catch {
      setUser(null); setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => adopt(data.session?.access_token));
    // Sign-in/out in this or another tab, and confirmation links that land on the site.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') { lastToken.current = session?.access_token; return; }
      adopt(session?.access_token);
    });
    return () => data.subscription.unsubscribe();
  }, [adopt]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAuthError(error);
    const token = data.session?.access_token;
    if (!token) throw new AuthError(401, 'Sign-in failed.');
    lastToken.current = token;
    setUser(await fetchAccount(token));
    setStatus('signedIn');
  }, []);

  const signup = useCallback(async (input: { name: string; email: string; password: string; plan?: Plan }) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { name: input.name, ...(input.plan && input.plan !== 'free' ? { requested_plan: input.plan } : {}) },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw toAuthError(error);
    // With email confirmation on, an existing address comes back with no identities (no error, by design).
    if (data.user && data.user.identities?.length === 0) throw new AuthError(409, 'Email already registered.');
    if (!data.session) return 'confirm';
    lastToken.current = data.session.access_token;
    setUser(await fetchAccount(data.session.access_token));
    setStatus('signedIn');
    return 'signedIn';
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    lastToken.current = undefined;
    setUser(null); setStatus('signedOut');
  }, []);

  return <AuthContext.Provider value={{ user, status, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
