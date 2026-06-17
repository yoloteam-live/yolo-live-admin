"use client";
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Music, Plus, Search, Loader2, RefreshCw, Trash2, Play, Pause, Upload, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAdminRole } from '@/lib/useAdminRole';

type Track = {
  id: string;
  title: string;
  artist: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_sec: number | null;
  category: string;
  is_active: boolean;
  created_at: string;
};

const CATEGORIES = ['general', 'romantic', 'party', 'lofi', 'rock', 'classical'];

export default function MusicPage() {
  // Super-admin only.
  const router = useRouter();
  const { isSuperAdmin, loading: roleLoading } = useAdminRole();
  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) router.replace('/');
  }, [isSuperAdmin, roleLoading, router]);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Upload form
  const [upTitle, setUpTitle] = useState('');
  const [upArtist, setUpArtist] = useState('');
  const [upCategory, setUpCategory] = useState('general');
  const [upAudio, setUpAudio] = useState<File | null>(null);
  const [upCover, setUpCover] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin]);

  if (roleLoading || !isSuperAdmin) return null;

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('music_tracks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('music fetch:', error);
    setTracks(data || []);
    setLoading(false);
  }

  async function uploadTrack() {
    if (!upTitle.trim() || !upAudio) {
      alert('Title and audio file are required.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert('Not signed in'); return; }

    setUploading(true);
    try {
      // 1. Upload audio
      setUploadProgress('Uploading audio…');
      const audioExt = upAudio.name.split('.').pop() || 'mp3';
      const audioPath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${audioExt}`;
      const { error: audioErr } = await supabase.storage
        .from('music')
        .upload(audioPath, upAudio, { cacheControl: '31536000', upsert: false });
      if (audioErr) throw audioErr;
      const audioUrl = supabase.storage.from('music').getPublicUrl(audioPath).data.publicUrl;

      // 2. Upload cover (optional)
      let coverUrl: string | null = null;
      if (upCover) {
        setUploadProgress('Uploading cover…');
        const coverExt = upCover.name.split('.').pop() || 'jpg';
        const coverPath = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${coverExt}`;
        const { error: coverErr } = await supabase.storage
          .from('music')
          .upload(coverPath, upCover, { cacheControl: '31536000', upsert: false });
        if (coverErr) console.warn('cover upload skipped:', coverErr.message);
        else coverUrl = supabase.storage.from('music').getPublicUrl(coverPath).data.publicUrl;
      }

      // 3. Detect duration (browser-side)
      setUploadProgress('Reading metadata…');
      const durationSec = await new Promise<number | null>((resolve) => {
        const a = new Audio(URL.createObjectURL(upAudio));
        a.onloadedmetadata = () => resolve(Math.round(a.duration) || null);
        a.onerror = () => resolve(null);
      });

      // 4. Insert row
      setUploadProgress('Saving…');
      const { error: insErr } = await supabase.from('music_tracks').insert({
        title: upTitle.trim(),
        artist: upArtist.trim() || null,
        audio_url: audioUrl,
        cover_url: coverUrl,
        duration_sec: durationSec,
        category: upCategory,
        is_active: true,
        created_by: user.id,
      });
      if (insErr) throw insErr;

      // Reset
      setUpTitle(''); setUpArtist(''); setUpAudio(null); setUpCover(null);
      setUpCategory('general'); setShowUpload(false);
      await load();
    } catch (e: any) {
      console.error('upload failed:', e);
      alert('Upload failed: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }

  async function toggleActive(t: Track) {
    const { error } = await supabase
      .from('music_tracks')
      .update({ is_active: !t.is_active })
      .eq('id', t.id);
    if (error) alert('Update failed: ' + error.message);
    else setTracks((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: !t.is_active } : x));
  }

  async function deleteTrack(t: Track) {
    if (!confirm(`Delete "${t.title}"? This also removes the audio file from storage.`)) return;

    // Pull the storage key from the public URL
    const audioKey = t.audio_url.split('/music/').pop();
    if (audioKey) {
      await supabase.storage.from('music').remove([audioKey]).catch(() => {});
    }
    if (t.cover_url) {
      const coverKey = t.cover_url.split('/music/').pop();
      if (coverKey) await supabase.storage.from('music').remove([coverKey]).catch(() => {});
    }

    const { error } = await supabase.from('music_tracks').delete().eq('id', t.id);
    if (error) alert('Delete failed: ' + error.message);
    else setTracks((prev) => prev.filter((x) => x.id !== t.id));
  }

  function togglePlay(t: Track) {
    if (playingId === t.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const a = new Audio(t.audio_url);
    audioRef.current = a;
    a.onended = () => setPlayingId(null);
    a.play().catch(() => setPlayingId(null));
    setPlayingId(t.id);
  }

  const filtered = tracks.filter((t) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return t.title.toLowerCase().includes(s) || (t.artist || '').toLowerCase().includes(s);
  });

  const formatDuration = (sec: number | null) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            <Music className="text-pink-500" /> Music Library
          </h2>
          <p className="text-gray-500 mt-1">
            Upload background music tracks that broadcasters can play during their live streams.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Search title or artist…"
              className="bg-[#1E1A34] border border-[#251B45] rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500 w-72"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="bg-[#1E1A34] border border-[#251B45] p-2 rounded-xl text-gray-400 hover:text-white transition-all"
            onClick={load}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] active:scale-[0.98] transition-all px-4 py-2 rounded-xl font-bold text-white flex items-center gap-2"
          >
            <Plus size={18} /> Add Track
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total Tracks" value={tracks.length.toString()} color="text-blue-400" />
        <Stat label="Active" value={tracks.filter((t) => t.is_active).length.toString()} color="text-green-400" />
        <Stat label="Inactive" value={tracks.filter((t) => !t.is_active).length.toString()} color="text-gray-400" />
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-gray-500 text-xs uppercase tracking-widest">
              <th className="px-6 py-4 font-black"></th>
              <th className="px-6 py-4 font-black">Title</th>
              <th className="px-6 py-4 font-black">Artist</th>
              <th className="px-6 py-4 font-black">Category</th>
              <th className="px-6 py-4 font-black">Duration</th>
              <th className="px-6 py-4 font-black">Status</th>
              <th className="px-6 py-4 font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading && tracks.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={18} /> Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                {tracks.length === 0 ? 'No tracks yet — upload the first one!' : 'No matches.'}
              </td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                <td className="px-6 py-4">
                  <button
                    onClick={() => togglePlay(t)}
                    className="w-10 h-10 rounded-full bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 flex items-center justify-center transition-all"
                    title={playingId === t.id ? 'Pause' : 'Preview'}
                  >
                    {playingId === t.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {t.cover_url
                      ? <img src={t.cover_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      : <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center"><Music size={16} className="text-pink-500" /></div>
                    }
                    <p className="font-bold text-white">{t.title}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-300">{t.artist || '—'}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-[10px] font-bold uppercase rounded-full">
                    {t.category}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-400 font-mono text-xs">{formatDuration(t.duration_sec)}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleActive(t)}
                    className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${
                      t.is_active
                        ? 'bg-green-400/10 text-green-400 border-green-400/30'
                        : 'bg-red-400/10 text-red-400 border-red-400/30'
                    }`}
                  >
                    {t.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => deleteTrack(t)}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1E1A34] border border-[#251B45] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                <Upload size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">Upload Track</h3>
                <p className="text-xs text-gray-500">MP3 / M4A / WAV recommended</p>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <Field label="Title *">
                <input value={upTitle} onChange={(e) => setUpTitle(e.target.value)}
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500"
                  placeholder="Romantic Instrumental"
                />
              </Field>
              <Field label="Artist">
                <input value={upArtist} onChange={(e) => setUpArtist(e.target.value)}
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500"
                  placeholder="DJ Robin"
                />
              </Field>
              <Field label="Category">
                <select value={upCategory} onChange={(e) => setUpCategory(e.target.value)}
                  className="w-full bg-[#0E111E] border border-[#251B45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Audio File *">
                <input type="file" accept="audio/*" onChange={(e) => setUpAudio(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-pink-500/10 file:text-pink-400 file:font-bold hover:file:bg-pink-500/20"
                />
                {upAudio && <p className="text-[10px] text-green-400 mt-2 flex items-center gap-1"><CheckCircle2 size={12} /> {upAudio.name}</p>}
              </Field>
              <Field label="Cover Image (optional)">
                <input type="file" accept="image/*" onChange={(e) => setUpCover(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-purple-500/10 file:text-purple-400 file:font-bold hover:file:bg-purple-500/20"
                />
                {upCover && <p className="text-[10px] text-green-400 mt-2 flex items-center gap-1"><CheckCircle2 size={12} /> {upCover.name}</p>}
              </Field>
              {uploadProgress && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-300 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> {uploadProgress}
                </div>
              )}
            </div>

            <div className="p-6 bg-white/5 flex gap-3">
              <button
                onClick={() => setShowUpload(false)}
                disabled={uploading}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={uploadTrack}
                disabled={uploading || !upTitle.trim() || !upAudio}
                className="flex-[2] bg-gradient-to-r from-pink-500 to-purple-600 hover:scale-[1.02] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={16} />}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card p-5">
      <p className="text-gray-500 text-xs font-medium">{label}</p>
      <h3 className={`text-2xl font-black mt-1 ${color}`}>{value}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}