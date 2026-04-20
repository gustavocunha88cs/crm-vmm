"use client";

import { useEffect, useState } from "react";
import type { Campanha } from "@/types/campanhas";

interface CampanhaCardProps {
  campanha: Campanha;
  onEdit: (c: Campanha) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onShowReport: (c: Campanha) => void;
}

const STATUS_MAP = {
  rascunho:  { label: "Rascunho",  bg: "#F0F0EE", color: "#888",    dot: "#ccc"    },
  ativa:     { label: "Ativa",     bg: "#E8F2E8", color: "#2A6B2D", dot: "#4CAF50" },
  pausada:   { label: "Pausada",   bg: "#FFF7E0", color: "#7A5C00", dot: "#F5A623" },
  concluida: { label: "Concluída", bg: "#E8EFF8", color: "#1E4A8A", dot: "#4A90D9" },
};

export default function CampanhaCard({
  campanha,
  onEdit,
  onDelete,
  onStart,
  onPause,
  onShowReport,
}: CampanhaCardProps) {
  const st = STATUS_MAP[campanha.status] ?? STATUS_MAP.rascunho;
  const prog = campanha.progresso || { total: 0, enviados: 0, falhos: 0 };
  const pct = prog.total > 0 ? Math.round((prog.enviados / prog.total) * 100) : 0;

  const [currentLead, setCurrentLead] = useState<{ phone: string; leadNome: string; status: string } | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (campanha.status === "ativa") {
      const fetchCurrent = async () => {
        try {
          const res = await fetch(`/api/campanhas/${campanha.id}/current-lead`);
          const data = await res.json();
          setCurrentLead(data.current || null);
        } catch {}
      };
      fetchCurrent();
      interval = setInterval(fetchCurrent, 4000);
    } else {
      setCurrentLead(null);
    }
    return () => clearInterval(interval);
  }, [campanha.status, campanha.id]);

  return (
    <div className={`cc-card cc-card--${campanha.status}`}>
      {/* Status dot + badge */}
      <div className="cc-top">
        <div className="cc-status" style={{ background: st.bg, color: st.color }}>
          <span className="cc-dot" style={{ background: st.dot }} />
          {st.label}
        </div>
        <div className="cc-actions">
          {(campanha.status === "rascunho" || campanha.status === "pausada") && (
            <button
              className="cc-action-btn cc-action-start"
              onClick={() => onStart(campanha.id!)}
              title="Iniciar campanha"
            >
              ▶ Iniciar
            </button>
          )}
          {campanha.status === "ativa" && (
            <button
              className="cc-action-btn cc-action-pause"
              onClick={() => onPause(campanha.id!)}
              title="Pausar campanha"
            >
              ⏸ Pausar
            </button>
          )}
          {campanha.status === "concluida" && (
            <button
              className="cc-action-btn"
              disabled
              style={{ background: "#E8EFF8", color: "#1E4A8A", borderColor: "#bbdefb", opacity: 0.8 }}
            >
              ✅ Finalizada
            </button>
          )}
          {campanha.status !== "ativa" && campanha.status !== "concluida" && (
            <button
              className="cc-action-btn cc-action-edit"
              onClick={() => onEdit(campanha)}
              title="Editar"
            >
              ✎
            </button>
          )}
          <button
            className="cc-action-btn cc-action-del"
            onClick={() => onDelete(campanha.id!)}
            title="Excluir campanha"
          >
            🗑
          </button>
          <button
            className="cc-action-btn cc-action-report"
            onClick={() => onShowReport(campanha)}
            title="Ver relatório de disparos"
          >
            📋 Relatório
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="cc-name">{campanha.nome}</h3>
      {campanha.descricao && (
        <p className="cc-desc">{campanha.descricao}</p>
      )}

      {/* Stats row */}
      <div className="cc-stats">
        <div className="cc-stat">
          <span className="cc-stat-v">{campanha.leadIds?.length ?? 0}</span>
          <span className="cc-stat-l">leads</span>
        </div>
        <div className="cc-stat">
          <span className="cc-stat-v">{campanha.mensagens?.length ?? 0}</span>
          <span className="cc-stat-l">variações</span>
        </div>
        <div className="cc-stat">
          <span className="cc-stat-v">{formatIntervalo(campanha.intervaloSegundos)}</span>
          <span className="cc-stat-l">intervalo</span>
        </div>
      </div>

      {/* Progress bar — only when not rascunho */}
      {campanha.status !== "rascunho" && prog.total > 0 && (
        <div className="cc-progress-wrap">
          <div className="cc-progress-row">
            <span>{prog.enviados}/{prog.total} enviados - {pct}%</span>
          </div>
          <div className="cc-progress-track">
            <div
              className="cc-progress-fill"
              style={{ width: `${pct}%`, background: st.dot }}
            />
          </div>
          {prog.falhos > 0 && (
            <span className="cc-falhos">⚠ {prog.falhos} falhou</span>
          )}
        </div>
      )}

      {/* Current Lead Info */}
      {currentLead && campanha.status === "ativa" && (
        <div style={{ marginTop: "12px", background: "rgba(42, 107, 45, 0.05)", borderLeft: "3px solid #2A6B2D", padding: "8px 12px", borderRadius: "0 8px 8px 0" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ height: "6px", width: "6px", borderRadius: "50%", background: "#2A6B2D", display: "inline-block" }}></span>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#2A6B2D", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {currentLead.status === "enviando" ? "Enviando agora para" : "Próximo na fila"}
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text)" }}>
            <strong>{currentLead.leadNome}</strong> <span style={{ color: "#888", fontSize: "11px" }}>({currentLead.phone})</span>
          </p>
        </div>
      )}

      {/* Tags */}
      {campanha.filtroTags?.length > 0 && (
        <div className="cc-tags">
          {campanha.filtroTags.map((t) => (
            <span key={t} className="cc-tag">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatIntervalo(s: number): string {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${Math.round(s / 3600)}h`;
}
