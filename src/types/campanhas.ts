// ─── Campanha ─────────────────────────────────────────────────────────────────
export type CampanhaStatus = "rascunho" | "pendente" | "ativa" | "pausada" | "concluida";

export interface Campanha {
  id?: string;
  userId: string;
  nome: string;
  descricao?: string;
  status: CampanhaStatus;
  filtroTags: string[];          // filtra leads por tag
  leadIds: string[];             // IDs dos leads selecionados
  mensagens: string[];           // até 10 variações
  intervaloSegundos: number;     // legado
  intervaloMin: number;          // intervalo mínimo em segundos
  intervaloMax: number;          // intervalo máximo em segundos
  progresso: {
    total: number;
    enviados: number;
    falhos: number;
  };
  createdAt: string | object;
  startedAt?: string | object | null;
  pausedAt?: string | object | null;
  concludedAt?: string | object | null;
  mediaUrl?: string;
}

// ─── Fila de Envio ────────────────────────────────────────────────────────────
export type FilaStatus = "pendente" | "enviando" | "enviado" | "falhou";

export interface FilaEnvio {
  id?: string;
  userId: string;
  campanhaId: string;
  leadId: string;
  leadNome: string;
  phone: string;
  mensagem: string;
  status: FilaStatus;
  tentativas: number;
  agendadoPara: string | object;
  enviadoEm?: string | object | null;
  mediaUrl?: string;
  erro?: string;
}

// ─── Tag (re-export shape for use in campanhas) ───────────────────────────────
export interface TagRef {
  id: string;
  name: string;
  color: string;
}
