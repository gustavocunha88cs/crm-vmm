import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  doc,
  getDoc,
  updateDoc,
  where,
  limit,
  documentId,
} from "firebase/firestore";
import { db } from "./client";
import type { Lead, Tag, ScraperLead } from "@/types";

// ─── Collection References ────────────────────────────────────────────────────
export const leadsCol = () => {
  if (!db) throw new Error("Firebase Firestore não inicializado.");
  return collection(db, "leads");
};
export const tagsCol = () => {
  if (!db) throw new Error("Firebase Firestore não inicializado.");
  return collection(db, "tags");
};
export const campanhasCol = () => {
  if (!db) throw new Error("Firebase Firestore não inicializado.");
  return collection(db, "campanhas");
};
export const filaEnvioCol = () => {
  if (!db) throw new Error("Firebase Firestore não inicializado.");
  return collection(db, "filaEnvio");
};

// ─── Tags ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all tags for a user ordered by name.
 */
export async function getTags(userId: string): Promise<Tag[]> {
  const q = query(
    tagsCol(), 
    where("userId", "==", userId),
    orderBy("name")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tag));
}

/**
 * Create a new tag for a user. Returns the created Tag with id.
 * Prevents duplicates by checking name first.
 */
export async function createTag(userId: string, name: string, color: string): Promise<Tag> {
  const trimmed = name.trim().toLowerCase().replace(/\s+/g, "-");

  // Check for duplicate for this user
  const existing = query(
    tagsCol(), 
    where("userId", "==", userId),
    where("name", "==", trimmed), 
    limit(1)
  );
  const snap = await getDocs(existing);
  if (!snap.empty) {
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Tag;
  }

  const payload = {
    userId,
    name: trimmed,
    color,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(tagsCol(), payload);

  return { id: ref.id, userId, name: trimmed, color, createdAt: new Date() };
}

// ─── Leads ────────────────────────────────────────────────────────────────────

/**
 * Save a batch of scraped leads to Firestore for a user.
 * Uses Firestore batch writes (max 500 per batch).
 * Returns { saved, skipped } counts.
 */
export async function saveLeadsToFirestore(
  userId: string,
  scraperLeads: ScraperLead[],
  tagIds: string[],
  batchId: string,
  onlyValidWA: boolean = false
): Promise<{ saved: number; skipped: number }> {
  if (!scraperLeads.length) return { saved: 0, skipped: 0 };

  // Split into chunks of 499 (Firestore batch limit is 500)
  const chunks = chunkArray(scraperLeads, 499);
  let saved = 0;
  let skipped = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(db);

    for (const raw of chunk) {
      // Skip leads without phone (useless for WhatsApp campaigns)
      if (!raw.phone) {
        skipped++;
        continue;
      }

      const normalizedPhone = normalizePhone(raw.phone);
      const leadRef = doc(leadsCol());

      const lead: Omit<Lead, "id"> = {
        userId,
        title: raw.title ?? "",
        address: raw.address ?? "",
        city: raw.city ?? "",
        state: raw.state ?? "",
        phone: normalizedPhone,
        website: raw.website ?? "",
        url: raw.url ?? "",
        totalScore: raw.totalScore ?? 0,
        reviewsCount: raw.reviewsCount ?? 0,
        categoryName: raw.categoryName ?? "",
        email: raw.email ?? "",
        tags: tagIds,
        status: "novo",
        wa_status: "PENDENTE",
        createdAt: serverTimestamp() as unknown as string,
        importBatchId: batchId,
      };

      batch.set(leadRef, lead);
      saved++;
    }

    await batch.commit();
  }

  return { saved, skipped };
}

/**
 * Fetch leads for a user, optionally filtered by tag.
 */
export async function getLeads(userId: string, tagId?: string): Promise<Lead[]> {
  let q;
  if (tagId) {
    q = query(
      leadsCol(),
      where("userId", "==", userId),
      where("tags", "array-contains", tagId),
      orderBy("createdAt", "desc")
    );
  } else {
    q = query(
      leadsCol(), 
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function getLead(id: string): Promise<Lead | null> {
  const ref = doc(leadsCol(), id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Lead;
}

export async function updateLead(id: string, data: Partial<Lead>): Promise<void> {
  const ref = doc(leadsCol(), id);
  await updateDoc(ref, data as any);
}

/**
 * Delete leads by their IDs in chunks to respect Firestore limits.
 */
export async function deleteLeads(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  let deletedCount = 0;
  
  const chunks = chunkArray(ids, 499);
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(leadsCol(), id));
      deletedCount++;
    }
    await batch.commit();
  }
  
  return deletedCount;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Normalize phone to E.164 Brazilian format: 55 + DDD + number
 * Handles: (82) 9 9999-9999, 82999999999, +5582999999999, etc.
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`; // DDD + 9 digits
  if (digits.length === 10) return `55${digits}`; // DDD + 8 digits
  return digits;
}

export async function getLeadsByIds(ids: string[]): Promise<Lead[]> {
  if (!ids.length) return [];

  const results: Lead[] = [];
  // Chunk into groups of 30 (Firestore "in" limit)
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const q = query(leadsCol(), where(documentId(), "in", chunk));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => results.push({ id: d.id, ...d.data() } as Lead));
  }
  return results;
}

/**
 * Fetch leads for a user that have ALL the specified tags.
 */
export async function getLeadsByTags(userId: string, tagIds: string[]): Promise<Lead[]> {
  if (!tagIds.length) {
    // No filter → return all leads for this user
    return getLeads(userId);
  }

  // Use array-contains on first tag, then filter client-side for the rest
  const q = query(
    leadsCol(),
    where("userId", "==", userId),
    where("tags", "array-contains", tagIds[0]),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));

  if (tagIds.length === 1) return all;

  // AND filter for additional tags
  return all.filter((lead) =>
    tagIds.every((tid) => lead.tags?.includes(tid))
  );
}
