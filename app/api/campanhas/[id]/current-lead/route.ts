import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  
  try {
    const snap = await adminDb.collection("filaEnvio")
      .where("userId", "==", userId)
      .where("campanhaId", "==", id)
      .where("status", "in", ["pendente", "enviando"])
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ current: null });
    }

    const data = snap.docs[0].data();
    return NextResponse.json({ 
      current: {
        phone: data.phone,
        leadNome: data.leadNome || "Desconhecido",
        status: data.status
      }
    });

  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
