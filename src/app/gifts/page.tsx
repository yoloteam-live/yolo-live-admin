"use client";
import { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';
import { requireCurrentProjectStorageUrl } from '@/lib/storageUrls';
import dynamic from 'next/dynamic';
import {
  Gift, Search, Plus, Edit2, Trash2, Loader2, X, CheckCircle2, XCircle,
  Crown, Sparkles, Diamond, Upload, Volume2, FileJson, Music,
} from 'lucide-react';

// lottie-react ships ESM with a browser-only dep on `lottie-web`.
// Loading it via next/dynamic (ssr:false) keeps the build happy and
// avoids pulling lottie-web into the server bundle for /gifts.
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

// Lottie internals (lottie-web's completeLayers) throw a TypeError on
// edge-case JSONs that pass our shape check but still confuse the
// renderer (mismatched asset refs, oddly-formed expressions, etc.).
// Wrapping the preview in this boundary keeps the whole modal alive —
// the worst case becomes "preview won't render" instead of "the gifts
// page crashed and reloaded."
class LottieErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) {
    if (typeof console !== 'undefined') console.warn('[gifts] Lottie preview crashed', err);
  }
  render() {
    if (this.state.failed) {
      return <span className="text-[10px] text-red-400 px-2 text-center">Preview crashed — file may not be valid Lottie.</span>;
    }
    return this.props.children;
  }
}

type GiftRow = {
  id: string;
  name: string;
  diamond_cost: number;
  bean_value: number | null;
  category: 'Classic' | 'Premium' | 'Exclusive';
  animation_path: string | null;
  animation_url: string | null;
  sound_path: string | null;
  sound_url: string | null;
  required_vip_type: 'VIP' | 'SVIP' | 'VVIP' | null;
  is_active: boolean;
  display_order: number;
  loop: boolean;
  custom_duration: number | null;
};

const CATEGORIES = ['Classic', 'Premium', 'Exclusive'] as const;
const VIP_TIERS  = ['', 'VIP', 'SVIP', 'VVIP'] as const;

const ANIM_BUCKET  = 'gift-animations';
const SOUND_BUCKET = 'gift-sounds';
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB — matches migration 85 caps.

const emptyGift: GiftRow = {
  id: '', name: '', diamond_cost: 10, bean_value: null,
  category: 'Classic', animation_path: '', animation_url: '',
  sound_path: '', sound_url: '',
  required_vip_type: null, is_active: true, display_order: 0,
  loop: false, custom_duration: null,
};

// Lottie animation JSON shape is intentionally `unknown` here — we
// don't traverse it, we just hand it to <Lottie animationData=... />.
// Keeping it loose stops the preview from failing TS when a file
// uses a non-standard top-level key.
type LottieJson = Record<string, unknown>;

