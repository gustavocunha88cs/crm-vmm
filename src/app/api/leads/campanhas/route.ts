import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    const [filaRes, campRes] = await Promise.all([
      supabaseAdmin.from("fila_envio").select("lead_id, campanha_id, status").eq("user_id", userId),
      supabaseAdmin.from("campanhas").select("id, nome").eq("user_id", userId)
    ]);

    if (filaRes.error) throw filaRes.error;
    if (campRes.error) throw campRes.error;

    const campMap: Record<string, string> = {};
    campRes.data.forEach(c => {
      campMap[c.id] = c.nome;
    });

    const leadMap: Record<string, any[]> = {};

    filaRes.data.forEach(row => {
      const leadId = row.lead_id;
      if (!leadId) return;

      if (!leadMap[leadId]) leadMap[leadId] = [];
      
      leadMap[leadId].push({
        campanhaId: row.campanha_id,
        campanhaNome: campMap[row.campanha_id] || "Campanha removida",
        status: row.status
      });
    });

    return NextResponse.json(leadMap);
  } catch (err: any) {
    console.error("Error in /api/leads/campanhas:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
