export type LeadStatus = "novo" | "enviado" | "entregue" | "lido" | "respondido" | "invalido" | "oportunidade" | "fechado" | "perdido";
export type LeadTemperature = "frio" | "morno" | "quente" | "gelado";

export interface Lead {
  id?: string;
  userId: string;
  title: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  website: string;
  url: string;
  totalScore: number;
  reviewsCount: number;
  categoryName: string;
  email: string;
  tags: string[];
  status: LeadStatus;
  wa_status?: "PENDENTE" | "VALIDADO" | "INVÁLIDO" | "NÃO_WHATSAPP";
  temperature?: LeadTemperature;
  createdAt: Date | string;
  acquisitionDate?: any; // Data de entrada no CRM
  updatedAt?: any;
  lastMessageAt?: any;
  importBatchId: string;
  campaignContacted?: boolean;
  lastCampaignName?: string;
  lastCampaignAt?: any;
}

// ─── Tag ──────────────────────────────────────────────────────────────────────
export interface Tag {
  id?: string;
  userId: string;
  name: string;
  color: string;
  createdAt: Date | string;
}

// ─── Scraper ──────────────────────────────────────────────────────────────────
export interface ScraperLead {
  title: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  website: string;
  url: string;
  totalScore: number;
  reviewsCount: number;
  categoryName: string;
  email?: string;
  wa_status?: "PENDENTE" | "VALIDADO" | "INVÁLIDO" | "NÃO_WHATSAPP";
  status?: string;
}

export interface ScraperSearchPayload {
  queries: string[];
  maxPer: number;
}

export interface ScraperEmailPayload {
  website: string;
}

// ─── Import Session ───────────────────────────────────────────────────────────
export interface ImportSession {
  leads: ScraperLead[];
  total: number;
  withEmail: number;
  withPhone: number;
}
