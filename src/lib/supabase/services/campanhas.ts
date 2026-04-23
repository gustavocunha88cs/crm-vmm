import { createClient } from "../server";
import type { Campanha, FilaEnvio } from "@/types/campanhas";

export async function getCampanhas(userId: string): Promise<Campanha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campanhas")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar campanhas:", error);
    return [];
  }

  return (data || []).map(mapCampanhaFromDb);
}

export async function createCampanha(userId: string, data: Partial<Campanha>): Promise<Campanha | null> {
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("campanhas")
    .insert([{
      user_id: userId,
      nome: data.nome,
      descricao: data.descricao,
      mensagens: data.mensagens || [],
      filtro_tags: data.filtroTags || [],
      lead_ids: data.leadIds || [],
      media_url: data.mediaUrl,
      status: "pendente",
      progresso: data.progresso || { total: 0, enviados: 0, falhos: 0 },
      intervalo_min: data.intervaloMin || 30,
      intervalo_max: data.intervaloMax || 60,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar campanha:", error);
    return null;
  }

  return mapCampanhaFromDb(created);
}

/**
 * Adiciona leads à fila de envio no Supabase
 */
export async function addLeadsToQueue(userId: string, items: any[]): Promise<boolean> {
  // ... (rows mapping same)
  const rows = items.map(item => ({
    user_id: userId,
    campanha_id: item.campanhaId,
    lead_id: item.leadId,
    lead_nome: item.leadNome,
    phone: item.phone,
    mensagem: item.mensagem,
    media_url: item.mediaUrl,
    status: "pendente",
    agendado_para: item.agendadoPara || new Date().toISOString()
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("fila_envio").insert(rows);
  if (error) {
    console.error("Erro ao adicionar à fila:", error);
    return false;
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getCampanha(userId: string, id: string): Promise<Campanha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campanhas")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return mapCampanhaFromDb(data);
}

export async function updateCampanha(userId: string, id: string, data: Partial<Campanha>): Promise<void> {
  const updateData: any = {};
  if (data.nome) updateData.nome = data.nome;
  if (data.descricao !== undefined) updateData.descricao = data.descricao;
  if (data.mensagens) updateData.mensagens = data.mensagens;
  if (data.status) updateData.status = data.status;
  if (data.progresso) updateData.progresso = data.progresso;
  if (data.mediaUrl !== undefined) updateData.media_url = data.mediaUrl;
  
  updateData.updated_at = new Date().toISOString();

  const supabase = await createClient();
  await supabase
    .from("campanhas")
    .update(updateData)
    .eq("id", id)
    .eq("user_id", userId);
}

export async function deleteCampanha(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("campanhas")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
}

export async function startCampanha(
  userId: string,
  campanhaId: string,
  leads: { id: string; phone: string; title: string }[],
  mensagens: string[],
  intervaloMin: number,
  intervaloMax: number,
  mediaUrl?: string
): Promise<void> {
  const now = new Date();
  let currentDelay = 0;

  const queueItems = leads.map((lead) => {
    // Escolhe uma mensagem aleatória das variações
    const msgTemplate = mensagens[Math.floor(Math.random() * mensagens.length)];
    const mensagem = msgTemplate.replace(/{nome}/g, lead.title);

    // Calcula o próximo agendamento
    const scheduledDate = new Date(now.getTime() + currentDelay * 1000);
    
    // Incrementa o delay para o próximo lead
    const nextInterval = Math.floor(Math.random() * (intervaloMax - intervaloMin + 1)) + intervaloMin;
    currentDelay += nextInterval;

    return {
      user_id: userId,
      campanha_id: campanhaId,
      lead_id: lead.id,
      lead_nome: lead.title,
      phone: lead.phone,
      mensagem: mensagem,
      media_url: mediaUrl || null,
      status: "pendente",
      agendado_para: scheduledDate.toISOString(),
      created_at: now.toISOString(),
    };
  });

  // 1. Insere na fila
  const supabase = await createClient();
  const { error: queueError } = await supabase.from("fila_envio").insert(queueItems);
  if (queueError) throw queueError;

  // 2. Atualiza a campanha
  const { error: campError } = await supabase
    .from("campanhas")
    .update({
      status: "ativa",
      progresso: { total: leads.length, enviados: 0, falhos: 0 },
      updated_at: now.toISOString()
    })
    .eq("id", campanhaId)
    .eq("user_id", userId);

  if (campError) throw campError;
}

function mapCampanhaFromDb(row: any): Campanha {
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome,
    descricao: row.descricao,
    mensagens: row.mensagens || [],
    filtroTags: row.filtro_tags || [],
    leadIds: row.lead_ids || [],
    mediaUrl: row.media_url,
    status: row.status,
    progresso: row.progresso || { total: 0, enviados: 0, falhos: 0 },
    intervaloMin: row.intervalo_min || 30,
    intervaloMax: row.intervalo_max || 60,
    intervaloSegundos: row.intervalo_min || 30, // legado
    createdAt: row.created_at,
    concludedAt: row.concluded_at
  } as Campanha;
}
