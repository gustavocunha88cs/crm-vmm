import { NextRequest, NextResponse } from "next/server";
import { pauseCampanha, resumeCampanha, getCampanha } from "@/lib/firebase/campanhas";

// POST /api/campanhas/[id]/pause
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await params;
  const campanha = await getCampanha(id);
  if (!campanha)
    return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  try {
    if (campanha.status === "ativa") {
      await pauseCampanha(id);
      return NextResponse.json({ ok: true, status: "pausada" });
    } else if (campanha.status === "pausada") {
      await resumeCampanha(id);
      return NextResponse.json({ ok: true, status: "ativa" });
    } else {
      return NextResponse.json(
        { error: `Não é possível pausar/retomar campanha com status "${campanha.status}"` },
        { status: 409 }
      );
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
