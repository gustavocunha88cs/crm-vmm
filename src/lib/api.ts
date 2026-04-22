import { auth } from "./firebase/client";

/**
 * Custom fetch wrapper that automatically adds the Firebase ID Token.
 */
export async function apiFetch(url: string, options: RequestInit = {}) {
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
