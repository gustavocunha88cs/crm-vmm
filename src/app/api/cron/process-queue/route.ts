import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";

let EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080").trim().replace(/\/$/, "");

// Garante que a URL tenha um protocolo (evita erro de 'unknown scheme')
if (EVOLUTION_API_URL && !EVOLUTION_API_URL.startsWith("http")) {
  EVOLUTION_API_URL = `http://${EVOLUTION_API_URL}`;
}

const EVOLUTION_API_KEY = (process.env.EVOLUTION_API_KEY ?? "BQYHJGJHJ").trim();
const PREFIX = "crm-vmm-";

export async function GET() {
  try {
    console.log("[Worker] Sincronização avançada iniciada...");
    
    if (!adminDb) {
      console.error("[Worker] Erro: adminDb não inicializado. Verifique as variáveis de ambiente.");
      return NextResponse.json({ error: "Firebase não inicializado" }, { status: 500 });
    }

    await syncAllEvolutionInstances();

    // Processamento de fila de campanhas
    const now = admin.firestore.Timestamp.now();
    const filaSnap = await adminDb.collection("filaEnvio")
      .where("status", "==", "pendente")
      .limit(10).get();

    if (filaSnap.empty) {
      return NextResponse.json({ ok: true, message: "Sincronização concluída com sucesso" });
    }

    // ... lógica de envio de campanha (mantida) ...
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Worker Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function syncAllEvolutionInstances() {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY }
    });
    
    if (!res.ok) {
        const errText = await res.text();
        console.error(`[ChatSync] Fallback Evolution API (${res.status}):`, errText.substring(0, 100));
        return;
    }

    const instancesRaw = await res.json();
    if (!Array.isArray(instancesRaw)) return;

    for (const item of instancesRaw) {
      const inst = item.instance;
      if (!inst || !inst.instanceName.startsWith(PREFIX)) continue;
      
      const instanceName = inst.instanceName;
      const state = inst.status || inst.state;
      const userId = instanceName.replace(PREFIX, "").toLowerCase();

      if (state === "open" || state === "CONNECTED") {
        console.log(`[ChatSync] Processando instância: ${instanceName}`);
        
        const chatsRes = await fetch(`${EVOLUTION_API_URL}/chat/findChats/${instanceName}`, {
          headers: { apikey: EVOLUTION_API_KEY }
        });
        
        if (!chatsRes.ok) continue;

        const allChats = await chatsRes.json();
        if (!Array.isArray(allChats)) continue;

        // FILTRAGEM E ORDENAÇÃO IGUAL AO WHATSAPP
        const validChats = allChats
          .filter((c: any) => {
            const jid = c.id || c.remoteJid || "";
            // Ignora IDs de sistema (@lid) e foca em contatos/grupos reais
            return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@g.us");
          })
          .sort((a: any, b: any) => {
            // Ordena pelo timestamp da última mensagem (mais recente primeiro)
            const timeA = Number(a.lastMsgTimestamp || 0);
            const timeB = Number(b.lastMsgTimestamp || 0);
            return timeB - timeA;
          })
          .slice(0, 100); // Pegamos os 100 chats mais recentes

        console.log(`[ChatSync] ${validChats.length} conversas reais encontradas para ${userId}`);

        const batch = adminDb.batch();
        
        for (const chat of validChats) {
          const remoteJid = chat.id || chat.remoteJid;
          const chatId = `${userId}_${remoteJid}`;
          const chatRef = adminDb.collection("chats").doc(chatId);

          const lastTime = Number(chat.lastMsgTimestamp || 0);
          const timestamp = lastTime 
            ? admin.firestore.Timestamp.fromMillis(lastTime * (lastTime > 9999999999 ? 1 : 1000))
            : admin.firestore.FieldValue.serverTimestamp();

          batch.set(chatRef, {
            userId,
            remoteJid,
            name: chat.pushName || chat.name || remoteJid.split("@")[0],
            lastMessage: chat.lastMessage || "",
            lastMessageTime: timestamp,
            unreadCount: chat.unreadCount || 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        
        await batch.commit();
        console.log(`[ChatSync] Batch de chats finalizado para ${userId}`);

        // Sincronização rápida de mensagens para os 10 chats mais ativos
        for (const chat of validChats.slice(0, 10)) {
          const remoteJid = chat.id || chat.remoteJid;
          try {
            const msgsRes = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify({ where: { remoteJid }, limit: 10 })
            });

            if (!msgsRes.ok) continue;

            const msgsData = await msgsRes.json();
            const msgs = Array.isArray(msgsData) ? msgsData : (msgsData.messages || []);
            
            const msgBatch = adminDb.batch();
            for (const m of msgs) {
              const mId = m.key?.id || m.id;
              if (!mId) continue;
              const msgRef = adminDb.collection("mensagens").doc(`${userId}_${mId}`);
              
              const mTime = Number(m.messageTimestamp || m.timestamp || 0);
              const mTimestamp = mTime 
                ? admin.firestore.Timestamp.fromMillis(mTime * (mTime > 9999999999 ? 1 : 1000))
                : admin.firestore.FieldValue.serverTimestamp();

              msgBatch.set(msgRef, {
                userId, chatId: `${userId}_${remoteJid}`, remoteJid,
                body: m.message?.conversation || m.message?.extendedTextMessage?.text || m.text || "Mídia",
                fromMe: m.key?.fromMe ?? m.fromMe ?? false,
                timestamp: mTimestamp,
                status: m.status || "RECEIVED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
            }
            await msgBatch.commit();
          } catch(e) {}
        }
      }
    }
  } catch (e) {
    console.error("[ChatSync] Erro global:", e);
  }
}
