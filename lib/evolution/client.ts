/**
 * lib/evolution/client.ts
 * Multi-tenant Evolution API client.
 */

const BASE_URL = process.env.EVOLUTION_API_URL      ?? "http://127.0.0.1:8080";
const API_KEY  = process.env.EVOLUTION_API_KEY       ?? "BQYHJGJHJ";
const DEFAULT_INSTANCE = "crm-vmm";

/**
 * Returns the sanitized instance name for a user.
 */
export function getUserInstanceName(userId: string): string {
  // Evolution instances should be alphanumeric or hyphens
  const sanitizedId = userId.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  return `${DEFAULT_INSTANCE}-${sanitizedId}`;
}

export async function getEvolutionConfig(userId: string) {
  return {
    serverUrl: BASE_URL,
    apiKey: API_KEY,
    instanceName: getUserInstanceName(userId),
  };
}

export type InstanceState = "open" | "connecting" | "close" | "unknown";

export interface InstanceStatus {
  instance: string;
  state:    InstanceState;
  profileName?: string;
  profilePic?:  string;
  number?:      string;
}

// ── Base fetch ───────────────────────────────────────────────────────────────
async function evoFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let sanitizedBaseUrl = BASE_URL.trim().replace(/\/$/, "");
  
  if (!sanitizedBaseUrl.startsWith("http")) {
    sanitizedBaseUrl = `http://${sanitizedBaseUrl}`;
  }

  const url = `${sanitizedBaseUrl}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Erro desconhecido");
    throw new Error(`Evolution API [${res.status}] ${path}: ${errorText}`);
  }

  return res.json() as Promise<T>;
}

// ── createInstance ───────────────────────────────────────────────────────────
export async function createInstance(userId: string): Promise<void> {
  const instanceName = getUserInstanceName(userId);
  await evoFetch<unknown>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      token: instanceName, // use instanceName as token for simplicity or generate one
    }),
  });
}

// ── getInstanceStatus ────────────────────────────────────────────────────────
export async function getInstanceStatus(userId: string): Promise<InstanceStatus> {
  const instanceName = getUserInstanceName(userId);
  try {
    const data = await evoFetch<any>(`/instance/connectionState/${instanceName}`);
    const rawState: string =
      data?.instance?.state ?? data?.state ?? "unknown";
    
    // Attempt to get profile info if connected
    let profile = {};
    if (normalizeState(rawState) === "open") {
       try {
         // Evolution API v1 profile endpoint
         const profData = await evoFetch<any>(`/instance/fetchProfile/${instanceName}`);
         profile = {
           profileName: profData?.name || profData?.pushname,
           profilePic: profData?.profilePictureUrl || profData?.picture,
           number: profData?.number || profData?.jid?.split("@")[0],
         };
       } catch (e) {
         // ignore profile fetch error
       }
    }

    return { 
      instance: instanceName, 
      state: normalizeState(rawState),
      ...profile
    };
  } catch {
    return { instance: instanceName, state: "unknown" };
  }
}

// ── getQRCode ────────────────────────────────────────────────────────────────
export async function getQRCode(userId: string): Promise<{ base64: string; code: string } | null> {
  const instanceName = getUserInstanceName(userId);
  try {
    const data = await evoFetch<any>(`/instance/connect/${instanceName}`);
    const base64 = data?.base64 ?? data?.qrcode?.base64 ?? null;
    const code   = data?.code   ?? data?.qrcode?.code   ?? "";
    return base64 ? { base64, code } : null;
  } catch {
    return null;
  }
}

// ── disconnectInstance ───────────────────────────────────────────────────────
export async function disconnectInstance(userId: string): Promise<void> {
  const instanceName = getUserInstanceName(userId);
  await evoFetch<unknown>(`/instance/logout/${instanceName}`, {
    method: "DELETE",
  });
}

// ── sendText ─────────────────────────────────────────────────────────────────
export async function sendText(
  userId: string,
  phone: string,
  text:  string,
): Promise<{ key?: { id: string } }> {
  const instanceName = getUserInstanceName(userId);
  return evoFetch<{ key?: { id: string } }>(
    `/message/sendText/${instanceName}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: phone,
        options: { delay: 1200 },
        textMessage: { text },
      }),
    },
  );
}

// ── normalizeState ───────────────────────────────────────────────────────────
function normalizeState(raw?: string): InstanceState {
  if (!raw) return "unknown";
  const s = raw.toLowerCase();
  if (s === "open"       || s === "connected") return "open";
  if (s === "connecting" || s === "qr" || s === "qrcode") return "connecting";
  if (s === "close"      || s === "closed")    return "close";
  return "unknown";
}