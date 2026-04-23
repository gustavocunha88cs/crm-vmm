import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-server";
import { sendText, getInstanceStatus } from "@/lib/evolution/client";

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { phone: string; text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.phone || !body.text?.trim()) {
    return NextResponse.json(
      { error: "phone e text são obrigatórios" },
      { status: 400 }
    );
  }

  // Check connection
  const status = await getInstanceStatus(userId);
  if (status.state !== "open") {
    return NextResponse.json(
      { error: "WhatsApp não está conectado" },
      { status: 400 }
    );
  }

  try {
    const result = await sendText(userId, body.phone, body.text);
    const messageId = result.key?.id;

    return NextResponse.json({
      ok: true,
      messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
