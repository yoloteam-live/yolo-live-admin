"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Edit2, Image as ImageIcon, Loader2, Plus, Trash2, ToggleLeft, ToggleRight, Upload, Video, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { optimizeImageFile } from '@/lib/imageOptimizer';

type IntroRow = {
  id: string;
  name: string;
  thumbnail_url: string;
  video_url: string;
  diamond_cost: number;
  is_active: boolean;
  display_order: number;
  duration_ms?: number | null;
  file_size_bytes?: number | null;
  video_width?: number | null;
  video_height?: number | null;
  video_mime_type?: string | null;
};

const BUCKET = 'mall-intros';
const MAX_IMAGE_BYTES = 180 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;
const MIN_INTRO_DURATION_SECONDS = 7.5;
const MAX_INTRO_DURATION_SECONDS = 8.5;
const MAX_INTRO_WIDTH = 720;
const MAX_INTRO_HEIGHT = 1280;
const BUNDLED_THUMBS: Record<string, string> = {
  'bundled://football-cup.webp': '/mall/intro/football-cup.webp',
  'bundled://blue-roses.webp': '/mall/intro/blue-roses.webp',
};

const emptyIntro: IntroRow = {
  id: '',
  name: '',
  thumbnail_url: '',
  video_url: '',
  diamond_cost: 0,
  is_active: true,
  display_order: 0,
  duration_ms: 8000,
  file_size_bytes: null,
  video_width: null,
  video_height: null,
  video_mime_type: null,
};

function previewUrl(url: string) {
  return BUNDLED_THUMBS[url] || url;
}

function loadVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(metadata);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video metadata. Please upload a valid MP4.'));
    };
    video.src = url;
  });
}

