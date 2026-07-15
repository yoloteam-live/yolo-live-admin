"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Crown, Edit2, Image as ImageIcon, Loader2, Plus, Trash2, Upload, Video, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { optimizeImageFile } from '@/lib/imageOptimizer';

type VipSubscription = {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  features: string[];
  intro_name: string;
  intro_thumbnail_url: string;
  intro_video_url: string;
  frame_name: string;
  frame_url: string;
  accent_color: string;
  is_active: boolean;
  display_order: number;
};

const INTRO_BUCKET = 'mall-intros';
const FRAME_BUCKET = 'profile-frames';
const MAX_IMAGE_BYTES = 180 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

const BUNDLED_THUMBS: Record<string, string> = {
  'bundled://football-cup.webp': '/mall/intro/football-cup.webp',
  'bundled://blue-roses.webp': '/mall/intro/blue-roses.webp',
};

const BUNDLED_FRAMES: Record<string, string> = {
  'bundled://heart-fantasy': '/profile-frames/heart-fantasy.webp',
  'bundled://angel-wing': '/profile-frames/angel-wing.webp',
  'bundled://royal-gold': '/profile-frames/royal-gold.webp',
};

const emptySubscription: VipSubscription = {
  id: '',
  name: '',
  price: 0,
  duration_days: 30,
  features: ['VIP badge', 'Color name', 'Entrance effect', 'VIP-only frame'],
  intro_name: '',
  intro_thumbnail_url: '',
  intro_video_url: '',
  frame_name: '',
  frame_url: '',
  accent_color: '#FBBF24',
  is_active: true,
  display_order: 0,
};

function previewUrl(url: string, bundled: Record<string, string>) {
  return bundled[url] || url;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
}

