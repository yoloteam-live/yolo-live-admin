"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { requireCurrentProjectStorageUrl } from '@/lib/storageUrls';

type FrameRow = {
  id: string;
  name: string;
  frame_url: string;
  diamond_cost: number;
  is_active: boolean;
  display_order: number;
  validity_days: number;
  access_scope: 'public' | 'admin_only';
};

const BUCKET = 'profile-frames';
const MAX_FRAME_BYTES = 1024 * 1024;
const BUNDLED_PREVIEWS: Record<string, string> = {
  'bundled://heart-fantasy': '/profile-frames/heart-fantasy.webp',
  'bundled://angel-wing': '/profile-frames/angel-wing.webp',
  'bundled://royal-gold': '/profile-frames/royal-gold.webp',
};
const emptyFrame: FrameRow = {
  id: '', name: '', frame_url: '', diamond_cost: 0, is_active: true, display_order: 0, validity_days: 7, access_scope: 'public',
};

function framePreviewUrl(frameUrl: string) {
  return BUNDLED_PREVIEWS[frameUrl] || frameUrl;
}

export default function ProfileFramesPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  const [rows, setRows] = useState<FrameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FrameRow | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profile_frames').select('*')
      .order('display_order').order('created_at');
    if (error) alert(`Could not load frames: ${error.message}`);
    setRows((data as FrameRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
    const channel = supabase.channel('admin-profile-frames')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_frames' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isSuperAdmin, load]);

  async function remove(frame: FrameRow) {
    if (!window.confirm(`Delete "${frame.name}"?`)) return;
    const { error } = await supabase.from('profile_frames').delete().eq('id', frame.id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const objectPath = frame.frame_url.includes(marker) ? frame.frame_url.split(marker)[1] : '';
    if (objectPath) await supabase.storage.from(BUCKET).remove([decodeURIComponent(objectPath)]);
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center">
            <ImageIcon size={23} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Profile Frames</h1>
            <p className="text-xs text-gray-500">Animated WebP frames, pricing and Mall availability</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptyFrame }); setCreating(true); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={18} /> Add Frame
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-fuchsia-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#2b2750] bg-[#17152e] p-14 text-center text-gray-500">
          No profile frames yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map((frame) => (
            <div key={frame.id} className="rounded-2xl overflow-hidden border border-[#302b55] bg-[#17152e]">
              <div className="aspect-square bg-[#0e1029] p-3 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={framePreviewUrl(frame.frame_url)} alt={frame.name} className="w-full h-full object-contain" />
                <div className="absolute top-3 left-3 right-3 flex justify-between">
                  <span className="rounded-lg bg-violet-600/80 text-white text-[10px] font-bold px-2 py-1">
                    {frame.diamond_cost === 0 ? 'FREE' : `${frame.diamond_cost.toLocaleString()} 💎`}
                  </span>
                  {!frame.is_active && <span className="rounded-lg bg-red-500/80 text-white text-[10px] font-bold px-2 py-1">HIDDEN</span>}
                </div>
              </div>
              <div className="p-4">
                <div className="font-bold text-white truncate">{frame.name}</div>
                <div className="text-[10px] text-gray-500 mt-1">ID: {frame.id} · Order: {frame.display_order}</div>
                <div className="text-[10px] text-violet-300 mt-1">{frame.validity_days || 7} days · {frame.access_scope === 'admin_only' ? 'Exclusive' : 'Public'}</div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setEditing({ ...frame }); setCreating(false); }} className="flex-1 py-2 rounded-lg bg-white/5 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => remove(frame)} className="p-2 rounded-lg bg-red-500/15 text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <FrameModal
          row={editing}
          creating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function FrameModal({ row, creating, onClose }: { row: FrameRow; creating: boolean; onClose: () => void }) {
  const [value, setValue] = useState(row);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.type !== 'image/webp' && !file.name.toLowerCase().endsWith('.webp')) {
      alert('Only WebP files are accepted.');
      return;
    }
    if (file.size > MAX_FRAME_BYTES) {
      alert('Frame must be 1 MB or smaller. Please compress the animated WebP before uploading.');
      return;
    }
    setUploading(true);
    const base = (value.id || value.name || 'frame').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const path = `${base}-${Date.now()}.webp`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    setUploading(false);
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = requireCurrentProjectStorageUrl(
      supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      BUCKET,
    );
    setValue((current) => ({ ...current, frame_url: url }));
  }

  async function save() {
    const id = value.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!id || !value.name.trim() || !value.frame_url) {
      alert('ID, name and WebP frame are required.');
      return;
    }
    try { requireCurrentProjectStorageUrl(value.frame_url, BUCKET); }
    catch (error) { alert(error instanceof Error ? error.message : 'Invalid frame URL.'); return; }
    if (value.diamond_cost < 0) { alert('Price cannot be negative.'); return; }
    setSaving(true);
    const payload = {
      id, name: value.name.trim(), frame_url: value.frame_url,
      diamond_cost: Number(value.diamond_cost) || 0,
      display_order: Number(value.display_order) || 0,
      is_active: value.is_active,
      validity_days: Math.max(1, Number(value.validity_days) || 7),
      access_scope: value.access_scope || 'public',
      updated_at: new Date().toISOString(),
    };
    const { error } = creating
      ? await supabase.from('profile_frames').insert(payload)
      : await supabase.from('profile_frames').update(payload).eq('id', row.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onClose();
  }

  const input = "w-full rounded-xl border border-[#39325f] bg-[#0f1026] px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500";
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#39325f] bg-[#18162f]">
        <div className="sticky top-0 bg-[#18162f] z-10 p-5 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-black text-white">{creating ? 'Add Profile Frame' : `Edit ${row.name}`}</h2>
          <button onClick={onClose}><X className="text-gray-400" size={20} /></button>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <label className="block text-xs text-gray-400">Frame ID
              <input className={`${input} mt-1`} disabled={!creating} value={value.id} onChange={(e) => setValue({ ...value, id: e.target.value })} placeholder="royal-gold" />
            </label>
            <label className="block text-xs text-gray-400">Ownership duration (days)
              <input type="number" min={1} className={`${input} mt-1`} value={value.validity_days || 7} onChange={(e) => setValue({ ...value, validity_days: Number(e.target.value) })} />
            </label>
            <label className="block text-xs text-gray-400">Access
              <select className={`${input} mt-1`} value={value.access_scope || 'public'} onChange={(e) => setValue({ ...value, access_scope: e.target.value as 'public'|'admin_only' })}>
                <option value="public">Public shop</option><option value="admin_only">Admin-only exclusive</option>
              </select>
            </label>
            <label className="block text-xs text-gray-400">Name
              <input className={`${input} mt-1`} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-400">Diamond price
              <input type="number" min={0} className={`${input} mt-1`} value={value.diamond_cost} onChange={(e) => setValue({ ...value, diamond_cost: Number(e.target.value) })} />
            </label>
            <label className="block text-xs text-gray-400">Display order
              <input type="number" className={`${input} mt-1`} value={value.display_order} onChange={(e) => setValue({ ...value, display_order: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={value.is_active} onChange={(e) => setValue({ ...value, is_active: e.target.checked })} />
              Visible in Mall
            </label>
          </div>
          <div>
            <button onClick={() => inputRef.current?.click()} className="w-full aspect-square rounded-2xl border border-dashed border-fuchsia-500/50 bg-[#0e1029] flex items-center justify-center overflow-hidden">
              {value.frame_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={framePreviewUrl(value.frame_url)} alt="Preview" className="w-full h-full object-contain" />
                : <span className="text-gray-500 flex flex-col items-center gap-2"><Upload />Upload animated WebP</span>}
            </button>
            <input ref={inputRef} hidden type="file" accept=".webp,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <p className="text-[10px] text-gray-500 mt-2">Animated WebP only · maximum 1 MB</p>
          </div>
        </div>
        <div className="p-5 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300">Cancel</button>
          <button disabled={saving || uploading} onClick={save} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white font-bold disabled:opacity-50">
            {saving || uploading ? 'Working…' : 'Save Frame'}
          </button>
        </div>
      </div>
    </div>
  );
}
