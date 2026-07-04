"use client";
import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { optimizeImageFile } from '@/lib/imageOptimizer';
import {
  Image as ImageIcon, Plus, Edit2, Trash2, Loader2, X, Upload, Diamond,
  CheckCircle2, ToggleLeft, ToggleRight,
} from 'lucide-react';

type TemplateRow = {
  id: string;
  name: string;
  background_url: string;
  preview_url: string | null;
  diamond_cost: number;
  is_active: boolean;
  display_order: number;
};

const emptyTemplate: TemplateRow = {
  id: '',
  name: '',
  background_url: '',
  preview_url: '',
  diamond_cost: 0,
  is_active: true,
  display_order: 0,
};

const BUCKET = 'audio-templates';
const MAX_UPLOAD_BYTES = 280 * 1024;

export default function AudioTemplatesPage() {
  // Super-admin only. Manager can't tweak monetisation surfaces.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audio_templates')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    setRows((data as TemplateRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void Promise.resolve().then(load);
    const ch = supabase
      .channel('admin-audio-templates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_templates' }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [isSuperAdmin, load]);

  if (roleLoading || !isSuperAdmin) return null;

  async function toggleActive(t: TemplateRow) {
    const { error } = await supabase
      .from('audio_templates')
      .update({ is_active: !t.is_active })
      .eq('id', t.id);
    if (error) alert('Failed: ' + error.message);
  }

  async function removeRow(t: TemplateRow) {
    if (!window.confirm(`Delete "${t.name}"? Hosts who already bought this template will keep their ownership row but won't be able to apply the background.`)) return;
    const { error } = await supabase.from('audio_templates').delete().eq('id', t.id);
    if (error) alert('Failed: ' + error.message);
  }

  const filtered = rows.filter((r) => {
    if (filter === 'free') return r.diamond_cost === 0;
    if (filter === 'paid') return r.diamond_cost > 0;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <ImageIcon className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Audio Room Templates</h1>
            <p className="text-xs text-gray-500">Static background images hosts can apply to their audio live rooms — free or paid in diamonds</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptyTemplate }); setCreating(true); }}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-lg shadow-pink-500/20 transition-all"
        >
          <Plus size={18} /> New Template
        </button>
      </div>

      <div className="flex gap-2 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1 mb-4 w-fit">
        {(['all', 'free', 'paid'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              filter === f ? 'bg-pink-500/20 text-pink-300' : 'text-gray-500 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-pink-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <ImageIcon className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No templates yet — upload one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => {
            const thumb = t.preview_url || t.background_url;
            return (
              <div key={t.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden hover:border-pink-500/40 transition-all">
                <div className="aspect-[3/4] bg-black/40 relative">
                  {thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={thumb} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={36} className="text-gray-700" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      t.diamond_cost === 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {t.diamond_cost === 0 ? 'FREE' : `${t.diamond_cost.toLocaleString()} 💎`}
                    </span>
                    {!t.is_active && (
                      <span className="bg-red-500/20 text-red-300 px-2 py-0.5 rounded-md text-[10px] font-bold">
                        DISABLED
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="font-bold text-white mb-1 truncate">{t.name}</div>
                  <div className="text-[10px] text-gray-500 mb-3">Order: {t.display_order}</div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => { setEditing({ ...t }); setCreating(false); }}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      title={t.is_active ? 'Disable' : 'Enable'}
                      className={`p-2 rounded-lg ${t.is_active ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-gray-700/30 text-gray-500 hover:bg-gray-700/50'}`}
                    >
                      {t.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => removeRow(t)}
                      className="p-2 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25"
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

      {editing && (
        <EditModal
          row={editing}
          creating={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// EditModal — kept local state for upload progress so the parent doesn't
// re-render the whole grid on every byte the file-input emits.
// =============================================================================
function EditModal({
  row,
  creating,
  onClose,
}: {
  row: TemplateRow;
  creating: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<TemplateRow>(row);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingPv, setUploadingPv] = useState(false);
  const [bgUploaded, setBgUploaded] = useState(false);
  const [pvUploaded, setPvUploaded] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const pvInputRef = useRef<HTMLInputElement>(null);

  function buildFilename(file: File, kind: 'bg' | 'pv') {
    const base = (editing.name || kind).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || kind;
    const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
    return `${base}-${kind}-${Date.now()}.${ext}`;
  }

  async function uploadFile(file: File, kind: 'bg' | 'pv') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Only JPG / PNG / WebP images are accepted.');
      return;
    }
    const optimized = await optimizeImageFile(file, {
      maxWidth: 1080,
      maxHeight: 1920,
      quality: 0.76,
      outputType: 'image/webp',
      filenamePrefix: `${editing.name || kind}-${kind}`,
    });
    if (optimized.size > MAX_UPLOAD_BYTES) {
      alert('Image is still larger than 280 KB after optimization. Please use a simpler or smaller image.');
      return;
    }
    const setUploading = kind === 'bg' ? setUploadingBg : setUploadingPv;
    const setUploaded = kind === 'bg' ? setBgUploaded : setPvUploaded;
    setUploading(true);
    const path = buildFilename(optimized, kind);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, {
        cacheControl: '31536000',
        upsert: false,
        contentType: optimized.type,
      });
    setUploading(false);
    if (error) {
      alert('Upload failed: ' + error.message);
      return;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (kind === 'bg') {
      setEditing({ ...editing, background_url: pub.publicUrl });
    } else {
      setEditing({ ...editing, preview_url: pub.publicUrl });
    }
    setUploaded(true);
    setTimeout(() => setUploaded(false), 2000);
  }

  async function save() {
    if (!editing.name.trim()) {
      alert('Name is required');
      return;
    }
    if (!editing.background_url) {
      alert('Background image is required — upload or paste a URL');
      return;
    }
    if (editing.diamond_cost < 0) {
      alert('Diamond cost cannot be negative');
      return;
    }
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      background_url: editing.background_url,
      preview_url: editing.preview_url || null,
      diamond_cost: editing.diamond_cost,
      is_active: editing.is_active,
      display_order: editing.display_order,
    };
    const { error } = creating
      ? await supabase.from('audio_templates').insert(payload)
      : await supabase.from('audio_templates').update(payload).eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert('Save failed: ' + error.message);
      return;
    }
    onClose();
  }

  const disabledWhileBusy = saving || uploadingBg || uploadingPv;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1E1A34] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              {creating ? <Plus size={18} className="text-white" /> : <Edit2 size={16} className="text-white" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{creating ? 'New Template' : `Edit ${editing.name}`}</h3>
              <p className="text-xs text-gray-500">Background image + price gating</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white" disabled={disabledWhileBusy}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Field label="Name *">
              <input
                type="text"
                className={inputCls}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Wedding Pavilion"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Diamond cost" hint="0 = free; >0 = paid">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={editing.diamond_cost}
                  onChange={(e) => setEditing({ ...editing, diamond_cost: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Display order">
                <input
                  type="number"
                  className={inputCls}
                  value={editing.display_order}
                  onChange={(e) => setEditing({ ...editing, display_order: Number(e.target.value) || 0 })}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Active (hosts can see + apply / purchase)
            </label>

            {/* Background block */}
            <div className="p-4 rounded-2xl bg-[#0E111E] border border-[#251B45] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-pink-400" />
                  <h4 className="text-sm font-black text-white">Background Image *</h4>
                </div>
                {bgUploaded && (
                  <span className="text-[10px] font-bold text-green-400 inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> uploaded
                  </span>
                )}
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'bg'); }}
              />
              <button
                onClick={() => bgInputRef.current?.click()}
                disabled={disabledWhileBusy}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500/60 bg-pink-500/5 hover:bg-pink-500/10 text-sm text-pink-200 transition-all disabled:opacity-50"
              >
                {uploadingBg ? (
                  <><Loader2 size={16} className="animate-spin" /> Uploading…</>
                ) : (
                  <><Upload size={16} /> Drop or pick a <code className="text-pink-300">.jpg / .png / .webp</code> (optimized)</>
                )}
              </button>
              <Field label="Background URL" hint="Public Storage URL. Paste manually or use the upload above.">
                <input
                  type="text"
                  className={inputCls}
                  value={editing.background_url}
                  onChange={(e) => setEditing({ ...editing, background_url: e.target.value })}
                />
              </Field>
            </div>

            {/* Preview block */}
            <div className="p-4 rounded-2xl bg-[#0E111E] border border-[#251B45] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Diamond size={16} className="text-cyan-400" />
                  <h4 className="text-sm font-black text-white">Preview Thumbnail (optional)</h4>
                </div>
                {pvUploaded && (
                  <span className="text-[10px] font-bold text-green-400 inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> uploaded
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-500">A smaller cropped version shown in the in-app catalogue tile. Falls back to the full background if blank.</p>
              <input
                ref={pvInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'pv'); }}
              />
              <button
                onClick={() => pvInputRef.current?.click()}
                disabled={disabledWhileBusy}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-500/5 hover:bg-cyan-500/10 text-sm text-cyan-200 transition-all disabled:opacity-50"
              >
                {uploadingPv ? (
                  <><Loader2 size={16} className="animate-spin" /> Uploading…</>
                ) : (
                  <><Upload size={16} /> Pick thumbnail (optional)</>
                )}
              </button>
              <Field label="Preview URL">
                <input
                  type="text"
                  className={inputCls}
                  value={editing.preview_url || ''}
                  onChange={(e) => setEditing({ ...editing, preview_url: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* Live preview tile */}
          <div className="md:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Preview</p>
            <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-black/40 border border-[#251B45]">
              {editing.preview_url || editing.background_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={editing.preview_url || editing.background_url}
                  alt="preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-700">
                  <ImageIcon size={48} />
                </div>
              )}
            </div>
            <div className="mt-3 text-xs text-gray-400">
              {editing.diamond_cost === 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">FREE — usable by every host</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Diamond size={12} className="text-amber-400" />
                  <span className="text-amber-300 font-bold">{editing.diamond_cost.toLocaleString()}</span>
                  <span className="text-gray-500">diamonds</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 flex items-center justify-end gap-3 sticky bottom-0 bg-[#1E1A34]">
          <button
            onClick={onClose}
            disabled={disabledWhileBusy}
            className="px-5 py-2 rounded-xl text-gray-400 hover:text-white text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={disabledWhileBusy}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-pink-500/20 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {creating ? 'Create template' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full bg-[#1A1230] border border-[#251B45] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors';
