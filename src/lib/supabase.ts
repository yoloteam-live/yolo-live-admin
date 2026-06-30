import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

const STORAGE_KEY = 'yolo-admin-auth';

// Pre-flight: if the persisted session object is malformed (missing the
// refresh_token field, or expired beyond the auth server's slop window),
// purge it BEFORE the supabase client wakes up. Otherwise the client's
// first auto-refresh attempt throws "Invalid Refresh Token: Refresh
// Token Not Found" into the console even though AuthGate eventually
// recovers. Browser-only — SSR has no localStorage.
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const missingRefresh = !parsed?.refresh_token && !parsed?.currentSession?.refresh_token;
      const expiresAt = parsed?.expires_at ?? parsed?.currentSession?.expires_at;
      // 7-day slop: tokens older than this are useless anyway; the
      // refresh API would reject them, so save ourselves the noise.
      const wayExpired = typeof expiresAt === 'number'
        && (Date.now() / 1000) - expiresAt > 7 * 24 * 3600;
      if (missingRefresh || wayExpired) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (_) {
    // Corrupted JSON — drop it.
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Namespace the storage key so a stale token from a different Supabase
    // project (or a previous deploy) can't leak in and trigger the
    // "Invalid Refresh Token: Refresh Token Not Found" noise at boot.
    storageKey: STORAGE_KEY,
  },
});
