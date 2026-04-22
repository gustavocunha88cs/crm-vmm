import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";

/**
 * GET /api/leads/campanhas
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const [filaSnap, campSnap] = await Promise.all([
      adminDb.collection("filaEnvio").where("userId", "==", userId).get(),
      adminDb.collection("campanhas").where("userId", "==", userId).get()
    ]);

    const campMap: Record<string, string> = {};
    campSnap.docs.forEach(d => {
      campMap[d.id] = d.data().nome;
    });

    const leadMap: Record<string, any[]> = {};

    filaSnap.docs.forEach(d => {
      const data = d.data();
      const leadId = data.leadId;
      if (!leadId) return;

      if (!leadMap[leadId]) leadMap[leadId] = [];
      
      leadMap[leadId].push({
        campanhaId: data.campanhaId,
        campanhaNome: campMap[data.campanhaId] || "Campanha removida",
        status: data.status
      });
    });

    return NextResponse.json(leadMap);
  } catch (err: any) {
    console.error("Error in /api/leads/campanhas:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
