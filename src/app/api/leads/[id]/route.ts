import { NextRequest, NextResponse } from "next/server";
import { updateLeadAdmin } from "@/lib/firebase/collections-admin";
import { getAuthUserId } from "@/lib/auth-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const data = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });
    }

    // Use admin version with userId check
    await updateLeadAdmin(userId, id, data);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Erro ao atualizar lead:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
