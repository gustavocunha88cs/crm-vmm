export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getTags, createTag } from "@/lib/supabase/services/leads";
import { getAuthUserId } from "@/lib/auth-server";

// GET /api/tags
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tags = await getTags(userId);
    return NextResponse.json({ tags });
  } catch (err: unknown) {
    console.error("GET /api/tags error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/tags
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { name: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json(
      { error: "Campo 'name' é obrigatório" },
      { status: 400 }
    );
  }

  try {
    const tag = await createTag(userId, body.name);
    return NextResponse.json({ tag });
  } catch (err: unknown) {
    console.error("POST /api/tags error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
