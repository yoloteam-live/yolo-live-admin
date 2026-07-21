"use client";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadAdminMedia } from '@/lib/adminMediaUpload';
import {
  Sparkles, Plus, Trash2, Upload, Loader2, X, Calendar, Eye,
  CheckCircle2, XCircle, Image as ImageIcon, FileJson, Clock,
  Star, Edit3, Save,
} from 'lucide-react';

type MediaType = 'image' | 'lottie';

type Splash = {
  id: string;
  title: string;
  media_url: string;
  media_type: MediaType;
  duration_ms: number;
  background_color: string;
  active_from: string | null;
  active_until: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

// Inline Lottie player loaded only on demand so the page bundle stays
// small — the admin doesn't need lottie until they open a preview.
function LottiePreview({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // null while loading, then either 'ok' or an error message string.
  // We render a visible failure state inside the preview tile when the
  // fetch / lottie-web parse fails so the admin sees "Preview failed"
  // instead of an unexplained blank card.
  const [status, setStatus] = useState<null | 'ok' | string>(null);
  useEffect(() => {
    let player: any;
    let cancelled = false;
    setStatus(null);
    (async () => {
      try {
        const lottie = (await import('lottie-web')).default;
        if (cancelled || !ref.current) return;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled || !ref.current) return;
        player = lottie.loadAnimation({
          container: ref.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: json,
        });
        setStatus('ok');
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || 'Failed to load Lottie';
        // eslint-disable-next-line no-console
        console.warn('Lottie preview failed:', url, '→', msg);
        setStatus(msg);
      }
    })();
    return () => { cancelled = true; try { player?.destroy(); } catch (_) {} };
  }, [url]);
  return (
    <div ref={ref} className="w-full h-full relative">
      {status && status !== 'ok' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-500/10 text-rose-300 text-[10px] p-2 text-center">
          <span className="font-bold mb-0.5">⚠ Preview failed</span>
          <span className="opacity-70 break-all">{status}</span>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM: Partial<Splash> = {
  title: '',
  media_url: '',
  media_type: 'image',
  duration_ms: 2000,
  background_color: '#0F091E',
  active_from: null,
  active_until: null,
  is_active: true,
  priority: 0,
};

export default function SplashPage() {
  const [rows, setRows]         = useState<Splash[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<Partial<Splash> | null>(null);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<Splash | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-app-splashes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_splashes' }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('app_splashes')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    setRows((data as Splash[]) || []);
    setLoading(false);
  }

  async function uploadFile(file: File): Promise<{ url: string; type: MediaType } | null> {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const type: MediaType = ext === 'json' ? 'lottie' : 'image';
      const allowedImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      if (type === 'image' && !allowedImage) {
        alert('Only PNG, JPG, WebP, or Lottie JSON files are accepted.');
        return null;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Splash media must be 5 MB or smaller.');
        return null;
      }

      let uploadFile = file;
      if (type === 'lottie') {
        try {
          JSON.parse(await file.text());
        } catch {
          alert('The selected Lottie file is not valid JSON.');
          return null;
        }
        if (file.type !== 'application/json') {
          uploadFile = new File([file], file.name, { type: 'application/json' });
        }
      }

      const url = await uploadAdminMedia({
        bucket: 'splashes',
        moduleKey: 'splash',
        file: uploadFile,
        cacheControl: '3600',
      });
      return { url, type };
    } catch (error: unknown) {
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown upload error'));
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadFile(file);
      if (!result || !editing) return;
      setEditing({ ...editing, media_url: result.url, media_type: result.type });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function save() {
    if (!editing) return;
    if (!editing.title?.trim())     { alert('Title is required.');     return; }
    if (!editing.media_url?.trim()) { alert('Upload an image or Lottie first.'); return; }
    if (editing.active_from && editing.active_until &&
        new Date(editing.active_from) >= new Date(editing.active_until)) {
      alert('Active-from must be earlier than active-until.');
      return;
    }
    setSaving(true);
    const payload = {
      title:            editing.title,
      media_url:        editing.media_url,
      media_type:       editing.media_type,
      duration_ms:      editing.duration_ms ?? 2000,
      background_color: editing.background_color ?? '#0F091E',
      active_from:      editing.active_from || null,
      active_until:     editing.active_until || null,
      is_active:        editing.is_active ?? true,
      priority:         editing.priority ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from('app_splashes').update(payload).eq('id', editing.id)
      : await supabase.from('app_splashes').insert(payload);
    setSaving(false);
    if (error) { alert('Save failed: ' + error.message); return; }
    setEditing(null);
  }

  async function toggleActive(s: Splash) {
    const { error } = await supabase.from('app_splashes')
      .update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) alert('Failed: ' + error.message);
  }

  async function remove(s: Splash) {
    if (!confirm(`Delete "${s.title}"? This won't delete the uploaded file from Storage.`)) return;
    const { error } = await supabase.from('app_splashes').delete().eq('id', s.id);
    if (error) alert('Failed: ' + error.message);
  }

  function statusOf(s: Splash): { label: string; tone: 'live' | 'scheduled' | 'past' | 'off' } {
    if (!s.is_active) return { label: 'Disabled', tone: 'off' };
    const now = Date.now();
    const from = s.active_from ? new Date(s.active_from).getTime() : -Infinity;
    const until = s.active_until ? new Date(s.active_until).getTime() : Infinity;
    if (now < from)  return { label: 'Scheduled', tone: 'scheduled' };
    if (now > until) return { label: 'Expired',   tone: 'past' };
    return { label: 'Live now', tone: 'live' };
  }

  function toneClasses(t: 'live' | 'scheduled' | 'past' | 'off') {
    if (t === 'live')      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (t === 'scheduled') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (t === 'past')      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    return 'bg-white/5 text-gray-400 border-white/10';
  }

  function fmtDate(s: string | null) {
    if (!s) return '—';
    // Force en-GB for a stable DD MMM YYYY · HH:mm format across every
    // admin's browser locale. The old `undefined` locale meant a US
    // admin saw "Jun 7, 2026, 3:04 PM" while a UK admin saw "7 Jun 2026
    // at 15:04" for the same row — confusing when shift handovers
    // compare timestamps across timezones.
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center">
            <Sparkles className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Splash Manager</h1>
            <p className="text-xs text-gray-500">Seasonal artwork the mobile app shows right after launch. No rebuild needed.</p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY_FORM })}
          className="bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 hover:scale-[1.02] shadow-lg shadow-fuchsia-500/20"
        >
          <Plus size={16} /> New splash
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-fuchsia-500" size={32} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <Sparkles className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-400 mb-1 font-bold">No splash configured</p>
          <p className="text-gray-500 text-sm">Tap "New splash" to upload your first seasonal artwork.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((s) => {
            const status = statusOf(s);
            return (
              <div key={s.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
                {/* Preview thumb */}
                <div className="relative h-48 overflow-hidden" style={{ background: s.background_color }}>
                  {s.media_type === 'lottie' ? (
                    <LottiePreview url={s.media_url} />
                  ) : (
                    // Plain img — Next/Image needs domain config we'd rather not add per-env.
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={s.media_url} alt={s.title} className="w-full h-full object-cover" />
                  )}
                  <span className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-md border ${toneClasses(status.tone)}`}>
                    {status.label}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-white font-bold truncate">{s.title}</p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                        {s.media_type === 'lottie' ? <FileJson size={10} /> : <ImageIcon size={10} />}
                        {s.media_type} · {s.duration_ms}ms
                        {s.priority > 0 && <><span className="mx-1">·</span><Star size={10} /> priority {s.priority}</>}
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 space-y-0.5 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={10} /> From: {fmtDate(s.active_from)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} /> Until: {fmtDate(s.active_until)}
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPreviewing(s)}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <button
                      onClick={() => setEditing(s)}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1"
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => toggleActive(s)}
                      className={`p-2 rounded-lg ${s.is_active ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-gray-500 hover:bg-white/5'}`}
                      title={s.is_active ? 'Disable' : 'Enable'}
                    >
                      {s.is_active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-rose-400/10 hover:text-rose-400"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <h3 className="text-lg font-black text-white">{editing.id ? 'Edit splash' : 'New splash'}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Preview */}
              <div className="rounded-2xl overflow-hidden h-40 border border-white/10 flex items-center justify-center" style={{ background: editing.background_color || '#0F091E' }}>
                {editing.media_url ? (
                  editing.media_type === 'lottie'
                    ? <LottiePreview url={editing.media_url} />
                    /* eslint-disable-next-line @next/next/no-img-element */
                    : <img src={editing.media_url} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <p className="text-gray-500 text-sm flex items-center gap-2">
                    <ImageIcon size={16} /> Upload an image or Lottie to preview
                  </p>
                )}
              </div>

              {/* Upload */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                  {editing.media_url ? 'Replace media' : 'Upload PNG / JPG / Lottie JSON'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/json"
                  className="hidden"
                  onChange={handleFilePick}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Title</label>
                  <input
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500"
                    value={editing.title || ''}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    placeholder="e.g. Eid 2026"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Duration (ms)</label>
                  <input
                    type="number" min={500} max={6000} step={100}
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500"
                    value={editing.duration_ms ?? 2000}
                    onChange={(e) => setEditing({ ...editing, duration_ms: parseInt(e.target.value) || 2000 })}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Background color</label>
                  <div className="flex gap-2 items-center">
                    <div className="w-9 h-9 rounded-lg border border-white/10" style={{ background: editing.background_color }} />
                    <input
                      className="flex-1 bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500 font-mono"
                      value={editing.background_color || '#0F091E'}
                      onChange={(e) => setEditing({ ...editing, background_color: e.target.value })}
                      placeholder="#0F091E"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Priority</label>
                  <input
                    type="number"
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500"
                    value={editing.priority ?? 0}
                    onChange={(e) => setEditing({ ...editing, priority: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-[9px] text-gray-600 mt-0.5">Higher wins when multiple match.</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Active from</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500"
                    value={editing.active_from ? editing.active_from.slice(0, 16) : ''}
                    onChange={(e) => setEditing({ ...editing, active_from: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  <p className="text-[9px] text-gray-600 mt-0.5">Empty = always on (from start).</p>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 font-bold">Active until</label>
                  <input
                    type="datetime-local"
                    className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-500"
                    value={editing.active_until ? editing.active_until.slice(0, 16) : ''}
                    onChange={(e) => setEditing({ ...editing, active_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  <p className="text-[9px] text-gray-600 mt-0.5">Empty = never expires.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                />
                Active (uncheck to disable without deleting)
              </label>
            </div>

            <div className="p-5 bg-white/5 flex gap-3 border-t border-white/5">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || uploading}
                className="flex-[2] bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-fuchsia-500/20"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={16} />}
                {editing.id ? 'Save changes' : 'Create splash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setPreviewing(null)}>
          <div
            className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ width: 270, height: 540, background: previewing.background_color }}
            onClick={(e) => e.stopPropagation()}
          >
            {previewing.media_type === 'lottie'
              ? <LottiePreview url={previewing.media_url} />
              /* eslint-disable-next-line @next/next/no-img-element */
              : <img src={previewing.media_url} alt={previewing.title} className="w-full h-full object-cover" />
            }
          </div>
        </div>
      )}
    </div>
  );
}
