export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCampanhas, createCampanha } from "@/lib/supabase/services/campanhas";
import type { Campanha } from "@/types/campanhas";
import { getAuthUserId } from "@/lib/auth-server";

// GET /api/campanhas
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const campanhas = await getCampanhas(userId);
    return NextResponse.json({ campanhas });
  } catch (err: unknown) {
    console.error("GET /api/campanhas error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/campanhas
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: Omit<Campanha, "id" | "createdAt" | "progresso" | "status" | "userId">;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }
  if (!body.mensagens?.length) {
    return NextResponse.json(
      { error: "Ao menos uma mensagem é obrigatória" },
      { status: 400 }
    );
  }

  try {
    const campanha = await createCampanha(userId, body);
    return NextResponse.json({ campanha }, { status: 201 });
  } catch (err: unknown) {
    console.error("POST /api/campanhas error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
