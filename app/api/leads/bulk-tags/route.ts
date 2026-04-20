export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/client";
import { doc, writeBatch, arrayUnion, arrayRemove } from "firebase/firestore";
import { getAuthUserId } from "@/lib/auth-server";

export async function PATCH(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { ids, tagIds, mode = "add" } = await req.json();

    if (!ids || !Array.isArray(ids) || !tagIds || !Array.isArray(tagIds)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const batch = writeBatch(db);

    for (const id of ids) {
      // Ideally verify lead belongs to userId first
      const leadRef = doc(db, "leads", id);
      
      if (mode === "set") {
        batch.update(leadRef, { 
          tags: tagIds, 
          updatedAt: new Date().toISOString() 
        });
      } else if (mode === "add") {
        batch.update(leadRef, { 
          tags: arrayUnion(...tagIds), 
          updatedAt: new Date().toISOString() 
        });
      } else if (mode === "remove") {
        batch.update(leadRef, { 
          tags: arrayRemove(...tagIds), 
          updatedAt: new Date().toISOString() 
        });
      }
    }

    await batch.commit();
    return NextResponse.json({ success: true, count: ids.length });
  } catch (err: any) {
    console.error("[BulkTags] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
