import { NextRequest, NextResponse } from "next/server";
import { getInstanceStatus, getEvolutionConfig } from "@/lib/evolution/client";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> | { jid: string } }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { jid } = await params;
    const status = await getInstanceStatus(userId);
    if (status.state !== "open") {
      return NextResponse.json({ error: "WhatsApp não está conectado" }, { status: 400 });
    }

    const { serverUrl, apiKey, instanceName } = await getEvolutionConfig(userId);
    const decodedJid = decodeURIComponent(jid);

    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, "")}/chat/findMessages/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ 
          where: { remoteJid: decodedJid },
          take: 50 
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      let messages = Array.isArray(data) ? data : (data.messages ?? []);
      
      messages.sort((a: any, b: any) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
      
      return NextResponse.json({ messages });
    } catch {
      return NextResponse.json({ messages: [] });
    }

  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
