import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { ids } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Nenhum lead selecionado." }, { status: 400 });
    }

    const batch = adminDb.batch();
    let count = 0;

    for (const id of ids) {
      const leadRef = adminDb.collection("leads").doc(id);
      batch.update(leadRef, { 
        wa_status: "PENDENTE",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error("[ValidateBase Admin] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
