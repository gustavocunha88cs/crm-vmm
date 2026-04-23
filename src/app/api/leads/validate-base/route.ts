import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

    const { error } = await supabaseAdmin
      .from("leads")
      .update({ 
        wa_status: "PENDENTE",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .in("id", ids);

    if (error) throw error;

    return NextResponse.json({ success: true, count: ids.length });
  } catch (err: any) {
    console.error("[ValidateBase Admin] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
