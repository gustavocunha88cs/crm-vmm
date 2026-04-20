import { NextRequest, NextResponse } from "next/server";
import { getTagsAdmin, createTagAdmin } from "@/lib/firebase/collections-admin";
import { getAuthUserId } from "@/lib/auth-server";

// GET /api/tags
export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tags = await getTagsAdmin(userId);
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

  const palette = [
    "#4E6550", "#28352A", "#6B8F6E", "#3D5C40",
    "#8BA888", "#2C4A2E", "#5C7A5F", "#1A3320",
  ];
  const color =
    body.color ?? palette[Math.floor(Math.random() * palette.length)];

  try {
    const tag = await createTagAdmin(userId, body.name, color);
    return NextResponse.json({ tag });
  } catch (err: unknown) {
    console.error("POST /api/tags error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
