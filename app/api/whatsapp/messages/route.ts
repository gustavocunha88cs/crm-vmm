import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getAuthUserId } from "@/lib/auth-server";
import * as admin from "firebase-admin";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const chatId = req.nextUrl.searchParams.get("chatId");
  const before = req.nextUrl.searchParams.get("before"); // ISO timestamp for pagination

  if (!chatId) {
    return NextResponse.json({ error: "chatId é obrigatório" }, { status: 400 });
  }

  // Security: ensure the chatId belongs to this user
  if (!chatId.startsWith(userId + "_")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    let query = adminDb
      .collection("mensagens")
      .where("chatId", "==", chatId)
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(PAGE_SIZE + 1); // fetch one extra to detect hasMore

    // Pagination: load messages older than `before`
    if (before) {
      const beforeDate = new Date(before);
      const beforeTimestamp = admin.firestore.Timestamp.fromDate(beforeDate);
      query = query.startAfter(beforeTimestamp) as any;
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    // Reverse so messages are chronological (oldest first)
    const messages = docs.reverse().map((d) => {
      const data = d.data();
      return {
        id: d.id,
        chatId: data.chatId,
        userId: data.userId,
        remoteJid: data.remoteJid,
        body: data.body || "",
        fromMe: data.fromMe ?? false,
        timestamp: data.timestamp?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        status: data.status || "RECEIVED",
      };
    });

    return NextResponse.json({ messages, hasMore });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
