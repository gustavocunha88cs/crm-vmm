import { createClient } from "../server";
import type { Lead, ScraperLead } from "@/types";

/**
 * Busca todos os leads do usuário, opcionalmente filtrados por tag.
 */
export async function getLeads(userId: string, tagId?: string): Promise<Lead[]> {
  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (tagId) {
    query = query.contains("tags", [tagId]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Erro ao buscar leads:", error);
    return [];
  }

  return (data || []).map(mapFromDb);
}

export async function getLeadsByIds(userId: string, ids: string[]): Promise<Lead[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) {
    console.error("Erro ao buscar leads por IDs:", error);
    return [];
  }

  return (data || []).map(mapFromDb);
}

/**
 * Salva um lote de leads vindos do scraper.
 */
export async function saveLeadsToSupabase(
  userId: string,
  scraperLeads: ScraperLead[],
  tagIds: string[],
  batchId: string
): Promise<{ saved: number; skipped: number }> {
  if (!scraperLeads.length) return { saved: 0, skipped: 0 };

  let saved = 0;
  let skipped = 0;

  const rows = scraperLeads
    .filter(raw => {
      if (!raw.phone) {
        skipped++;
        return false;
      }
      return true;
    })
    .map(raw => ({
      user_id: userId,
      nome: raw.title || "Sem nome",
      phone: normalizePhone(raw.phone),
      status: "novo",
      tags: tagIds,
      tags_ref: [],
      city: raw.city || null,
      state: raw.state || null,
      address: raw.address || null,
      email: raw.email || null,
      website: raw.website || null,
      category_name: raw.categoryName || null,
      total_score: raw.totalScore || null,
      reviews_count: raw.reviewsCount || null,
      url: raw.url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const supabase = await createClient();
    const { error } = await supabase.from("leads").insert(rows);
    if (error) {
      console.error("Erro ao inserir leads:", error);
      throw error;
    }
    saved = rows.length;
  }

  return { saved, skipped };
}

export async function deleteLeads(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) {
    console.error("Erro ao deletar leads:", error);
    return 0;
  }
  return ids.length;
}

export async function updateLead(userId: string, id: string, data: Partial<Lead>) {
  const supabase = await createClient();
  
  // Mapeia de camelCase para snake_case
  const updateData: any = {};
  if (data.title !== undefined) updateData.nome = data.title;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.wa_status !== undefined) updateData.wa_status = data.wa_status;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.website !== undefined) updateData.website = data.website;
  if (data.categoryName !== undefined) updateData.category_name = data.categoryName;
  if (data.totalScore !== undefined) updateData.total_score = data.totalScore;
  if (data.reviewsCount !== undefined) updateData.reviews_count = data.reviewsCount;
  if (data.url !== undefined) updateData.url = data.url;

  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Erro ao atualizar lead no Supabase:", error);
    throw error;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  return digits;
}

export async function getTags(userId: string): Promise<any[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("tags")
    .eq("user_id", userId);
  
  // Como no SQL as tags estão no lead, vamos extrair as únicas ou criar uma tabela de tags.
  // Para manter a compatibilidade com o seu código anterior, vou criar a lógica de busca.
  // Idealmente no Supabase teríamos uma tabela 'tags', mas vamos simplificar.
  const allTags = data?.flatMap(d => d.tags) || [];
  return Array.from(new Set(allTags)).map(t => ({ id: t, name: t, color: "#4E6550" }));
}

export async function createTag(userId: string, name: string): Promise<any> {
  const trimmed = name.trim().toLowerCase();
  return { id: trimmed, name: trimmed, color: "#4E6550" };
}

function mapFromDb(row: any): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.nome,
    phone: row.phone,
    status: row.status,
    wa_status: row.wa_status,
    tags: row.tags || [],
    city: row.city,
    state: row.state,
    address: row.address,
    email: row.email,
    website: row.website,
    categoryName: row.category_name,
    acquisitionDate: row.created_at,
    createdAt: row.created_at,
    totalScore: row.total_score,
    reviewsCount: row.reviews_count,
    url: row.url
  } as Lead;
}
