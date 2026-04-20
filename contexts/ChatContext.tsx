"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import type { Chat } from "@/types/chat";

// ─── Context types ────────────────────────────────────────────────────────────
interface ChatContextValue {
  chats: Chat[];
  unreadTotal: number;
  isLoading: boolean;
  waConnected: boolean;
  refreshChats: () => void;
}

const ChatContext = createContext<ChatContextValue>({
  chats: [],
  unreadTotal: 0,
  isLoading: false,
  waConnected: false,
  refreshChats: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ChatProvider({ children }: { children: ReactNode }) {
  const [chats, setChats]           = useState<Chat[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const statusTimerRef              = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatsTimerRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch chats from Firestore via API ──────────────────────────────────────
  const fetchChats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/whatsapp/chats");
      if (!res.ok) return;
      const data = await res.json();
      const raw: any[] = data.chats ?? [];
      setChats(
        raw.map((c) => ({
          ...c,
          lastMessageTime: c.lastMessageTime ? new Date(c.lastMessageTime) : null,
        }))
      );
    } catch {
      // silently ignore
    }
  }, []);

  // ── Check WhatsApp status ───────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/whatsapp/status");
      if (!res.ok) { setWaConnected(false); return; }
      const data = await res.json();
      const connected = data.state === "open";
      setWaConnected(connected);
      if (connected) fetchChats();
    } catch {
      setWaConnected(false);
    }
  }, [fetchChats]);

  // ── Start background polling ────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    checkStatus().finally(() => setIsLoading(false));

    // Poll status every 15s
    statusTimerRef.current = setInterval(checkStatus, 15_000);

    // Poll chats every 15s (only runs if connected, checkStatus handles it)
    chatsTimerRef.current = setInterval(() => {
      if (waConnected) fetchChats();
    }, 15_000);

    return () => {
      clearInterval(statusTimerRef.current!);
      clearInterval(chatsTimerRef.current!);
    };
  }, [checkStatus, fetchChats]);

  // Update chats timer when connection changes
  useEffect(() => {
    if (waConnected) fetchChats();
  }, [waConnected, fetchChats]);

  const unreadTotal = chats.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  return (
    <ChatContext.Provider
      value={{
        chats,
        unreadTotal,
        isLoading,
        waConnected,
        refreshChats: fetchChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useChat() {
  return useContext(ChatContext);
}
