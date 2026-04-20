import { getEvolutionConfig } from "./client";
import { adminDb } from "../firebase-admin";
import * as admin from "firebase-admin";

export interface WhatsAppNumberResult {
  exists: boolean;
  jid: string;
  number: string;
}

/**
 * Validação de Sintaxe (Regex) - Formato Internacional
 */
export function validatePhoneSyntax(phone: string): boolean {
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 10 || clean.length > 15) return false;
  
  if (clean.startsWith("55")) {
    return clean.length >= 12;
  }
  
  return true;
}

/**
 * Verifica se a API está em cooldown por segurança (Circuit Breaker)
 */
async function checkCircuitBreaker(): Promise<boolean> {
  try {
    const safetyRef = adminDb.collection("settings").doc("evolution_safety");
    const snap = await safetyRef.get();
    if (!snap.exists) return true;

    const data = snap.data();
    if (data?.cooldownUntil && new Date(data.cooldownUntil) > new Date()) {
      console.warn(`[CircuitBreaker Admin] API em repouso até ${data.cooldownUntil}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[CircuitBreaker Admin] Erro:`, err);
    return true; // Prossegue mesmo com erro de leitura nas settings
  }
}

/**
 * Ativa o repouso forçado da API
 */
async function triggerCircuitBreaker() {
  try {
    const safetyRef = adminDb.collection("settings").doc("evolution_safety");
    const cooldownUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    await safetyRef.set({ cooldownUntil, lastErrorAt: new Date().toISOString() }, { merge: true });
    console.error(`[CircuitBreaker Admin] Muitas falhas. API suspensa por 30 minutos.`);
  } catch (err) {
    console.error(`[CircuitBreaker Admin] Falha ao acionar CB:`, err);
  }
}

/**
 * Consulta a Evolution API para checar se o número tem WhatsApp (Multi-tenant)
 */
export async function checkWhatsAppNumbers(userId: string, numbers: string[]): Promise<WhatsAppNumberResult[] | null> {
  const isOpen = await checkCircuitBreaker();
  if (!isOpen) return null;

  const config = await getEvolutionConfig(userId);
  const { serverUrl, apiKey, instanceName } = config;

  try {
    const response = await fetch(`${serverUrl}/chat/whatsappNumbers/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify({ numbers }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
       if (response.status === 429 || response.status >= 500) {
         await triggerCircuitBreaker();
       }
       const errData = await response.json().catch(() => ({}));
       console.error("[Evolution Check Admin] Erro na API:", errData);
       return [];
    }

    return await response.json();
  } catch (err) {
    console.error("[Evolution Check Admin] Falha de conexão:", err);
    return null;
  }
}

/**
 * Validação em lote com Throttling e Humanização
 */
export async function validateNumbersWithThrottling(
  userId: string,
  numbers: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];
  const BATCH_SIZE = 10;
  
  const syntaxValid = numbers.filter(n => {
    if (validatePhoneSyntax(n)) return true;
    invalid.push(n);
    return false;
  });

  const total = numbers.length;
  let processedCount = numbers.length - syntaxValid.length;

  for (let i = 0; i < syntaxValid.length; i += BATCH_SIZE) {
    const chunk = syntaxValid.slice(i, i + BATCH_SIZE);
    
    for (const [idxInChunk, num] of chunk.entries()) {
      const globalIdx = i + idxInChunk;
      
      try {
        const results = await checkWhatsAppNumbers(userId, [num]);
        
        if (results === null) {
          console.warn(`[Throttling Admin] Verificação suspensa para ${num} (API occupied or cooldown)`);
          break; 
        }

        const cleanNum = num.replace(/\D/g, "");
        const res = results.find(r => {
           const cleanR = r.number.replace(/\D/g, "");
           return cleanR === cleanNum || r.jid.includes(cleanNum);
        });
        
        if (res?.exists) {
          valid.push(num);
        } else {
          invalid.push(num);
        }
      } catch (err) {
        console.error(`[Throttling Admin] Erro inesperado ao validar ${num}:`, err);
      }

      processedCount++;
      if (onProgress) onProgress(processedCount, total);

      if (processedCount < total) {
        const isEndOfBatch = (globalIdx + 1) % BATCH_SIZE === 0;
        if (!isEndOfBatch) {
          const delay = Math.floor(Math.random() * (12000 - 6000 + 1)) + 6000;
          console.log(`[Throttling Admin] Esperando ${delay}ms para o próximo número (${num})...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (i + BATCH_SIZE < syntaxValid.length) {
      const rest = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
      console.log(`[Throttling Admin] Fim do lote. Descansando por ${rest/1000}s...`);
      await new Promise(r => setTimeout(r, rest));
    }
  }

  return { valid, invalid };
}

/**
 * Alias para compatibilidade
 */
export async function validateNumbersBatch(userId: string, numbers: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    return validateNumbersWithThrottling(userId, numbers);
}
