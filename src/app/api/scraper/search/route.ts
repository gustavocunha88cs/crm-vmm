import { NextRequest, NextResponse } from "next/server";
import { validateNumbersBatch } from "@/lib/evolution/numbers";

const SERP_API_KEY = process.env.SERPAPI_KEY;

export async function POST(req: NextRequest) {
  if (!SERP_API_KEY) {
    return NextResponse.json(
      { error: "SERPAPI_KEY não configurado no .env.local" },
      { status: 500 }
    );
  }

  let body: { queries: string[]; maxPer?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  if (!body.queries?.length) {
    return NextResponse.json({ error: "Campo 'queries' é obrigatório" }, { status: 400 });
  }

  const maxPer = body.maxPer ?? 20;
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  for (const query of body.queries) {
    try {
      const leads = await searchGoogleMaps(query, maxPer);
      allLeads.push(...leads);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      console.error(`Erro na query "${query}":`, msg);
      errors.push(`${query}: ${msg}`);
    }
  }

  // Se não encontrou nada e tem erros, retorna o erro
  if (allLeads.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: errors[0] },
      { status: 502 }
    );
  }

  // Remove duplicatas por place_id
  const seen = new Set<string>();
  const unique = allLeads.filter((l) => {
    if (seen.has(l.place_id)) return false;
    seen.add(l.place_id);
    return true;
  });

  // ── WhatsApp Check (Background) ─────────────────────────────────────────────
  const verifiedLeads = unique.map(l => {
    if (!l.phone) return { ...l, wa_status: "NÃO_WHATSAPP" as const };
    return { 
      ...l, 
      wa_status: "PENDENTE" as const, // Será processado pelo worker em segundo plano
      status: "novo" as any 
    };
  });

  return NextResponse.json(verifiedLeads);
}


// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  title:        string;
  address:      string;
  city:         string;
  state:        string;
  phone:        string;
  website:      string;
  url:          string;
  totalScore:   number;
  reviewsCount: number;
  categoryName: string;
  email:        string;
  place_id:     string;
}

// ─── SerpAPI call ─────────────────────────────────────────────────────────────
async function searchGoogleMaps(query: string, limit: number): Promise<Lead[]> {
  const params = new URLSearchParams({
    engine:  "google_maps",
    q:       query,
    type:    "search",
    hl:      "pt",
    gl:      "br",
    api_key: SERP_API_KEY!,
  });

  const url = `https://serpapi.com/search.json?${params}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  // Lê o corpo como texto primeiro para diagnóstico
  const text = await res.text();

  // Verifica se é HTML (erro de autenticação ou página de erro)
  if (text.trim().startsWith("<")) {
    throw new Error(`SerpAPI retornou HTML (HTTP ${res.status}). Verifique sua SERPAPI_KEY.`);
  }

  // Tenta parsear JSON
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida da SerpAPI: ${text.slice(0, 100)}`);
  }

  // Erro retornado pela própria SerpAPI
  if (data.error) {
    throw new Error(`SerpAPI: ${data.error}`);
  }

  if (!res.ok) {
    throw new Error(`SerpAPI HTTP ${res.status}`);
  }

  const results: any[] = data.local_results ?? [];

  if (results.length === 0) {
    console.log(`SerpAPI: nenhum resultado para "${query}"`);
  }

  return results.slice(0, limit).map((r: any) => {
    const { city, state } = parseAddress(r.address ?? "");
    const phone = normalizePhone(r.phone ?? "");

    return {
      title:        r.title        ?? "",
      address:      r.address      ?? "",
      city,
      state,
      phone,
      website:      r.website      ?? "",
      url:          r.place_id
                      ? `https://www.google.com/maps/place/?q=place_id:${r.place_id}`
                      : (r.link ?? ""),
      totalScore:   r.rating       ?? 0,
      reviewsCount: r.reviews      ?? 0,
      categoryName: r.type         ?? (Array.isArray(r.types) ? r.types[0] : ""),
      email:        "",
      place_id:     r.place_id     ?? r.title ?? Math.random().toString(),
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseAddress(address: string): { city: string; state: string } {
  const match = address.match(/([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Z]{2})/);
  if (match) {
    return { city: match[1].trim(), state: match[2].trim() };
  }
  const parts = address.split(",");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].trim().replace(/\d{5}-\d{3}/, "").trim();
    return { city: last, state: "" };
  }
  return { city: "", state: "" };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10) return `55${digits}`;
  return digits;
}
