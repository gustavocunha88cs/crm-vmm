export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("fila_envio")
      .select("*")
      .eq("user_id", userId)
      .eq("campanha_id", id)
      .order("agendado_para", { ascending: false });

    if (error) throw error;

    const results = (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      campanhaId: row.campanha_id,
      leadId: row.lead_id,
      leadNome: row.lead_nome,
      phone: row.phone,
      mensagem: row.mensagem,
      status: row.status,
      agendadoPara: row.agendado_para,
      enviadoEm: row.enviado_em,
      erro: row.erro,
    }));

    return NextResponse.json({ results });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