export default function VipSubscriptionsPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  const [rows, setRows] = useState<VipSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VipSubscription | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vip_subscriptions').select('*')
      .order('display_order').order('created_at');
    if (error) alert(`Could not load VIP subscriptions: ${error.message}`);
    setRows(((data as VipSubscription[]) || []).map((row) => ({
      ...row,
      features: Array.isArray(row.features) ? row.features : [],
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
    const channel = supabase.channel('admin-vip-subscriptions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vip_subscriptions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isSuperAdmin, load]);

  async function remove(row: VipSubscription) {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from('vip_subscriptions').delete().eq('id', row.id);
    if (error) alert(`Delete failed: ${error.message}`);
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-pink-600 flex items-center justify-center">
            <Crown size={23} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">VIP Subscriptions</h1>
            <p className="text-xs text-gray-500">VIP-only packages with subscription, frame and intro rewards</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptySubscription }); setCreating(true); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={18} /> Add Package
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-amber-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#2b2750] bg-[#17152e] p-14 text-center text-gray-500">
          No VIP subscriptions yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl overflow-hidden border border-[#302b55] bg-[#17152e]">
              <div className="p-4" style={{ background: `linear-gradient(135deg, ${row.accent_color || '#FBBF24'}33, transparent)` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-white text-lg">{row.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{row.price.toLocaleString()} 💎 · {row.duration_days} days · Order {row.display_order}</div>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${row.is_active ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
                    {row.is_active ? 'ACTIVE' : 'HIDDEN'}
                  </span>
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/5 bg-[#0e1029] p-3">
                  <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Frame</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl(row.frame_url, BUNDLED_FRAMES)} alt={row.frame_name} className="w-full aspect-square object-contain" />
                  <div className="text-white text-xs font-bold truncate mt-2">{row.frame_name || 'VIP Frame'}</div>
                </div>
                <div className="rounded-xl border border-white/5 bg-[#0e1029] p-3">
                  <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Intro</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl(row.intro_thumbnail_url, BUNDLED_THUMBS)} alt={row.intro_name} className="w-full aspect-square object-cover rounded-lg" />
                  <div className="text-white text-xs font-bold truncate mt-2">{row.intro_name || 'VIP Intro'}</div>
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {row.features.slice(0, 4).map((feature) => (
                    <span key={feature} className="rounded-lg bg-cyan-400/10 border border-cyan-300/10 text-cyan-100 text-[10px] font-bold px-2 py-1">{feature}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing({ ...row }); setCreating(false); }} className="flex-1 py-2 rounded-lg bg-white/5 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => remove(row)} className="p-2 rounded-lg bg-red-500/15 text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <VipSubscriptionModal
          row={editing}
          creating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function VipSubscriptionModal({ row, creating, onClose }: { row: VipSubscription; creating: boolean; onClose: () => void }) {
  const [value, setValue] = useState(row);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const thumbRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLInputElement>(null);

  function buildPath(file: File, kind: 'thumb' | 'video' | 'frame') {
    const base = slugify(value.id || value.name || 'vip-package') || 'vip-package';
    const ext = (file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'webp')).toLowerCase();
    return `${base}-${kind}-${Date.now()}.${ext}`;
  }

  async function uploadThumb(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Thumbnail must be JPG, PNG, or WebP.');
      return;
    }
    setUploading('thumb');
    const uploadFile = await optimizeImageFile(file, {
      maxWidth: 480,
      maxHeight: 640,
      quality: 0.76,
      outputType: 'image/webp',
      filenamePrefix: value.id || value.name || file.name,
    });
    if (uploadFile.size > MAX_IMAGE_BYTES) {
      setUploading('');
      alert('Thumbnail is still larger than 180 KB after optimization.');
      return;
    }
    const path = buildPath(uploadFile, 'thumb');
    const { error } = await supabase.storage.from(INTRO_BUCKET).upload(path, uploadFile, {
      contentType: uploadFile.type,
      cacheControl: '31536000',
      upsert: false,
    });
    setUploading('');
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = supabase.storage.from(INTRO_BUCKET).getPublicUrl(path).data.publicUrl;
    setValue((current) => ({ ...current, intro_thumbnail_url: url }));
  }

  async function uploadIntroVideo(file: File) {
    if (file.type !== 'video/mp4' || !/\.mp4$/i.test(file.name)) {
      alert('Intro video must be an optimized MP4 file.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      alert('Intro video must be 5 MB or smaller.');
      return;
    }
    setUploading('video');
    const path = buildPath(file, 'video');
    const { error } = await supabase.storage.from(INTRO_BUCKET).upload(path, file, {
      contentType: 'video/mp4',
      cacheControl: '31536000',
      upsert: false,
    });
    setUploading('');
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = supabase.storage.from(INTRO_BUCKET).getPublicUrl(path).data.publicUrl;
    setValue((current) => ({ ...current, intro_video_url: url }));
  }

  async function uploadFrame(file: File) {
    if (file.type !== 'image/webp' && !file.name.toLowerCase().endsWith('.webp')) {
      alert('Frame must be a WebP file.');
      return;
    }
    if (file.size > MAX_FRAME_BYTES) {
      alert('Frame must be 1 MB or smaller.');
      return;
    }
    setUploading('frame');
    const path = buildPath(file, 'frame');
    const { error } = await supabase.storage.from(FRAME_BUCKET).upload(path, file, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    setUploading('');
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = supabase.storage.from(FRAME_BUCKET).getPublicUrl(path).data.publicUrl;
    setValue((current) => ({ ...current, frame_url: url }));
  }

  function updateFeature(index: number, nextValue: string) {
    const next = [...value.features];
    if (nextValue === '') next.splice(index, 1);
    else next[index] = nextValue;
    setValue({ ...value, features: next });
  }

  async function save() {
    const id = slugify(value.id || value.name);
    if (!id || !value.name.trim() || !value.intro_thumbnail_url || !value.intro_video_url || !value.frame_url) {
      alert('ID, name, intro thumbnail, intro video, and frame are required.');
      return;
    }
    if (value.price < 0 || value.duration_days < 1) {
      alert('Price cannot be negative and duration must be at least 1 day.');
      return;
    }

    setSaving(true);
    const payload = {
      id,
      name: value.name.trim(),
      price: Number(value.price) || 0,
      duration_days: Number(value.duration_days) || 30,
      features: value.features.filter(Boolean),
      intro_name: value.intro_name.trim(),
      intro_thumbnail_url: value.intro_thumbnail_url.trim(),
      intro_video_url: value.intro_video_url.trim(),
      frame_name: value.frame_name.trim(),
      frame_url: value.frame_url.trim(),
      accent_color: value.accent_color || '#FBBF24',
      is_active: value.is_active,
      display_order: Number(value.display_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = creating
      ? await supabase.from('vip_subscriptions').insert(payload)
      : await supabase.from('vip_subscriptions').update(payload).eq('id', row.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onClose();
  }

  const busy = saving || !!uploading;
  const input = "w-full rounded-xl border border-[#39325f] bg-[#0f1026] px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#39325f] bg-[#18162f]">
        <div className="sticky top-0 bg-[#18162f] z-10 p-5 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-black text-white">{creating ? 'Add VIP Package' : `Edit ${row.name}`}</h2>
          <button onClick={onClose} disabled={busy}><X className="text-gray-400" size={20} /></button>
        </div>

        <div className="p-5 grid lg:grid-cols-[1.1fr_.9fr] gap-5">
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-400">Package ID
                <input className={`${input} mt-1`} disabled={!creating} value={value.id} onChange={(e) => setValue({ ...value, id: e.target.value })} placeholder="vip-royal-entry" />
              </label>
              <label className="block text-xs text-gray-400">Name
                <input className={`${input} mt-1`} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
              </label>
              <label className="block text-xs text-gray-400">Price
                <input type="number" min={0} className={`${input} mt-1`} value={value.price} onChange={(e) => setValue({ ...value, price: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label className="block text-xs text-gray-400">Duration days
                <input type="number" min={1} className={`${input} mt-1`} value={value.duration_days} onChange={(e) => setValue({ ...value, duration_days: Math.max(1, Number(e.target.value) || 1) })} />
              </label>
              <label className="block text-xs text-gray-400">Accent color
                <input className={`${input} mt-1 font-mono`} value={value.accent_color} onChange={(e) => setValue({ ...value, accent_color: e.target.value })} />
              </label>
              <label className="block text-xs text-gray-400">Display order
                <input type="number" className={`${input} mt-1`} value={value.display_order} onChange={(e) => setValue({ ...value, display_order: Number(e.target.value) || 0 })} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={value.is_active} onChange={(e) => setValue({ ...value, is_active: e.target.checked })} />
              Visible on native VIP page
            </label>

            <div>
              <div className="text-xs text-gray-400 mb-2">Features</div>
              <div className="space-y-2">
                {value.features.map((feature, index) => (
                  <input
                    key={index}
                    className={input}
                    value={feature}
                    onChange={(e) => updateFeature(index, e.target.value)}
                    placeholder="Empty to remove"
                  />
                ))}
              </div>
              <button onClick={() => setValue({ ...value, features: [...value.features, ''] })} className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1 mt-2">
                <Plus size={11} /> Add feature
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-400">Intro name
                <input className={`${input} mt-1`} value={value.intro_name} onChange={(e) => setValue({ ...value, intro_name: e.target.value })} />
              </label>
              <label className="block text-xs text-gray-400">Frame name
                <input className={`${input} mt-1`} value={value.frame_name} onChange={(e) => setValue({ ...value, frame_name: e.target.value })} />
              </label>
            </div>

            <label className="block text-xs text-gray-400">Intro thumbnail URL
              <input className={`${input} mt-1`} value={value.intro_thumbnail_url} onChange={(e) => setValue({ ...value, intro_thumbnail_url: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-400">Intro video URL
              <input className={`${input} mt-1`} value={value.intro_video_url} onChange={(e) => setValue({ ...value, intro_video_url: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-400">Frame URL
              <input className={`${input} mt-1`} value={value.frame_url} onChange={(e) => setValue({ ...value, frame_url: e.target.value })} />
            </label>
          </div>

          <div className="space-y-3">
            <button onClick={() => thumbRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-cyan-500/50 bg-[#0e1029] p-3 text-cyan-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploading === 'thumb' ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Upload intro thumbnail
            </button>
            <input ref={thumbRef} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={(e) => e.target.files?.[0] && uploadThumb(e.target.files[0])} />

            <button onClick={() => videoRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-violet-500/50 bg-[#0e1029] p-3 text-violet-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploading === 'video' ? <Loader2 className="animate-spin" size={16} /> : <Video size={16} />}
              Upload intro video
            </button>
            <input ref={videoRef} hidden type="file" accept=".mp4,video/mp4" onChange={(e) => e.target.files?.[0] && uploadIntroVideo(e.target.files[0])} />

            <button onClick={() => frameRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-pink-500/50 bg-[#0e1029] p-3 text-pink-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploading === 'frame' ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />}
              Upload frame WebP
            </button>
            <input ref={frameRef} hidden type="file" accept=".webp,image/webp" onChange={(e) => e.target.files?.[0] && uploadFrame(e.target.files[0])} />

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl overflow-hidden border border-[#39325f] bg-[#0e1029] p-3">
                <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Frame Preview</div>
                {value.frame_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl(value.frame_url, BUNDLED_FRAMES)} alt="Frame preview" className="w-full aspect-square object-contain" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-gray-600"><ImageIcon size={38} /></div>
                )}
              </div>
              <div className="rounded-2xl overflow-hidden border border-[#39325f] bg-[#0e1029] p-3">
                <div className="text-[10px] uppercase font-bold text-gray-500 mb-2">Intro Preview</div>
                {value.intro_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl(value.intro_thumbnail_url, BUNDLED_THUMBS)} alt="Intro preview" className="w-full aspect-square object-cover rounded-xl" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-gray-600"><Video size={38} /></div>
                )}
              </div>
            </div>

            <p className="text-[11px] leading-5 text-gray-500">
              VIP package assets are stored here only. They are not inserted into the Mall Intro or Profile Frame tabs.
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 disabled:opacity-50">Cancel</button>
          <button disabled={busy} onClick={save} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-600 text-white font-bold disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Save Package
          </button>
        </div>
      </div>
    </div>
  );
}
