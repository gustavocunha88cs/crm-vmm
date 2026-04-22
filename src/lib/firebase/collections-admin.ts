import { adminDb } from "../firebase-admin";
import * as admin from "firebase-admin";
import type { Lead, Tag, ScraperLead } from "@/types";
import type { Campanha } from "@/types/campanhas";

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function getTagsAdmin(userId: string): Promise<Tag[]> {
  const snap = await adminDb
    .collection("tags")
    .where("userId", "==", userId)
    .orderBy("name")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tag));
}

export async function createTagAdmin(userId: string, name: string, color: string): Promise<Tag> {
  const trimmed = name.trim().toLowerCase().replace(/\s+/g, "-");
  
  const existing = await adminDb
    .collection("tags")
    .where("userId", "==", userId)
    .where("name", "==", trimmed)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { id: existing.docs[0].id, ...existing.docs[0].data() } as Tag;
  }

  const payload = {
    userId,
    name: trimmed,
    color,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await adminDb.collection("tags").add(payload);
  return { id: ref.id, ...payload, createdAt: new Date() } as any;
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getLeadsAdmin(userId: string, tagId?: string): Promise<Lead[]> {
  let query: admin.firestore.Query = adminDb.collection("leads").where("userId", "==", userId);
  
  if (tagId) {
    query = query.where("tags", "array-contains", tagId);
  }

  const snap = await query.orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function saveLeadsAdmin(
  userId: string,
  scraperLeads: ScraperLead[],
  tagIds: string[],
  batchId: string
): Promise<{ saved: number; skipped: number }> {
  if (!scraperLeads.length) return { saved: 0, skipped: 0 };

  const chunks = chunkArray(scraperLeads, 499);
  let saved = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const batch = adminDb.batch();
    for (const raw of chunk) {
      if (!raw.phone) { skipped++; continue; }
      
      const normalizedPhone = raw.phone.replace(/\D/g, "");
      const leadRef = adminDb.collection("leads").doc();
      
      batch.set(leadRef, {
        userId,
        title: raw.title ?? "",
        address: raw.address ?? "",
        city: raw.city ?? "",
        state: raw.state ?? "",
        phone: normalizedPhone.startsWith("55") ? normalizedPhone : `55${normalizedPhone}`,
        website: raw.website ?? "",
        url: raw.url ?? "",
        totalScore: raw.totalScore ?? 0,
        reviewsCount: raw.reviewsCount ?? 0,
        categoryName: raw.categoryName ?? "",
        email: raw.email ?? "",
        tags: tagIds,
        status: "novo",
        wa_status: "PENDENTE",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        acquisitionDate: admin.firestore.FieldValue.serverTimestamp(), // Nova Data de Aquisição
        importBatchId: batchId,
      });
      saved++;
    }
    await batch.commit();
  }
  return { saved, skipped };
}

export async function updateLeadAdmin(userId: string, id: string, data: Partial<Lead>): Promise<void> {
    const leadRef = adminDb.collection("leads").doc(id);
    const snap = await leadRef.get();
    if (snap.exists && snap.data()?.userId === userId) {
      await leadRef.update(data as any);
    } else {
      throw new Error("Não autorizado para atualizar este lead");
    }
}

export async function deleteLeadsAdmin(userId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    let deletedCount = 0;
    
    // Process in batches but check ownership for each
    const chunks = chunkArray(ids, 499);
    for (const chunk of chunks) {
      const batch = adminDb.batch();
      for (const id of chunk) {
        const ref = adminDb.collection("leads").doc(id);
        const snap = await ref.get();
        if (snap.exists && snap.data()?.userId === userId) {
          batch.delete(ref);
          deletedCount++;
        }
      }
      await batch.commit();
    }
    return deletedCount;
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

export async function getCampanhasAdmin(userId: string): Promise<Campanha[]> {
    const snap = await adminDb
      .collection("campanhas")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campanha));
}

