import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";
import { validateNumbersWithThrottling } from "@/lib/evolution/numbers";
import { getAuthUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Background Validation Worker (Cron) using Admin SDK to bypass rules
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const leadsSnap = await adminDb.collection("leads")
      .where("userId", "==", userId)
      .where("wa_status", "==", "PENDENTE")
      .limit(2)
      .get();
    
    if (leadsSnap.empty) {
      return NextResponse.json({ message: "Sem leads pendentes." });
    }

    const leadsToProcess = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const phones = leadsToProcess.map(l => l.phone).filter(Boolean);

    console.log(`[CronValidation Admin] User ${userId}: Validando ${phones.length} leads...`);
    const result = await validateNumbersWithThrottling(userId, phones);

    let count = 0;
    const batch = adminDb.batch();

    for (const lead of leadsToProcess) {
      const isValid = result.valid.includes(lead.phone);
      const isInvalid = result.invalid.includes(lead.phone);
      
      if (!isValid && !isInvalid) continue;

      const leadRef = adminDb.collection("leads").doc(lead.id);
      batch.update(leadRef, {
        wa_status: isValid ? "VALIDADO" : "INVÁLIDO",
        status: isValid ? lead.status : "perdido",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      processed: count,
      valid: result.valid.length,
      invalid: result.invalid.length,
      skipped: leadsToProcess.length - count
    });

  } catch (err: any) {
    console.error("[CronValidation Admin] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
