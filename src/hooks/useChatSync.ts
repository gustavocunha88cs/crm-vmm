"use client";

import { useEffect, useCallback } from "react";
import { useChat } from "@/contexts/ChatContext";
import { apiFetch } from "@/lib/api";

export function useChatSync() {
  const { refreshChats } = useChat();

  const sync = useCallback(async () => {
    try {
      // 1. Verifica status da conexão
      const statusRes = await apiFetch("/api/whatsapp/status");
      if (statusRes.ok) {
        const status = await statusRes.json();
        
        // 2. Se conectado, atualiza os chats
        if (status.state === "open") {
          await refreshChats();
        }
      }
    } catch (err) {
      console.error("Chat sync error:", err);
    }
  }, [refreshChats]);

  useEffect(() => {
    // Sincronização inicial
    sync();

    // Intervalo de 15 segundos
    const interval = setInterval(sync, 15000);
    
    return () => clearInterval(interval);
  }, [sync]);
}
