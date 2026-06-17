"use client";
import { useEffect, useState } from 'react';
import {
  Diamond, Sparkles, Wallet, TrendingUp, Loader2, RefreshCw, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGE_LABEL: Record<RangeKey, string> = {
  '24h': 'Last 24 hours',
  '7d':  'Last 7 days',
  '30d': 'Last 30 days',
  'all': 'All time',
};

const rangeStart = (key: RangeKey): string | null => {
  const now = Date.now();
  switch (key) {
    case '24h': return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case '7d':  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'all': return null;
  }
};

export default function EarningsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [loading, setLoading] = useState(true);
  const [diamondTopupBdt, setDiamondTopupBdt] = useState(0);
  const [diamondTopupCount, setDiamondTopupCount] = useState(0);
  const [hostPayoutBdt, setHostPayoutBdt] = useState(0);
  const [hostPayoutCount, setHostPayoutCount] = useState(0);
  const [agencyStockBdt, setAgencyStockBdt] = useState(0);
  const [resellerStockBdt, setResellerStockBdt] = useState(0);
  const [topAgencies, setTopAgencies] = useState<{ id: string; name: string; total: number }[]>([]);

  useEffect(() => { load(); }, [range]);

  async function load() {
    setLoading(true);
    const start = rangeStart(range);

    // Topup requests (confirmed) — gross BDT inflow from users
    let topupsQ = supabase
      .from('topup_requests')
      .select('bdt_value', { count: 'exact' })
      .eq('status', 'confirmed');
    if (start) topupsQ = topupsQ.gte('confirmed_at', start);
    const topupsRes = await topupsQ;

    // Host payouts (paid) — outflow
    let payoutsQ = supabase
      .from('agency_payouts')
      .select('bdt_value, agency_id', { count: 'exact' })
      .eq('status', 'paid');
    if (start) payoutsQ = payoutsQ.gte('paid_at', start);
    const payoutsRes = await payoutsQ;

    // Bulk stock fulfilled — what super admin received from agencies/resellers
    let agencyStockQ = supabase
      .from('agency_stock_requests')
      .select('bdt_value')
      .eq('status', 'fulfilled');
    if (start) agencyStockQ = agencyStockQ.gte('fulfilled_at', start);
    const agencyStockRes = await agencyStockQ;

    let resellerStockQ = supabase
      .from('reseller_stock_requests')
      .select('bdt_value')
      .eq('status', 'fulfilled');
    if (start) resellerStockQ = resellerStockQ.gte('fulfilled_at', start);
    const resellerStockRes = await resellerStockQ;

    // Agency name lookup
    const agencyIds = Array.from(new Set((payoutsRes.data || []).map((p) => p.agency_id))).filter(Boolean);
    let agencyNames = new Map<string, string>();
    if (agencyIds.length > 0) {
      const { data: ags } = await supabase.from('agencies').select('id, name').in('id', agencyIds);
      if (ags) agencyNames = new Map(ags.map((a) => [a.id, a.name]));
    }

    // Top agencies by payout
    const agencyTotals: Record<string, number> = {};
    (payoutsRes.data || []).forEach((p) => {
      if (!p.agency_id) return;
      agencyTotals[p.agency_id] = (agencyTotals[p.agency_id] || 0) + Number(p.bdt_value || 0);
    });
    const top = Object.entries(agencyTotals)
      .map(([id, total]) => ({ id, name: agencyNames.get(id) || id.slice(0, 8), total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    setDiamondTopupBdt((topupsRes.data || []).reduce((s, r) => s + Number(r.bdt_value || 0), 0));
    setDiamondTopupCount(topupsRes.count || 0);
    setHostPayoutBdt((payoutsRes.data || []).reduce((s, r) => s + Number(r.bdt_value || 0), 0));
    setHostPayoutCount(payoutsRes.count || 0);
    setAgencyStockBdt((agencyStockRes.data || []).reduce((s, r) => s + Number(r.bdt_value || 0), 0));
    setResellerStockBdt((resellerStockRes.data || []).reduce((s, r) => s + Number(r.bdt_value || 0), 0));
    setTopAgencies(top);
    setLoading(false);
  }

  const stockRevenue = agencyStockBdt + resellerStockBdt;
  const platformNet = stockRevenue - hostPayoutBdt;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-pink-500 mb-3" size={36} />
        <p className="text-gray-400 text-sm">Loading earnings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Earnings & Cash Flow</h2>
          <p className="text-gray-500 mt-1">Platform revenue, host payouts and net profit.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {(['24h', '7d', '30d', 'all'] as RangeKey[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                range === r ? 'bg-pink-500 text-white' : 'bg-[#1E1A34] border border-[#251B45] text-gray-400 hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
          <button onClick={load} className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all ml-2">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500">Showing {RANGE_LABEL[range]}</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Diamond Topups (gross)" value={`৳${diamondTopupBdt.toLocaleString()}`} sub={`${diamondTopupCount} requests`} icon={Diamond} color="text-pink-400" />
        <StatCard label="Stock Sold to Partners" value={`৳${stockRevenue.toLocaleString()}`} sub={`Agency + Reseller bulk`} icon={Wallet} color="text-blue-400" />
        <StatCard label="Host Payouts" value={`৳${hostPayoutBdt.toLocaleString()}`} sub={`${hostPayoutCount} payouts`} icon={Sparkles} color="text-yellow-400" />
        <StatCard
          label="Platform Net"
          value={`৳${platformNet.toLocaleString()}`}
          sub={platformNet >= 0 ? 'Stock revenue − Payouts' : 'Underwater — fix payout rate'}
          icon={TrendingUp}
          color={platformNet >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* Top Agencies */}
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold text-white mb-4">Top Agencies by Payout ({RANGE_LABEL[range]})</h3>
        {topAgencies.length === 0 ? (
          <p className="text-gray-500 text-sm">No payouts in this range yet.</p>
        ) : (
          <div className="space-y-3">
            {topAgencies.map((a, idx) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>
                  <span className="font-bold text-white">{a.name}</span>
                </div>
                <span className="font-black text-pink-400">৳{a.total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Flow visualization */}
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold text-white mb-6">Cash Flow Direction</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FlowBox icon={ArrowDownLeft} title="In" subtitle="From partners" value={stockRevenue} color="text-green-400" />
          <FlowBox icon={ArrowUpRight} title="Out" subtitle="To hosts" value={hostPayoutBdt} color="text-red-400" />
          <FlowBox icon={TrendingUp} title="Net" subtitle={platformNet >= 0 ? 'Profit' : 'Loss'} value={Math.abs(platformNet)} color={platformNet >= 0 ? 'text-blue-400' : 'text-orange-400'} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="glass-card p-6">
      <div className={`p-3 rounded-xl bg-white/5 w-fit ${color}`}>
        <Icon size={24} />
      </div>
      <div className="mt-4">
        <p className="text-gray-500 text-sm font-medium">{label}</p>
        <h3 className="text-2xl font-black text-white mt-1">{value}</h3>
        {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function FlowBox({ icon: Icon, title, subtitle, value, color }: { icon: any; title: string; subtitle: string; value: number; color: string }) {
  return (
    <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-black uppercase tracking-widest text-gray-400">{title}</span>
        <Icon size={18} className={color} />
      </div>
      <p className={`text-2xl font-black ${color}`}>৳{value.toLocaleString()}</p>
      <p className="text-[10px] text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}