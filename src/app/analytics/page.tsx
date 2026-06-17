"use client";
import { useEffect, useState } from 'react';
import {
  BarChart3, Users, Activity, TrendingUp, Loader2, RefreshCw, Diamond, Gift,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Stats = {
  liveNow: number;
  signupsToday: number;
  signupsWeek: number;
  totalUsers: number;
  giftsToday: number;
  giftsWeek: number;
  diamondsSentToday: number;
  hourlyEngagement: number[];
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [topTags, setTopTags] = useState<{ tag: string; count: number }[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      liveRes,
      signupsTodayRes,
      signupsWeekRes,
      totalUsersRes,
      giftsTodayRes,
      giftsWeekRes,
      diamondsSentRes,
      tagsRes,
      hourlyRes,
    ] = await Promise.all([
      supabase.from('live_streams').select('id', { count: 'exact', head: true }).eq('status', 'live'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfWeek),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('gifts_log').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
      supabase.from('gifts_log').select('id', { count: 'exact', head: true }).gte('created_at', startOfWeek),
      supabase.from('transactions').select('amount').eq('type', 'topup').eq('status', 'completed').gte('created_at', startOfDay),
      supabase.from('live_streams').select('tag').gte('started_at', startOfWeek).not('tag', 'is', null),
      // Hourly bucket via raw signups in last 24h (we'll bucket client-side)
      supabase.from('profiles').select('created_at').gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const diamondsToday = (diamondsSentRes.data || []).reduce((s, t) => s + (t.amount || 0), 0);

    // Tags aggregation
    const tagMap: Record<string, number> = {};
    (tagsRes.data || []).forEach((row) => {
      const t = row.tag as string;
      if (t) tagMap[t] = (tagMap[t] || 0) + 1;
    });
    const tags = Object.entries(tagMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    setTopTags(tags);

    // Hourly bucket
    const buckets = new Array(24).fill(0);
    (hourlyRes.data || []).forEach((row) => {
      const d = new Date(row.created_at);
      const offset = Math.floor((now.getTime() - d.getTime()) / (60 * 60 * 1000));
      const idx = 23 - offset;
      if (idx >= 0 && idx < 24) buckets[idx] += 1;
    });

    setStats({
      liveNow: liveRes.count || 0,
      signupsToday: signupsTodayRes.count || 0,
      signupsWeek: signupsWeekRes.count || 0,
      totalUsers: totalUsersRes.count || 0,
      giftsToday: giftsTodayRes.count || 0,
      giftsWeek: giftsWeekRes.count || 0,
      diamondsSentToday: diamondsToday,
      hourlyEngagement: buckets,
    });
    setLoading(false);
  }

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-pink-500 mb-3" size={36} />
        <p className="text-gray-400 text-sm">Crunching analytics…</p>
      </div>
    );
  }

  const maxBucket = Math.max(1, ...stats.hourlyEngagement);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">System Analytics</h2>
          <p className="text-gray-500 mt-1">Real-time platform metrics from the database.</p>
        </div>
        <button onClick={load} className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Live Right Now', value: stats.liveNow.toLocaleString(), icon: Activity, color: 'text-green-400' },
          { label: 'Signups (Today)', value: stats.signupsToday.toLocaleString(), icon: Users, color: 'text-blue-400' },
          { label: 'Gifts Sent (Today)', value: stats.giftsToday.toLocaleString(), icon: Gift, color: 'text-pink-400' },
          { label: 'Diamonds Topup (Today)', value: stats.diamondsSentToday.toLocaleString(), icon: Diamond, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-6">
            <div className={`p-3 rounded-xl bg-white/5 w-fit ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div className="mt-4">
              <p className="text-gray-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-black text-white mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'text-blue-400' },
          { label: 'Signups (Last 7d)', value: stats.signupsWeek.toLocaleString(), icon: TrendingUp, color: 'text-pink-400' },
          { label: 'Gifts (Last 7d)', value: stats.giftsWeek.toLocaleString(), icon: BarChart3, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-5">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                <stat.icon size={18} />
              </div>
              <div>
                <p className="text-gray-500 text-xs">{stat.label}</p>
                <h3 className="text-xl font-black text-white">{stat.value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card p-6 min-h-[300px]">
          <h3 className="text-xl font-bold mb-2 text-white">Signups — last 24 hours</h3>
          <p className="text-xs text-gray-500 mb-6">Hourly buckets from profiles.created_at</p>
          <div className="flex items-end gap-1 h-48">
            {stats.hourlyEngagement.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center group">
                <div
                  className="w-full bg-gradient-to-t from-pink-500/20 to-pink-500 rounded-t-sm transition-all"
                  style={{ height: `${(count / maxBucket) * 100}%`, minHeight: count > 0 ? 4 : 2 }}
                  title={`${count} signups`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 font-bold mt-4">
            <span>24h ago</span>
            <span>12h ago</span>
            <span>now</span>
          </div>
        </div>

        <div className="glass-card p-6 min-h-[300px]">
          <h3 className="text-xl font-bold mb-2 text-white">Top Live Tags</h3>
          <p className="text-xs text-gray-500 mb-6">Last 7 days</p>
          {topTags.length === 0 ? (
            <p className="text-gray-500 text-sm">No tagged streams in this window.</p>
          ) : (
            <div className="space-y-3">
              {topTags.map((t) => (
                <div key={t.tag}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-white">{t.tag}</span>
                    <span className="text-gray-400">{t.count}</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
                      style={{ width: `${(t.count / topTags[0].count) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}