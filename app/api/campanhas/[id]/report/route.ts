import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    
    // Buscar todos os itens da fila para esta campanha com filtro de userId
    const snap = await adminDb.collection("filaEnvio")
      .where("userId", "==", userId)
      .where("campanhaId", "==", id)
      .get();

    const results = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    // Ordenar no JS para evitar problemas de índice
    results.sort((a: any, b: any) => {
        const timeA = a.enviadoEm?.toMillis() || a.agendadoPara?.toMillis() || 0;
        const timeB = b.enviadoEm?.toMillis() || b.agendadoPara?.toMillis() || 0;
        return timeB - timeA; // Mais recentes primeiro
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
