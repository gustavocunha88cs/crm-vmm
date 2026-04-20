import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-server";
import * as he from "he"; // Para decodificar entidades HTML

export const dynamic = "force-dynamic";

// Lista de termos para ignorar (evitar e-mails de plataformas como Wix, Shopify, etc)
const BLOCKED_KEYWORDS = [
  'example', 'sentry', 'wixpress', 'shopify', 'wordpress',
  'schema', 'pixel', 'facebook', 'google', 'amazon', 'microsoft',
  'jquery', 'bootstrap', 'placeholder', 'noreply', 'no-reply'
];

// Páginas comuns onde e-mails costumam estar escondidos
const CONTACT_PATHS = ['/contato', '/contact', '/fale-conosco', '/sobre', '/about'];

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body: { website: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const website = body.website?.trim();
  if (!website) return NextResponse.json({ email: "" });

  try {
    console.log(`[DeepScraper] Iniciando captura profunda em: ${website}`);
    
    // 1. Normalizar URL (Garantir protocolo)
    let targetBase = website;
    if (!/^https?:\/\//i.test(targetBase)) {
      targetBase = `https://${targetBase}`;
    }
    targetBase = targetBase.replace(/\/$/, ""); // Remove barra no final

    // 2. Tentar Página Principal
    let email = await scrapeFromUrl(targetBase);
    
    // 3. Se não achou, tentar páginas de contato
    if (!email) {
      console.log(`[DeepScraper] E-mail não encontrado na Home. Tentando páginas de contato...`);
      for (const path of CONTACT_PATHS) {
        if (email) break;
        const contactUrl = `${targetBase}${path}`;
        email = await scrapeFromUrl(contactUrl);
      }
    }

    if (email) {
      console.log(`[DeepScraper] ✅ Sucesso! E-mail encontrado: ${email}`);
    } else {
      console.log(`[DeepScraper] ❌ Nenhum e-mail qualificado encontrado para ${website}`);
    }

    return NextResponse.json({ email: email || "" });

  } catch (err: any) {
    console.error(`[DeepScraper] Erro crítico em ${website}:`, err.message);
    return NextResponse.json({ email: "" });
  }
}

/**
 * Função que faz o fetch do HTML e extrai o e-mail
 */
async function scrapeFromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000), // 8 segundos por página
    });

    if (!response.ok) return null;
    
    let html = await response.text();
    
    // Limpar HTML (remover scripts e styles como no seu PHP)
    html = html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "");
    html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
    
    // Decodificar entidades HTML (ex: &#64; -> @)
    html = he.decode(html);

    // Regex de e-mail (mesmo do seu PHP)
    const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailPattern);

    if (matches) {
      for (const match of matches) {
        const e = match.toLowerCase();
        
        // Verificar se o e-mail não está na lista de bloqueados
        const isBlocked = BLOCKED_KEYWORDS.some(keyword => e.includes(keyword));
        if (!isBlocked) {
          return e;
        }
      }
    }

    return null;
  } catch (err) {
    // Se falhar o https, poderíamos tentar http aqui, mas por economia de tempo/rede vamos para o próximo path
    return null;
  }
}
