"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { optimizeImageFile } from "@/lib/imageOptimizer";
import {
  Image as ImageIcon, Plus, Trash2, Upload, Loader2, X, Link as LinkIcon,
  CheckCircle2, XCircle, Save, ArrowUp, ArrowDown,
} from "lucide-react";

type Banner = {
  id: string;
  image_url: string;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
  position: 'top' | 'bottom';
  created_at: string;
  updated_at: string;
};

const RECOMMENDED_SIZE = "1080 × 500 px";
const MAX_ACTIVE = 5;
const MAX_BANNER_UPLOAD_BYTES = 350 * 1024;

export default function BannersPage() {
  const [rows, setRows]         = useState<Banner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState<Partial<Banner> | null>(null);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("home_banners")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    setRows((data as Banner[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const ch = supabase
      .channel("admin-home-banners")
      .on("postgres_changes", { event: "*", schema: "public", table: "home_banners" }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [load]);

  const activeCountFor = (position: 'top' | 'bottom') => rows.filter((r) => r.is_active && (r.position ?? 'top') === position).length;

  async function uploadFile(file: File): Promise<string | null> {
    setUploading(true);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        alert("Only PNG, JPG, or WebP images are accepted.");
        return null;
      }
      const optimized = await optimizeImageFile(file, {
        maxWidth: 1080,
        maxHeight: 500,
        quality: 0.78,
        outputType: "image/webp",
        filenamePrefix: file.name,
      });
      if (optimized.size > MAX_BANNER_UPLOAD_BYTES) {
        alert("Banner is still larger than 350 KB after optimization. Please use a simpler or smaller image.");
        return null;
      }
      const safeName = optimized.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("banners")
        .upload(path, optimized, { upsert: false, cacheControl: "31536000", contentType: optimized.type });
      if (error) {
        alert("Upload failed: " + error.message);
        return null;
      }
      const { data } = supabase.storage.from("banners").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setUploading(false);
    }
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (!url || !editing) return;
    setEditing({ ...editing, image_url: url });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function save() {
    if (!editing) return;
    if (!editing.image_url) { alert("Please upload a banner image first."); return; }
    const wouldBeActive = editing.is_active ?? true;
    const position = editing.position ?? 'top';
    const otherActiveCount = rows.filter((r) => r.is_active && r.id !== editing.id && (r.position ?? 'top') === position).length;
    if (wouldBeActive && otherActiveCount >= MAX_ACTIVE) {
      alert(`Only ${MAX_ACTIVE} banners can be active at a time. Disable another first.`);
      return;
    }

    setSaving(true);
    const payload = {
      image_url:     editing.image_url,
      link_url:      editing.link_url?.trim() || null,
      display_order: editing.display_order ?? 0,
      is_active:     editing.is_active ?? true,
      position:      editing.position ?? 'top',
    };

    const { error } = editing.id
      ? await supabase.from("home_banners").update(payload).eq("id", editing.id)
      : await supabase.from("home_banners").insert(payload);
    setSaving(false);
    if (error) { alert("Save failed: " + error.message); return; }
    setEditing(null);
  }

  async function toggleActive(b: Banner) {
    if (!b.is_active && activeCountFor(b.position ?? 'top') >= MAX_ACTIVE) {
      alert(`Only ${MAX_ACTIVE} banners can be active at a time. Disable another first.`);
      return;
    }
    const { error } = await supabase
      .from("home_banners")
      .update({ is_active: !b.is_active })
      .eq("id", b.id);
    if (error) alert("Failed: " + error.message);
  }

  async function remove(b: Banner) {
    if (!confirm("Delete this banner? This action cannot be undone.")) return;
    const { error } = await supabase.from("home_banners").delete().eq("id", b.id);
    if (error) alert("Failed: " + error.message);
  }

  async function shift(b: Banner, direction: -1 | 1) {
    const sorted = [...rows].sort((a, b) => a.display_order - b.display_order);
    const idx    = sorted.findIndex((r) => r.id === b.id);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= sorted.length) return;
    const other = sorted[nextIdx];
    // Swap display_order between b and other.
    await Promise.all([
      supabase.from("home_banners").update({ display_order: other.display_order }).eq("id", b.id),
      supabase.from("home_banners").update({ display_order: b.display_order }).eq("id", other.id),
    ]);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center">
            <ImageIcon className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Home Banners</h1>
            <p className="text-xs text-gray-500">
              Up to {MAX_ACTIVE} banners shown on the home grid above the live tiles.
              Recommended size: <b className="text-pink-400">{RECOMMENDED_SIZE}</b>
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ image_url: "", link_url: "", display_order: (rows.at(-1)?.display_order ?? -1) + 1, is_active: activeCountFor('top') < MAX_ACTIVE, position: 'top' })}
          className="bg-gradient-to-r from-pink-500 to-violet-600 text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 hover:scale-[1.02] shadow-lg shadow-pink-500/20"
        >
          <Plus size={16} /> New banner
        </button>
      </div>

      <div className="mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-400">
        Top <b className="text-white">{activeCountFor('top')}</b> / {MAX_ACTIVE} · Bottom <b className="text-white">{activeCountFor('bottom')}</b> / {MAX_ACTIVE}. Use arrows to reorder.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-pink-500" size={32} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <ImageIcon className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-400 mb-1 font-bold">No banners yet</p>
          <p className="text-gray-500 text-sm">Tap New banner to upload your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((b, i) => (
            <div key={b.id} className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden flex items-stretch">
              {/* Preview */}
              <div className="w-44 h-24 flex-shrink-0 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt="banner" className="w-full h-full object-cover" />
              </div>

              {/* Meta */}
              <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                <div>
                  <p className="text-[10px] uppercase text-gray-500 font-bold tracking-widest">
                    Slot {b.display_order + 1}
                  </p>
                  <p className="text-white text-sm font-bold truncate">
                    {b.link_url ? (
                      <span className="flex items-center gap-1">
                        <LinkIcon size={12} className="text-cyan-400 flex-shrink-0" />
                        <span className="truncate">{b.link_url}</span>
                      </span>
                    ) : (
                      <span className="text-gray-500 italic">No tap action</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    (b.position ?? 'top') === 'top'
                      ? "bg-pink-500/15 text-pink-300 border-pink-500/30"
                      : "bg-violet-500/15 text-violet-300 border-violet-500/30"
                  }`}>
                    {(b.position ?? 'top') === 'top' ? 'TOP' : 'BOTTOM'}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    b.is_active
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-white/5 text-gray-400 border-white/10"
                  }`}>
                    {b.is_active ? <><CheckCircle2 size={10} /> Live</> : <><XCircle size={10} /> Off</>}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col items-center justify-center gap-1 pr-3">
                <button
                  onClick={() => shift(b, -1)}
                  disabled={i === 0}
                  className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => shift(b, 1)}
                  disabled={i === rows.length - 1}
                  className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="flex flex-col gap-1 pr-3 py-3">
                <button
                  onClick={() => setEditing(b)}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(b)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg ${
                    b.is_active
                      ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300"
                      : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300"
                  }`}
                >
                  {b.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => remove(b)}
                  className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center">
                  <ImageIcon size={20} className="text-white" />
                </div>
                <h3 className="text-lg font-black text-white">{editing.id ? "Edit banner" : "New banner"}</h3>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Preview */}
              <div className="rounded-2xl overflow-hidden h-44 border border-white/10 bg-black flex items-center justify-center">
                {editing.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={editing.image_url} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <p className="text-gray-500 text-sm flex items-center gap-2">
                    <ImageIcon size={16} /> Upload a banner image to preview
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                  {editing.image_url ? "Replace image" : "Upload PNG / JPG / WebP"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFilePick}
                />
              </div>
              <p className="text-[10px] text-gray-500 text-center -mt-2">
                Recommended size: <b>{RECOMMENDED_SIZE}</b> · optimized to WebP under 350 KB
              </p>

              <div>
                <label className="text-[10px] uppercase text-gray-500 font-bold flex items-center gap-1 mb-1">
                  <LinkIcon size={10} /> Tap action URL (optional)
                </label>
                <input
                  className="w-full bg-[#0E111E] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500"
                  value={editing.link_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
                  placeholder="https://… or deep link"
                />
                <p className="text-[10px] text-gray-600 mt-1">Empty = banner just sits there decoratively.</p>
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-500 font-bold tracking-widest mb-1.5 block">
                  Position on home screen
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, position: 'top' })}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold text-left ${
                      (editing.position ?? 'top') === 'top'
                        ? 'bg-pink-500/20 border-pink-500/50 text-pink-200'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    Top
                    <p className="text-[9px] font-normal text-gray-500 mt-0.5">Hero slot above live grid</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, position: 'bottom' })}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold text-left ${
                      editing.position === 'bottom'
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-200'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    Bottom
                    <p className="text-[9px] font-normal text-gray-500 mt-0.5">Below the live cards</p>
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={editing.is_active ?? true}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                />
                Active (visible on home screen)
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
                disabled={saving || uploading || !editing.image_url}
                className="flex-[2] bg-gradient-to-r from-pink-500 to-violet-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-pink-500/20"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={16} />}
                {editing.id ? "Save changes" : "Create banner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
