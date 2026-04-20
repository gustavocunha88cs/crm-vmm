import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/client";
import { collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await params;
  
  try {
    const q = query(
      collection(db, "filaEnvio"),
      where("campanhaId", "==", id),
      where("status", "in", ["pendente", "enviando"]),
      limit(1)
    );

    const snap = await getDocs(q);
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
