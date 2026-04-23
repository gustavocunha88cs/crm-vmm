import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

let EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080").trim().replace(/\/$/, "");

if (EVOLUTION_API_URL && !EVOLUTION_API_URL.startsWith("http")) {
  if (EVOLUTION_API_URL.includes("railway.app") || EVOLUTION_API_URL.includes("up.railway.app")) {
    EVOLUTION_API_URL = `https://${EVOLUTION_API_URL}`;
  } else {
    EVOLUTION_API_URL = `http://${EVOLUTION_API_URL}`;
  }
}

const EVOLUTION_API_KEY = (process.env.EVOLUTION_API_KEY ?? "BQYHJGJHJ").trim();

export async function GET() {
  try {
    console.log("[Worker] Processamento de fila Supabase iniciado...");
    
    // 1. Busca itens pendentes
    const { data: items, error: fetchError } = await supabaseAdmin
      .from("fila_envio")
      .select("*")
      .eq("status", "pendente")
      .lte("agendado_para", new Date().toISOString())
      .limit(40);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: true, message: "Fila vazia" });
    }

    console.log(`[Cron] Processando ${items.length} itens...`);
    
    const results = await Promise.all(items.map(async (item) => {
      const instanceName = `crm-vmm-${item.user_id.substring(0, 8).toLowerCase()}`;

      try {
        // Marca como enviando
        await supabaseAdmin.from("fila_envio").update({ status: "enviando" }).eq("id", item.id);

        let res;
        if (item.media_url) {
          res = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({
              number: item.phone,
              mediaMessage: {
                mediatype: "image",
                caption: item.mensagem,
                media: item.media_url
              }
            })
          });
        } else {
          res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({
              number: item.phone,
              textMessage: { text: item.mensagem }
            })
          });
        }

        if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
        const apiData = await res.json();

        // Sucesso
        await supabaseAdmin.from("fila_envio").update({
          status: "enviado",
          enviado_em: new Date().toISOString(),
          message_id: apiData?.key?.id || apiData?.messageId || null
        }).eq("id", item.id);

        // Atualiza contadores na campanha
        const { data: camp } = await supabaseAdmin
          .from("campanhas")
          .select("progresso")
          .eq("id", item.campanha_id)
          .single();

        if (camp) {
          const newProg = { 
            ...camp.progresso, 
            enviados: (camp.progresso.enviados || 0) + 1 
          };
          
          const isDone = newProg.enviados >= newProg.total;
          
          await supabaseAdmin.from("campanhas").update({
            progresso: newProg,
            status: isDone ? "concluida" : "em_andamento",
            concluded_at: isDone ? new Date().toISOString() : null
          }).eq("id", item.campanha_id);
        }

        return { success: true, phone: item.phone };
      } catch (err: any) {
        console.error(`[Cron] Erro ao enviar para ${item.phone}:`, err.message);
        await supabaseAdmin.from("fila_envio").update({ status: "falhou" }).eq("id", item.id);
        
        // Atualiza contadores de falha
        const { data: camp } = await supabaseAdmin
          .from("campanhas")
          .select("progresso")
          .eq("id", item.campanha_id)
          .single();

        if (camp) {
          await supabaseAdmin.from("campanhas").update({
            progresso: { 
              ...camp.progresso, 
              falhos: (camp.progresso.falhos || 0) + 1 
            }
          }).eq("id", item.campanha_id);
        }

        return { success: false, phone: item.phone, error: err.message };
      }
    }));

    return NextResponse.json({ ok: true, processed: items.length, results });
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
