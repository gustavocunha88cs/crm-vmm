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
    const leadsSnap = await adminDb.collection("leads")
      .where("userId", "==", userId)
      .where("wa_status", "==", "PENDENTE")
      .get();
    
    if (leadsSnap.empty) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const batch = adminDb.batch();
    let count = 0;

    leadsSnap.docs.forEach(d => {
      batch.update(d.ref, { 
        wa_status: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    });

    await batch.commit();

    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error("[CancelValidation Admin] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
