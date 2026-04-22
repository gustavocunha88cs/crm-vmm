"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashMetrics {
  totalLeads:       number;
  novosLeads:       number;
  totalCampanhas:   number;
  campanhasAtivas:  number;
  mensagensEnviadas:number;
  taxaSucesso:      number;
}

interface RecentLead {
  id:           string;
  title:        string;
  city:         string;
  phone:        string;
  categoryName: string;
  status:       string;
  createdAt:    string;
}

interface ActiveCampanha {
  id:        string;
  nome:      string;
  status:    string;
  progresso: { total: number; enviados: number; falhos: number };
}

interface WAStatus {
  state:       string;
  profileName?: string;
  number?:     string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics,    setMetrics]    = useState<DashMetrics | null>(null);
  const [recentLeads, setRecentLeads] = useState<RecentLead[]>([]);
  const [activeCamps, setActiveCamps] = useState<ActiveCampanha[]>([]);
  const [waStatus,   setWaStatus]   = useState<WAStatus | null>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    loadDashboard();
    const t = setInterval(loadDashboard, 30_000); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  async function loadDashboard() {
    try {
      const [leadsRes, campanhasRes, waRes] = await Promise.allSettled([
        apiFetch("/api/leads"),
        apiFetch("/api/campanhas"),
        apiFetch("/api/whatsapp/status"),
      ]);

      // Process leads
      const leads: RecentLead[] = [];
      if (leadsRes.status === "fulfilled" && leadsRes.value.ok) {
        const d = await leadsRes.value.json();
        leads.push(...(d.leads ?? []));
      }

      // Process campanhas
      const campanhas: ActiveCampanha[] = [];
      if (campanhasRes.status === "fulfilled" && campanhasRes.value.ok) {
        const d = await campanhasRes.value.json();
        campanhas.push(...(d.campanhas ?? []));
      }

      // WhatsApp status
      if (waRes.status === "fulfilled" && waRes.value.ok) {
        const d = await waRes.value.json();
        setWaStatus(d);
      }

      // Build metrics
      const ativas = campanhas.filter((c) => c.status === "ativa");
      const enviados = campanhas.reduce((s, c) => s + (c.progresso?.enviados ?? 0), 0);
      const total    = campanhas.reduce((s, c) => s + (c.progresso?.total    ?? 0), 0);
      const falhos   = campanhas.reduce((s, c) => s + (c.progresso?.falhos   ?? 0), 0);

      setMetrics({
        totalLeads:        leads.length,
        novosLeads:        leads.filter((l) => l.status === "novo").length,
        totalCampanhas:    campanhas.length,
        campanhasAtivas:   ativas.length,
        mensagensEnviadas: enviados,
        taxaSucesso:       total > 0 ? Math.round(((enviados - falhos) / total) * 100) : 0,
      });

      setRecentLeads(leads.slice(0, 8));
      setActiveCamps(ativas.slice(0, 4));
    } catch {
      // fail silently — partial data is fine
    } finally {
      setLoading(false);
    }
  }

  const greeting = getGreeting();
  const firstName = user?.email?.split("@")[0] ?? "usuário";

  return (
    <div className="db-root">
      {/* ── Header ── */}
      <div className="db-header">
        <div>
          <h1 className="db-title">
            {greeting}, <span className="db-title-name">{firstName}</span> 👋
          </h1>
          <p className="db-subtitle">
            {loading ? "Carregando dados…" : `Visão geral do seu CRM · ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}`}
          </p>
        </div>
        <div className="db-header-actions">
          <Link href="/leads" className="db-btn-outline">Ver Leads</Link>
          <Link href="/campanhas" className="db-btn-primary">+ Nova Campanha</Link>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="db-metrics">
        {[
          {
            label: "Total de Leads",
            value: metrics?.totalLeads ?? "—",
            sub:   metrics ? `${metrics.novosLeads} novos` : "",
            icon:  "👥",
            color: "#28352A",
            href:  "/leads",
          },
          {
            label: "Campanhas Ativas",
            value: metrics?.campanhasAtivas ?? "—",
            sub:   metrics ? `de ${metrics.totalCampanhas} total` : "",
            icon:  "📣",
            color: "#4E6550",
            href:  "/campanhas",
            pulse: (metrics?.campanhasAtivas ?? 0) > 0,
          },
          {
            label: "Mensagens Enviadas",
            value: metrics?.mensagensEnviadas?.toLocaleString("pt-BR") ?? "—",
            sub:   metrics?.taxaSucesso ? `${metrics.taxaSucesso}% sucesso` : "",
            icon:  "💬",
            color: "#2A6B2D",
            href:  "/campanhas",
          },
          {
            label: "WhatsApp",
            value: waStatus?.state === "open" ? "Conectado" : waStatus?.state === "connecting" ? "Conectando" : "Offline",
            sub:   waStatus?.profileName ?? waStatus?.number ?? "Clique para conectar",
            icon:  "📱",
            color: waStatus?.state === "open" ? "#2A6B2D" : "#b91c1c",
            href:  "/whatsapp",
            isWa:  true,
            waState: waStatus?.state,
          },
        ].map((card) => (
          <Link key={card.label} href={card.href} className="db-metric-card" style={{ "--card-c": card.color } as React.CSSProperties}>
            <div className="db-metric-top">
              <span className="db-metric-icon">{card.icon}</span>
              {card.pulse && <span className="db-metric-pulse" />}
              {card.isWa && (
                <span
                  className="db-wa-dot"
                  style={{
                    background:
                      card.waState === "open"        ? "#4CAF50" :
                      card.waState === "connecting"  ? "#F5A623" : "#e87070",
                  }}
                />
              )}
            </div>
            <div className="db-metric-value" style={{ color: card.color }}>
              {loading ? <span className="db-skeleton" style={{ width: "60px" }} /> : card.value}
            </div>
            <div className="db-metric-label">{card.label}</div>
            {card.sub && !loading && (
              <div className="db-metric-sub">{card.sub}</div>
            )}
          </Link>
        ))}
      </div>

      {/* ── Two-column section ── */}
      <div className="db-cols">

        {/* Active campaigns */}
        <div className="db-section">
          <div className="db-section-header">
            <h2 className="db-section-title">Campanhas Ativas</h2>
            <Link href="/campanhas" className="db-section-link">Ver todas →</Link>
          </div>

          {loading ? (
            <div className="db-loading-rows">
              {[1,2,3].map((i) => <div key={i} className="db-skeleton-row" />)}
            </div>
          ) : activeCamps.length === 0 ? (
            <div className="db-empty">
              <span>📣</span>
              <p>Nenhuma campanha ativa no momento.</p>
              <Link href="/campanhas" className="db-btn-sm">Criar campanha</Link>
            </div>
          ) : (
            <div className="db-camp-list">
              {activeCamps.map((c) => {
                const pct = c.progresso.total > 0
                  ? Math.round((c.progresso.enviados / c.progresso.total) * 100)
                  : 0;
                return (
                  <Link key={c.id} href="/campanhas" className="db-camp-item">
                    <div className="db-camp-top">
                      <span className="db-camp-name">{c.nome}</span>
                      <span className="db-camp-pct">{pct}%</span>
                    </div>
                    <div className="db-camp-track">
                      <div className="db-camp-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="db-camp-meta">
                      <span>{c.progresso.enviados} enviados</span>
                      <span>{c.progresso.total} total</span>
                      {c.progresso.falhos > 0 && (
                        <span className="db-camp-falhos">⚠ {c.progresso.falhos} falhou</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent leads */}
        <div className="db-section">
          <div className="db-section-header">
            <h2 className="db-section-title">Leads Recentes</h2>
            <Link href="/leads" className="db-section-link">Ver todos →</Link>
          </div>

          {loading ? (
            <div className="db-loading-rows">
              {[1,2,3,4,5].map((i) => <div key={i} className="db-skeleton-row" />)}
            </div>
          ) : recentLeads.length === 0 ? (
            <div className="db-empty">
              <span>👥</span>
              <p>Nenhum lead importado ainda.</p>
              <Link href="/leads" className="db-btn-sm">Importar leads</Link>
            </div>
          ) : (
            <div className="db-leads-list">
              {recentLeads.map((lead) => (
                <Link key={lead.id} href="/leads" className="db-lead-item">
                  <div className="db-lead-avatar">
                    {lead.title?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="db-lead-info">
                    <span className="db-lead-name">{lead.title}</span>
                    <span className="db-lead-meta">
                      {lead.city && <>{lead.city} · </>}
                      {lead.categoryName}
                    </span>
                  </div>
                  <span
                    className="db-lead-status"
                    style={{
                      background:
                        lead.status === "novo"        ? "#E8F2E8" :
                        lead.status === "enviado"     ? "#E8EFF8" :
                        lead.status === "respondido"  ? "#FFF7E0" : "#F0F0EE",
                      color:
                        lead.status === "novo"        ? "#2A6B2D" :
                        lead.status === "enviado"     ? "#1E4A8A" :
                        lead.status === "respondido"  ? "#7A5C00" : "#888",
                    }}
                  >
                    {lead.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="db-quick-actions">
        <h2 className="db-section-title" style={{ marginBottom: 14 }}>Ações rápidas</h2>
        <div className="db-actions-grid">
          {[
            { icon: "🔍", label: "Importar Leads",    sub: "Buscar novos contatos via scraper",    href: "/leads",     action: "import" },
            { icon: "📣", label: "Nova Campanha",      sub: "Criar e configurar uma campanha",      href: "/campanhas" },
            { icon: "📱", label: "Conectar WhatsApp", sub: "Configurar conexão para envios",       href: "/whatsapp"  },
            { icon: "🏷️", label: "Gerenciar Leads",   sub: "Visualizar e organizar sua base",      href: "/leads"     },
          ].map((a) => (
            <Link key={a.label} href={a.href} className="db-action-card">
              <span className="db-action-icon">{a.icon}</span>
              <div>
                <p className="db-action-label">{a.label}</p>
                <p className="db-action-sub">{a.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        .db-root {
          font-family: inherit;
          padding: 32px; min-height: 100vh;
          background: var(--bg);
        }

        /* Header */
        .db-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; margin-bottom: 28px;
          flex-wrap: wrap; gap: 16px;
        }
        .db-title {
          font-size: 26px; font-weight: 800; color: var(--dark); margin: 0 0 5px;
        }
        .db-title-name { color: var(--s); }
        .db-subtitle { font-size: 13px; color: #9AA494; margin: 0; }
        .db-header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .db-btn-primary {
          padding: 9px 18px; background: var(--p); color: var(--bg);
          border-radius: 8px; font-family: inherit;
          font-size: 13px; font-weight: 700; text-decoration: none;
          transition: background .15s; display: inline-flex; align-items: center;
          white-space: nowrap;
        }
        .db-btn-primary:hover { background: var(--s); }
        .db-btn-outline {
          padding: 9px 16px; background: transparent;
          border: 1.5px solid var(--border); border-radius: 8px;
          font-family: inherit; font-size: 13px;
          color: var(--text); text-decoration: none; transition: all .15s;
          white-space: nowrap;
        }
        .db-btn-outline:hover { border-color: var(--s); color: var(--p); }

        /* Metric cards */
        .db-metrics {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 14px; margin-bottom: 24px;
        }
        .db-metric-card {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px;
          text-decoration: none; display: block;
          transition: all .15s; position: relative; overflow: hidden;
        }
        .db-metric-card:hover {
          box-shadow: 0 4px 20px rgba(11,16,23,.08);
          transform: translateY(-1px);
          border-color: var(--card-c, var(--border));
        }
        .db-metric-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px; background: var(--card-c, transparent);
          opacity: 0; transition: opacity .15s;
        }
        .db-metric-card:hover::before { opacity: 1; }
        .db-metric-top {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 10px;
          position: relative;
        }
        .db-metric-icon { font-size: 22px; }
        .db-metric-pulse {
          width: 8px; height: 8px; border-radius: 50%; background: #4CAF50;
          animation: dbPulse 2s ease-in-out infinite;
        }
        @keyframes dbPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        .db-wa-dot {
          width: 9px; height: 9px; border-radius: 50%;
        }
        .db-metric-value {
          font-size: 28px; font-weight: 800; line-height: 1; margin-bottom: 4px;
        }
        .db-metric-label { font-size: 12px; font-weight: 600; color: var(--text); }
        .db-metric-sub   { font-size: 11px; color: #9AA494; margin-top: 3px; }

        /* Skeleton */
        .db-skeleton {
          display: inline-block; height: 1em;
          background: linear-gradient(90deg, #e8e8e4 25%, #d8d9d3 50%, #e8e8e4 75%);
          background-size: 200% 100%;
          animation: dbShimmer 1.5s infinite;
          border-radius: 4px;
        }
        .db-skeleton-row {
          height: 56px; border-radius: 8px;
          background: linear-gradient(90deg, #e8e8e4 25%, #d8d9d3 50%, #e8e8e4 75%);
          background-size: 200% 100%;
          animation: dbShimmer 1.5s infinite;
          margin-bottom: 8px;
        }
        .db-loading-rows { display: flex; flex-direction: column; gap: 4px; }
        @keyframes dbShimmer { to { background-position: -200% 0; } }

        /* Two columns */
        .db-cols {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; margin-bottom: 24px;
        }
        .db-section {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px;
        }
        .db-section-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px;
        }
        .db-section-title { font-size: 15px; font-weight: 800; color: var(--dark); margin: 0; }
        .db-section-link  { font-size: 12px; color: var(--s); text-decoration: none; font-weight: 700; }
        .db-section-link:hover { text-decoration: underline; }

        /* Empty state */
        .db-empty {
          display: flex; flex-direction: column;
          align-items: center; gap: 8px;
          padding: 28px 16px; color: var(--text);
        }
        .db-empty span { font-size: 30px; }
        .db-empty p { font-size: 13px; color: #9AA494; margin: 0; }
        .db-btn-sm {
          padding: 6px 14px; background: var(--p); color: var(--bg);
          border-radius: 6px; font-family: inherit;
          font-size: 12px; font-weight: 700; text-decoration: none;
          transition: background .15s; margin-top: 4px;
        }
        .db-btn-sm:hover { background: var(--s); }

        /* Campaign list */
        .db-camp-list { display: flex; flex-direction: column; gap: 10px; }
        .db-camp-item {
          display: block; padding: 12px; border-radius: 8px;
          border: 1px solid var(--border); text-decoration: none;
          transition: all .15s;
        }
        .db-camp-item:hover { background: #F8FAF7; border-color: var(--s); }
        .db-camp-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .db-camp-name { font-size: 13px; font-weight: 700; color: var(--dark); }
        .db-camp-pct  { font-size: 12px; font-weight: 800; color: var(--s); }
        .db-camp-track {
          height: 4px; background: #e8e8e4; border-radius: 2px;
          overflow: hidden; margin-bottom: 6px;
        }
        .db-camp-fill { height: 100%; background: var(--s); border-radius: 2px; transition: width .5s ease; }
        .db-camp-meta { display: flex; gap: 10px; font-size: 11px; color: #9AA494; }
        .db-camp-falhos { color: #e87070; font-weight: 700; }

        /* Leads list */
        .db-leads-list { display: flex; flex-direction: column; gap: 2px; }
        .db-lead-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 8px; border-radius: 8px;
          text-decoration: none; transition: background .1s;
        }
        .db-lead-item:hover { background: #F8FAF7; }
        .db-lead-avatar {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(78,101,80,.12); color: var(--s);
          font-size: 13px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .db-lead-info { flex: 1; min-width: 0; }
        .db-lead-name { display: block; font-size: 13px; font-weight: 700; color: var(--dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .db-lead-meta { display: block; font-size: 11px; color: #9AA494; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .db-lead-status {
          padding: 2px 8px; border-radius: 10px;
          font-size: 10px; font-weight: 700; flex-shrink: 0;
        }

        /* Quick actions */
        .db-quick-actions {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px;
        }
        .db-actions-grid {
          display: grid; grid-template-columns: repeat(4,1fr); gap: 10px;
        }
        .db-action-card {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px; border-radius: 10px;
          border: 1.5px solid var(--border); text-decoration: none;
          transition: all .15s; background: var(--surface);
        }
        .db-action-card:hover {
          border-color: var(--s); background: white;
          box-shadow: 0 2px 12px rgba(11,16,23,.06);
        }
        .db-action-icon { font-size: 22px; flex-shrink: 0; margin-top: 1px; }
        .db-action-label { font-size: 13px; font-weight: 700; color: var(--dark); margin: 0 0 3px; }
        .db-action-sub   { font-size: 11px; color: #9AA494; margin: 0; line-height: 1.3; }

        @media (max-width: 1100px) {
          .db-metrics { grid-template-columns: repeat(2,1fr); }
          .db-actions-grid { grid-template-columns: repeat(2,1fr); }
        }
        @media (max-width: 720px) {
          .db-cols { grid-template-columns: 1fr; }
          .db-metrics { grid-template-columns: repeat(2,1fr); }
          .db-root { padding: 20px 16px; }
        }
      `}</style>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
