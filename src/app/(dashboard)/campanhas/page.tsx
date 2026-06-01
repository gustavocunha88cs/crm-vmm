"use client";

import { useState, useEffect, useCallback } from "react";
import CampanhaFormModal from "@/components/campanhas/CampanhaFormModal";
import CampanhaCard from "@/components/campanhas/CampanhaCard";
import CampanhaReportModal from "@/components/campanhas/CampanhaReportModal";
import type { Campanha, CampanhaStatus } from "@/types/campanhas";
import { apiFetch } from "@/lib/api";

const STATUS_FILTERS: { value: CampanhaStatus | "todas"; label: string }[] = [
  { value: "todas",     label: "Todas"     },
  { value: "rascunho",  label: "Rascunho"  },
  { value: "ativa",     label: "Ativas"    },
  { value: "pausada",   label: "Pausadas"  },
  { value: "concluida", label: "Concluídas"},
];

export default function CampanhasPage() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [statusFilter, setStatusFilter] = useState<CampanhaStatus | "todas">("todas");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // campanha id
  const [reportCampanha, setReportCampanha] = useState<Campanha | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCampanhas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/campanhas");
      const data = await res.json();
      setCampanhas(data.campanhas ?? []);
    } catch {
      showToast("Erro ao carregar campanhas", "err");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchCampanhas(); 
  }, [fetchCampanhas]);

  // Polling para atualizar progresso e status em tempo real
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const res = await apiFetch("/api/campanhas");
        const data = await res.json();
        if (data.campanhas) {
          // Só atualiza se houver mudança relevante (opcional, mas vamos simplificar)
          setCampanhas(data.campanhas);
        }
      } catch {}
    };

    // Se houver campanhas ativas, poll a cada 6s. Senão a cada 15s.
    const hasActive = campanhas.some(c => c.status === "ativa");
    const ms = hasActive ? 6000 : 15000;

    intervalId = setInterval(poll, ms);
    return () => clearInterval(intervalId);
  }, [campanhas.length, campanhas.some(c => c.status === "ativa")]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSaved(campanha: Campanha) {
    setCampanhas((prev) => {
      const idx = prev.findIndex((c) => c.id === campanha.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = campanha;
        return next;
      }
      return [campanha, ...prev];
    });
    showToast(
      editing ? "Campanha atualizada!" : "Campanha criada com sucesso!"
    );
    setEditing(null);
  }

  function handleEdit(c: Campanha) {
    setEditing(c);
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    setConfirmDelete(null);
    setActionLoading(id);
    try {
      await apiFetch(`/api/campanhas/${id}`, { method: "DELETE" });
      setCampanhas((prev) => prev.filter((c) => c.id !== id));
      showToast("Campanha excluída.");
    } catch {
      showToast("Erro ao excluir", "err");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStart(id: string) {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/campanhas/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampanhas((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "ativa" } : c))
      );
      showToast(`✓ Campanha iniciada! ${data.totalEnfileirados} envios na fila.`);
    } catch (err: unknown) {
      showToast((err as Error).message ?? "Erro ao iniciar", "err");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePause(id: string) {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/campanhas/${id}/pause`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampanhas((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: data.status as CampanhaStatus } : c
        )
      );
      showToast(
        data.status === "pausada" ? "Campanha pausada." : "Campanha retomada."
      );
    } catch (err: unknown) {
      showToast((err as Error).message ?? "Erro", "err");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered =
    statusFilter === "todas"
      ? campanhas
      : campanhas.filter((c) => c.status === statusFilter);

  // ── Aggregates ───────────────────────────────────────────────────────────────
  const totals = {
    ativas:    campanhas.filter((c) => c.status === "ativa").length,
    rascunhos: campanhas.filter((c) => c.status === "rascunho").length,
    enviados:  campanhas.reduce((s, c) => s + (c.progresso?.enviados ?? 0), 0),
    leads:     campanhas.reduce((s, c) => s + (c.leadIds?.length ?? 0), 0),
  };

  return (
    <>
      <CampanhaFormModal
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={handleSaved}
        editingCampanha={editing}
      />

      {reportCampanha && (
        <CampanhaReportModal
          isOpen={!!reportCampanha}
          onClose={() => setReportCampanha(null)}
          campanha={reportCampanha}
        />
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="cp-confirm-overlay">
          <div className="cp-confirm-box">
            <h3>Excluir campanha?</h3>
            <p>Esta ação não pode ser desfeita. A fila de envios também será excluída.</p>
            <div className="cp-confirm-actions">
              <button className="cp-btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="cp-btn-danger" onClick={() => handleDelete(confirmDelete)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cp-root">
        {/* Toast */}
        {toast && (
          <div className={`cp-toast cp-toast--${toast.type}`}>
            {toast.msg}
          </div>
        )}

        {/* Page header */}
        <div className="cp-header">
          <div>
            <h1 className="cp-title">Campanhas</h1>
            <p className="cp-subtitle">
              {loading ? "Carregando…" : `${campanhas.length} campanha${campanhas.length !== 1 ? "s" : ""} no total`}
            </p>
          </div>
          <button className="cp-btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            + Nova Campanha
          </button>
        </div>

        {/* Metric cards */}
        <div className="cp-metrics">
          <div className="cp-metric">
            <span className="cp-metric-v cp-metric-green">{totals.ativas}</span>
            <span className="cp-metric-l">campanhas ativas</span>
          </div>
          <div className="cp-metric">
            <span className="cp-metric-v">{totals.rascunhos}</span>
            <span className="cp-metric-l">rascunhos</span>
          </div>
          <div className="cp-metric">
            <span className="cp-metric-v cp-metric-blue">{totals.enviados.toLocaleString("pt-BR")}</span>
            <span className="cp-metric-l">mensagens enviadas</span>
          </div>
          <div className="cp-metric">
            <span className="cp-metric-v">{totals.leads.toLocaleString("pt-BR")}</span>
            <span className="cp-metric-l">leads em campanhas</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="cp-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`cp-filter-btn ${statusFilter === f.value ? "active" : ""}`}
              onClick={() => setStatusFilter(f.value as CampanhaStatus | "todas")}
            >
              {f.label}
              <span className="cp-filter-count">
                {f.value === "todas"
                  ? campanhas.length
                  : campanhas.filter((c) => c.status === f.value).length}
              </span>
            </button>
          ))}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="cp-loading">
            <div className="cp-spinner" />
            <p>Carregando campanhas…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cp-empty">
            <span className="cp-empty-icon">📣</span>
            <p className="cp-empty-title">
              {statusFilter === "todas" ? "Nenhuma campanha ainda" : `Nenhuma campanha ${STATUS_FILTERS.find(f=>f.value===statusFilter)?.label.toLowerCase()}`}
            </p>
            <p className="cp-empty-sub">
              {statusFilter === "todas"
                ? "Crie sua primeira campanha e comece a prospectar via WhatsApp."
                : "Tente outro filtro."}
            </p>
            {statusFilter === "todas" && (
              <button
                className="cp-btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setFormOpen(true)}
              >
                + Nova Campanha
              </button>
            )}
          </div>
        ) : (
          <div className="cp-grid">
            {filtered.map((c) => (
              <div key={c.id} className={actionLoading === c.id ? "cp-card-loading" : ""}>
                <CampanhaCard
                  campanha={c}
                  onEdit={handleEdit}
                  onDelete={(id) => setConfirmDelete(id)}
                  onStart={handleStart}
                  onPause={handlePause}
                  onShowReport={(c) => setReportCampanha(c)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .cp-root {
          font-family: inherit;
          padding: 32px; min-height: 100vh; background: var(--bg);
          position: relative;
        }

        /* Toast */
        .cp-toast {
          position: fixed; top: 20px; right: 20px;
          padding: 12px 20px; border-radius: 8px;
          font-size: 14px; font-weight: 600;
          z-index: 2000; animation: cpFadeIn .2s ease;
          box-shadow: 0 4px 20px rgba(11,16,23,.2);
        }
        .cp-toast--ok { background: var(--s); color: white; }
        .cp-toast--err { background: #c0392b; color: white; }
        @keyframes cpFadeIn {
          from{opacity:0;transform:translateY(-8px)}
          to{opacity:1;transform:translateY(0)}
        }

        /* Header */
        .cp-header {
          display: flex; align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 28px; flex-wrap: wrap; gap: 16px;
        }
        .cp-title { font-size: 28px; font-weight: 800; color: var(--p); margin: 0 0 4px; }
        .cp-subtitle { font-size: 13px; color: #9AA494; margin: 0; }

        /* Buttons */
        .cp-btn-primary {
          padding: 10px 20px; background: var(--p);
          color: var(--bg); border: none; border-radius: 8px;
          font-family: inherit; font-size: 14px;
          font-weight: 700; cursor: pointer; transition: background .15s;
          white-space: nowrap;
        }
        .cp-btn-primary:hover { background: var(--s); }
        .cp-btn-secondary {
          padding: 9px 16px; background: transparent;
          border: 1.5px solid var(--border); border-radius: 8px;
          font-family: inherit; font-size: 13px;
          color: var(--text); cursor: pointer; transition: all .15s;
        }
        .cp-btn-secondary:hover { border-color: var(--s); }
        .cp-btn-danger {
          padding: 9px 16px; background: #c0392b;
          color: white; border: none; border-radius: 8px;
          font-family: inherit; font-size: 13px;
          font-weight: 700; cursor: pointer; transition: background .15s;
        }
        .cp-btn-danger:hover { background: #a93226; }

        /* Metrics */
        .cp-metrics {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 12px; margin-bottom: 28px;
        }
        .cp-metric {
          background: white; border: 1px solid var(--border);
          border-radius: 10px; padding: 16px 20px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .cp-metric-v { font-size: 28px; font-weight: 800; color: var(--p); line-height: 1; }
        .cp-metric-green { color: #2A6B2D; }
        .cp-metric-blue  { color: #1E4A8A; }
        .cp-metric-l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9AA494; }

        /* Filters */
        .cp-filters { display: flex; gap: 6px; margin-bottom: 24px; flex-wrap: wrap; }
        .cp-filter-btn {
          padding: 7px 14px; border-radius: 20px;
          border: 1.5px solid var(--border); background: transparent;
          font-family: inherit; font-size: 13px; font-weight: 600;
          color: var(--text); cursor: pointer; transition: all .15s;
          display: flex; align-items: center; gap: 7px;
        }
        .cp-filter-btn:hover { border-color: var(--s); }
        .cp-filter-btn.active { background: var(--p); border-color: var(--p); color: var(--bg); }
        .cp-filter-count {
          background: rgba(0,0,0,.08); color: inherit;
          font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
        }
        .cp-filter-btn.active .cp-filter-count { background: rgba(228,230,219,.2); }

        /* Grid */
        .cp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .cp-card-loading { opacity: .5; pointer-events: none; }

        /* Card styles (inline in CampanhaCard, but we add global bits here) */
        .cc-card {
          background: white; border: 1.5px solid var(--border);
          border-radius: 12px; padding: 20px;
          transition: box-shadow .15s, transform .15s;
          display: flex; flex-direction: column; gap: 12px;
        }
        .cc-card:hover { box-shadow: 0 4px 20px rgba(11,16,23,.08); transform: translateY(-1px); }
        .cc-card--ativa { border-left: 3px solid #4CAF50; }
        .cc-card--pausada { border-left: 3px solid #F5A623; }
        .cc-top { display: flex; align-items: center; justify-content: space-between; }
        .cc-status {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 700;
        }
        .cc-dot {
          width: 7px; height: 7px; border-radius: 50%;
        }
        .cc-card--ativa .cc-dot { animation: ccPulse 2s ease-in-out infinite; }
        @keyframes ccPulse {
          0%,100%{opacity:1} 50%{opacity:.4}
        }
        .cc-actions { display: flex; gap: 6px; }
        .cc-action-btn {
          padding: 5px 10px; border-radius: 6px;
          border: 1px solid var(--border); background: transparent;
          font-size: 12px; font-weight: 700; cursor: pointer;
          font-family: inherit; transition: all .15s;
        }
        .cc-action-start { color: #2A6B2D; border-color: #c3e6cb; }
        .cc-action-start:hover { background: #E8F2E8; }
        .cc-action-pause { color: #7A5C00; border-color: #ffe082; }
        .cc-action-pause:hover { background: #FFF7E0; }
        .cc-action-edit { color: var(--text); }
        .cc-action-edit:hover { background: var(--surface); }
        .cc-action-del { color: #c0392b; border-color: #f5c6c3; }
        .cc-action-del:hover { background: #fdecea; }
        .cc-action-report { color: #1E4A8A; border-color: #bbdefb; }
        .cc-action-report:hover { background: #e3f2fd; }
        .cc-name { font-size: 16px; font-weight: 800; color: var(--dark); margin: 0; }
        .cc-desc { font-size: 12px; color: #9AA494; margin: 0; line-height: 1.4; }
        .cc-stats { display: flex; gap: 16px; }
        .cc-stat { display: flex; flex-direction: column; gap: 1px; }
        .cc-stat-v { font-size: 18px; font-weight: 800; color: var(--p); line-height: 1; }
        .cc-stat-l { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #9AA494; }
        .cc-progress-wrap { display: flex; flex-direction: column; gap: 4px; }
        .cc-progress-row { display: flex; justify-content: space-between; font-size: 11px; color: #9AA494; }
        .cc-progress-track {
          height: 4px; background: #e8e8e8; border-radius: 2px; overflow: hidden;
        }
        .cc-progress-fill { height: 100%; border-radius: 2px; transition: width .5s ease; }
        .cc-falhos { font-size: 11px; color: #e87070; }
        .cc-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .cc-tag {
          font-size: 10px; font-weight: 700; color: var(--s);
          background: rgba(78,101,80,.1); padding: 2px 7px; border-radius: 8px;
        }

        /* Loading / empty */
        .cp-loading {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px;
          padding: 80px 20px; color: var(--text);
        }
        .cp-spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(78,101,80,.2);
          border-top-color: var(--s); border-radius: 50%;
          animation: cpSpin .8s linear infinite;
        }
        @keyframes cpSpin { to{transform:rotate(360deg)} }
        .cp-empty {
          display: flex; flex-direction: column;
          align-items: center; gap: 8px;
          padding: 80px 20px;
        }
        .cp-empty-icon { font-size: 48px; }
        .cp-empty-title { font-size: 18px; font-weight: 700; color: var(--p); margin: 0; }
        .cp-empty-sub { font-size: 13px; color: #9AA494; margin: 0; text-align: center; max-width: 320px; }

        /* Confirm dialog */
        .cp-confirm-overlay {
          position: fixed; inset: 0; z-index: 1500;
          background: rgba(11,16,23,.65); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .cp-confirm-box {
          background: white; border-radius: 12px;
          padding: 28px; max-width: 380px; width: 90%;
          box-shadow: 0 20px 60px rgba(11,16,23,.25);
          animation: cpFadeIn .18s ease;
        }
        .cp-confirm-box h3 { font-size: 17px; font-weight: 800; color: var(--dark); margin: 0 0 8px; }
        .cp-confirm-box p { font-size: 13px; color: var(--text); margin: 0 0 20px; line-height: 1.5; }
        .cp-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }

        @media (max-width: 768px) {
          .cp-metrics { grid-template-columns: repeat(2,1fr); }
          .cp-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
