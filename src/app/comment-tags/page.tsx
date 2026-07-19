"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, Image as ImageIcon, Loader2, Plus, Tags, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { requireCurrentProjectStorageUrl } from '@/lib/storageUrls';

type CommentTag = {
  id: string;
  name: string;
  image_url: string;
  is_active: boolean;
  display_order: number;
};

const BUCKET = 'comment-tags';
const MAX_BYTES = 2 * 1024 * 1024;
const emptyTag: CommentTag = { id: '', name: '', image_url: '', is_active: true, display_order: 0 };

export default function CommentTagsPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  const [rows, setRows] = useState<CommentTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommentTag | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('comment_tags').select('*')
      .order('display_order').order('created_at');
    if (error) alert(`Could not load comment tags: ${error.message}`);
    setRows((data as CommentTag[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
    const channel = supabase.channel('admin-comment-tags')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_tags' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isSuperAdmin, load]);

  async function remove(row: CommentTag) {
    if (!window.confirm(`Delete “${row.name}”? It will also be removed from assigned users.`)) return;
    const { error } = await supabase.from('comment_tags').delete().eq('id', row.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const objectPath = row.image_url.includes(marker) ? row.image_url.split(marker)[1] : '';
    if (objectPath) await supabase.storage.from(BUCKET).remove([decodeURIComponent(objectPath)]);
  }

  if (roleLoading || !isSuperAdmin) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
            <Tags size={23} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Comment Tags</h1>
            <p className="text-xs text-gray-500">Upload permanent identity tags, then assign them from User Management</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptyTag }); setCreating(true); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold flex items-center gap-2"
        >
          <Plus size={18} /> Add Tag
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-emerald-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[#2b2750] bg-[#17152e] p-14 text-center text-gray-500">
          No comment tags yet. Upload a transparent PNG or WebP to begin.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl overflow-hidden border border-[#302b55] bg-[#17152e]">
              <div className="h-40 bg-[linear-gradient(45deg,#14152d_25%,#1d2040_25%,#1d2040_50%,#14152d_50%,#14152d_75%,#1d2040_75%)] bg-[length:20px_20px] p-4 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.image_url} alt={row.name} className="w-full h-full object-contain" />
                {!row.is_active && <span className="absolute top-3 right-3 rounded-lg bg-red-500/80 text-white text-[10px] font-bold px-2 py-1">DISABLED</span>}
              </div>
              <div className="p-4">
                <div className="font-bold text-white truncate">{row.name}</div>
                <div className="text-[10px] text-gray-500 mt-1">ID: {row.id} · Order: {row.display_order}</div>
                <div className="flex gap-2 mt-4">
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
        <TagModal row={editing} creating={creating} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function TagModal({ row, creating, onClose }: { row: CommentTag; creating: boolean; onClose: () => void }) {
  const [value, setValue] = useState(row);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const allowed = ['image/png', 'image/webp', 'image/jpeg'];
    if (!allowed.includes(file.type)) { alert('Upload a PNG, WebP or JPEG image.'); return; }
    if (file.size > MAX_BYTES) { alert('Tag image must be 2 MB or smaller.'); return; }
    setUploading(true);
    const ext = file.name.toLowerCase().split('.').pop() || 'png';
    const base = (value.id || value.name || 'tag').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag';
    const path = `${base}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type, cacheControl: '31536000', upsert: false,
    });
    setUploading(false);
    if (error) { alert(`Upload failed: ${error.message}`); return; }
    const url = requireCurrentProjectStorageUrl(
      supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      BUCKET,
    );
    setValue((current) => ({ ...current, image_url: url }));
  }

  async function save() {
    const id = value.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (!id || !value.name.trim() || !value.image_url) { alert('ID, name and tag image are required.'); return; }
    try { requireCurrentProjectStorageUrl(value.image_url, BUCKET); }
    catch (error) { alert(error instanceof Error ? error.message : 'Invalid tag URL.'); return; }
    setSaving(true);
    const payload = {
      id,
      name: value.name.trim(),
      image_url: value.image_url,
      is_active: value.is_active,
      display_order: Number(value.display_order) || 0,
      updated_at: new Date().toISOString(),
    };
    const { error } = creating
      ? await supabase.from('comment_tags').insert(payload)
      : await supabase.from('comment_tags').update(payload).eq('id', row.id);
    setSaving(false);
    if (error) { alert(`Save failed: ${error.message}`); return; }
    onClose();
  }

  const field = 'w-full rounded-xl border border-[#39325f] bg-[#0f1026] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-3xl border border-[#39325f] bg-[#18162f] overflow-hidden">
        <div className="p-5 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-black text-white">{creating ? 'Add Comment Tag' : `Edit ${row.name}`}</h2>
          <button onClick={onClose}><X className="text-gray-400" size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block text-xs text-gray-400">Tag ID
            <input className={`${field} mt-1`} disabled={!creating} value={value.id} onChange={(e) => setValue({ ...value, id: e.target.value })} placeholder="admin" />
          </label>
          <label className="block text-xs text-gray-400">Display name
            <input className={`${field} mt-1`} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} placeholder="Admin" />
          </label>
          <label className="block text-xs text-gray-400">Display order
            <input type="number" className={`${field} mt-1`} value={value.display_order} onChange={(e) => setValue({ ...value, display_order: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={value.is_active} onChange={(e) => setValue({ ...value, is_active: e.target.checked })} /> Available for assignment
          </label>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="w-full rounded-xl border border-dashed border-emerald-500/50 bg-[#0e1029] p-4 text-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50">
            {uploading ? <Loader2 className="animate-spin" size={17} /> : <Upload size={17} />} Upload tag image
          </button>
          <input ref={inputRef} hidden type="file" accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <p className="text-[10px] text-gray-500">Transparent PNG or WebP recommended. Maximum 2 MB.</p>
          <div className="h-32 rounded-xl bg-[#0e1029] border border-white/5 p-3 flex items-center justify-center">
            {value.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.image_url} alt="Tag preview" className="max-w-full max-h-full object-contain" />
            ) : <ImageIcon className="text-gray-700" size={32} />}
          </div>
        </div>
        <div className="p-5 bg-white/5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 text-white font-bold">Cancel</button>
          <button onClick={save} disabled={saving || uploading} className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={17} /> : <Tags size={17} />} Save Tag
          </button>
        </div>
      </div>
    </div>
  );
}
