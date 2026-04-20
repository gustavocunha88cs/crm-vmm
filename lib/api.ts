import { auth } from "./firebase/client";

/**
 * Custom fetch wrapper that automatically adds the Firebase ID Token.
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