export default function MallIntrosPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  const [rows, setRows] = useState<IntroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<IntroRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('mall_intro_items').select('*')
      .order('display_order').order('created_at');
    if (error) alert(`Could not load intro items: ${error.message}`);
    setRows((data as IntroRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
    const channel = supabase.channel('admin-mall-intros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mall_intro_items' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isSuperAdmin, load]);

  async function toggleActive(row: IntroRow) {
    const { error } = await supabase.from('mall_intro_items')
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) alert(`Update failed: ${error.message}`);
  }

  async function remove(row: IntroRow) {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from('mall_intro_items').delete().eq('id', row.id);
    if (error) alert(`Delete failed: ${error.message}`);
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center">
            <Video size={23} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Mall Intros</h1>
            <p className="text-xs text-gray-500">Intro animations shown in the app Mall Intro tab</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptyIntro }); setCreating(true); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={18} /> Add Intro
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-cyan-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#2b2750] bg-[#17152e] p-14 text-center text-gray-500">
          No intro items yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl overflow-hidden border border-[#302b55] bg-[#17152e]">
              <div className="aspect-[3/4] bg-[#0e1029] relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl(row.thumbnail_url)} alt={row.name} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 right-3 flex justify-between">
                  <span className="rounded-lg bg-violet-600/80 text-white text-[10px] font-bold px-2 py-1">
                    {row.diamond_cost === 0 ? 'FREE' : `${row.diamond_cost.toLocaleString()} 💎`}
                  </span>
                  {!row.is_active && <span className="rounded-lg bg-red-500/80 text-white text-[10px] font-bold px-2 py-1">HIDDEN</span>}
                </div>
              </div>
              <div className="p-4">
                <div className="font-bold text-white truncate">{row.name}</div>
                <div className="text-[10px] text-gray-500 mt-1">ID: {row.id} · Order: {row.display_order}</div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setEditing({ ...row }); setCreating(false); }} className="flex-1 py-2 rounded-lg bg-white/5 text-white text-xs font-bold flex items-center justify-center gap-1.5">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => toggleActive(row)} className={`p-2 rounded-lg ${row.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-gray-700/30 text-gray-500'}`}>
                    {row.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                  </button>
                  <button onClick={() => remove(row)} className="p-2 rounded-lg bg-red-500/15 text-red-300"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <IntroModal
          row={editing}
          creating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function IntroModal({ row, creating, onClose }: { row: IntroRow; creating: boolean; onClose: () => void }) {
  const [value, setValue] = useState(row);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const thumbRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  function buildPath(file: File, kind: 'thumb' | 'video') {
    const base = (value.id || value.name || 'intro').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'intro';
    const ext = (file.name.split('.').pop() || (kind === 'thumb' ? 'webp' : 'mp4')).toLowerCase();
    return `${base}-${kind}-${Date.now()}.${ext}`;
  }

  async function upload(file: File, kind: 'thumb' | 'video') {
    const isThumb = kind === 'thumb';
    const okType = isThumb
      ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      : file.type === 'video/mp4' && /\.mp4$/i.test(file.name);
    if (!okType) {
      alert(isThumb ? 'Thumbnail must be JPG, PNG, or WebP.' : 'Intro video must be an optimized MP4 file.');
      return;
    }
    let uploadFile = file;
    if (isThumb) {
      uploadFile = await optimizeImageFile(file, {
        maxWidth: 480,
        maxHeight: 640,
        quality: 0.76,
        outputType: 'image/webp',
        filenamePrefix: value.id || value.name || file.name,
      });
    }
    if (uploadFile.size > (isThumb ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
      alert(isThumb ? 'Thumbnail is still larger than 180 KB after optimization. Please use a simpler image.' : 'Intro video must be 5 MB or smaller.');
      return;
    }
    let videoMetadata: { duration: number; width: number; height: number } | null = null;
    if (!isThumb) {
      try {
        videoMetadata = await loadVideoMetadata(file);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not read video metadata.');
        return;
      }
      if (videoMetadata.duration < MIN_INTRO_DURATION_SECONDS || videoMetadata.duration > MAX_INTRO_DURATION_SECONDS) {
        alert(`Intro video must be about 8 seconds (${MIN_INTRO_DURATION_SECONDS}-${MAX_INTRO_DURATION_SECONDS}s). This file is ${videoMetadata.duration.toFixed(2)}s.`);
        return;
      }
      if (videoMetadata.width > MAX_INTRO_WIDTH || videoMetadata.height > MAX_INTRO_HEIGHT) {
        alert(`Intro video must be ${MAX_INTRO_WIDTH}x${MAX_INTRO_HEIGHT} or smaller. This file is ${videoMetadata.width}x${videoMetadata.height}.`);
        return;
      }
    }
    const setUploading = isThumb ? setUploadingThumb : setUploadingVideo;
    setUploading(true);
    const path = buildPath(uploadFile, kind);
    const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, {
      contentType: isThumb ? uploadFile.type : 'video/mp4',
      cacheControl: '31536000',
      upsert: false,
    });
    setUploading(false);
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    setValue((current) => isThumb ? { ...current, thumbnail_url: url } : {
      ...current,
      video_url: url,
      duration_ms: Math.round((videoMetadata?.duration || 8) * 1000),
      file_size_bytes: uploadFile.size,
      video_width: videoMetadata?.width || null,
      video_height: videoMetadata?.height || null,
      video_mime_type: 'video/mp4',
    });
  }

  async function save() {
    const id = value.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!id || !value.name.trim() || !value.thumbnail_url || !value.video_url) {
      alert('ID, name, thumbnail and video are required.');
      return;
    }
    if (value.diamond_cost < 0) { alert('Price cannot be negative.'); return; }
    setSaving(true);
    const payload = {
      id,
      name: value.name.trim(),
      thumbnail_url: value.thumbnail_url,
      video_url: value.video_url,
      diamond_cost: Number(value.diamond_cost) || 0,
      display_order: Number(value.display_order) || 0,
      is_active: value.is_active,
      duration_ms: value.duration_ms || 8000,
      file_size_bytes: value.file_size_bytes || null,
      video_width: value.video_width || null,
      video_height: value.video_height || null,
      video_mime_type: value.video_mime_type || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = creating
      ? await supabase.from('mall_intro_items').insert(payload)
      : await supabase.from('mall_intro_items').update(payload).eq('id', row.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onClose();
  }

  const busy = saving || uploadingThumb || uploadingVideo;
  const input = "w-full rounded-xl border border-[#39325f] bg-[#0f1026] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[#39325f] bg-[#18162f]">
        <div className="sticky top-0 bg-[#18162f] z-10 p-5 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-black text-white">{creating ? 'Add Intro' : `Edit ${row.name}`}</h2>
          <button onClick={onClose} disabled={busy}><X className="text-gray-400" size={20} /></button>
        </div>
        <div className="p-5 grid md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <label className="block text-xs text-gray-400">Intro ID
              <input className={`${input} mt-1`} disabled={!creating} value={value.id} onChange={(e) => setValue({ ...value, id: e.target.value })} placeholder="golden-entrance" />
            </label>
            <label className="block text-xs text-gray-400">Name
              <input className={`${input} mt-1`} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-gray-400">Diamond price
                <input type="number" min={0} className={`${input} mt-1`} value={value.diamond_cost} onChange={(e) => setValue({ ...value, diamond_cost: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label className="block text-xs text-gray-400">Display order
                <input type="number" className={`${input} mt-1`} value={value.display_order} onChange={(e) => setValue({ ...value, display_order: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={value.is_active} onChange={(e) => setValue({ ...value, is_active: e.target.checked })} />
              Visible in app Intro tab
            </label>
            <label className="block text-xs text-gray-400">Thumbnail URL
              <input className={`${input} mt-1`} value={value.thumbnail_url} onChange={(e) => setValue({ ...value, thumbnail_url: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-400">Video URL
              <input className={`${input} mt-1`} value={value.video_url} onChange={(e) => setValue({ ...value, video_url: e.target.value })} />
            </label>
          </div>
          <div className="space-y-3">
            <button onClick={() => thumbRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-cyan-500/50 bg-[#0e1029] p-3 text-cyan-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploadingThumb ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Upload thumbnail
            </button>
            <input ref={thumbRef} hidden type="file" accept=".jpg,.jpeg,.png,.webp,image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'thumb')} />

            <button onClick={() => videoRef.current?.click()} disabled={busy} className="w-full rounded-2xl border border-dashed border-violet-500/50 bg-[#0e1029] p-3 text-violet-100 flex items-center justify-center gap-2 disabled:opacity-50">
              {uploadingVideo ? <Loader2 className="animate-spin" size={16} /> : <Video size={16} />}
              Upload intro video
            </button>
            <input ref={videoRef} hidden type="file" accept=".mp4,video/mp4" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'video')} />
            <p className="text-[11px] leading-5 text-gray-500">
              MP4 only. 7.5-8.5s, max 5 MB, max 720x1280, H.264/AAC recommended.
            </p>
            {value.video_url && (
              <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[11px] text-gray-400">
                <div>Duration: {value.duration_ms ? `${(value.duration_ms / 1000).toFixed(2)}s` : 'unknown'}</div>
                <div>Size: {value.file_size_bytes ? `${(value.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : 'unknown'}</div>
                <div>Resolution: {value.video_width && value.video_height ? `${value.video_width}x${value.video_height}` : 'unknown'}</div>
              </div>
            )}

            <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-[#0e1029] border border-[#39325f]">
              {value.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl(value.thumbnail_url)} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600"><ImageIcon size={44} /></div>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-xl bg-white/5 text-gray-300 disabled:opacity-50">Cancel</button>
          <button disabled={busy} onClick={save} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-bold disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Save Intro
          </button>
        </div>
      </div>
    </div>
  );
}
