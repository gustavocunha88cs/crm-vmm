import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateNumbersWithThrottling } from "@/lib/evolution/numbers";
import { getAuthUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Background Validation Worker (Cron) using Admin SDK to bypass rules
 */
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { data: leadsToProcess, error: fetchError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("wa_status", "PENDENTE")
      .limit(2);
    
    if (fetchError) throw fetchError;

    if (!leadsToProcess || leadsToProcess.length === 0) {
      return NextResponse.json({ message: "Sem leads pendentes." });
    }

    const phones = leadsToProcess.map(l => l.phone).filter(Boolean);

    console.log(`[CronValidation Admin] User ${userId}: Validando ${phones.length} leads...`);
    const result = await validateNumbersWithThrottling(userId, phones);

    let count = 0;
    for (const lead of leadsToProcess) {
      const isValid = result.valid.includes(lead.phone);
      const isInvalid = result.invalid.includes(lead.phone);
      
      if (!isValid && !isInvalid) continue;

      await supabaseAdmin
        .from("leads")
        .update({
          wa_status: isValid ? "VALIDADO" : "INVÁLIDO",
          status: isValid ? lead.status : "perdido",
          updated_at: new Date().toISOString()
        })
        .eq("id", lead.id);
      
      count++;
    }

    return NextResponse.json({
      processed: count,
      valid: result.valid.length,
      invalid: result.invalid.length,
      skipped: leadsToProcess.length - count
    });

  } catch (err: any) {
    console.error("[CronValidation Admin] Erro:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
