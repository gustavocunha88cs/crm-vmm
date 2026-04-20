import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-server";
import { sendText, getUserInstanceName, getInstanceStatus } from "@/lib/evolution/client";
import { adminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { phone: string; text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.phone || !body.text?.trim()) {
    return NextResponse.json(
      { error: "phone e text são obrigatórios" },
      { status: 400 }
    );
  }

  // Check connection
  const status = await getInstanceStatus(userId);
  if (status.state !== "open") {
    return NextResponse.json(
      { error: "WhatsApp não está conectado" },
      { status: 400 }
    );
  }

  try {
    const result = await sendText(userId, body.phone, body.text);
    const messageId = result.key?.id;

    // Save sent message to Firestore so it appears in chat immediately
    const remoteJid = `${body.phone}@s.whatsapp.net`;
    const chatId = `${userId}_${remoteJid}`;
    const now = admin.firestore.Timestamp.now();

    if (messageId) {
      const docId = `${userId}_${messageId}`;
      await adminDb.collection("mensagens").doc(docId).set({
        userId,
        chatId,
        remoteJid,
        body: body.text,
        fromMe: true,
        timestamp: now,
        status: "SENT",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Update chat's lastMessage
    await adminDb.collection("chats").doc(chatId).set({
      userId,
      remoteJid,
      name: body.phone,
      lastMessage: body.text,
      lastMessageTime: now,
      unreadCount: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      messageId,
      timestamp: now.toDate().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
