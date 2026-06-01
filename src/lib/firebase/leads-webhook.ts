import { collection, query, where, getDocs, updateDoc, Timestamp, doc, orderBy } from "firebase/firestore";
import { db } from "./client";
import { Lead } from "@/types";

export async function findLeadByPhone(userId: string, phone: string): Promise<Lead | null> {
  const cleanPhone = phone.replace(/\D/g, "").slice(-8); // últimos 8 dígitos (heurística)
  
  // Buscar leads apenas deste usuário
  const q = query(
    collection(db, "leads"), 
    where("userId", "==", userId),
    where("status", "!=", "descartado"),
    orderBy("status"), // orderBy is needed for "!=" where clauses in some firestore configs
    orderBy("createdAt", "desc")
  );
  
  const snap = await getDocs(q);
  
  // Busca por correspondência parcial de fim de número
  const found = snap.docs.find(d => {
    const p = d.data().phone?.replace(/\D/g, "");
    return p && p.endsWith(cleanPhone);
  });
  
  if (!found) return null;
  return { id: found.id, ...found.data() } as Lead;
}

export async function updateLeadStatus(id: string, updates: Partial<Lead>) {
  const ref = doc(db, "leads", id);
  await updateDoc(ref, {
    ...updates,
    updatedAt: Timestamp.now()
  });
}
