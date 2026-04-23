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
const PREFIX = "crm-vmm-";

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
      const instanceName = `${PREFIX}${item.user_id.substring(0, 8).toLowerCase()}`;

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

        const data = await res.json();

        if (res.ok) {
          // Sucesso
          await supabaseAdmin.from("fila_envio").update({
            status: "enviado",
            enviado_em: new Date().toISOString(),
            message_id: data.key?.id || data.messageId
          }).eq("id", item.id);

          // Atualiza progresso da campanha
          const { data: camp } = await supabaseAdmin
            .from("campanhas")
            .select("progresso")
            .eq("id", item.campanha_id)
            .single();

          if (camp) {
            const prog = camp.progresso || { total: 0, enviados: 0, falhos: 0 };
            prog.enviados = (prog.enviados || 0) + 1;
            
            const isDone = prog.enviados + (prog.falhos || 0) >= prog.total;
            
            await supabaseAdmin.from("campanhas").update({
              progresso: prog,
              status: isDone ? "concluida" : "ativa",
              concluded_at: isDone ? new Date().toISOString() : null
            }).eq("id", item.campanha_id);
          }

          return { id: item.id, status: "success" };
        } else {
          throw new Error(data.message || "Erro no envio");
        }
      } catch (err: any) {
        console.error(`[Worker] Erro no item ${item.id}:`, err.message);
        
        await supabaseAdmin.from("fila_envio").update({
          status: "falhou",
          erro: err.message
        }).eq("id", item.id);

        // Atualiza falha na campanha
        const { data: camp } = await supabaseAdmin
          .from("campanhas")
          .select("progresso")
          .eq("id", item.campanha_id)
          .single();

        if (camp) {
          const prog = camp.progresso || { total: 0, enviados: 0, falhos: 0 };
          prog.falhos = (prog.falhos || 0) + 1;
          await supabaseAdmin.from("campanhas").update({ progresso: prog }).eq("id", item.campanha_id);
        }

        return { id: item.id, status: "failed", error: err.message };
      }
    }));

    // Sincronização de chats removida para evitar erros de build com Firebase
    return NextResponse.json({
      ok: true,
      processed: results.length,
      results
    });

  } catch (error: any) {
    console.error("[Worker Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
