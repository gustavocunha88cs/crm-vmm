import { NextRequest } from "next/server";
import * as admin from "firebase-admin";
import "@/lib/firebase-admin"; // ensure admin is initialized

/**
 * Gets the userId from the Authorization header (Bearer <token>).
 * Returns null if not authorized.
 */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying Firebase ID token:", error);
    return null;
  }
}
