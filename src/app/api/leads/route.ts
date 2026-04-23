export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLeads, saveLeadsToSupabase, deleteLeads } from "@/lib/supabase/services/leads";
import { nanoid } from "nanoid";
import type { ScraperLead } from "@/types";
import { getAuthUserId } from "@/lib/auth-server";

// GET /api/leads
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tagId = req.nextUrl.searchParams.get("tag") || undefined;
  
  try {
    const leads = await getLeads(userId, tagId);
    return NextResponse.json({ leads });
  } catch (err: unknown) {
    console.error("GET /api/leads error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/leads — bulk import
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { leads: ScraperLead[]; tagIds: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.leads?.length) {
    return NextResponse.json({ error: "Nenhum lead para importar" }, { status: 400 });
  }

  const batchId = nanoid(10);

  try {
    const result = await saveLeadsToSupabase(
      userId,
      body.leads,
      body.tagIds ?? [],
      batchId
    );
    return NextResponse.json({ ...result, batchId });
  } catch (err: any) {
    console.error("POST /api/leads error:", {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint
    });
    return NextResponse.json({ 
      error: err.message || "Erro desconhecido",
      details: err.details,
      code: err.code
    }, { status: 500 });
  }
}

// DELETE /api/leads — bulk delete
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body: { ids: string[] } = await req.json();
    if (!body.ids || !body.ids.length) {
      return NextResponse.json({ error: "Nenhum ID fornecido" }, { status: 400 });
    }

    const count = await deleteLeads(body.ids);
    return NextResponse.json({ success: true, count });
  } catch (err: unknown) {
    console.error("DELETE /api/leads error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
