"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@/contexts/ChatContext";
import { apiFetch } from "@/lib/api";
import type { Chat, Message } from "@/types/chat";

const PAGE_SIZE = 30;

export default function ChatPage() {
  const { chats, isLoading: chatsLoading, waConnected, refreshChats } = useChat();

  const [selectedChat, setSelectedChat]     = useState<Chat | null>(null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading]       = useState(false);
  const [hasMore, setHasMore]               = useState(false);
  const [loadingMore, setLoadingMore]       = useState(false);
  const [inputText, setInputText]           = useState("");
  const [sending, setSending]               = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");
  const [error, setError]                   = useState("");

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const pollTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load messages for selected chat ──────────────────────────────────────
  const loadMessages = useCallback(async (chat: Chat, append = false) => {
    if (!chat) return;
    if (!append) setMsgsLoading(true);

    try {
      const oldest = append && messages.length > 0 ? messages[0].timestamp : undefined;
      const url = `/api/whatsapp/messages?chatId=${encodeURIComponent(chat.id)}${
        oldest ? `&before=${encodeURIComponent(new Date(oldest).toISOString())}` : ""
      }`;

      const res = await apiFetch(url);
      if (!res.ok) return;
      const data = await res.json();

      const parsed: Message[] = (data.messages ?? []).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));

      if (append) {
        setMessages((prev) => [...parsed, ...prev]);
        setHasMore(data.hasMore ?? false);
      } else {
        setMessages(parsed);
        setHasMore(data.hasMore ?? false);
        // Scroll to bottom after initial load
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch {
      // ignore
    } finally {
      setMsgsLoading(false);
    }
  }, [messages]);

  // ── Poll for new messages every 10s ──────────────────────────────────────
  const pollMessages = useCallback(async (chat: Chat) => {
    try {
      const res = await apiFetch(
        `/api/whatsapp/messages?chatId=${encodeURIComponent(chat.id)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const parsed: Message[] = (data.messages ?? []).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));

      // Merge — avoid duplicates using id
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = parsed.filter((m) => !existingIds.has(m.id));
        if (!newMsgs.length) return prev;
        setTimeout(() => scrollToBottom(), 50);
        return [...prev, ...newMsgs];
      });
    } catch {}
  }, []);

  // ── Select chat ───────────────────────────────────────────────────────────
  function handleSelectChat(chat: Chat) {
    setSelectedChat(chat);
    setMessages([]);
    setHasMore(false);
    setError("");
    clearInterval(pollTimerRef.current!);
    loadMessages(chat);

    // Start polling
    pollTimerRef.current = setInterval(() => pollMessages(chat), 10_000);
  }

  useEffect(() => {
    return () => clearInterval(pollTimerRef.current!);
  }, []);

  // ── Load more (older messages) ────────────────────────────────────────────
  async function handleLoadMore() {
    if (!selectedChat || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const scrollArea = messagesAreaRef.current;
    const prevHeight = scrollArea?.scrollHeight ?? 0;

    await loadMessages(selectedChat, true);

    // Preserve scroll position after prepend
    setTimeout(() => {
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight - prevHeight;
      }
      setLoadingMore(false);
    }, 50);
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend() {
    if (!selectedChat || !inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);
    setError("");

    const phone = selectedChat.remoteJid.split("@")[0];

    // Optimistic update
    const tempMsg: Message = {
      id: `temp_${Date.now()}`,
      chatId: selectedChat.id,
      userId: "",
      remoteJid: selectedChat.remoteJid,
      body: text,
      fromMe: true,
      timestamp: new Date(),
      status: "SENDING",
    };
    setMessages((prev) => [...prev, tempMsg]);
    scrollToBottom();

    try {
      const res = await apiFetch("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ phone, text }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erro ao enviar");
      }

      const data = await res.json();

      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMsg.id
            ? { ...m, id: data.messageId ? `_${data.messageId}` : m.id, status: "SENT" }
            : m
        )
      );
    } catch (err: unknown) {
      setError((err as Error).message);
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // ── Filter chats ──────────────────────────────────────────────────────────
  const filteredChats = chats.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.remoteJid?.includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    );
  });

  const totalUnread = chats.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  return (
    <div className="ch-root">
      {/* ── Left: chat list ── */}
      <div className="ch-sidebar">
        <div className="ch-sidebar-header">
          <div className="ch-sidebar-title-row">
            <h1 className="ch-title">Conversas</h1>
            {totalUnread > 0 && (
              <span className="ch-unread-badge">{totalUnread}</span>
            )}
            <button
              className="ch-refresh-btn"
              onClick={refreshChats}
              title="Atualizar conversas"
            >
              ↻
            </button>
          </div>

          <div className="ch-search-wrap">
            <span className="ch-search-icon">🔍</span>
            <input
              className="ch-search"
              placeholder="Buscar conversa…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="ch-chat-list">
          {!waConnected && (
            <div className="ch-not-connected">
              <span>📵</span>
              <p>WhatsApp desconectado</p>
              <a href="/whatsapp" className="ch-connect-link">Conectar →</a>
            </div>
          )}

          {waConnected && chatsLoading && filteredChats.length === 0 && (
            <div className="ch-list-loading">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="ch-skeleton-item">
                  <div className="ch-skeleton-avatar" />
                  <div className="ch-skeleton-lines">
                    <div className="ch-skeleton-line ch-skeleton-line--wide" />
                    <div className="ch-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {waConnected && !chatsLoading && filteredChats.length === 0 && (
            <div className="ch-empty-chats">
              <span>💬</span>
              <p>Nenhuma conversa encontrada</p>
            </div>
          )}

          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              className={`ch-chat-item ${selectedChat?.id === chat.id ? "active" : ""}`}
              onClick={() => handleSelectChat(chat)}
            >
              <div className="ch-avatar">
                {chat.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="ch-chat-info">
                <div className="ch-chat-top">
                  <span className="ch-chat-name">{chat.name}</span>
                  {chat.lastMessageTime && (
                    <span className="ch-chat-time">
                      {formatTime(chat.lastMessageTime)}
                    </span>
                  )}
                </div>
                <div className="ch-chat-bottom">
                  <span className="ch-last-msg">
                    {chat.lastMessage?.slice(0, 45) || "Sem mensagens"}
                    {(chat.lastMessage?.length ?? 0) > 45 ? "…" : ""}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="ch-unread">{chat.unreadCount}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: messages ── */}
      <div className="ch-main">
        {!selectedChat ? (
          <div className="ch-no-chat">
            <div className="ch-no-chat-art">
              <div className="ch-no-chat-circle" />
              <span className="ch-no-chat-icon">💬</span>
            </div>
            <h2>Selecione uma conversa</h2>
            <p>Escolha um contato na lista para ver as mensagens</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="ch-messages-header">
              <div className="ch-avatar ch-avatar--lg">
                {selectedChat.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div>
                <div className="ch-header-name">{selectedChat.name}</div>
                <div className="ch-header-number">
                  {formatPhoneDisplay(selectedChat.remoteJid)}
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div className="ch-messages-area" ref={messagesAreaRef}>
              {/* Load more button */}
              {hasMore && (
                <div className="ch-load-more-wrap">
                  <button
                    className="ch-load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <><span className="ch-mini-spinner" /> Carregando…</>
                    ) : (
                      "↑ Carregar mensagens anteriores"
                    )}
                  </button>
                </div>
              )}

              {/* Loading state */}
              {msgsLoading && (
                <div className="ch-msgs-loading">
                  <div className="ch-spinner" />
                  <span>Carregando mensagens…</span>
                </div>
              )}

              {/* Messages */}
              {!msgsLoading && messages.length === 0 && (
                <div className="ch-no-messages">
                  <span>Nenhuma mensagem nesta conversa</span>
                </div>
              )}

              {messages.map((msg, i) => {
                const showDate =
                  i === 0 ||
                  !isSameDay(messages[i - 1].timestamp, msg.timestamp);

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="ch-date-divider">
                        <span>{formatDate(msg.timestamp)}</span>
                      </div>
                    )}
                    <div
                      className={`ch-msg-wrap ${msg.fromMe ? "ch-msg-wrap--me" : ""}`}
                    >
                      <div
                        className={`ch-bubble ${msg.fromMe ? "ch-bubble--me" : "ch-bubble--them"}`}
                      >
                        <p className="ch-bubble-text">{msg.body}</p>
                        <div className="ch-bubble-meta">
                          <span>{formatMsgTime(msg.timestamp)}</span>
                          {msg.fromMe && (
                            <span className="ch-tick">
                              {msg.status === "SENDING" ? "⏳" : "✓✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="ch-send-error">⚠ {error}</div>
            )}

            {/* Input */}
            <div className="ch-input-area">
              <textarea
                className="ch-input"
                placeholder="Digite uma mensagem…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={sending}
              />
              <button
                className="ch-send-btn"
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
              >
                {sending ? <span className="ch-mini-spinner" /> : "➤"}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .ch-root {
          --p: #28352A; --s: #4E6550; --bg: #E4E6DB;
          --dark: #0B1017; --text: #58595B;
          --border: #C8CCC0; --surface: #F2F3EE;
          font-family: 'Syne', sans-serif;
          display: flex; height: 100vh;
          background: var(--bg); overflow: hidden;
        }

        /* ── Sidebar ── */
        .ch-sidebar {
          width: 340px; flex-shrink: 0;
          background: white;
          border-right: 1px solid var(--border);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .ch-sidebar-header {
          padding: 20px 16px 12px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .ch-sidebar-title-row {
          display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
        }
        .ch-title { font-size: 20px; font-weight: 800; color: var(--p); margin: 0; flex: 1; }
        .ch-unread-badge {
          background: #25D366; color: white;
          font-size: 11px; font-weight: 800;
          padding: 2px 7px; border-radius: 10px;
        }
        .ch-refresh-btn {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 6px; width: 28px; height: 28px;
          cursor: pointer; font-size: 15px; color: var(--text);
          display: flex; align-items: center; justify-content: center;
          transition: all .15s;
        }
        .ch-refresh-btn:hover { background: var(--bg); }
        .ch-search-wrap { position: relative; }
        .ch-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 13px; }
        .ch-search {
          width: 100%; padding: 8px 12px 8px 30px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 20px; font-size: 13px; color: var(--text);
          outline: none; box-sizing: border-box; font-family: inherit;
        }
        .ch-search:focus { border-color: var(--s); }

        /* Chat list */
        .ch-chat-list { flex: 1; overflow-y: auto; }
        .ch-not-connected {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 40px 20px; text-align: center;
        }
        .ch-not-connected span { font-size: 32px; }
        .ch-not-connected p { font-size: 13px; color: #9AA494; margin: 0; }
        .ch-connect-link {
          font-size: 13px; font-weight: 700; color: var(--s);
          text-decoration: none; padding: 6px 14px;
          border: 1.5px solid var(--s); border-radius: 6px;
          margin-top: 4px; transition: all .15s;
        }
        .ch-connect-link:hover { background: var(--s); color: white; }
        .ch-empty-chats {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 40px 20px; color: #9AA494;
        }
        .ch-empty-chats span { font-size: 28px; }
        .ch-empty-chats p { font-size: 13px; margin: 0; }

        /* Chat item */
        .ch-chat-item {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border: none; background: transparent;
          cursor: pointer; width: 100%; text-align: left;
          border-bottom: 1px solid var(--border);
          transition: background .1s; font-family: inherit;
        }
        .ch-chat-item:hover { background: var(--surface); }
        .ch-chat-item.active { background: rgba(78,101,80,.12); }
        .ch-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: var(--s); color: white;
          font-size: 16px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ch-avatar--lg { width: 36px; height: 36px; font-size: 14px; }
        .ch-chat-info { flex: 1; min-width: 0; }
        .ch-chat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; }
        .ch-chat-name { font-size: 14px; font-weight: 700; color: var(--dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
        .ch-chat-time { font-size: 11px; color: #9AA494; flex-shrink: 0; }
        .ch-chat-bottom { display: flex; align-items: center; justify-content: space-between; }
        .ch-last-msg { font-size: 12px; color: #9AA494; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .ch-unread {
          background: #25D366; color: white;
          font-size: 10px; font-weight: 800;
          min-width: 18px; height: 18px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; flex-shrink: 0; margin-left: 6px;
        }

        /* Skeletons */
        .ch-list-loading { padding: 8px 0; }
        .ch-skeleton-item { display: flex; gap: 12px; padding: 12px 16px; }
        .ch-skeleton-avatar { width: 42px; height: 42px; border-radius: 50%; background: #e8e8e4; animation: chShimmer 1.5s infinite; flex-shrink: 0; }
        .ch-skeleton-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
        .ch-skeleton-line { height: 12px; border-radius: 6px; background: #e8e8e4; animation: chShimmer 1.5s infinite; width: 60%; }
        .ch-skeleton-line--wide { width: 80%; }
        @keyframes chShimmer { 0%,100%{opacity:1} 50%{opacity:.5} }

        /* ── Main area ── */
        .ch-main {
          flex: 1; display: flex; flex-direction: column;
          overflow: hidden; background: #f0f2eb;
        }

        /* No chat selected */
        .ch-no-chat {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px;
        }
        .ch-no-chat-art { position: relative; margin-bottom: 8px; }
        .ch-no-chat-circle {
          width: 100px; height: 100px; border-radius: 50%;
          background: rgba(78,101,80,.1);
        }
        .ch-no-chat-icon {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%,-50%); font-size: 40px;
        }
        .ch-no-chat h2 { font-size: 20px; font-weight: 800; color: var(--p); margin: 0; }
        .ch-no-chat p { font-size: 13px; color: #9AA494; margin: 0; }

        /* Header */
        .ch-messages-header {
          padding: 12px 20px;
          background: white;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 12px;
          flex-shrink: 0;
          box-shadow: 0 1px 4px rgba(0,0,0,.06);
        }
        .ch-header-name { font-size: 15px; font-weight: 800; color: var(--dark); }
        .ch-header-number { font-size: 12px; color: #9AA494; }

        /* Messages area */
        .ch-messages-area {
          flex: 1; overflow-y: auto; padding: 16px 20px;
          display: flex; flex-direction: column; gap: 2px;
        }

        /* Load more */
        .ch-load-more-wrap { display: flex; justify-content: center; margin-bottom: 12px; }
        .ch-load-more-btn {
          padding: 6px 16px; background: white;
          border: 1px solid var(--border); border-radius: 16px;
          font-family: inherit; font-size: 12px; font-weight: 600;
          color: var(--s); cursor: pointer; transition: all .15s;
          display: flex; align-items: center; gap: 6px;
        }
        .ch-load-more-btn:hover:not(:disabled) { background: var(--surface); }
        .ch-load-more-btn:disabled { opacity: .6; cursor: not-allowed; }

        /* Loading / empty */
        .ch-msgs-loading {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px; color: #9AA494; font-size: 13px;
        }
        .ch-no-messages { text-align: center; padding: 40px; color: #9AA494; font-size: 13px; }

        /* Date divider */
        .ch-date-divider {
          display: flex; align-items: center; justify-content: center;
          margin: 12px 0 8px;
        }
        .ch-date-divider span {
          background: rgba(11,16,23,.12); color: white;
          font-size: 11px; font-weight: 600;
          padding: 3px 10px; border-radius: 10px;
        }

        /* Message bubbles */
        .ch-msg-wrap { display: flex; margin-bottom: 2px; }
        .ch-msg-wrap--me { justify-content: flex-end; }
        .ch-bubble {
          max-width: 65%; padding: 8px 12px;
          border-radius: 12px; position: relative;
          word-break: break-word;
        }
        .ch-bubble--them {
          background: white; border-radius: 2px 12px 12px 12px;
          border: 1px solid var(--border);
        }
        .ch-bubble--me {
          background: var(--p); color: #E4E6DB;
          border-radius: 12px 2px 12px 12px;
        }
        .ch-bubble-text { font-size: 14px; margin: 0 0 4px; line-height: 1.4; white-space: pre-wrap; }
        .ch-bubble--them .ch-bubble-text { color: var(--dark); }
        .ch-bubble--me .ch-bubble-text { color: #E4E6DB; }
        .ch-bubble-meta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
        .ch-bubble-meta span { font-size: 10px; opacity: .7; }
        .ch-tick { font-size: 12px !important; }

        /* Error */
        .ch-send-error {
          padding: 8px 20px; background: #fdecea;
          font-size: 12px; color: #b91c1c; font-weight: 600;
          flex-shrink: 0;
        }

        /* Input area */
        .ch-input-area {
          padding: 12px 16px;
          background: white; border-top: 1px solid var(--border);
          display: flex; align-items: flex-end; gap: 10px;
          flex-shrink: 0;
        }
        .ch-input {
          flex: 1; padding: 10px 14px;
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: 20px; font-size: 14px; color: var(--dark);
          outline: none; resize: none; font-family: inherit;
          max-height: 120px; line-height: 1.4;
          transition: border-color .15s;
        }
        .ch-input:focus { border-color: var(--s); }
        .ch-send-btn {
          width: 42px; height: 42px; border-radius: 50%;
          background: var(--p); color: white;
          border: none; cursor: pointer; font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s; flex-shrink: 0;
        }
        .ch-send-btn:hover:not(:disabled) { background: var(--s); }
        .ch-send-btn:disabled { opacity: .4; cursor: not-allowed; }

        /* Spinners */
        .ch-spinner {
          width: 28px; height: 28px;
          border: 3px solid rgba(78,101,80,.2);
          border-top-color: var(--s); border-radius: 50%;
          animation: chSpin .8s linear infinite;
        }
        .ch-mini-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,.3);
          border-top-color: white; border-radius: 50%;
          animation: chSpin .8s linear infinite;
        }
        @keyframes chSpin { to { transform: rotate(360deg); } }

        @media (max-width: 700px) {
          .ch-sidebar { width: 100%; display: ${false ? "none" : "flex"}; }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(date: Date): string {
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

function formatPhoneDisplay(remoteJid: string): string {
  const num = remoteJid.split("@")[0];
  if (num.startsWith("55") && num.length >= 12) {
    const ddd = num.slice(2, 4);
    const rest = num.slice(4);
    if (rest.length === 9) return `+55 (${ddd}) ${rest.slice(0,5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 (${ddd}) ${rest.slice(0,4)}-${rest.slice(4)}`;
  }
  return `+${num}`;
}
