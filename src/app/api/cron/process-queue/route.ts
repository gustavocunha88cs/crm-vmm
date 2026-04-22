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

    // 2. Processamento de fila de campanhas
    const filaSnap = await adminDb.collection("filaEnvio")
      .where("status", "==", "pendente")
      .orderBy("agendadoPara", "asc")
      .limit(3) // Processa 3 por vez para não estourar o tempo do serverless
      .get();

    if (filaSnap.empty) {
      return NextResponse.json({ ok: true, message: "Fila vazia ou sincronização ok" });
    }

    console.log(`[Cron] Processando ${filaSnap.size} itens da fila...`);
    
    for (const doc of filaSnap.docs) {
      const item = doc.data();
      const instanceName = `crm-vmm-${item.userId.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase()}`;

      try {
        await doc.ref.update({ status: "enviando" });

        const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({
            number: item.phone,
            textMessage: { text: item.mensagem }
          })
        });

        if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);

        await doc.ref.update({
          status: "enviado",
          enviadoEm: admin.firestore.Timestamp.now()
        });

        // Atualiza contadores na campanha
        const campRef = adminDb.collection("campanhas").doc(item.campanhaId);
        await campRef.update({
          "progresso.enviados": admin.firestore.FieldValue.increment(1)
        });

      } catch (err: any) {
        console.error(`[Cron] Erro ao enviar para ${item.phone}:`, err.message);
        await doc.ref.update({ status: "falhou", erro: err.message });
      }
    }

    return NextResponse.json({ ok: true, processed: filaSnap.size });
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
