import { NextRequest, NextResponse } from "next/server";
import { findLeadByPhone, updateLeadStatus } from "@/lib/firebase/leads-webhook";
import { LeadStatus, LeadTemperature } from "@/types";

const HOT_KEYWORDS = ["valor", "preço", "quanto", "custo", "interessado", "quero", "contrato", "reunião", "agendar"];

/**
 * Extract userId from instance name (crm-vmm-<userId>)
 */
function extractUserId(instance: string): string | null {
  if (instance.startsWith("crm-vmm-")) {
    return instance.replace("crm-vmm-", "");
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, instance, data } = body;

    console.log(`[Webhook Evolution] Evento: ${event} na instância: ${instance}`);

    const userId = extractUserId(instance);
    if (!userId) {
       // If it's the default instance or unknown, we can't easily map it 
       // unless we have a mapping. For now, we skip if not in user format.
       console.log(`[Webhook] Ignorando instância não mapeada para usuário: ${instance}`);
       return NextResponse.json({ ok: true });
    }

    if (event === "messages.upsert") {
      const message = data.message;
      const key = data.key;
      const fromMe = key.fromMe;
      const remoteJid = key.remoteJid;
      const phone = remoteJid.split("@")[0];

      if (!fromMe) {
        const lead = await findLeadByPhone(userId, phone);
        if (lead) {
          const text = (message?.conversation || message?.extendedTextMessage?.text || "").toLowerCase();
          
          let newTemperature: LeadTemperature = lead.temperature || "morno";
          let newStatus: LeadStatus = "respondido";

          const isHot = HOT_KEYWORDS.some(kw => text.includes(kw));
          if (isHot) {
            newTemperature = "quente";
            newStatus = "oportunidade";
          } else if (!lead.temperature || lead.temperature === "frio") {
             newTemperature = "morno";
          }

          await updateLeadStatus(lead.id!, {
            status: newStatus,
            temperature: newTemperature,
            lastMessageAt: new Date().toISOString()
          });
          
          console.log(`[Webhook] Lead ${phone} (User: ${userId}) atualizado para ${newStatus} (${newTemperature})`);
        }
      }
    }

    if (event === "messages.update") {
      const key = data.key;
      const update = data.update;
      const status = update.status; 
      const remoteJid = key.remoteJid;
      const phone = remoteJid.split("@")[0];

      if (key.fromMe) {
        const lead = await findLeadByPhone(userId, phone);
        if (lead) {
          let newStatus: LeadStatus = lead.status;
          
          if (status === "READ") newStatus = "lido";
          else if (status === "DELIVERY" && lead.status !== "lido" && lead.status !== "respondido") newStatus = "entregue";
          else if (status === "SERVER" && lead.status === "novo") newStatus = "enviado";

          await updateLeadStatus(lead.id!, { status: newStatus });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Webhook Error]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
