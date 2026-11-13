// Who is logged in, shared by the public pages and the dashboard.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Plan, User } from '@shared/types';

type Status = 'loading' | 'signedIn' | 'signedOut';

/** Error from the auth API, with the HTTP status so pages can show a translated message. */
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AuthError(0, 'Could not reach the server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

interface AuthState {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { name: string; email: string; password: string; plan?: Plan }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
        setStatus(data?.user ? 'signedIn' : 'signedOut');
      })
      .catch(() => setStatus('signedOut'));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await post<{ user: User }>('/api/auth/login', { email, password });
    setUser(user); setStatus('signedIn');
  }, []);

  const signup = useCallback(async (input: { name: string; email: string; password: string; plan?: Plan }) => {
    const { user } = await post<{ user: User }>('/api/auth/signup', input);
    setUser(user); setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await post('/api/auth/logout').catch(() => {});
    setUser(null); setStatus('signedOut');
  }, []);

  return <AuthContext.Provider value={{ user, status, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
