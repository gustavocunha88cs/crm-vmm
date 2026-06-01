import { NextRequest, NextResponse } from "next/server";
import { createInstance, getInstanceStatus } from "@/lib/evolution/client";
import { getAuthUserId } from "@/lib/auth-server";

/**
 * POST /api/whatsapp/connect
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    console.log(`[CRM] Iniciando tentativa de conexão para usuário ${userId}...`);

    try {
      await createInstance(userId);
    } catch (createErr: any) {
      console.warn("[CRM] createInstance aviso:", createErr.message);
    }

    const status = await getInstanceStatus(userId);

    return NextResponse.json({
      ok: true,
      state: status.state === "open" ? "open" : "connecting",
      message:
        status.state === "open"
          ? "WhatsApp já conectado"
          : "Pronto para ler QR Code",
    });
  } catch (err: any) {
    console.error("[ERRO NO CRM CONNECT]:", err.message);

    if (err.message.includes("401")) {
      return NextResponse.json({ error: "API Key inválida" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Erro na comunicação interna", details: err.message },
      { status: 500 },
    );
  }
}