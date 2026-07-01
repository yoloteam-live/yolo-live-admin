"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Shield, Phone, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!phone || !password) {
      setError('Phone and password are required.');
      return;
    }

    // Match mobile app's phone->dummy email trick
    let fullPhone = phone.trim();
    if (!fullPhone.startsWith('+')) fullPhone = '+880' + fullPhone;
    const dummyEmail = `${fullPhone.replace('+', '')}@yolo.app`;

    setLoading(true);
    try {
      // Clear any stale session first. If a previous refresh token expired
      // (or got revoked server-side) it would still sit in localStorage and
      // make Supabase fire a "Invalid Refresh Token: Refresh Token Not Found"
      // before our signIn even runs. signOut() clears that state silently.
      try { await supabase.auth.signOut(); } catch (_) {}

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: dummyEmail,
        password,
      });
      if (signInErr) throw signInErr;
      if (!data?.user) throw new Error('Login failed.');

      // Check admin role
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', data.user.id)
        .single();

      if (profErr) throw profErr;
      if (!profile || !['admin', 'super_admin', 'manager'].includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error('Access denied. This panel is for admins only.');
      }

      router.replace('/');
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E111E] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 mb-4 shadow-lg shadow-pink-500/20">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white">Care Live Super Admin</h1>
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
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="tel"
                placeholder="+8801XXXXXXXXX"
                className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-pink-500 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
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
            Same phone & password as your mobile app account. Role must be manager or super_admin.
          </p>
        </form>
      </div>
    </div>
  );
}
