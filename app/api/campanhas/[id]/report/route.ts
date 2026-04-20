import { NextRequest, NextResponse } from "next/server";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = await params;
    const filaCol = collection(db, "filaEnvio");
    
    // Buscar todos os itens da fila para esta campanha
    const q = query(
      filaCol,
      where("campanhaId", "==", id)
      // Ordenar por agendamento ou envio se desejar, mas em local sem indice composto pode falhar
    );

    const snap = await getDocs(q);
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
