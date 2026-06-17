import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Namespace the storage key so a stale token from a different Supabase
    // project (or a previous deploy) can't leak in and trigger the
    // "Invalid Refresh Token: Refresh Token Not Found" noise at boot.
    storageKey: 'yolo-admin-auth',
  },
});
