import { NextRequest, NextResponse } from "next/server";
import { disconnectInstance } from "@/lib/evolution/client";
import { getAuthUserId } from "@/lib/auth-server";

/**
 * POST /api/whatsapp/disconnect
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await disconnectInstance(userId);
    return NextResponse.json({ ok: true, state: "close" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
