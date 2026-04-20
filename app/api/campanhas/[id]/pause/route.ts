import { NextRequest, NextResponse } from "next/server";
import { getCampanhaAdmin, updateCampanhaAdmin } from "@/lib/firebase/collections-admin";
import { getAuthUserId } from "@/lib/auth-server";
import * as admin from "firebase-admin";

// POST /api/campanhas/[id]/pause
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const campanha = await getCampanhaAdmin(userId, id);
  
  if (!campanha)
    return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  try {
    if (campanha.status === "ativa") {
      await updateCampanhaAdmin(userId, id, {
        status: "pausada",
        pausedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      });
      return NextResponse.json({ ok: true, status: "pausada" });
    } else if (campanha.status === "pausada") {
      await updateCampanhaAdmin(userId, id, {
        status: "ativa",
        pausedAt: null,
      });
      return NextResponse.json({ ok: true, status: "ativa" });
    } else {
      return NextResponse.json(
        { error: `Não é possível pausar/retomar campanha com status "${campanha.status}"` },
        { status: 409 }
      );
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
