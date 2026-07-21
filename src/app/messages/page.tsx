"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MessageSquare, Send, ShieldCheck, Store, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  is_read: boolean;
  created_at: string;
  // Stamped by the stamp_chat_sender_role trigger (migration 80) so
  // the admin UI can flag messages sent by a manager. Optional in
  // case an old row pre-trigger gets loaded.
  sender_role?: string | null;
};

type Conversation = {
  convId: string;
  otherId: string;
  name: string;
  avatar: string | null;
  displayId?: number | null;
  role?: string | null;
  isReseller: boolean;
  isAgencyOwner: boolean;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

// chat_messages.conversation_id is built as "minId__maxId"
const buildConvId = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

const relativeTime = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)     return 'now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
};

export default function MessagesPage() {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'priority' | 'unread'>('priority');
  const [searchTerm, setSearchTerm] = useState('');

  // Active chat
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // ─── Bootstrap: who am I? ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) setAdminId(session.user.id);
    })();
  }, []);

  // ─── Load conversation list ───────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);

    const { data: msgs, error } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, receiver_id, content, type, is_read, created_at, sender_role')
      .or(`sender_id.eq.${adminId},receiver_id.eq.${adminId}`)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.warn('messages fetch:', error.message);
      setConversations([]);
      setLoading(false);
      return;
    }

    // Group by conversation_id, keep most recent + count unread
    const byConv = new Map<string, { last: ChatMessage; unread: number }>();
    (msgs || []).forEach((m: ChatMessage) => {
      if (!byConv.has(m.conversation_id)) {
        byConv.set(m.conversation_id, { last: m, unread: 0 });
      }
      const entry = byConv.get(m.conversation_id)!;
      if (m.receiver_id === adminId && !m.is_read) entry.unread += 1;
    });

    // Resolve other-party profiles + check reseller/agency status
    const otherIds: string[] = [];
    byConv.forEach((v) => {
      const otherId = v.last.sender_id === adminId ? v.last.receiver_id : v.last.sender_id;
      otherIds.push(otherId);
    });
    const uniqueOtherIds = Array.from(new Set(otherIds));

    const profileMap = new Map<string, any>();
    if (uniqueOtherIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, display_id')
        .in('id', uniqueOtherIds);
      (profs || []).forEach((p: any) => profileMap.set(p.id, p));
    }

    // Which of these are resellers? agency owners?
    const resellerSet = new Set<string>();
    if (uniqueOtherIds.length > 0) {
      const { data: rs } = await supabase
        .from('resellers')
        .select('user_id')
        .in('user_id', uniqueOtherIds);
      (rs || []).forEach((r: any) => { if (r.user_id) resellerSet.add(r.user_id); });
    }
    const agencyOwnerSet = new Set<string>();
    if (uniqueOtherIds.length > 0) {
      const { data: ag } = await supabase
        .from('agencies')
        .select('owner_id')
        .in('owner_id', uniqueOtherIds);
      (ag || []).forEach((a: any) => { if (a.owner_id) agencyOwnerSet.add(a.owner_id); });
    }

    const rows: Conversation[] = [];
    byConv.forEach((v, convId) => {
      const otherId = v.last.sender_id === adminId ? v.last.receiver_id : v.last.sender_id;
      const p = profileMap.get(otherId);
      rows.push({
        convId,
        otherId,
        name: p?.full_name || 'User',
        avatar: p?.avatar_url || null,
        displayId: p?.display_id,
        role: p?.role,
        isReseller: resellerSet.has(otherId),
        isAgencyOwner: agencyOwnerSet.has(otherId),
        lastMessage: v.last.type === 'gift' ? '🎁 Gift'
                   : v.last.type === 'image' ? '📷 Photo'
                   : v.last.content || '',
        lastAt: v.last.created_at,
        unread: v.unread,
      });
    });

    // Priority resellers + agency owners first, then by recency
    rows.sort((a, b) => {
      const aPri = (a.isReseller || a.isAgencyOwner) ? 0 : 1;
      const bPri = (b.isReseller || b.isAgencyOwner) ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
    });

    setConversations(rows);
    setLoading(false);
  }, [adminId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ─── Realtime: refresh list on any chat change ────────────────────
  useEffect(() => {
    if (!adminId) return;
    const ch = supabase
      .channel(`admin-msg-list-${adminId}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (row?.sender_id === adminId || row?.receiver_id === adminId) {
            loadConversations();
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [adminId, loadConversations]);

  // ─── Load thread when a conversation is selected ──────────────────
  const loadThread = useCallback(async (conv: Conversation) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conv.convId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) console.warn('thread fetch:', error.message);
    setMessages(data || []);
    setLoadingMessages(false);

    // Mark received as read
    if (adminId) {
      const unreadIds = (data || []).filter((m: ChatMessage) => m.receiver_id === adminId && !m.is_read).map((m: ChatMessage) => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('chat_messages').update({ is_read: true }).in('id', unreadIds);
        loadConversations();
      }
    }
  }, [adminId, loadConversations]);

  // When activeConv changes, load its thread
  useEffect(() => {
    if (activeConv) loadThread(activeConv);
    else setMessages([]);
  }, [activeConv?.convId, loadThread]);

  // ─── Realtime: append messages live in the active thread ──────────
  useEffect(() => {
    if (!activeConv || !adminId) return;
    const ch = supabase
      .channel(`admin-thread-${activeConv.convId}-${Date.now()}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeConv.convId}` },
        (payload: any) => {
          setMessages((prev) => {
            const tempIdx = prev.findIndex((m) =>
              String(m.id).startsWith('temp-') &&
              m.sender_id === payload.new.sender_id &&
              m.content === payload.new.content
            );
            if (tempIdx >= 0) {
              const next = prev.slice();
              next[tempIdx] = payload.new;
              return next;
            }
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          if (payload.new.receiver_id === adminId) {
            supabase.from('chat_messages').update({ is_read: true }).eq('id', payload.new.id);
          }
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${activeConv.convId}` },
        (payload: any) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeConv?.convId, adminId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length, activeConv?.convId]);

  // ─── Send a reply (bypasses the 1-diamond fee — admin replies free) ─
  async function sendReply() {
    if (!activeConv || !adminId) return;
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText('');
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId,
      conversation_id: activeConv.convId,
      sender_id: adminId,
      receiver_id: activeConv.otherId,
      content: text,
      type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    }]);

    setSending(true);
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: activeConv.convId,
      sender_id: adminId,
      receiver_id: activeConv.otherId,
      content: text,
      type: 'text',
    });
    setSending(false);

    if (error) {
      alert('Send failed: ' + error.message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
    }
  }

  // ─── Filter conversation list ─────────────────────────────────────
  const filteredConvs = conversations.filter((c) => {
    if (filter === 'priority' && !(c.isReseller || c.isAgencyOwner)) return false;
    if (filter === 'unread' && c.unread === 0) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matches = c.name.toLowerCase().includes(q)
        || String(c.displayId || '').includes(q)
        || c.lastMessage.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const priorityUnread = conversations.filter((c) => (c.isReseller || c.isAgencyOwner) && c.unread > 0).length;
  const allUnread = conversations.reduce((acc, c) => acc + c.unread, 0);

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-0 gap-3 lg:h-[calc(100vh-48px)] lg:gap-4">
      {/* Conversations sidebar */}
      <div className={`${activeConv ? 'hidden lg:flex' : 'flex'} w-full lg:w-96 bg-[#1E1A34] border border-[#251B45] rounded-2xl flex-col overflow-hidden`}>
        <div className="p-4 border-b border-[#251B45]">
          <h2 className="text-xl font-bold text-white mb-3">Inbox</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search name, ID, message…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/30 border border-[#2D2351] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            {[
              { key: 'priority' as const, label: 'Priority', badge: priorityUnread },
              { key: 'unread'   as const, label: 'Unread',   badge: allUnread },
              { key: 'all'      as const, label: 'All',      badge: null as null | number },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === f.key
                    ? 'bg-[#FF2E7E] text-white'
                    : 'bg-black/20 text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
                {!!f.badge && f.badge > 0 && (
                  <span className="ml-1 text-[10px] bg-pink-700/60 px-1.5 rounded-full">{f.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-pink-500" /></div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              No conversations
            </div>
          ) : (
            filteredConvs.map((c) => (
              <button
                key={c.convId}
                onClick={() => setActiveConv(c)}
                className={`w-full flex items-center gap-3 p-3 border-b border-[#251B45] hover:bg-white/5 text-left transition-all ${
                  activeConv?.convId === c.convId ? 'bg-white/5' : ''
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-300 font-bold overflow-hidden">
                    {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : (c.name[0]?.toUpperCase() || 'U')}
                  </div>
                  {c.isAgencyOwner && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-purple-600 border-2 border-[#1E1A34] flex items-center justify-center" title="Agency owner">
                      <ShieldCheck size={10} className="text-white" />
                    </div>
                  )}
                  {!c.isAgencyOwner && c.isReseller && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 border-2 border-[#1E1A34] flex items-center justify-center" title="Reseller">
                      <Store size={10} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <p className={`text-sm truncate ${c.unread > 0 ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>
                      {c.name}
                    </p>
                    <span className={`text-[10px] shrink-0 ${c.unread > 0 ? 'text-pink-400 font-bold' : 'text-gray-500'}`}>
                      {relativeTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 mt-0.5">
                    <p className={`text-xs truncate ${c.unread > 0 ? 'text-white' : 'text-gray-400'}`}>
                      {c.lastMessage}
                    </p>
                    {c.unread > 0 && (
                      <span className="shrink-0 text-[10px] font-bold bg-pink-500 text-white rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  {c.displayId && (
                    <p className="text-[10px] text-gray-500 mt-0.5">ID {c.displayId}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Active thread */}
      <div className={`${activeConv ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 bg-[#1E1A34] border border-[#251B45] rounded-2xl flex-col overflow-hidden`}>
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageSquare size={56} className="mb-3 opacity-25" />
            <p className="font-semibold">Pick a conversation</p>
            <p className="text-xs mt-1 opacity-70">Resellers + agency owners are pinned at the top.</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 p-4 border-b border-[#251B45]">
              <button onClick={() => setActiveConv(null)} className="p-1 rounded hover:bg-white/10 lg:hidden">
                <ChevronLeft size={20} />
              </button>
              <div className="w-10 h-10 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-300 font-bold overflow-hidden">
                {activeConv.avatar ? <img src={activeConv.avatar} alt="" className="w-full h-full object-cover" /> : (activeConv.name[0]?.toUpperCase() || 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-white truncate">{activeConv.name}</p>
                  {activeConv.isAgencyOwner && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-700/40 text-purple-200 border border-purple-500/60 px-1.5 py-0.5 rounded">
                      Agency
                    </span>
                  )}
                  {activeConv.isReseller && !activeConv.isAgencyOwner && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-700/40 text-emerald-200 border border-emerald-500/60 px-1.5 py-0.5 rounded">
                      Reseller
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">ID {activeConv.displayId || '—'}</p>
              </div>
            </div>

            {/* Messages list */}
            <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-pink-500" /></div>
              ) : messages.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Start the conversation.</p>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_id === adminId;
                  return (
                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isMe ? 'bg-pink-500 text-white rounded-br-md' : 'bg-black/30 text-gray-100 rounded-bl-md'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          {/* Outbound DMs sent by a manager get a small
                              amber tag so the owner can trace which
                              helper replied. Inbound messages from
                              users don't need this — only admin-side
                              senders are interesting. */}
                          {isMe && m.sender_role === 'manager' && (
                            <span className="bg-amber-700/40 text-amber-200 border border-amber-500/60 text-[9px] px-1.5 py-0.5 rounded font-bold">
                              Manager
                            </span>
                          )}
                          <span className={`text-[10px] ${isMe ? 'text-white/70' : 'text-gray-500'}`}>
                            {formatTime(m.created_at)}
                          </span>
                          {isMe && !String(m.id).startsWith('temp-') && (
                            <span className={`text-[10px] font-bold ${m.is_read ? 'text-sky-300' : 'text-white/60'}`}>
                              {m.is_read ? '✓✓ Seen' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-[#251B45] p-3 flex gap-2 items-end">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                rows={1}
                className="flex-1 resize-none bg-black/30 border border-[#2D2351] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 max-h-32"
              />
              <button
                onClick={sendReply}
                disabled={!inputText.trim() || sending}
                className="px-4 py-2 rounded-lg bg-[#FF2E7E] text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pink-600 transition-all flex items-center gap-1"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
