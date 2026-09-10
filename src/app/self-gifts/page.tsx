'use client';

/**
 * Self-Gift Monitoring
 * ====================
 * Hosts may gift themselves during their own live. Those gifts are deliberately
 * excluded from rankings, agency income and withdrawable earnings, so they do
 * not show up in any of the normal earnings screens - which is exactly why they
 * need a report of their own.
 *
 * Every row is the audit record required for review: host, gift, diamond value,
 * timestamp and the live session it happened in.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Gift, AlertTriangle } from 'lucide-react';

type Row = {
  gift_log_id: string;
  host_id: string;
  host_name: string | null;
  host_display_id: number | null;
  gift_id: string | null;
  gift_name: string | null;
  gift_count: number | null;
  diamond_cost: number | null;
  bean_value: number | null;
  room_id: string | null;
  stream_type: string | null;
  stream_started_at: string | null;
  created_at: string;
};

type Summary = { hosts: number; gifts: number; diamonds: number; beans: number };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default function SelfGiftsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDay(d);
  });
  const [end, setEnd] = useState(() => isoDay(new Date()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
    const endIso = new Date(`${end}T23:59:59.999Z`).toISOString();
    const [report, totals] = await Promise.all([
      supabase.rpc('admin_self_gift_report', { p_start: startIso, p_end: endIso, p_limit: 500 }),
      supabase.rpc('admin_self_gift_summary', { p_start: startIso, p_end: endIso }),
    ]);
    if (report.error) setError(report.error.message);
    setRows((report.data as Row[]) || []);
    setSummary((totals.data as Summary) || null);
    setLoading(false);
  }, [start, end]);

  useEffect(() => { void load(); }, [load]);

  const tiles: Array<[string, string]> = [
    ['Hosts self-gifting', (summary?.hosts ?? 0).toLocaleString()],
    ['Self-gifts sent', (summary?.gifts ?? 0).toLocaleString()],
    ['Diamonds spent', (summary?.diamonds ?? 0).toLocaleString()],
    ['Beans credited (locked)', (summary?.beans ?? 0).toLocaleString()],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <Gift className="text-pink-400" size={22} /> Self-Gift Monitoring
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gifts hosts sent to themselves. Excluded from rankings, agency income and
          withdrawals, so they appear nowhere else.
        </p>
      </div>

      <div className="glass-card p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">From</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-2.5 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">To</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-2.5 text-sm text-white" />
        </div>
        <button onClick={() => void load()}
          className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm">
          Apply
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="glass-card p-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest">{label}</p>
            <p className="text-xl font-black text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="glass-card p-4 flex items-center gap-2 text-red-300 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <div className="glass-card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-pink-400" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">No self-gifts in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-white/10">
                  <th className="text-left py-3 px-5">When</th>
                  <th className="text-left">Host</th>
                  <th className="text-left">Host ID</th>
                  <th className="text-left">Gift</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Diamonds</th>
                  <th className="text-right">Beans</th>
                  <th className="text-left pl-4">Live session</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.gift_log_id} className="border-b border-white/5">
                    <td className="py-3 px-5 text-gray-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="text-white">{r.host_name || '—'}</td>
                    <td className="text-gray-400">{r.host_display_id ?? '—'}</td>
                    <td className="text-gray-300">{r.gift_name || r.gift_id || '—'}</td>
                    <td className="text-right text-gray-300">{r.gift_count ?? 1}</td>
                    <td className="text-right font-bold text-cyan-300">
                      {Number(r.diamond_cost || 0).toLocaleString()}
                    </td>
                    <td className="text-right text-yellow-300">
                      {Number(r.bean_value || 0).toLocaleString()}
                    </td>
                    <td className="pl-4 text-gray-500">
                      {r.room_id
                        ? `${r.stream_type || 'live'}${r.stream_started_at ? ` · ${new Date(r.stream_started_at).toLocaleString()}` : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
