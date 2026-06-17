"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import {
  Target, Award, TrendingUp, Plus, Edit2, Trash2, Loader2, X,
  CheckCircle2, XCircle, Sparkles,
} from 'lucide-react';

type Tab = 'tasks' | 'badges' | 'levels';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'tasks',  label: 'Tasks',   icon: Target },
  { id: 'badges', label: 'Badges',  icon: Award },
  { id: 'levels', label: 'Level Tiers', icon: TrendingUp },
];

const TABLE_OF: Record<Tab, string> = {
  tasks: 'tasks', badges: 'badges', levels: 'level_tiers',
};

// Field schema per tab → drives both table headers and edit modal.
type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'color' | 'select' | 'check'; opts?: string[]; required?: boolean; hint?: string };
const FIELDS: Record<Tab, FieldDef[]> = {
  tasks: [
    { key: 'id',            label: 'ID',           type: 'text',   required: true },
    { key: 'title',         label: 'Title',        type: 'text',   required: true },
    { key: 'reward',        label: 'Reward (💎)',  type: 'number', required: true },
    { key: 'action',        label: 'Action',       type: 'select', opts: ['watch','gift','live','share','custom'], required: true },
    { key: 'audience',      label: 'Audience',     type: 'select', opts: ['all','host','viewer'], required: true },
    { key: 'description',   label: 'Description',  type: 'text' },
    { key: 'display_order', label: 'Display order',type: 'number' },
    { key: 'is_active',     label: 'Active',       type: 'check' },
  ],
  badges: [
    { key: 'id',            label: 'ID',           type: 'text',   required: true },
    { key: 'name',          label: 'Name',         type: 'text',   required: true },
    { key: 'description',   label: 'Description',  type: 'text' },
    { key: 'icon_url',      label: 'Icon URL',     type: 'text', hint: 'Public PNG/SVG' },
    { key: 'criteria',      label: 'Unlock criteria', type: 'text' },
    { key: 'display_order', label: 'Display order',type: 'number' },
    { key: 'is_active',     label: 'Active',       type: 'check' },
  ],
  levels: [
    { key: 'id',            label: 'ID',           type: 'text',   required: true },
    { key: 'name',          label: 'Name',         type: 'text',   required: true },
    { key: 'color',         label: 'Color',        type: 'color',  required: true },
    { key: 'icon',          label: 'Icon (ionicon)', type: 'text', hint: 'e.g. star-outline' },
    { key: 'min_level',     label: 'Min level',    type: 'number', required: true },
    { key: 'max_level',     label: 'Max level',    type: 'number', required: true },
    { key: 'display_order', label: 'Display order',type: 'number' },
  ],
};

export default function ContentPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [tab, setTab] = useState<Tab>('tasks');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    const ch = supabase
      .channel(`admin-${tab}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_OF[tab] }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from(TABLE_OF[tab])
      .select('*')
      .order('display_order', { ascending: true });
    setRows(data || []);
    setLoading(false);
  }

  async function save() {
    if (!editing) return;
    for (const f of FIELDS[tab]) {
      if (f.required && (editing[f.key] === undefined || editing[f.key] === null || editing[f.key] === '')) {
        alert(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    const { error } = creating
      ? await supabase.from(TABLE_OF[tab]).insert(editing)
      : await supabase.from(TABLE_OF[tab]).update(editing).eq('id', editing.id);
    setSaving(false);
    if (error) { alert('Failed: ' + error.message); return; }
    setEditing(null);
    setCreating(false);
  }

  async function toggleActive(row: any) {
    const { error } = await supabase.from(TABLE_OF[tab]).update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) alert('Failed: ' + error.message);
  }

  async function remove(row: any) {
    if (!window.confirm(`Delete "${row.name ?? row.title ?? row.id}"?`)) return;
    const { error } = await supabase.from(TABLE_OF[tab]).delete().eq('id', row.id);
    if (error) alert('Failed: ' + error.message);
  }

  const blank = () => {
    const o: any = {};
    FIELDS[tab].forEach((f) => {
      if (f.type === 'number') o[f.key] = 0;
      else if (f.type === 'check') o[f.key] = true;
      else o[f.key] = '';
    });
    return o;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Content & Progression</h1>
            <p className="text-xs text-gray-500">Tasks, badges, and level tiers — all driven by these tables</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(blank()); setCreating(true); }}
          className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          <Plus size={18} /> New {tab.slice(0, -1)}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-[#1E1A34] border border-[#251B45] rounded-2xl p-1.5 mb-4 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                tab === t.id
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cyan-500" size={32} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <p className="text-gray-500">No rows. Click "New" to add one.</p>
        </div>
      ) : (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                {FIELDS[tab].filter((f) => f.key !== 'description' && f.key !== 'criteria').map((f) => (
                  <th key={f.key} className="px-4 py-3 text-left">{f.label}</th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  {FIELDS[tab].filter((f) => f.key !== 'description' && f.key !== 'criteria').map((f) => (
                    <td key={f.key} className="px-4 py-3 text-sm text-white">
                      {f.type === 'check' ? (
                        r[f.key]
                          ? <CheckCircle2 className="text-green-400" size={16} />
                          : <XCircle className="text-gray-500" size={16} />
                      ) : f.type === 'color' && r[f.key] ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-4 h-4 rounded" style={{ background: r[f.key] }} />
                          <code className="text-xs text-gray-400">{r[f.key]}</code>
                        </span>
                      ) : (
                        <span className={f.key === 'id' ? 'font-mono text-gray-400 text-xs' : ''}>
                          {String(r[f.key] ?? '—')}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {'is_active' in r && (
                        <button onClick={() => toggleActive(r)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white" title="Toggle active">
                          {r.is_active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        </button>
                      )}
                      <button onClick={() => { setEditing({ ...r }); setCreating(false); }} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => remove(r)} className="p-1.5 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{creating ? 'New' : 'Edit'} {tab.slice(0, -1)}</h3>
              <button onClick={() => { setEditing(null); setCreating(false); }} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              {FIELDS[tab].map((f) => (
                <div key={f.key} className={f.key === 'description' || f.key === 'criteria' ? 'col-span-2' : ''}>
                  <label className="text-[10px] uppercase text-gray-500 font-bold block mb-1">
                    {f.label}{f.required ? ' *' : ''}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
                      value={editing[f.key] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    >
                      {f.opts!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'check' ? (
                    <label className="flex items-center gap-2 mt-2 text-white text-sm">
                      <input
                        type="checkbox"
                        checked={!!editing[f.key]}
                        onChange={(e) => setEditing({ ...editing, [f.key]: e.target.checked })}
                      />
                      Yes
                    </label>
                  ) : f.type === 'color' ? (
                    <input
                      type="text"
                      placeholder="#FFFFFF"
                      className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 font-mono"
                      value={editing[f.key] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    />
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : 'text'}
                      disabled={!creating && f.key === 'id'}
                      className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                      value={editing[f.key] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [f.key]: f.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value })}
                    />
                  )}
                  {f.hint && <p className="text-[10px] text-gray-600 mt-1">{f.hint}</p>}
                </div>
              ))}
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl"
                onClick={() => { setEditing(null); setCreating(false); }}
                disabled={saving}
              >Cancel</button>
              <button
                className="flex-[2] bg-gradient-to-r from-cyan-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={save}
                disabled={saving}
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={16} />}
                {creating ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}