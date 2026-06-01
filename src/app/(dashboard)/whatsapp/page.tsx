"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type ConnectionState = "open" | "connecting" | "close" | "unknown" | "loading";

interface InstanceStatus {
  state:        ConnectionState;
  profileName?: string;
  profilePic?:  string;
  number?:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_STATUS = 8_000;   // poll status every 8s
const POLL_INTERVAL_QR     = 20_000;  // refresh QR every 20s (before expiry)
const QR_EXPIRY_SECONDS    = 60;

// ─── Component ────────────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  const [status, setStatus]           = useState<InstanceStatus>({ state: "loading" });
  const [qrBase64, setQrBase64]       = useState<string>("");
  const [qrExpiry, setQrExpiry]       = useState(0);   // countdown seconds
  const [testPhone, setTestPhone]     = useState("");
  const [testMsg, setTestMsg]         = useState("");
  const [testResult, setTestResult]   = useState<string>("");
  const [testLoading, setTestLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Fetch status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res  = await apiFetch("/api/whatsapp/status");
      const data = await res.json();
      setStatus(data);
      return data.state as ConnectionState;
    } catch {
      setStatus({ state: "unknown" });
      return "unknown" as ConnectionState;
    }
  }, []);

  // ── Fetch QR ────────────────────────────────────────────────────────────────
  const fetchQR = useCallback(async () => {
    try {
      const res = await apiFetch("/api/whatsapp/qrcode");
      if (res.status === 409) {
        // Already connected — just refresh status
        await fetchStatus();
        return;
      }
      if (!res.ok) { setQrBase64(""); return; }
      const data = await res.json();
      if (data.base64) {
        setQrBase64(data.base64);
        setQrExpiry(QR_EXPIRY_SECONDS);
      }
    } catch {
      setQrBase64("");
    }
  }, [fetchStatus]);

  // ── Start QR expiry countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    if (qrBase64 && status.state === "connecting") {
      expiryTimerRef.current = setInterval(() => {
        setQrExpiry((prev) => {
          if (prev <= 1) {
            clearInterval(expiryTimerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (expiryTimerRef.current) clearInterval(expiryTimerRef.current); };
  }, [qrBase64, status.state]);

  // ── Main polling logic ───────────────────────────────────────────────────────
  useEffect(() => {
    // Initial load
    fetchStatus().then((state) => {
      if (state === "connecting") fetchQR();
    });

    // Poll status
    statusTimerRef.current = setInterval(async () => {
      const state = await fetchStatus();
      if (state === "open") {
        // Connected! Stop QR polling
        clearInterval(qrTimerRef.current!);
        setQrBase64("");
      } else if (state === "connecting" && !qrBase64) {
        fetchQR();
      }
    }, POLL_INTERVAL_STATUS);

    return () => {
      clearInterval(statusTimerRef.current!);
      clearInterval(qrTimerRef.current!);
      clearInterval(expiryTimerRef.current!);
    };
  }, [fetchStatus, fetchQR]);

  // Poll QR refresh when connecting
  useEffect(() => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    if (status.state === "connecting") {
      qrTimerRef.current = setInterval(fetchQR, POLL_INTERVAL_QR);
    }
    return () => { if (qrTimerRef.current) clearInterval(qrTimerRef.current); };
  }, [status.state, fetchQR]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleConnect() {
    setActionLoading(true);
    setQrBase64("");
    try {
      const res = await apiFetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus({ state: "connecting" });
      await fetchQR();
    } catch (err: unknown) {
      showToast((err as Error).message, "err");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o WhatsApp? As campanhas em andamento serão pausadas.")) return;
    setActionLoading(true);
    try {
      await apiFetch("/api/whatsapp/disconnect", { method: "POST" });
      setStatus({ state: "close" });
      setQrBase64("");
      showToast("WhatsApp desconectado.");
    } catch (err: unknown) {
      showToast((err as Error).message, "err");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRefreshQR() {
    setQrBase64("");
    await fetchQR();
  }

  async function handleTestSend() {
    if (!testPhone.trim() || !testMsg.trim()) return;
    setTestLoading(true);
    setTestResult("");
    try {
      const res = await apiFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.replace(/\D/g, ""), text: testMsg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestResult(`✓ Enviado! ID: ${data.messageId ?? "—"}`);
    } catch (err: unknown) {
      setTestResult(`✗ ${(err as Error).message}`);
    } finally {
      setTestLoading(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isConnected   = status.state === "open";
  const isConnecting  = status.state === "connecting";
  const isDisconnected = status.state === "close" || status.state === "unknown";
  const isLoading     = status.state === "loading";

  const expiryPct = (qrExpiry / QR_EXPIRY_SECONDS) * 100;

  return (
    <div className="wa-root">
      {/* Toast */}
      {toast && (
        <div className={`wa-toast wa-toast--${toast.type}`}>{toast.msg}</div>
      )}

      {/* Page header */}
      <div className="wa-page-header">
        <div>
          <h1 className="wa-page-title">WhatsApp</h1>
          <p className="wa-page-sub">Gerencie a conexão com o WhatsApp para disparo das campanhas</p>
        </div>
      </div>

      <div className="wa-layout">

        {/* ── LEFT: Status + QR panel ── */}
        <div className="wa-main-panel">

          {/* Status card */}
          <div className={`wa-status-card wa-status-card--${isLoading ? "loading" : status.state}`}>
            <div className="wa-status-left">
              <div className="wa-status-icon-wrap">
                {isConnected && <div className="wa-avatar-wrap">
                  {status.profilePic
                    ? <img src={status.profilePic} className="wa-avatar" alt="Profile" />
                    : <div className="wa-avatar-placeholder">
                        <WhatsAppIcon size={28} color="white" />
                      </div>
                  }
                  <div className="wa-avatar-dot wa-avatar-dot--green" />
                </div>}
                {isConnecting && (
                  <div className="wa-status-icon wa-status-icon--connecting">
                    <div className="wa-pulse-ring" />
                    <WhatsAppIcon size={24} color="white" />
                  </div>
                )}
                {(isDisconnected || isLoading) && (
                  <div className="wa-status-icon wa-status-icon--disconnected">
                    <WhatsAppIcon size={24} color="rgba(255,255,255,0.5)" />
                  </div>
                )}
              </div>

              <div className="wa-status-text">
                {isLoading && <><span className="wa-status-title">Verificando conexão…</span><span className="wa-status-desc">Aguarde</span></>}
                {isConnected && <>
                  <span className="wa-status-title wa-status-title--green">Conectado</span>
                  {status.profileName && <span className="wa-status-desc">{status.profileName}</span>}
                  {status.number && <span className="wa-status-number">+{status.number}</span>}
                </>}
                {isConnecting && <>
                  <span className="wa-status-title wa-status-title--yellow">Aguardando leitura do QR</span>
                  <span className="wa-status-desc">Abra o WhatsApp no celular e escaneie o código</span>
                </>}
                {isDisconnected && <>
                  <span className="wa-status-title wa-status-title--red">Desconectado</span>
                  <span className="wa-status-desc">Clique em Conectar para gerar um novo QR Code</span>
                </>}
              </div>
            </div>

            <div className="wa-status-actions">
              {isConnected && (
                <button
                  className="wa-btn wa-btn-outline-red"
                  onClick={handleDisconnect}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Spinner sm /> : "Desconectar"}
                </button>
              )}
              {(isDisconnected || isLoading) && (
                <button
                  className="wa-btn wa-btn-primary"
                  onClick={handleConnect}
                  disabled={actionLoading || isLoading}
                >
                  {actionLoading ? <Spinner sm white /> : "Conectar WhatsApp"}
                </button>
              )}
              {isConnecting && (
                <button
                  className="wa-btn wa-btn-outline"
                  onClick={handleRefreshQR}
                  disabled={actionLoading}
                >
                  ↻ Novo QR
                </button>
              )}
            </div>
          </div>

          {/* QR Code panel */}
          {isConnecting && (
            <div className="wa-qr-panel">
              <div className="wa-qr-header">
                <div>
                  <h2 className="wa-qr-title">Escanear QR Code</h2>
                  <p className="wa-qr-subtitle">Use o WhatsApp no celular para escanear</p>
                </div>
                {qrExpiry > 0 && (
                  <div className="wa-expiry">
                    <svg className="wa-expiry-ring" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e0e0e0" strokeWidth="2.5" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={qrExpiry < 15 ? "#e87070" : "#4E6550"}
                        strokeWidth="2.5"
                        strokeDasharray={`${expiryPct} 100`}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                        style={{ transition: "stroke-dasharray 1s linear, stroke .3s" }}
                      />
                    </svg>
                    <span
                      className="wa-expiry-text"
                      style={{ color: qrExpiry < 15 ? "#e87070" : "#4E6550" }}
                    >
                      {qrExpiry}s
                    </span>
                  </div>
                )}
              </div>

              <div className="wa-qr-body">
                {qrBase64 ? (
                  <div className="wa-qr-wrap">
                    <div className="wa-qr-frame">
                      {/* Corner decorations */}
                      <div className="wa-qr-corner wa-qr-corner--tl" />
                      <div className="wa-qr-corner wa-qr-corner--tr" />
                      <div className="wa-qr-corner wa-qr-corner--bl" />
                      <div className="wa-qr-corner wa-qr-corner--br" />
                      <img
                        src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                        alt="QR Code WhatsApp"
                        className="wa-qr-img"
                        style={{ opacity: qrExpiry < 10 ? 0.4 : 1, transition: "opacity .3s" }}
                      />
                      {qrExpiry === 0 && (
                        <div className="wa-qr-expired">
                          <span>QR expirado</span>
                          <button className="wa-btn wa-btn-primary" onClick={handleRefreshQR}>
                            Gerar novo
                          </button>
                        </div>
                      )}
                    </div>

                    {qrExpiry > 0 && qrExpiry < 15 && (
                      <p className="wa-qr-expiring">⚠ QR expirando em {qrExpiry}s — escaneie agora!</p>
                    )}
                  </div>
                ) : (
                  <div className="wa-qr-loading">
                    <div className="wa-spinner-lg" />
                    <p>Gerando QR Code…</p>
                    <span>Isso pode levar alguns segundos</span>
                  </div>
                )}

                <div className="wa-qr-steps">
                  <h3 className="wa-steps-title">Como conectar</h3>
                  {[
                    ["📱", "Abra o WhatsApp no celular"],
                    ["⋮", "Toque em Menu (três pontos) ou Configurações"],
                    ["🔗", "Selecione Dispositivos Conectados"],
                    ["➕", "Toque em Conectar dispositivo"],
                    ["📸", "Aponte a câmera para o QR Code acima"],
                  ].map(([icon, text], i) => (
                    <div key={i} className="wa-step">
                      <div className="wa-step-num">{i + 1}</div>
                      <span className="wa-step-icon">{icon}</span>
                      <span className="wa-step-text">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Connected — profile detail */}
          {isConnected && (
            <div className="wa-connected-panel">
              <div className="wa-connected-header">
                <div className="wa-connected-icon">✓</div>
                <div>
                  <h2 className="wa-connected-title">WhatsApp conectado!</h2>
                  <p className="wa-connected-sub">
                    As campanhas podem ser iniciadas e os envios serão executados automaticamente pelo worker.
                  </p>
                </div>
              </div>

              <div className="wa-connected-info">
                {status.profileName && (
                  <div className="wa-info-row">
                    <span className="wa-info-label">Conta</span>
                    <span className="wa-info-value">{status.profileName}</span>
                  </div>
                )}
                {status.number && (
                  <div className="wa-info-row">
                    <span className="wa-info-label">Número</span>
                    <span className="wa-info-value">+{status.number}</span>
                  </div>
                )}

                <div className="wa-info-row">
                  <span className="wa-info-label">Status</span>
                  <span className="wa-info-badge wa-info-badge--green">Online</span>
                </div>
              </div>
            </div>
          )}

          {/* Disconnected placeholder */}
          {(isDisconnected) && !isLoading && (
            <div className="wa-disconnected-panel">
              <div className="wa-disconnected-art">
                <div className="wa-disc-circle wa-disc-circle--1" />
                <div className="wa-disc-circle wa-disc-circle--2" />
                <div className="wa-disc-circle wa-disc-circle--3" />
                <WhatsAppIcon size={48} color="rgba(78,101,80,0.25)" />
              </div>
              <h2 className="wa-disc-title">Nenhum dispositivo conectado</h2>
              <p className="wa-disc-sub">
                Conecte seu WhatsApp para habilitar o envio das campanhas.<br />
                O processo é rápido — basta escanear o QR Code com o celular.
              </p>
              <button
                className="wa-btn wa-btn-primary wa-btn-lg"
                onClick={handleConnect}
                disabled={actionLoading}
              >
                {actionLoading ? <><Spinner sm white /> Gerando QR…</> : "→ Conectar WhatsApp"}
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Test send + info ── */}
        <div className="wa-sidebar">

          {/* Test send */}
          <div className="wa-test-card">
            <div className="wa-test-header">
              <h3 className="wa-test-title">Teste de Envio</h3>
              <span className={`wa-test-badge ${isConnected ? "wa-test-badge--on" : "wa-test-badge--off"}`}>
                {isConnected ? "disponível" : "offline"}
              </span>
            </div>
            <p className="wa-test-desc">
              Envie uma mensagem de teste para validar a conexão antes de iniciar campanhas.
            </p>

            <div className="wa-test-form">
              <div className="wa-field">
                <label className="wa-label">Número (com DDD)</label>
                <input
                  className="wa-input"
                  placeholder="5582999999999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  disabled={!isConnected}
                />
                <span className="wa-hint">Formato: 55 + DDD + número</span>
              </div>
              <div className="wa-field">
                <label className="wa-label">Mensagem</label>
                <textarea
                  className="wa-input wa-textarea"
                  placeholder="Olá! Este é um teste de envio do CRM VMM."
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  disabled={!isConnected}
                  rows={3}
                />
              </div>

              {testResult && (
                <div className={`wa-test-result ${testResult.startsWith("✓") ? "wa-test-result--ok" : "wa-test-result--err"}`}>
                  {testResult}
                </div>
              )}

              <button
                className="wa-btn wa-btn-primary wa-btn-full"
                onClick={handleTestSend}
                disabled={!isConnected || testLoading || !testPhone.trim() || !testMsg.trim()}
              >
                {testLoading ? <><Spinner sm white /> Enviando…</> : "📤 Enviar mensagem de teste"}
              </button>
            </div>
          </div>

          {/* Info card */}
          <div className="wa-info-card">
            <h3 className="wa-info-card-title">ℹ️ Como funciona</h3>
            <div className="wa-info-items">
              {[
                { icon: "🔗", title: "Conexão via QR",      desc: "O WhatsApp conecta como dispositivo vinculado — sem risco de ban." },
                { icon: "🤖", title: "Worker automático",   desc: "Os envios são executados pelo worker mesmo com o navegador fechado." },
                { icon: "⏱", title: "Intervalo configurável", desc: "Defina o intervalo entre mensagens em cada campanha para evitar bloqueios." },
                { icon: "🔀", title: "Mensagens aleatórias", desc: "O sistema sorteia entre as variações para parecer mais natural." },
              ].map((item) => (
                <div key={item.title} className="wa-info-item">
                  <span className="wa-info-item-icon">{item.icon}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* ── Tokens ── */
        .wa-root {
          font-family: inherit;
          padding: 32px; min-height: 100vh;
          background: var(--bg); position: relative;
        }

        /* Toast */
        .wa-toast {
          position: fixed; top: 20px; right: 20px;
          padding: 12px 20px; border-radius: 8px;
          font-size: 14px; font-weight: 600; z-index: 2000;
          box-shadow: 0 4px 20px rgba(11,16,23,.2);
          animation: waFade .2s ease;
        }
        .wa-toast--ok  { background: var(--s); color: white; }
        .wa-toast--err { background: #c0392b; color: white; }
        @keyframes waFade { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }

        /* Page header */
        .wa-page-header {
          margin-bottom: 28px;
        }
        .wa-page-title { font-size: 28px; font-weight: 800; color: var(--p); margin: 0 0 4px; }
        .wa-page-sub { font-size: 13px; color: #9AA494; margin: 0; }

        /* Layout */
        .wa-layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 20px;
          align-items: start;
        }
        .wa-main-panel { display: flex; flex-direction: column; gap: 16px; }
        .wa-sidebar     { display: flex; flex-direction: column; gap: 16px; }

        /* ── Status card ── */
        .wa-status-card {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px 24px;
          display: flex; align-items: center;
          justify-content: space-between; gap: 16px;
          flex-wrap: wrap;
          transition: border-color .3s;
        }
        .wa-status-card--open       { border-color: #4CAF50; background: #f6fff6; }
        .wa-status-card--connecting { border-color: #F5A623; background: #fffdf6; }
        .wa-status-card--close,
        .wa-status-card--unknown    { border-color: var(--border); }
        .wa-status-card--loading    { border-color: var(--border); opacity: .7; }

        .wa-status-left { display: flex; align-items: center; gap: 16px; }

        /* Avatar */
        .wa-avatar-wrap { position: relative; }
        .wa-avatar { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; }
        .wa-avatar-placeholder {
          width: 52px; height: 52px; border-radius: 50%;
          background: #25D366; display: flex;
          align-items: center; justify-content: center;
        }
        .wa-avatar-dot {
          position: absolute; bottom: 2px; right: 2px;
          width: 13px; height: 13px; border-radius: 50%;
          border: 2px solid white;
        }
        .wa-avatar-dot--green { background: #4CAF50; }

        /* Status icon */
        .wa-status-icon {
          width: 52px; height: 52px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }
        .wa-status-icon--connecting { background: #F5A623; }
        .wa-status-icon--disconnected { background: #ddd; }

        .wa-pulse-ring {
          position: absolute; inset: -6px; border-radius: 50%;
          border: 2px solid #F5A623;
          animation: waPulse 2s ease-in-out infinite;
        }
        @keyframes waPulse {
          0%,100% { transform: scale(1); opacity: .7; }
          50%      { transform: scale(1.15); opacity: 0; }
        }

        .wa-status-text { display: flex; flex-direction: column; gap: 2px; }
        .wa-status-title { font-size: 16px; font-weight: 800; color: var(--dark); }
        .wa-status-title--green  { color: #2A6B2D; }
        .wa-status-title--yellow { color: #7A5C00; }
        .wa-status-title--red    { color: #b91c1c; }
        .wa-status-desc   { font-size: 13px; color: #9AA494; }
        .wa-status-number { font-size: 13px; color: var(--s); font-weight: 700; }
        .wa-status-actions { display: flex; gap: 8px; }

        /* ── QR panel ── */
        .wa-qr-panel {
          background: white; border: 1.5px solid #F5A623;
          border-radius: 12px; overflow: hidden;
        }
        .wa-qr-header {
          padding: 18px 24px;
          background: linear-gradient(135deg, #28352A 0%, #4E6550 100%);
          display: flex; align-items: center; justify-content: space-between;
        }
        .wa-qr-title { font-size: 17px; font-weight: 800; color: #E4E6DB; margin: 0 0 3px; }
        .wa-qr-subtitle { font-size: 12px; color: rgba(228,230,219,.6); margin: 0; }

        /* Expiry ring */
        .wa-expiry { position: relative; width: 48px; height: 48px; flex-shrink: 0; }
        .wa-expiry-ring { width: 100%; height: 100%; }
        .wa-expiry-text {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800;
        }

        .wa-qr-body {
          padding: 24px;
          display: grid; grid-template-columns: auto 1fr;
          gap: 28px; align-items: start;
        }

        /* QR image */
        .wa-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .wa-qr-frame {
          position: relative; padding: 12px;
          background: white; border-radius: 12px;
          box-shadow: 0 4px 24px rgba(11,16,23,.12);
        }
        .wa-qr-img { display: block; width: 200px; height: 200px; }

        /* Corner decorations */
        .wa-qr-corner {
          position: absolute; width: 22px; height: 22px;
          border-color: #28352A; border-style: solid;
        }
        .wa-qr-corner--tl { top: 4px; left: 4px; border-width: 3px 0 0 3px; border-radius: 3px 0 0 0; }
        .wa-qr-corner--tr { top: 4px; right: 4px; border-width: 3px 3px 0 0; border-radius: 0 3px 0 0; }
        .wa-qr-corner--bl { bottom: 4px; left: 4px; border-width: 0 0 3px 3px; border-radius: 0 0 0 3px; }
        .wa-qr-corner--br { bottom: 4px; right: 4px; border-width: 0 3px 3px 0; border-radius: 0 0 3px 0; }

        .wa-qr-expired {
          position: absolute; inset: 0; background: rgba(255,255,255,.9);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 10px; border-radius: 8px;
          font-weight: 700; font-size: 14px; color: var(--p);
        }
        .wa-qr-expiring {
          font-size: 12px; color: #e87070; font-weight: 700;
          text-align: center; animation: waFlash .6s ease-in-out infinite alternate;
        }
        @keyframes waFlash { from{opacity:1} to{opacity:.5} }

        /* QR loading */
        .wa-qr-loading {
          width: 200px; height: 200px; padding: 12px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px;
        }
        .wa-qr-loading p { font-size: 13px; font-weight: 700; color: var(--p); margin: 0; }
        .wa-qr-loading span { font-size: 11px; color: #9AA494; }

        /* Steps */
        .wa-qr-steps { display: flex; flex-direction: column; gap: 12px; }
        .wa-steps-title { font-size: 13px; font-weight: 800; color: var(--p); margin: 0 0 8px; text-transform: uppercase; letter-spacing: .06em; }
        .wa-step { display: flex; align-items: center; gap: 10px; }
        .wa-step-num {
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--p); color: #E4E6DB;
          font-size: 11px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .wa-step-icon { font-size: 16px; width: 22px; text-align: center; flex-shrink: 0; }
        .wa-step-text { font-size: 13px; color: var(--text); line-height: 1.3; }

        /* ── Connected panel ── */
        .wa-connected-panel {
          background: white; border: 1.5px solid #4CAF50;
          border-radius: 12px; padding: 24px; display: flex;
          flex-direction: column; gap: 20px;
        }
        .wa-connected-header { display: flex; align-items: flex-start; gap: 16px; }
        .wa-connected-icon {
          width: 44px; height: 44px; border-radius: 50%;
          background: #4CAF50; color: white; font-size: 22px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; animation: waPopIn .4s cubic-bezier(.2,.8,.3,1.4);
        }
        @keyframes waPopIn { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
        .wa-connected-title { font-size: 18px; font-weight: 800; color: #2A6B2D; margin: 0 0 4px; }
        .wa-connected-sub   { font-size: 13px; color: #9AA494; margin: 0; line-height: 1.4; }
        .wa-connected-info  { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .wa-info-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; border-bottom: 1px solid var(--border);
        }
        .wa-info-row:last-child { border-bottom: none; }
        .wa-info-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9AA494; }
        .wa-info-value { font-size: 13px; color: var(--dark); font-weight: 600; }
        .wa-mono { font-family: 'Courier New', monospace; font-size: 12px; }
        .wa-info-badge { padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .wa-info-badge--green { background: #E8F2E8; color: #2A6B2D; }

        /* ── Disconnected panel ── */
        .wa-disconnected-panel {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 48px 24px;
          display: flex; flex-direction: column;
          align-items: center; gap: 16px; text-align: center;
        }
        .wa-disconnected-art {
          position: relative; width: 100px; height: 100px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 8px;
        }
        .wa-disc-circle {
          position: absolute; border-radius: 50%;
          border: 1.5px solid rgba(78,101,80,0.12);
        }
        .wa-disc-circle--1 { inset: 0; }
        .wa-disc-circle--2 { inset: 12px; }
        .wa-disc-circle--3 { inset: 24px; }
        .wa-disc-title { font-size: 20px; font-weight: 800; color: var(--p); margin: 0; }
        .wa-disc-sub   { font-size: 13px; color: #9AA494; margin: 0; line-height: 1.5; max-width: 360px; }

        /* ── Sidebar cards ── */
        .wa-test-card, .wa-info-card {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px;
        }
        .wa-test-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .wa-test-title { font-size: 15px; font-weight: 800; color: var(--p); margin: 0; }
        .wa-test-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          border-radius: 10px; text-transform: uppercase; letter-spacing: .05em;
        }
        .wa-test-badge--on  { background: #E8F2E8; color: #2A6B2D; }
        .wa-test-badge--off { background: #F0F0EE; color: #aaa; }
        .wa-test-desc { font-size: 12px; color: #9AA494; margin: 0 0 14px; line-height: 1.4; }

        .wa-test-form { display: flex; flex-direction: column; gap: 12px; }
        .wa-field { display: flex; flex-direction: column; gap: 5px; }
        .wa-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--p); }
        .wa-hint  { font-size: 10px; color: #aaa; }
        .wa-input {
          width: 100%; padding: 9px 12px;
          background: white; border: 1.5px solid var(--border);
          border-radius: 7px; font-size: 13px; color: var(--text);
          outline: none; transition: border-color .15s;
          box-sizing: border-box; font-family: inherit;
        }
        .wa-input:focus { border-color: var(--s); box-shadow: 0 0 0 3px rgba(78,101,80,.08); }
        .wa-input:disabled { background: var(--surface); color: #bbb; cursor: not-allowed; }
        .wa-textarea { resize: vertical; min-height: 72px; }

        .wa-test-result {
          padding: 8px 12px; border-radius: 6px;
          font-size: 12px; font-weight: 700;
        }
        .wa-test-result--ok  { background: #E8F2E8; color: #2A6B2D; }
        .wa-test-result--err { background: #fdecea; color: #b91c1c; }

        /* Info card */
        .wa-info-card-title { font-size: 14px; font-weight: 800; color: var(--p); margin: 0 0 14px; }
        .wa-info-items { display: flex; flex-direction: column; gap: 12px; }
        .wa-info-item { display: flex; gap: 10px; align-items: flex-start; }
        .wa-info-item-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
        .wa-info-item strong { display: block; font-size: 12px; font-weight: 700; color: var(--dark); margin-bottom: 2px; }
        .wa-info-item p { font-size: 11px; color: #9AA494; margin: 0; line-height: 1.4; }

        /* ── Buttons ── */
        .wa-btn {
          padding: 12px 20px; border-radius: 8px; font-family: inherit; font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all .15s; border: none;
          display: inline-flex; align-items: center; gap: 8px;
          white-space: nowrap;
        }
        .wa-btn-primary { background: var(--p); color: var(--bg); }
        .wa-btn-primary:hover:not(:disabled) { background: var(--s); }
        .wa-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .wa-btn-outline {
          background: transparent; color: var(--text);
          border: 1.5px solid var(--border);
        }
        .wa-btn-outline:hover { border-color: var(--s); color: var(--p); }
        .wa-btn-outline-red {
          background: transparent; color: #b91c1c;
          border: 1.5px solid #f5c6c3;
        }
        .wa-btn-outline-red:hover:not(:disabled) { background: #fdecea; }
        .wa-btn-outline-red:disabled { opacity: .5; cursor: not-allowed; }
        .wa-btn-lg { padding: 13px 28px; font-size: 15px; }
        .wa-btn-full { width: 100%; justify-content: center; }

        /* Spinners */
        .wa-spinner-lg {
          width: 36px; height: 36px;
          border: 3px solid rgba(78,101,80,.2);
          border-top-color: var(--s); border-radius: 50%;
          animation: waSpin .8s linear infinite;
        }
        @keyframes waSpin { to{transform:rotate(360deg)} }

        @media (max-width: 900px) {
          .wa-layout { grid-template-columns: 1fr; }
          .wa-qr-body { grid-template-columns: 1fr; }
          .wa-qr-wrap { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WhatsAppIcon({ size = 24, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
        fill={color}
      />
    </svg>
  );
}

function Spinner({ sm, white }: { sm?: boolean; white?: boolean }) {
  const size = sm ? 14 : 20;
  return (
    <span
      style={{
        display: "inline-block",
        width: size, height: size,
        border: `2.5px solid ${white ? "rgba(228,230,219,.3)" : "rgba(78,101,80,.2)"}`,
        borderTopColor: white ? "#E4E6DB" : "#4E6550",
        borderRadius: "50%",
        animation: "waSpin .8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}
