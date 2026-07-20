"use client";
import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, UserRound, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!identifier || !password) {
      setError('Email or phone and password are required.');
      return;
    }

    const raw = identifier.trim();
    const emailCandidates = raw.includes('@')
      ? [raw.toLowerCase()]
      : (() => {
          const digits = raw.replace(/\D/g, '');
          const canonical = digits.startsWith('880')
            ? digits
            : digits.startsWith('0') ? `880${digits.slice(1)}` : `880${digits}`;
          // The second value supports accounts created by the old login's
          // +880 + 01... normalization bug.
          return [...new Set([`${canonical}@yolo.app`, `880${digits}@yolo.app`])];
        })();

    setLoading(true);
    try {
      // Clear any stale session first. If a previous refresh token expired
      // (or got revoked server-side) it would still sit in localStorage and
      // make Supabase fire a "Invalid Refresh Token: Refresh Token Not Found"
      // before our signIn even runs. signOut() clears that state silently.
      try { await supabase.auth.signOut(); } catch {}

      let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null;
      let signInErr: Error | null = null;
      for (const email of emailCandidates) {
        const attempt = await supabase.auth.signInWithPassword({ email, password });
        if (!attempt.error) { data = attempt.data; signInErr = null; break; }
        signInErr = attempt.error;
      }
      if (signInErr || !data) throw signInErr || new Error('Login failed.');
      if (!data?.user) throw new Error('Login failed.');

      const access = await supabase.rpc('get_my_admin_access');
      if (access.error || !access.data?.success || access.data?.is_active === false) {
        // Migration rollout fallback for the existing owner account only.
        const legacy = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
        if (!legacy.data || !['admin', 'super_admin'].includes(legacy.data.role)) {
          await supabase.auth.signOut();
          throw new Error('Access denied. This account has no active dashboard role.');
        }
      }

      if (!data.user) {
        await supabase.auth.signOut();
        throw new Error('Login failed.');
      }

      router.replace('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      if (/exceed_cached_egress_quota|service for this project is restricted/i.test(message)) {
        setError('Dashboard service is temporarily restricted by the Supabase project quota. The project owner must remove the spend cap or upgrade the plan.');
      } else if (/networkerror|failed to fetch|network request failed/i.test(message)) {
        setError('Cannot reach the authentication service. Check the connection and Supabase project status, then try again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E111E] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/popular-live-logo.png"
            alt="Popular Live"
            width={104}
            height={104}
            priority
            className="mx-auto mb-5 h-[104px] w-[104px] rounded-lg object-cover shadow-xl shadow-black/30"
          />
          <h1 className="text-3xl font-black text-white">Popular Live Admin</h1>
          <p className="text-gray-500 text-sm mt-2">Sign in with your admin credentials</p>
        </div>

        <form onSubmit={handleLogin} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
              Email or phone
            </label>
            <div className="relative">
              <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                placeholder="admin@company.com or +8801XXXXXXXXX"
                className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-500 text-sm"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-500 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Sign In'}
          </button>

          <p className="text-center text-[10px] text-gray-500">
            Use the credentials assigned by a dashboard administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
