import { NextRequest, NextResponse } from "next/server";
import { validateNumbersBatch } from "@/lib/evolution/numbers";
import { getAuthUserId } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { numbers } = await req.json();
    if (!numbers || !Array.isArray(numbers)) {
      return NextResponse.json({ error: "Numbers array is required" }, { status: 400 });
    }

    const result = await validateNumbersBatch(userId, numbers);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
