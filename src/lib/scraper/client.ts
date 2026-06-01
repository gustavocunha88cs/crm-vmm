/**
 * Server-side wrapper for the PHP scraper.
 * Used by API routes — never imported by client components.
 */

const SCRAPER_URL = process.env.SCRAPER_PHP_URL;

export interface ScraperSearchParams {
  queries: string[];
  maxPer?: number;
}

export interface ScraperEmailParams {
  website: string;
}

export async function scraperSearch(params: ScraperSearchParams) {
  if (!SCRAPER_URL) throw new Error("SCRAPER_PHP_URL não configurado");

  const res = await fetch(`${SCRAPER_URL}/?api=search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: params.queries, maxPer: params.maxPer ?? 20 }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scraper retornou HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function scraperEmail(params: ScraperEmailParams): Promise<string> {
  if (!SCRAPER_URL) return "";

  try {
    const res = await fetch(`${SCRAPER_URL}/?api=scrape_email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website: params.website }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return data.email ?? "";
  } catch {
    return "";
  }
}
