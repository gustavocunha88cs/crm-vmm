import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase/client";

/**
 * Gets the userId from the Authorization header (Bearer <token>).
 * Returns null if not authorized.
 */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error("Error verifying Supabase token:", error);
      return null;
    }
    return user.id;
  } catch (error) {
    console.error("Auth server error:", error);
    return null;
  }
}
