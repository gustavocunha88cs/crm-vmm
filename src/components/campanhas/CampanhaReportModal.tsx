"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { Campanha } from "@/types/campanhas";

interface ReportItem {
  id: string;
  leadNome: string;
  phone: string;
  status: "pendente" | "enviado" | "falhou";
  enviadoEm?: any;
  agendadoPara?: any;
  mensagem: string;
}

interface CampanhaReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  campanha: Campanha;
}

export default function CampanhaReportModal({
  isOpen,
  onClose,
  campanha,
}: CampanhaReportModalProps) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, campanha.id]);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/campanhas/${campanha.id}/report`);
      const data = await res.json();
      setItems(data.results || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="rep-overlay" onClick={onClose}>
      <div className="rep-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rep-header">
          <div>
            <h2>Relatório de Disparos</h2>
            <p>{campanha.nome}</p>
          </div>
          <button className="rep-close" onClick={onClose}>✕</button>
        </div>

        <div className="rep-body">
          {loading ? (
            <div className="rep-loading">
              <div className="rep-spinner" />
              <span>Carregando relatório...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="rep-empty">Nenhum registro de disparo encontrado.</div>
          ) : (
            <table className="rep-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Agendado</th>
                  <th>Disparado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const scheduledDate = item.agendadoPara ? (item.agendadoPara.seconds ? item.agendadoPara.seconds * 1000 : item.agendadoPara) : null;
                  const sentDate = item.enviadoEm ? (item.enviadoEm.seconds ? item.enviadoEm.seconds * 1000 : item.enviadoEm) : null;
                  
                  const scheduledTime = scheduledDate ? new Date(scheduledDate).toLocaleString("pt-BR", { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' }) : "—";
                  const sentTime = sentDate ? new Date(sentDate).toLocaleString("pt-BR", { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' }) : "—";
                  
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="rep-lead-cell">
                          <strong>{item.leadNome}</strong>
                          <span className="rep-msg-preview" title={item.mensagem}>{item.mensagem.substring(0, 30)}...</span>
                        </div>
                      </td>
                      <td>{item.phone}</td>
                      <td>
                        <span className={`rep-status-badge ${item.status}`}>
                          {item.status === "enviado" ? "✓ Sucesso" : item.status === "falhou" ? "✕ Falhou" : "⏲ Pendente"}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{scheduledTime}</td>
                      <td style={{ fontSize: '11px', whiteSpace: 'nowrap', fontWeight: sentDate ? 700 : 400 }}>{sentTime}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rep-footer">
          <button className="rep-btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>

      <style jsx>{`
        .rep-overlay {
          position: fixed; inset: 0; background: rgba(11,16,23,0.7);
          backdrop-filter: blur(8px); z-index: 2000;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .rep-modal {
          background: #F2F3EE; width: 100%; max-width: 800px;
          max-height: 85vh; border-radius: 16px; display: flex; flex-direction: column;
          box-shadow: 0 40px 100px rgba(0,0,0,0.4); overflow: hidden;
        }
        .rep-header {
          padding: 24px; background: #28352A; color: white;
          display: flex; justify-content: space-between; align-items: flex-start;
        }
        .rep-header h2 { margin: 0; font-size: 20px; font-weight: 800; }
        .rep-header p { margin: 4px 0 0; font-size: 13px; opacity: 0.7; }
        .rep-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; }

        .rep-body { flex: 1; overflow-y: auto; padding: 12px; }
        .rep-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px; color: #4E6550; }
        .rep-spinner { 
          width: 32px; height: 32px; border: 3px solid rgba(78,101,80,0.1); 
          border-top-color: #4E6550; border-radius: 50%; animation: spin 0.8s linear infinite; 
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .rep-empty { padding: 40px; text-align: center; color: #888; }
        
        .rep-table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
        .rep-table th { background: #E4E6DB; padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: #58595B; }
        .rep-table td { padding: 12px 16px; border-bottom: 1px solid #F2F3EE; font-size: 13px; color: #28352A; }
        
        .rep-lead-cell { display: flex; flex-direction: column; gap: 2px; }
        .rep-msg-preview { font-size: 11px; color: #999; }
        
        .rep-status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
        .rep-status-badge.enviado { background: #E8F2E8; color: #2A6B2D; }
        .rep-status-badge.falhou { background: #fdecea; color: #c0392b; }
        .rep-status-badge.pendente { background: #FFF7E0; color: #7A5C00; }
        
        .rep-footer { padding: 16px 24px; background: white; display: flex; justify-content: flex-end; }
        .rep-btn-primary { 
            padding: 10px 24px; background: #28352A; color: white; border: none; 
            border-radius: 8px; font-weight: 700; cursor: pointer;
        }
      `}</style>
    </div>
  );
}
