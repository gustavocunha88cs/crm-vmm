import { NextRequest, NextResponse } from "next/server";
import { getInstanceStatus, createInstance } from "@/lib/evolution/client";
import { getAuthUserId } from "@/lib/auth-server";

/**
 * GET /api/whatsapp/status
 * Returns the current WhatsApp connection state for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const userIdOriginal = await getAuthUserId(req);
    if (!userIdOriginal) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const userId = userIdOriginal.toLowerCase();

    // Ensure instance exists for this user (idempotent)
    await createInstance(userId).catch(() => {
      // Instance may already exist — that's fine
    });

    const status = await getInstanceStatus(userId);
    return NextResponse.json(status);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message, state: "unknown" },
      { status: 500 }
    );
  }
}