export async function getCampanhaAdmin(userId: string, id: string): Promise<Campanha | null> {
  const snap = await adminDb.collection("campanhas").doc(id).get();
  if (!snap.exists || snap.data()?.userId !== userId) return null;
  return { id: snap.id, ...snap.data() } as Campanha;
}

export async function createCampanhaAdmin(
  userId: string,
  data: Omit<Campanha, "id" | "createdAt" | "progresso" | "status" | "userId">
): Promise<Campanha> {
  const payload = {
    ...data,
    userId,
    status: "rascunho" as const,
    progresso: { total: 0, enviados: 0, falhos: 0 },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    startedAt: null,
    pausedAt: null,
    concludedAt: null,
  };
  const ref = await adminDb.collection("campanhas").add(payload);
  return { id: ref.id, ...payload, createdAt: new Date().toISOString() } as any;
}

export async function updateCampanhaAdmin(userId: string, id: string, data: Partial<Campanha>): Promise<void> {
  const ref = adminDb.collection("campanhas").doc(id);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.userId === userId) {
    await ref.update(data as any);
  } else {
    throw new Error("Não autorizado para atualizar esta campanha");
  }
}

export async function deleteCampanhaAdmin(userId: string, id: string): Promise<void> {
  const ref = adminDb.collection("campanhas").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId) {
    throw new Error("Não autorizado para deletar esta campanha");
  }

  const batch = adminDb.batch();
  batch.delete(ref);
  
  const filaSnap = await adminDb.collection("filaEnvio").where("campanhaId", "==", id).get();
  filaSnap.docs.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
}

// ─── Activation ───────────────────────────────────────────────────────────────

export async function getLeadsByIdsAdmin(userId: string, ids: string[]): Promise<Lead[]> {
  if (!ids.length) return [];
  const results: Lead[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await adminDb.collection("leads")
      .where("userId", "==", userId)
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .get();
    snap.docs.forEach((d) => results.push({ id: d.id, ...d.data() } as Lead));
  }
  return results;
}

export async function startCampanhaAdmin(
  userId: string,
  campanhaId: string,
  leads: Array<{ id: string; phone: string; title: string }>,
  mensagens: string[],
  intervaloMinS: number = 60,
  intervaloMaxS: number = 120
): Promise<void> {
  const now = Date.now();
  
  // 1. Limpa fila anterior desta campanha para evitar duplicidades
  const existingQueue = await adminDb.collection("filaEnvio")
    .where("campanhaId", "==", campanhaId)
    .get();
  
  const deleteBatch = adminDb.batch();
  existingQueue.docs.forEach(doc => deleteBatch.delete(doc.ref));
  await deleteBatch.commit();

  const batch = adminDb.batch();
  const shuffledLeads = [...leads].sort(() => Math.random() - 0.5);
  
  let delayAcumulado = 0;
  shuffledLeads.forEach((lead, i) => {
    if (i > 0) {
      const min = Math.max(10, intervaloMinS);
      const max = Math.max(min, intervaloMaxS);
      const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
      delayAcumulado += randomDelay;
    }

    const rawMsg = mensagens[i % mensagens.length];
    const mensagem = rawMsg.replace(/\{nome\}/gi, lead.title).replace(/\{empresa\}/gi, lead.title);
    const agendadoPara = admin.firestore.Timestamp.fromMillis(now + delayAcumulado * 1000);
    const filaRef = adminDb.collection("filaEnvio").doc();
    
    batch.set(filaRef, {
      userId,
      campanhaId,
      leadId: lead.id,
      leadNome: lead.title,
      phone: lead.phone,
      mensagem,
      status: "pendente",
      tentativas: 0,
      agendadoPara,
      enviadoEm: null,
    });
  });

  const campanhaRef = adminDb.collection("campanhas").doc(campanhaId);
  batch.update(campanhaRef, {
    status: "ativa",
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    pausedAt: null,
    "progresso.total": leads.length,
    "progresso.enviados": 0,
    "progresso.falhos": 0,
  });

  await batch.commit();
}

// ─── Utils ─────────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
