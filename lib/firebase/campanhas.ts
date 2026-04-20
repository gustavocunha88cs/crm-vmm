/**
 * lib/firebase/campanhas.ts
 * All Firestore operations for the campanhas module.
 */

import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  writeBatch,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "./client";
import type { Campanha, FilaEnvio } from "@/types/campanhas";

// ─── Collection helpers ───────────────────────────────────────────────────────
const campanhasCol = () => collection(db, "campanhas");
const filaEnvioCol = () => collection(db, "filaEnvio");

// ─── Campanhas CRUD ───────────────────────────────────────────────────────────

export async function getCampanhas(userId: string): Promise<Campanha[]> {
  const q = query(
    campanhasCol(), 
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Campanha));
}

export async function getCampanha(id: string): Promise<Campanha | null> {
  const ref = doc(db, "campanhas", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Campanha;
}

export async function createCampanha(
  userId: string,
  data: Omit<Campanha, "id" | "createdAt" | "progresso" | "status" | "userId">
): Promise<Campanha> {
  const payload = {
    ...data,
    userId,
    status: "rascunho" as const,
    progresso: { total: 0, enviados: 0, falhos: 0 },
    createdAt: serverTimestamp(),
    startedAt: null,
    pausedAt: null,
    concludedAt: null,
  };
  const ref = await addDoc(campanhasCol(), payload);
  return { id: ref.id, ...payload, createdAt: new Date().toISOString() } as Campanha;
}

export async function updateCampanha(
  id: string,
  data: Partial<Campanha>
): Promise<void> {
  const ref = doc(db, "campanhas", id);
  await updateDoc(ref, data as Record<string, unknown>);
}

export async function deleteCampanha(id: string): Promise<void> {
  // Delete campanha doc
  await deleteDoc(doc(db, "campanhas", id));
  // Delete associated fila items
  const q = query(filaEnvioCol(), where("campanhaId", "==", id));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ─── Campanha Actions ─────────────────────────────────────────────────────────

/**
 * Activate campanha: build the fila and set status to "ativa".
 * Fetches leads from Firestore using leadIds, generates one fila item per lead.
 */
export async function startCampanha(
  userId: string,
  campanhaId: string,
  leads: Array<{ id: string; phone: string; title: string }>,
  mensagens: string[]
): Promise<void> {
    const batch = writeBatch(db);
  const now = Date.now();
  
  // Embaralhar leads para evitar padrões robóticos na sequência de mensagens
  const shuffledLeads = [...leads].sort(() => Math.random() - 0.5);
  
  const campanhaDoc = await getCampanha(campanhaId);

  // Enfileira com atraso progressivo aleatório
  let delayAcumulado = 0;
  
  shuffledLeads.forEach((lead, i) => {
    // 0 para o primeiro, depois atraso aleatório entre min e max
    if (i > 0) {
      // O banco já deve conter o valor em SEGUNDOS (ex: 60 se o user escolheu 1 min)
      let minS = Number(campanhaDoc?.intervaloMin || 60);
      let maxS = Number(campanhaDoc?.intervaloMax || 120);

      // Se por algum motivo o valor vier como "1" (minuto sem converter), corrigimos para 60s
      if (minS < 30) minS = minS * 60;
      if (maxS < 30) maxS = maxS * 60;

      const randomDelay = Math.floor(Math.random() * (maxS - minS + 1)) + minS;
      delayAcumulado += randomDelay;
    }

    const mensagem = sortearMensagem(mensagens, lead, i);
    const agendadoPara = Timestamp.fromMillis(now + delayAcumulado * 1000);
    const filaRef = doc(filaEnvioCol());
    
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
    } satisfies Omit<FilaEnvio, "id">);
  });

  // Update campanha status
  const campanhaRef = doc(db, "campanhas", campanhaId);
  batch.update(campanhaRef, {
    status: "ativa",
    startedAt: serverTimestamp(),
    pausedAt: null,
    "progresso.total": leads.length,
    "progresso.enviados": 0,
    "progresso.falhos": 0,
  });

  await batch.commit();
}

export async function pauseCampanha(campanhaId: string): Promise<void> {
  await updateDoc(doc(db, "campanhas", campanhaId), {
    status: "pausada",
    pausedAt: serverTimestamp(),
  });
}

export async function resumeCampanha(campanhaId: string): Promise<void> {
  await updateDoc(doc(db, "campanhas", campanhaId), {
    status: "ativa",
    pausedAt: null,
  });
}

// ─── Fila queries ─────────────────────────────────────────────────────────────

export async function getFilaByCampanha(campanhaId: string): Promise<FilaEnvio[]> {
  const q = query(
    filaEnvioCol(),
    where("campanhaId", "==", campanhaId),
    orderBy("agendadoPara", "asc"),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FilaEnvio));
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Pick a random message from the array and substitute variables.
 */
function sortearMensagem(
  mensagens: string[],
  lead: { title: string; phone?: string },
  index: number
): string {
  // Round-robin para garantir distribuição uniforme das variações
  const raw = mensagens[index % mensagens.length];
  return raw
    .replace(/\{nome\}/gi, lead.title)
    .replace(/\{empresa\}/gi, lead.title);
}
