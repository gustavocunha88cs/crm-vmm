import { NextRequest, NextResponse } from "next/server";
import { getCampanhaAdmin, startCampanhaAdmin, getLeadsByIdsAdmin } from "@/lib/firebase/collections-admin";
import { getAuthUserId } from "@/lib/auth-server";

// POST /api/campanhas/[id]/start
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  
  try {
    const campanha = await getCampanhaAdmin(userId, id);
    
    if (!campanha)
      return NextResponse.json({ error: "Campanha não encontrada ou acesso negado" }, { status: 404 });

    if (campanha.status === "ativa")
      return NextResponse.json({ error: "Campanha já está ativa" }, { status: 409 });

    if (!campanha.leadIds?.length)
      return NextResponse.json({ error: "Nenhum lead selecionado" }, { status: 400 });

    const leads = await getLeadsByIdsAdmin(userId, campanha.leadIds);
    const leadsComTelefone = leads.filter((l) => l.phone);

    if (!leadsComTelefone.length)
      return NextResponse.json(
        { error: "Nenhum lead com telefone válido" },
        { status: 400 }
      );

    await startCampanhaAdmin(
      userId,
      id,
      leadsComTelefone.map((l: any) => ({
        id: l.id!,
        phone: l.phone!,
        title: l.title || "Sem Nome",
      })),
      campanha.mensagens || [],
      Number(campanha.intervaloMin || 60),
      Number(campanha.intervaloMax || 120)
    );

    return NextResponse.json({
      ok: true,
      totalEnfileirados: leadsComTelefone.length,
    });
  } catch (err: unknown) {
    console.error("Start Campanha error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
