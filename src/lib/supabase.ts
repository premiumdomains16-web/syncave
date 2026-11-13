// Browser Supabase client: used only for sign-in (Supabase Auth). All data goes
// through the API Edge Function, which checks the signed-in user on every call.
// The URL and anon (publishable) key are public by design; set them in .env.local:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co     (or just SUPABASE_URL)
//   VITE_SUPABASE_ANON_KEY=eyJ... / sb_publishable_...
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.error('Syncave: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (Supabase → Project Settings → API).');
}

export const supabase = createClient(url || 'https://missing.supabase.co', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Base URL of the API Edge Function routes, e.g. https://xxxx.supabase.co/functions/v1 (paths start with /api). */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || (url ? `${url}/functions/v1` : '')).replace(/\/+$/, '');

/** The current access token (refreshed automatically), or undefined when signed out. */
export async function accessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
