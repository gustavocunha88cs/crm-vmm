import { NextRequest, NextResponse } from "next/server";
import { getInstanceStatus, getEvolutionConfig } from "@/lib/evolution/client";
import { getLeads } from "@/lib/firebase/collections";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const status = await getInstanceStatus(userId);
    if (status.state !== "open") {
      return NextResponse.json({ error: "WhatsApp não está conectado" }, { status: 400 });
    }

    const { serverUrl, apiKey, instanceName } = await getEvolutionConfig(userId);

    const res = await fetch(`${serverUrl.replace(/\/$/, "")}/chat/findChats/${instanceName}?type=all`, {
      method: "GET",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) {
      throw new Error(`Evolution API Error: ${res.status}`);
    }
    
    const data = await res.json();
    let chats = [];
    if (Array.isArray(data)) {
      chats = data;
    } else if (data && Array.isArray(data.chats)) {
      chats = data.chats;
    } else if (data && typeof data === 'object') {
       const possibleArray = Object.values(data).find(v => Array.isArray(v));
       if (possibleArray) chats = possibleArray as any[];
    }

    chats.sort((a: any, b: any) => {
      const timeA = a.lastMsgTimestamp || a.updatedAt || 0;
      const timeB = b.lastMsgTimestamp || b.updatedAt || 0;
      return timeB - timeA;
    });

    const normalizePhone = (p: string) => p.replace(/\D/g, "").slice(-8); 

    const leads = await getLeads(userId);
    const leadMap = new Map();
    leads.forEach(l => {
      if (l.phone) {
        const norm = normalizePhone(l.phone);
        if (l.title) leadMap.set(norm, l.title);
      }
    });
    
    chats = chats.map((c: any) => {
      const fullJid = c.id;
      const phoneRaw = fullJid?.split("@")[0] || "";
      const normPhone = normalizePhone(phoneRaw);
      
      if (!c.name || c.name === phoneRaw || (typeof c.name === 'string' && c.name.includes("@"))) {
         if (normPhone && leadMap.has(normPhone)) {
            c.name = leadMap.get(normPhone);
         }
      }
      return c;
    });

    return NextResponse.json({ chats });
  } catch (err: unknown) {
    console.error("[CRM] Fetch Chats Error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
