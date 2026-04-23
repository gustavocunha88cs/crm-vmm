"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextValue {
  user:        User | null;
  loading:     boolean;
  signIn:      (email: string, password: string) => Promise<void>;
  signUp:      (email: string, password: string) => Promise<void>;
  logOut:      () => Promise<void>;
  error:       string;
  clearError:  () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue>({
  user:       null,
  loading:    true,
  signIn:     async () => {},
  signUp:     async () => {},
  logOut:     async () => {},
  error:      "",
  clearError: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      checkRedirect(session?.user ?? null);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoading(false);
      checkRedirect(currentUser);
    });

    return () => subscription.unsubscribe();
  }, [pathname]);

  function checkRedirect(currentUser: User | null) {
    const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
    if (!currentUser && !isAuthPage) {
      router.replace("/login");
    }
    if (currentUser && isAuthPage) {
      router.replace("/dashboard");
    }
  }

  async function signIn(email: string, password: string) {
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(friendlyAuthError(err.message));
      throw err;
    }
    router.replace("/dashboard");
  }

  async function signUp(email: string, password: string) {
    setError("");
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome: email.split("@")[0], // Placeholder
        },
      },
    });

    if (err) {
      setError(friendlyAuthError(err.message));
      throw err;
    }
    // Supabase might require email confirmation, but we redirect if session exists
    router.replace("/dashboard");
  }

  async function logOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, logOut, error, clearError: () => setError("") }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  return useContext(AuthContext);
}

// ─── Error messages in PT-BR ──────────────────────────────────────────────────
function friendlyAuthError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed"))       return "Por favor, confirme seu e-mail.";
  if (msg.includes("User already registered"))    return "Este e-mail já está em uso.";
  if (msg.includes("Password should be"))        return "A senha deve ser mais forte.";
  return msg;
}
