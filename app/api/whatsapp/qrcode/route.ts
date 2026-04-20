import { NextRequest, NextResponse } from "next/server";
import { getQRCode, getInstanceStatus } from "@/lib/evolution/client";
import { getAuthUserId } from "@/lib/auth-server";

/**
 * GET /api/whatsapp/qrcode
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const status = await getInstanceStatus(userId);

    if (status.state === "open") {
      return NextResponse.json(
        { error: "WhatsApp já está conectado" },
        { status: 409 }
      );
    }

    const qr = await getQRCode(userId);

    if (!qr) {
      return NextResponse.json(
        { error: "QR code ainda não disponível. Tente novamente em alguns segundos." },
        { status: 404 }
      );
    }

    return NextResponse.json(qr);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
