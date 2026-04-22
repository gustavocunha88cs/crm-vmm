import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const snap = await adminDb
      .collection("chats")
      .where("userId", "==", userId)
      .orderBy("lastMessageTime", "desc")
      .limit(100)
      .get();

    const chats = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        remoteJid: data.remoteJid,
        name: data.name || formatNumber(data.remoteJid),
        lastMessage: data.lastMessage || "",
        lastMessageTime: data.lastMessageTime?.toDate?.()?.toISOString() ?? null,
        unreadCount: data.unreadCount ?? 0,
      };
    });

    return NextResponse.json({ chats });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

function formatNumber(remoteJid: string): string {
  const num = remoteJid.split("@")[0];
  // Format Brazilian number: 5582999999999 → (82) 99999-9999
  if (num.startsWith("55") && num.length >= 12) {
    const ddd  = num.slice(2, 4);
    const rest = num.slice(4);
    if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return num;
}
