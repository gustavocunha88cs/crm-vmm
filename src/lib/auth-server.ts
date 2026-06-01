import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Gets the userId from the Supabase session (cookies) or Authorization header.
 * Returns null if not authorized.
 */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  try {
    const supabase = await createClient();
    
    // 1. Try to get from session (cookies) - standard for Next.js SSR
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user.id;

    // 2. Fallback: Try Authorization header (for external calls or testing)
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split("Bearer ")[1];
      const { data: { user: headerUser } } = await supabase.auth.getUser(token);
      return headerUser?.id ?? null;
    }

    return null;
  } catch (error) {
    console.error("Auth server error:", error);
    return null;
  }
}
