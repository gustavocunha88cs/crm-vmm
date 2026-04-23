export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import {
  getCampanha,
  updateCampanha,
  deleteCampanha,
} from "@/lib/supabase/services/campanhas";
import { getAuthUserId } from "@/lib/auth-server";

// GET /api/campanhas/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const campanha = await getCampanha(userId, id);
    if (!campanha)
      return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json({ campanha });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// PATCH /api/campanhas/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    await updateCampanha(userId, id, body);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/campanhas/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    await deleteCampanha(userId, id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