export default function GiftsPage() {
  // Super-admin only. See useAdminRole for why we keep the role check
  // in the hook (live updates if the owner demotes a manager mid-session).
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | typeof CATEGORIES[number]>('all');
  const [editing, setEditing] = useState<GiftRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    const ch = supabase
      .channel('admin-gifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gifts' }, () => load())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('gifts')
      .select('*')
      .order('category')
      .order('display_order', { ascending: true });
    setGifts((data as GiftRow[]) || []);
    setLoading(false);
  }

  async function save() {
    if (!editing) return;
    if (!editing.id.trim() || !editing.name.trim()) {
      alert('id and name are required');
      return;
    }
    if (editing.diamond_cost < 1) {
      alert('Diamond cost must be at least 1');
      return;
    }
    try {
      if (editing.animation_url) requireCurrentProjectStorageUrl(editing.animation_url, ANIM_BUCKET);
      if (editing.sound_url) requireCurrentProjectStorageUrl(editing.sound_url, SOUND_BUCKET);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Invalid gift media URL.');
      return;
    }
    setSaving(true);
    const payload = {
      ...editing,
      animation_path: editing.animation_path || null,
      animation_url:  editing.animation_url  || null,
      sound_path:     editing.sound_path     || null,
      sound_url:      editing.sound_url      || null,
      required_vip_type: editing.required_vip_type || null,
    };
    const { error } = creating
      ? await supabase.from('gifts').insert(payload)
      : await supabase.from('gifts').update(payload).eq('id', editing.id);
    setSaving(false);
    if (error) {
      alert('Failed: ' + error.message);
      return;
    }
    setEditing(null);
    setCreating(false);
  }

  async function toggleActive(g: GiftRow) {
    const { error } = await supabase
      .from('gifts')
      .update({ is_active: !g.is_active })
      .eq('id', g.id);
    if (error) alert('Failed: ' + error.message);
  }

  async function removeGift(g: GiftRow) {
    if (!window.confirm(`Delete "${g.name}"? This can break historical gifts_log lookups. Consider disabling instead.`)) return;
    const { error } = await supabase.from('gifts').delete().eq('id', g.id);
    if (error) alert('Failed: ' + error.message);
  }

  const filtered = gifts.filter((g) => {
    if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return g.id.toLowerCase().includes(s) || g.name.toLowerCase().includes(s);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <Gift className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Gifts Catalog</h1>
            <p className="text-xs text-gray-500">Live-room gift inventory — pricing, VIP gating, availability</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing({ ...emptyGift }); setCreating(true); }}
          className="bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-2.5 px-5 rounded-xl flex items-center gap-2 shadow-lg shadow-pink-500/20 transition-all"
        >
          <Plus size={18} /> New Gift
        </button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="Search by id or name…"
            className="w-full bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 bg-[#1E1A34] border border-[#251B45] rounded-xl p-1">
          {(['all', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                categoryFilter === c
                  ? 'bg-pink-500/20 text-pink-300'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-pink-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl p-12 text-center">
          <Gift className="mx-auto text-gray-600 mb-3" size={48} />
          <p className="text-gray-500">No gifts match this filter.</p>
        </div>
      ) : (
        <div className="bg-[#1E1A34] border border-[#251B45] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Bean</th>
                <th className="px-4 py-3 text-left">VIP Gate</th>
                <th className="px-4 py-3 text-center" title="Has SFX">SFX</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => {
                const hasSound = !!(g.sound_url || g.sound_path);
                return (
                <tr key={g.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-gray-400">{g.id}</td>
                  <td className="px-4 py-3 text-white font-semibold">{g.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      g.category === 'Classic'   ? 'bg-blue-500/15 text-blue-300' :
                      g.category === 'Premium'   ? 'bg-purple-500/15 text-purple-300' :
                                                   'bg-amber-500/15 text-amber-300'
                    }`}>{g.category}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-cyan-300 font-bold">
                      <Diamond size={12} /> {g.diamond_cost.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-yellow-300/80 text-xs">
                    {(g.bean_value ?? Math.floor(g.diamond_cost / 2)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {g.required_vip_type ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300">
                        <Crown size={10} /> {g.required_vip_type}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center" title={hasSound ? 'Has SFX' : 'No SFX'}>
                    <Volume2
                      size={16}
                      className={`mx-auto ${hasSound ? 'text-green-400' : 'text-gray-700'}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(g)}>
                      {g.is_active ? (
                        <CheckCircle2 className="text-green-400 mx-auto" size={18} />
                      ) : (
                        <XCircle className="text-gray-500 mx-auto" size={18} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditing({ ...g }); setCreating(false); }}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => removeGift(g)}
                        className="p-1.5 hover:bg-red-400/10 rounded-lg text-gray-400 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <EditModal
          editing={editing}
          setEditing={setEditing}
          creating={creating}
          saving={saving}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal — kept in its own component so the upload state (progress flags,
// preview JSON, file-input refs) doesn't pollute the page-level hooks.
// ─────────────────────────────────────────────────────────────────────
function EditModal({
  editing,
  setEditing,
  creating,
  saving,
  onCancel,
  onSave,
}: {
  editing: GiftRow;
  setEditing: (g: GiftRow) => void;
  creating: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [uploadingAnim, setUploadingAnim]   = useState(false);
  const [uploadingSound, setUploadingSound] = useState(false);
  const [animUploaded, setAnimUploaded]     = useState(false);
  const [soundUploaded, setSoundUploaded]   = useState(false);
  const [animPreview, setAnimPreview]       = useState<LottieJson | null>(null);
  const [animPreviewErr, setAnimPreviewErr] = useState<string | null>(null);

  const animInputRef  = useRef<HTMLInputElement | null>(null);
  const soundInputRef = useRef<HTMLInputElement | null>(null);

  // Whenever animation_url changes (manual paste OR upload), refresh the
  // preview. Wrapped in try/catch so a broken/CORS-blocked JSON can't
  // crash the modal — we just show the error inline.
  //
  // CRITICAL: validate the parsed JSON is actually a Lottie document
  // BEFORE handing it to <Lottie animationData=…>. Without this guard
  // lottie-web's internal completeLayers() reads `layers.length` of an
  // undefined field on any random JSON (or a 404 HTML body that fetch
  // happens to parse as JSON via a permissive server) and the component
  // crashes the whole modal with a runtime TypeError. A minimal Lottie
  // file has a `layers` array and the version string `v`; we check both.
  useEffect(() => {
    let cancelled = false;
    setAnimPreview(null);
    setAnimPreviewErr(null);
    const url = editing.animation_url;
    if (!url) return;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: any = await res.json();
        if (cancelled) return;
        if (!json || typeof json !== 'object' || !Array.isArray(json.layers) || typeof json.v !== 'string') {
          setAnimPreviewErr('File is not a valid Lottie animation (missing layers / version).');
          return;
        }
        setAnimPreview(json as LottieJson);
      } catch (e: any) {
        if (!cancelled) setAnimPreviewErr(e?.message || 'preview unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [editing.animation_url]);

  // Derive a filename-safe slug from the gift id (when editing) or the
  // name (when creating before id is typed). The timestamp suffix means
  // re-uploading the same file never overwrites the previous variant,
  // so an admin can roll back by pasting the older URL.
  function buildFilename(file: File, kind: 'anim' | 'sound') {
    const base = (editing.id || editing.name || kind).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || kind;
    const ext = kind === 'anim'
      ? 'json'
      : (file.name.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3');
    return `${base}-${Date.now()}.${ext}`;
  }

  async function handleAnimFile(file: File) {
    setAnimUploaded(false);
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('File is larger than 2 MB. Try a smaller Lottie.');
      return;
    }
    // Validate the file is BOTH parseable JSON AND a real Lottie before
    // sending it to Storage. Without the Lottie shape check, a random
    // JSON (or even a typo'd file) gets uploaded, then the modal's
    // preview useEffect tries to render it and lottie-web crashes deep
    // in completeLayers reading `layers.length` of undefined.
    let parsed: any;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      alert('That file is not valid JSON.');
      return;
    }
    if (!parsed || typeof parsed !== 'object'
        || !Array.isArray(parsed.layers) || typeof parsed.v !== 'string') {
      alert('That JSON does not look like a Lottie animation (missing layers or version). Export from LottieFiles / After Effects and try again.');
      return;
    }

    setUploadingAnim(true);
    const path = buildFilename(file, 'anim');
    const { error } = await supabase.storage
      .from(ANIM_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/json',
      });
    setUploadingAnim(false);

    if (error) {
      alert('Animation upload failed: ' + error.message);
      return;
    }
    const { data: pub } = supabase.storage.from(ANIM_BUCKET).getPublicUrl(path);
    setEditing({ ...editing, animation_url: requireCurrentProjectStorageUrl(pub.publicUrl, ANIM_BUCKET) });
    setAnimUploaded(true);
    setTimeout(() => setAnimUploaded(false), 2000);
  }

  async function handleSoundFile(file: File) {
    setSoundUploaded(false);
    if (file.size > MAX_UPLOAD_BYTES) {
      alert('File is larger than 2 MB. Try a smaller clip.');
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.mp3') && !lower.endsWith('.wav')) {
      alert('Only .mp3 or .wav files are allowed.');
      return;
    }

    setUploadingSound(true);
    const path = buildFilename(file, 'sound');
    // Override contentType so Storage's MIME allowlist matches even
    // when the browser hands us "audio/x-mpeg" / "" for the same file.
    const contentType = lower.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
    const { error } = await supabase.storage
      .from(SOUND_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });
    setUploadingSound(false);

    if (error) {
      alert('Sound upload failed: ' + error.message);
      return;
    }
    const { data: pub } = supabase.storage.from(SOUND_BUCKET).getPublicUrl(path);
    setEditing({ ...editing, sound_url: requireCurrentProjectStorageUrl(pub.publicUrl, SOUND_BUCKET) });
    setSoundUploaded(true);
    setTimeout(() => setSoundUploaded(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1E1A34] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              {creating ? <Plus size={18} className="text-white" /> : <Edit2 size={16} className="text-white" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{creating ? 'New Gift' : `Edit ${editing.name}`}</h3>
              <p className="text-xs text-gray-500">id, animation, sound, cost & gating</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="ID *" hint="Stable identifier — referenced in gifts_log">
            <input
              type="text"
              className={inputCls}
              value={editing.id}
              disabled={!creating}
              onChange={(e) => setEditing({ ...editing, id: e.target.value })}
            />
          </Field>
          <Field label="Name *">
            <input
              type="text"
              className={inputCls}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </Field>

          <Field label="Diamond cost *">
            <input
              type="number"
              min={1}
              className={inputCls}
              value={editing.diamond_cost}
              onChange={(e) => setEditing({ ...editing, diamond_cost: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Bean value" hint="Receiver earns. Empty = 50% of cost">
            <input
              type="number"
              className={inputCls}
              value={editing.bean_value ?? ''}
              onChange={(e) => setEditing({ ...editing, bean_value: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>

          <Field label="Category *">
            <select
              className={inputCls}
              value={editing.category}
              onChange={(e) => setEditing({ ...editing, category: e.target.value as any })}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="VIP gate" hint="Only this tier (or higher) can send">
            <select
              className={inputCls}
              value={editing.required_vip_type ?? ''}
              onChange={(e) => setEditing({ ...editing, required_vip_type: (e.target.value || null) as any })}
            >
              <option value="">— No gate —</option>
              {VIP_TIERS.filter(Boolean).map((v) => <option key={v} value={v as string}>{v}</option>)}
            </select>
          </Field>

          {/* ─── Animation block ─────────────────────────────────── */}
          <div className="col-span-2 mt-2 p-4 rounded-2xl bg-[#0E111E] border border-[#251B45]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileJson size={16} className="text-pink-400" />
                <h4 className="text-sm font-black text-white">Lottie Animation</h4>
              </div>
              {animUploaded && (
                <span className="text-[10px] font-bold text-green-400 inline-flex items-center gap-1">
                  <CheckCircle2 size={12} /> uploaded
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                {/* Dropzone / file picker */}
                <button
                  type="button"
                  onClick={() => animInputRef.current?.click()}
                  disabled={uploadingAnim}
                  className="w-full border-2 border-dashed border-[#251B45] hover:border-pink-500/60 rounded-xl py-4 px-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-all disabled:opacity-50"
                >
                  {uploadingAnim ? (
                    <><Loader2 className="animate-spin" size={16} /> Uploading…</>
                  ) : (
                    <><Upload size={16} /> Drop or pick a Lottie <code className="text-pink-300">.json</code> (max 2 MB)</>
                  )}
                </button>
                <input
                  ref={animInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset the input so the same file can be re-picked
                    // after a failed upload without remounting the modal.
                    e.target.value = '';
                    if (f) void handleAnimFile(f);
                  }}
                />

                <Field label="Animation path" hint="Bundled file e.g. 'animation/Rose.json' — fallback if URL unset">
                  <input
                    type="text"
                    className={inputCls}
                    value={editing.animation_path || ''}
                    onChange={(e) => setEditing({ ...editing, animation_path: e.target.value })}
                  />
                </Field>
                <Field label="Animation URL" hint="Public Supabase Storage URL. Paste manually or use the upload above.">
                  <input
                    type="text"
                    className={inputCls}
                    value={editing.animation_url || ''}
                    onChange={(e) => setEditing({ ...editing, animation_url: e.target.value })}
                  />
                </Field>
              </div>

              {/* Preview tile */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-[120px] h-[120px] rounded-xl bg-black/40 border border-[#251B45] flex items-center justify-center overflow-hidden">
                  {editing.animation_url ? (
                    animPreview ? (
                      <LottieErrorBoundary>
                        <Lottie animationData={animPreview} loop style={{ width: 110, height: 110 }} />
                      </LottieErrorBoundary>
                    ) : animPreviewErr ? (
                      <span className="text-[10px] text-red-400 px-2 text-center">{animPreviewErr}</span>
                    ) : (
                      <Loader2 className="animate-spin text-gray-500" size={20} />
                    )
                  ) : (
                    <FileJson size={28} className="text-gray-700" />
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Preview</p>
              </div>
            </div>
          </div>

          {/* ─── Sound block ─────────────────────────────────────── */}
          <div className="col-span-2 p-4 rounded-2xl bg-[#0E111E] border border-[#251B45]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Music size={16} className="text-cyan-400" />
                <h4 className="text-sm font-black text-white">Sound Effect (SFX)</h4>
              </div>
              {soundUploaded && (
                <span className="text-[10px] font-bold text-green-400 inline-flex items-center gap-1">
                  <CheckCircle2 size={12} /> uploaded
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                <button
                  type="button"
                  onClick={() => soundInputRef.current?.click()}
                  disabled={uploadingSound}
                  className="w-full border-2 border-dashed border-[#251B45] hover:border-cyan-500/60 rounded-xl py-4 px-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-white transition-all disabled:opacity-50"
                >
                  {uploadingSound ? (
                    <><Loader2 className="animate-spin" size={16} /> Uploading…</>
                  ) : (
                    <><Upload size={16} /> Drop or pick an SFX <code className="text-cyan-300">.mp3 / .wav</code> (max 2 MB)</>
                  )}
                </button>
                <input
                  ref={soundInputRef}
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleSoundFile(f);
                  }}
                />

                <Field label="Sound path" hint="Bundled key e.g. 'audio/gifts/rose.mp3' — fallback if URL unset">
                  <input
                    type="text"
                    className={inputCls}
                    value={editing.sound_path || ''}
                    onChange={(e) => setEditing({ ...editing, sound_path: e.target.value })}
                  />
                </Field>
                <Field label="Sound URL" hint="Public Supabase Storage URL. Paste manually or use the upload above.">
                  <input
                    type="text"
                    className={inputCls}
                    value={editing.sound_url || ''}
                    onChange={(e) => setEditing({ ...editing, sound_url: e.target.value })}
                  />
                </Field>
              </div>

              {/* Audio preview */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-full">
                  {editing.sound_url ? (
                    <audio
                      controls
                      src={editing.sound_url}
                      className="w-full"
                      // key forces the element to reload when the URL changes,
                      // otherwise the <audio> caches the old src.
                      key={editing.sound_url}
                    />
                  ) : (
                    <div className="w-full h-[40px] rounded-lg bg-black/40 border border-[#251B45] flex items-center justify-center">
                      <Music size={18} className="text-gray-700" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Preview</p>
              </div>
            </div>
          </div>

          <Field label="Display order">
            <input
              type="number"
              className={inputCls}
              value={editing.display_order}
              onChange={(e) => setEditing({ ...editing, display_order: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Loop duration (ms)" hint="Empty = play once">
            <input
              type="number"
              className={inputCls}
              value={editing.custom_duration ?? ''}
              onChange={(e) => setEditing({ ...editing, custom_duration: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={editing.loop}
              onChange={(e) => setEditing({ ...editing, loop: e.target.checked })}
            />
            Loop animation
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
            />
            Active (visible in app)
          </label>
        </div>

        <div className="p-6 bg-white/5 flex gap-3 sticky bottom-0">
          <button
            className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl"
            onClick={onCancel}
            disabled={saving || uploadingAnim || uploadingSound}
          >
            Cancel
          </button>
          <button
            className="flex-[2] bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl shadow-lg shadow-pink-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            onClick={onSave}
            disabled={saving || uploadingAnim || uploadingSound}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={16} />}
            {creating ? 'Create' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}
