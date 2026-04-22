"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LogoVMM } from "@/components/logo/LogoVMM";
import Link from "next/link";

export default function RegisterPage() {
  const { signUp, error, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");
    
    if (password !== confirmPassword) {
      setValidationError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setValidationError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
    } catch (err) {
      // Error is handled by AuthContext
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-box">
             <LogoVMM width="32" height="32" />
          </div>
          <h1>Criar sua Conta</h1>
          <p>Cadastre-se para começar a gerenciar seus leads com o VMM CRM.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {(error || validationError) && (
            <div className="login-error">{error || validationError}</div>
          )}

          <div className="login-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="confirmPassword">Confirmar Senha</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="login-submit" 
            disabled={loading || authLoading}
          >
            {loading || authLoading ? (
              <div className="login-spinner" />
            ) : (
              "Criar Conta"
            )}
          </button>

          <div className="login-switch">
            Já tem uma conta? <Link href="/login">Entre aqui</Link>
          </div>
        </form>

        <div className="login-footer">
          <p>© {new Date().getFullYear()} Agência VMM. Todos os direitos reservados.</p>
        </div>
      </div>

      <style jsx>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #E4E6DB 0%, #D8DBCB 100%);
          padding: 20px;
          font-family: var(--font-montserrat), sans-serif;
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 50px -12px rgba(40, 53, 42, 0.15);
          animation: cardAppear 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes cardAppear {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-logo-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          background: var(--p);
          border-radius: 18px;
          margin-bottom: 20px;
          box-shadow: 0 10px 20px rgba(40, 53, 42, 0.2);
        }

        .login-header h1 {
          font-size: 24px;
          font-weight: 800;
          color: var(--p);
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        }

        .login-header p {
          font-size: 14px;
          color: var(--text);
          line-height: 1.6;
          opacity: 0.8;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-error {
          background: #FEE7E6;
          color: #B91C1C;
          padding: 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          border: 1px solid rgba(185, 28, 28, 0.1);
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .login-field label {
          font-size: 12px;
          font-weight: 700;
          color: var(--p);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .login-field input {
          width: 100%;
          padding: 14px 16px;
          background: white;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          font-size: 15px;
          transition: all 0.2s;
          color: var(--dark);
          outline: none;
        }

        .login-field input:focus {
          border-color: var(--s);
          box-shadow: 0 0 0 4px rgba(78, 101, 80, 0.1);
        }

        .login-submit {
          margin-top: 10px;
          padding: 16px;
          background: var(--p);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-submit:hover:not(:disabled) {
          background: var(--s);
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(40, 53, 42, 0.15);
        }

        .login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-switch {
          text-align: center;
          font-size: 14px;
          color: var(--text);
          margin-top: 8px;
        }

        .login-switch a {
          color: var(--p);
          font-weight: 700;
          text-decoration: none;
        }

        .login-switch a:hover {
          text-decoration: underline;
        }

        .login-footer {
          margin-top: 32px;
          text-align: center;
          border-top: 1px solid var(--border);
          padding-top: 24px;
        }

        .login-footer p {
          font-size: 11px;
          color: var(--text);
          opacity: 0.6;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
      `}</style>
    </div>
  );
}
