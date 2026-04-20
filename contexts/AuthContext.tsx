"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
  AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
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

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Redirect unauthenticated users to login/register
      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
      if (!firebaseUser && !isAuthPage) {
        router.replace("/login");
      }
      // Redirect authenticated users away from auth pages
      if (firebaseUser && isAuthPage) {
        router.replace("/dashboard");
      }
    });
    return unsub;
  }, [pathname, router]);

  async function signIn(email: string, password: string) {
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(friendlyAuthError(err as AuthError));
      throw err;
    }
  }

  async function signUp(email: string, password: string) {
    setError("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(friendlyAuthError(err as AuthError));
      throw err;
    }
  }

  async function logOut() {
    await signOut(auth);
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
function friendlyAuthError(err: AuthError): string {
  switch (err.code) {
    case "auth/invalid-email":           return "E-mail inválido.";
    case "auth/user-not-found":          return "Usuário não encontrado.";
    case "auth/wrong-password":          return "Senha incorreta.";
    case "auth/email-already-in-use":    return "Este e-mail já está em uso.";
    case "auth/weak-password":           return "A senha deve ter pelo menos 6 caracteres.";
    case "auth/invalid-credential":      return "E-mail ou senha incorretos.";
    case "auth/too-many-requests":       return "Muitas tentativas. Tente novamente em alguns minutos.";
    case "auth/network-request-failed":  return "Erro de rede. Verifique sua conexão.";
    case "auth/user-disabled":           return "Esta conta foi desativada.";
    default:                             return "Erro na operação. Tente novamente.";
  }
}
