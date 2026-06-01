"use client";

import { useState, useEffect, useCallback } from "react";
import ImportLeadsModal from "@/components/leads/ImportLeadsModal";
import AddLeadManualModal from "@/components/leads/AddLeadManualModal";
import LeadEditModal from "@/components/leads/LeadEditModal";
import CampanhaFormModal from "@/components/campanhas/CampanhaFormModal";
import LeadsKanban from "@/components/leads/LeadsKanban";
import BulkTagModal from "@/components/leads/BulkTagModal";
import type { Lead, LeadStatus, LeadTemperature } from "@/types";
import type { Campanha, FilaStatus } from "@/types/campanhas";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api";

interface LeadExtended extends Lead {
  lastMessageAt?: any;
  importBatchId: string;
  campaignContacted?: boolean;
  lastCampaignName?: string;
  lastCampaignAt?: any;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  novo:       { label: "🚀 Lista de Disparo",  bg: "#E8F2E8", color: "#2A6B2D" },
  enviado:    { label: "📤 Enviado",    bg: "#E8EFF8", color: "#1E4A8A" },
  entregue:   { label: "📥 Entregue",   bg: "#E3F2FD", color: "#1976D2" },
  lido:       { label: "👀 Lido",       bg: "#FFF9C4", color: "#FBC02D" },
  respondido: { label: "💬 Respondido", bg: "#E8F5E9", color: "#2E7D32" },
  oportunidade: { label: "🔥 Oportunidade", bg: "#FFEBEE", color: "#D32F2F" },
  fechado:    { label: "💰 Fechado",    bg: "#F1F8E9", color: "#33691E" },
  perdido:    { label: "🗑️ Perdido",    bg: "#F5F5F5", color: "#616161" },
  invalido:   { label: "❌ Inválido",   bg: "#FFEBEE", color: "#C62828" },
};

export default function LeadsPage() {
  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [tags,        setTags]        = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [importOpen,  setImportOpen]  = useState(false);
  const [manualOpen,  setManualOpen]  = useState(false);
  const [editOpen,    setEditOpen]    = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [campOpen,    setCampOpen]    = useState(false);
  const [filterTag,   setFilterTag]   = useState<string>("");
  const [search,      setSearch]      = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [successMsg,  setSuccessMsg]  = useState("");
  const [isDeleting,  setIsDeleting]  = useState(false);
  const [view, setView] = useState<"lista" | "kanban">("lista");
  const [validatingProgress, setValidatingProgress] = useState<{current: number, total: number} | null>(null);
  const [onlyShowValidWA, setOnlyShowValidWA] = useState(false);
  const [isProcessingWA, setIsProcessingWA] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [isValidatingBase, setIsValidatingBase] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Campaign tracking states
  const [leadCampanhas, setLeadCampanhas] = useState<Record<string, any[]>>({});
  const [allCampMap, setAllCampMap] = useState<Campanha[]>([]);
  const [filterCampanha, setFilterCampanha] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, tagsRes, mappingRes, campRes] = await Promise.all([
        apiFetch(`/api/leads${filterTag ? `?tag=${filterTag}` : ""}`),
        apiFetch("/api/tags"),
        apiFetch("/api/leads/campanhas"),
        apiFetch("/api/campanhas"),
      ]);
      
      if (!leadsRes.ok || !mappingRes.ok) throw new Error("Erro ao buscar dados");

      const leadsData   = await leadsRes.json();
      const tagsData    = await tagsRes.json();
      const mappingData = await mappingRes.json();
      const campData    = await campRes.json();

      setLeads(leadsData.leads ?? []);
      setTags(tagsData.tags   ?? []);
      setLeadCampanhas(mappingData ?? {});
      setAllCampMap(campData.campanhas ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterTag]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleImportSuccess(count: number) {
    setImportOpen(false);
    setSuccessMsg(`✓ ${count} leads importados com sucesso!`);
    fetchData();
    setTimeout(() => setSuccessMsg(""), 5000);
  }

  function handleCampanhaSaved(campanha: Campanha) {
    setCampOpen(false);
    setSelectedIds(new Set());
    setSuccessMsg(`✓ Campanha "${campanha.nome}" criada! Acesse a aba Campanhas para iniciá-la.`);
    setTimeout(() => setSuccessMsg(""), 6000);
  }

  async function handleDelete() {
    if (!confirm(`Tem certeza que deseja DELETAR ${selectedIds.size} leads permanentemente?`)) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await apiFetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setSuccessMsg(`✓ ${ids.length} leads deletados com sucesso!`);
        setSelectedIds(new Set());
        fetchData();
        setTimeout(() => setSuccessMsg(""), 5000);
      } else {
        alert("Erro ao deletar leads");
      }
    } catch {
      alert("Erro ao conectar com o servidor.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCancelValidation() {
    if (!confirm("Isso irá parar a validação de todos os leads pendentes. Deseja continuar?")) return;
    setIsCancelling(true);
    try {
      const res = await apiFetch("/api/leads/cancel-validation", { method: "POST" });
      if (res.ok) {
        setSuccessMsg("🛡️ Validação cancelada com sucesso.");
        fetchData();
        setTimeout(() => setSuccessMsg(""), 5000);
      }
    } catch {
      alert("Erro ao cancelar validação.");
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleValidateBase() {
    if (selectedIds.size === 0) return alert("Selecione ao menos um lead para validar.");
    if (!confirm(`Deseja colocar os ${selectedIds.size} leads selecionados na fila de validação?`)) return;
    setIsValidatingBase(true);
    try {
      const res = await apiFetch("/api/leads/validate-base", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(`🛡️ ${data.count} leads adicionados à fila de validação!`);
        setSelectedIds(new Set());
        fetchData();
        setTimeout(() => setSuccessMsg(""), 6000);
      }
    } catch {
      alert("Erro ao iniciar validação.");
    } finally {
      setIsValidatingBase(false);
    }
  }

  // Leads selecionados com telefone para passar ao modal de campanha
  const selectedLeadObjects = leads.filter(
    (l) => l.id && selectedIds.has(l.id)
  );

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      // Filter by WhatsApp status if enabled
      if (onlyShowValidWA && l.wa_status !== "VALIDADO") return false;

      // Filter by Campaign
      if (filterCampanha) {
        const leadParticipations = leadCampanhas[l.id!] || [];
        const isInCamp = leadParticipations.some(p => p.campanhaId === filterCampanha);
        if (!isInCamp) return false;
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.title?.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.categoryName?.toLowerCase().includes(q)
      );
    });
  }, [leads, onlyShowValidWA, filterCampanha, search, leadCampanhas]);

  // ── Selection ──────────────────────────────────────────────────────────────
  function toggleSelect(id: string, index: number, event?: React.MouseEvent) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      
      if (event?.shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(index, lastSelectedIndex);
        const end = Math.max(index, lastSelectedIndex);
        const shouldSelect = !prev.has(id);
        
        for (let i = start; i <= end; i++) {
          const leadId = filtered[i]?.id;
          if (leadId) {
            shouldSelect ? next.add(leadId) : next.delete(leadId);
          }
        }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      
      setLastSelectedIndex(index);
      return next;
    });
  }
  // Auto-trigger validation worker if pending
  useEffect(() => {
    const pending = leads.filter(l => l.wa_status === "PENDENTE").length;
    if (pending > 0 && !isProcessingWA) {
      setValidatingProgress({ 
        current: leads.filter(l => l.wa_status && ["VALIDADO", "INVÁLIDO"].includes(l.wa_status)).length, 
        total: leads.length 
      });
      
      const timer = setTimeout(async () => {
        setIsProcessingWA(true);
        try {
          // Cada chamada agora processa apenas 2 leads para ser rápido e evitar timeout
          await apiFetch("/api/cron/validate-leads");
          fetchData(); 
        } catch (e) {
          console.error("Validation trigger failed", e);
        } finally {
          setIsProcessingWA(false);
        }
      }, 5000); 

      return () => clearTimeout(timer);
    } else if (pending === 0) {
      setValidatingProgress(null);
    }
  }, [leads, isProcessingWA, fetchData]);

  function toggleAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id!).filter(Boolean)));
    }
  }

  // ── CSV Logic ──────────────────────────────────────────────────────────────
  async function handleExportXLS() {
    const targets = selectedLeadObjects.length > 0 ? selectedLeadObjects : filtered;
    if (targets.length === 0) return;
    
    const { utils, writeFile } = await import("xlsx");
    
    // Headers e dados
    const data = targets.map(l => ({
      "Empresa": l.title || "",
      "Telefone": l.phone || "",
      "E-mail": l.email || "",
      "Cidade": l.city || "",
      "Estado": l.state || "",
      "Endereço": l.address || "",
      "Website": l.website || "",
      "Categoria": l.categoryName || ""
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Leads");
    
    writeFile(wb, `leads_vmm_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function downloadTemplate() {
    const csvContent = "Empresa,Telefone,E-mail,Cidade,Estado,Endereço,Website,Categoria\n" +
                     "Exemplo Ltda,5511999999999,contato@exemplo.com,São Paulo,SP,Av Paulista 1000,https://exemplo.com,Serviços";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_leads_crm.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }  function formatDate(timestamp: any) {
    if (!timestamp) return "—";
    try {
      let d = timestamp;

      // Trata objetos de Timestamp do Firebase (seconds ou _seconds)
      if (typeof d === "object") {
        if (d.seconds !== undefined) d = d.seconds * 1000;
        else if (d._seconds !== undefined) d = d._seconds * 1000;
      }

      const date = new Date(d);
      
      // Verifica se a data é válida
      if (isNaN(date.getTime())) {
        return "—";
      }
      
      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return "—";
    }
  }


  return (
    <>
      {/* Modal de importação */}
      <ImportLeadsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={handleImportSuccess}
      />
      <BulkTagModal
        isOpen={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        onSuccess={() => {
          setSuccessMsg("✓ Tags atualizadas com sucesso!");
          setSelectedIds(new Set());
          fetchData();
          setTimeout(() => setSuccessMsg(""), 5000);
        }}
        selectedLeadIds={Array.from(selectedIds)}
        availableTags={tags}
      />
      <AddLeadManualModal
        isOpen={manualOpen}
        onClose={() => setManualOpen(false)}
        onSuccess={() => {
          setManualOpen(false);
          setSuccessMsg("✓ Lead cadastrado com sucesso!");
          fetchData();
          setTimeout(() => setSuccessMsg(""), 5000);
        }}
      />

      <LeadEditModal
        isOpen={editOpen}
        onClose={() => { setEditOpen(false); setEditingLead(null); }}
        lead={editingLead}
        availableTags={tags}
        onSuccess={(updated) => {
          setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
          setSuccessMsg("✓ Lead atualizado com sucesso!");
          setTimeout(() => setSuccessMsg(""), 4000);
        }}
      />

      {/* Modal de campanha — recebe os leads selecionados */}
      <CampanhaFormModal
        isOpen={campOpen}
        onClose={() => setCampOpen(false)}
        onSaved={handleCampanhaSaved}
        editingCampanha={null}
        preSelectedLeads={selectedLeadObjects}
      />

      <div className="lp-root">
        {/* Progress Bar for Background Validation */}
        {validatingProgress && (
          <div className="lp-validation-bar">
            <div className="lp-v-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="lp-v-pulse"></span>
                <span>🛡️ <b>Validação de Segurança em Segundo Plano...</b></span>
              </div>
              <span className="lp-v-count">{leads.filter(l => l.wa_status === "PENDENTE").length} leads restantes (Humanizado 8-18s)</span>
            </div>
            <div className="lp-v-progress">
              <div 
                className="lp-v-fill" 
                style={{ width: `${Math.round(((validatingProgress.total - leads.filter(l => l.wa_status === "PENDENTE").length) / validatingProgress.total) * 100)}%` }} 
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="lp-v-hint">Este processo é lento propositalmente para proteger seu WhatsApp contra banimentos. Você pode sair desta tela ou usar outras funções sem problemas.</p>
              <button 
                onClick={handleCancelValidation}
                disabled={isCancelling}
                className="lp-v-cancel"
              >
                {isCancelling ? "Cancelando..." : "🛑 Cancelar Validação"}
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="lp-header">
          <div>
            <h1 className="lp-title">Leads</h1>
            <p className="lp-subtitle">
              {loading ? "Carregando…" : `${leads.length} leads na base`}
            </p>
          </div>
          <div className="lp-header-actions">
            {selectedIds.size > 0 && (
              <>
                <button
                  className="lp-btn-red"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  🗑️ Deletar ({selectedIds.size})
                </button>
                <button
                  className="lp-btn-secondary"
                  onClick={() => setBulkTagOpen(true)}
                  style={{ padding: "10px 18px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "white", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}
                >
                  🏷️ Mudar Tags ({selectedIds.size})
                </button>
                <button
                  className="lp-btn-green"
                  onClick={() => setCampOpen(true)}
                >
                  📣 Criar campanha ({selectedIds.size})
                </button>
                <button
                  className="lp-btn-secondary"
                  onClick={handleValidateBase}
                  disabled={isValidatingBase}
                  style={{ padding: "10px 15px", borderRadius: "8px", border: "1.5px solid #2A6B2D", background: "rgba(42, 107, 45, 0.05)", color: "#2A6B2D", fontWeight: 700, cursor: "pointer" }}
                  title="Identifica os leads selecionados e coloca na fila de verificação"
                >
                  {isValidatingBase ? "⏳ Processando..." : "🛡️ Verificar WhatsApp"}
                </button>
              </>
            )}
            <button
              className="lp-btn-secondary"
              onClick={handleExportXLS}
              disabled={filtered.length === 0}
              style={{ padding: "10px 15px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 700, cursor: "pointer", transition: "all .15s", fontFamily: "inherit" }}
              title="Exportar filtrados para Excel"
            >
              📥 Exportar Planilha
            </button>
            <button
              className="lp-btn-secondary"
              onClick={() => setManualOpen(true)}
              style={{ padding: "10px 20px", borderRadius: "8px", border: "1.5px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 700, cursor: "pointer", transition: "all .15s", fontFamily: "inherit" }}
            >
              + Adicionar Um
            </button>
            {/* Template download removido daqui e movido para o modal */}
            <button className="lp-btn-primary" onClick={() => setImportOpen(true)} style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "var(--p)", color: "white", fontWeight: 700, cursor: "pointer", transition: "all .15s", fontFamily: "inherit" }}>
              + Importar Leads
            </button>
          </div>
        </div>

        {/* Toast */}
        {successMsg && (
          <div className="lp-toast">{successMsg}</div>
        )}

        <div className="lp-view-tabs">
            <button className={`lp-view-btn ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>Lista de Leads</button>
            <button className={`lp-view-btn ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>Fluxo Kanban (CRM)</button>
        </div>

        {/* Filters */}
        <div className="lp-filters">
          <div className="lp-search-wrap">
            <span className="lp-search-icon">🔍</span>
            <input
              className="lp-search"
              placeholder="Buscar por nome, cidade, telefone, e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="lp-tag-filters">
            <button
              className={`lp-tag-btn ${filterTag === "" ? "active" : ""}`}
              onClick={() => setFilterTag("")}
            >
              Todos
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={`lp-tag-btn ${filterTag === tag.id ? "active" : ""}`}
                style={{ "--tag-c": tag.color } as React.CSSProperties}
                onClick={() => setFilterTag(filterTag === tag.id ? "" : tag.id!)}
              >
                {tag.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
            <label className="lp-checkbox-wrap">
              <input 
                type="checkbox" 
                checked={onlyShowValidWA} 
                onChange={(e) => setOnlyShowValidWA(e.target.checked)}
              />
              <span>WhatsApp Válidos ✅</span>
            </label>

            <div className="lp-camp-select-wrap">
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#58595B', marginRight: '6px' }}>CAMPANHA:</span>
              <select 
                className="lp-camp-select"
                value={filterCampanha}
                onChange={(e) => setFilterCampanha(e.target.value)}
              >
                <option value="">Todas as Campanhas</option>
                {allCampMap.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table / Kanban */}
        {view === "kanban" ? (
          <LeadsKanban 
            leads={filtered} 
            onLeadsUpdate={fetchData} 
            onlyShowValidWA={onlyShowValidWA} 
          />
        ) : (
          <div className="lp-table-container">
            {loading ? (
              <div className="lp-empty">
                <div className="lp-spinner" />
                <p>Carregando leads…</p>
              </div>
            ) : filtered.length === 0 ? (
            <div className="lp-empty">
              <span className="lp-empty-icon">📭</span>
              <p className="lp-empty-title">Nenhum lead encontrado</p>
              <p className="lp-empty-sub">
                {leads.length === 0
                  ? "Clique em \"Importar Leads\" para começar."
                  : "Tente ajustar os filtros."}
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                 <button
                   className="lp-btn-primary"
                   onClick={() => setImportOpen(true)}
                 >
                   + Importar Leads
                 </button>
                 <button
                   className="lp-btn-secondary"
                   onClick={downloadTemplate}
                   style={{ padding: "10px 15px", border: "1.5px solid var(--border)", borderRadius: "8px", background: "white", cursor: 'pointer', fontWeight: 700 }}
                 >
                   📄 Baixar Modelo CSV
                 </button>
              </div>
            </div>
          ) : (
            <table className="lp-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="lp-checkbox"
                    />
                  </th>
                  <th>Empresa</th>
                  <th>Localização</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Categoria</th>
                  <th>Tags</th>
                  <th>Aquisição</th>
                  <th>Campanhas</th>
                  <th>Nota</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      className={selectedIds.has(lead.id!) ? "selected" : ""}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingLead(lead);
                        setEditOpen(true);
                      }}
                      onClick={(e) => lead.id && toggleSelect(lead.id, filtered.indexOf(lead), e)}
                    >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id!)}
                        onChange={(e) => lead.id && toggleSelect(lead.id, filtered.indexOf(lead), e as any)}
                        className="lp-checkbox"
                      />
                    </td>
                    <td>
                      <div className="lp-lead-name">
                        {lead.title}
                      </div>
                      {lead.website && (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lp-lead-url"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.website.replace(/^https?:\/\//, "").slice(0, 28)}
                        </a>
                      )}
                    </td>
                    <td>
                      <div style={{ marginBottom: "2px" }}>
                        <span style={{ fontWeight: 600 }}>{lead.city}</span>
                        {lead.state && <span className="lp-state">{lead.state}</span>}
                      </div>
                      {(lead.address || lead.url) && (
                        <div className="lp-address" title={lead.address}>
                          {lead.url ? (
                            <a
                              href={lead.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="lp-maps-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              📍 {lead.address ? (lead.address.length > 40 ? lead.address.slice(0, 40) + "…" : lead.address) : "Ver no mapa"}
                            </a>
                          ) : (
                            <span className="lp-muted">
                              📍 {lead.address.length > 40 ? lead.address.slice(0, 40) + "…" : lead.address}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      {lead.phone ? (
                        <a
                          href={`https://wa.me/${lead.phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="lp-phone"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="lp-muted">—</span>
                      )}
                    </td>
                    <td>
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="lp-email"
                          onClick={(e) => e.stopPropagation()}
                          title={lead.email}
                        >
                          {lead.email.length > 24 ? lead.email.slice(0, 24) + "…" : lead.email}
                        </a>
                      ) : (
                        <span className="lp-muted">—</span>
                      )}
                    </td>
                    <td>
                      {lead.categoryName && (
                        <span className="lp-category">{lead.categoryName}</span>
                      )}
                    </td>
                    <td>
                      <div className="lp-tags">
                        {lead.tags?.map((tid) => {
                          const tag = tags.find((t) => t.id === tid);
                          return tag ? (
                            <span
                              key={tid}
                              className="lp-tag"
                              style={{ "--tag-c": tag.color } as React.CSSProperties}
                            >
                              {tag.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '11px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                         {formatDate(lead.acquisitionDate || lead.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div className="lp-camp-badges">
                        {(() => {
                          const participations = leadCampanhas[lead.id!] || [];
                          if (participations.length === 0) return <span className="lp-muted">—</span>;
                          
                          return (
                            <>
                              {participations.slice(0, 2).map((p, idx) => {
                                const truncated = p.campanhaNome.length > 20 ? p.campanhaNome.slice(0, 18) + '…' : p.campanhaNome;
                                return (
                                  <span 
                                    key={idx} 
                                    className={`lp-camp-badge ${p.status}`}
                                    title={`${p.campanhaNome} (${p.status})`}
                                  >
                                    {truncated}
                                  </span>
                                );
                              })}
                              {participations.length > 2 && (
                                <span className="lp-camp-badge more" title={participations.map(p => p.campanhaNome).join(", ")}>
                                  +{participations.length - 2}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td>
                      {lead.totalScore ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span className="lp-score">★ {Number(lead.totalScore).toFixed(1)}</span>
                          {lead.reviewsCount !== undefined && lead.reviewsCount !== null && (
                            <span className="lp-reviews">({lead.reviewsCount} {lead.reviewsCount === 1 ? 'avaliação' : 'avaliações'})</span>
                          )}
                        </div>
                      ) : (
                        <span className="lp-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span
                          className="lp-status"
                          style={{
                            background: STATUS_CONFIG[lead.status]?.bg ?? "#F0F0EE",
                            color:      STATUS_CONFIG[lead.status]?.color ?? "#888",
                          }}
                        >
                          {STATUS_CONFIG[lead.status]?.label ?? lead.status}
                        </span>
                        {lead.wa_status && (
                          <span 
                            style={{ 
                              fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                              background: lead.wa_status === 'VALIDADO' ? '#E8F2E8' : '#F5EAEA',
                              color: lead.wa_status === 'VALIDADO' ? '#2A6B2D' : '#8B1A1A',
                              textAlign: 'center'
                            }}
                          >
                            {lead.wa_status === 'VALIDADO' ? '✅ WHATSAPP OK' : '❌ INVÁLIDO'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                       <button 
                         className="lp-tag-btn"
                         onClick={() => { setEditingLead(lead); setEditOpen(true); }}
                         style={{ padding: '4px 8px', borderColor: 'var(--s)', color: 'var(--s)' }}
                       >
                         Editar
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

        {filtered.length > 0 && (
          <div className="lp-footer">
            <span>
              {selectedIds.size > 0 ? `${selectedIds.size} selecionados · ` : ""}
              {filtered.length} leads exibidos
            </span>
            {selectedIds.size > 0 && (
              <div style={{ display: "flex", gap: "10px" }}>
                <button 
                  className="lp-btn-red" 
                  onClick={handleDelete}
                  disabled={isDeleting}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  🗑️ Deletar ({selectedIds.size})
                </button>
                <button 
                  className="lp-btn-green" 
                  onClick={() => setCampOpen(true)}
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  📣 Criar campanha com {selectedIds.size} lead{selectedIds.size > 1 ? "s" : ""}
                </button>
              </div>
            )}
          </div>
        )}

        {view === "kanban" && <p style={{ textAlign: 'center', fontSize: '11px', color: '#888', marginTop: '20px' }}>Arraste os leads para mudar o status manualmente.</p>}
      </div>

      <style>{`
        .lp-root {
          padding: 32px; min-height: 100vh; background: var(--bg);
        }
        .lp-view-tabs { display: flex; gap: 4px; background: #E4E6DB; padding: 4px; border-radius: 12px; margin-bottom: 24px; width: fit-content; }
        .lp-view-btn { 
            border: none; background: transparent; padding: 6px 16px; border-radius: 8px; 
            font-size: 13px; font-weight: 700; color: #58595B; cursor: pointer; transition: all .15s;
        }
        .lp-view-btn.active { background: white; color: #28352A; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        /* ── Validation Bar ── */
        .lp-validation-bar {
          background: #fff;
          border: 1.5px solid #C8CCC0;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .lp-v-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
        }
        .lp-v-progress {
          height: 8px;
          background: #f0f0f0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .lp-v-fill {
          height: 100%;
          background: #4E6550;
          transition: width 1s linear;
        }
        .lp-v-count { font-weight: 700; color: #4E6550; }
        .lp-v-pulse {
          width: 8px; height: 8px;
          background: #4E6550;
          border-radius: 50%;
          animation: lpPulse 1.5s infinite;
        }
        @keyframes lpPulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(78, 101, 80, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(78, 101, 80, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(78, 101, 80, 0); }
        }
        .lp-checkbox-wrap {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 700; color: var(--p);
          cursor: pointer; padding: 4px 10px;
          background: #E4E6DB; border-radius: 20px;
          transition: all .2s;
        }
        .lp-camp-select-wrap { display: flex; align-items: center; margin-left: 8px; }
        .lp-camp-select {
          padding: 6px 12px; border-radius: 8px; border: 1.5px solid #C8CCC0;
          background: white; font-size: 11px; font-weight: 700; color: #28352A;
          cursor: pointer; outline: none; transition: border-color .15s;
        }
        .lp-camp-select:focus { border-color: var(--s); }

        .lp-camp-badges { display: flex; flex-wrap: wrap; gap: 4px; max-width: 140px; }
        .lp-camp-badge {
          font-size: 10px; font-weight: 700; font-family: 'Syne', sans-serif;
          padding: 2px 8px; border-radius: 10px; white-space: nowrap;
          transition: transform 0.1s;
        }
        .lp-camp-badge:hover { transform: scale(1.05); }
        .lp-camp-badge.enviado { background: #E8F2E8; color: #2A6B2D; }
        .lp-camp-badge.pendente, .lp-camp-badge.enviando { background: #FFF7E0; color: #7A5C00; }
        .lp-camp-badge.falhou { background: #fdecea; color: #b91c1c; }
        .lp-camp-badge.more { background: #f0f0ee; color: #58595B; font-size: 9px; }
        .lp-checkbox-wrap:hover { background: #D8DBCB; }
        .lp-checkbox-wrap input { width: 14px; height: 14px; cursor: pointer; accent-color: #4E6550; }
        .lp-v-hint {
          font-size: 11px;
          color: #9AA494;
          margin: 0;
        }
        .lp-v-cancel {
          background: #ffebee; color: #b71c1c; border: 1.5px solid #ffcdd2;
          padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700;
          cursor: pointer; transition: all .15s;
        }
        .lp-v-cancel:hover { background: #ffcdd2; }
        .lp-v-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

        .lp-header {
          display: flex; align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 28px; flex-wrap: wrap; gap: 16px;
        }
        .lp-title { font-size: 28px; font-weight: 800; color: var(--p); margin: 0 0 4px; }
        .lp-subtitle { font-size: 13px; color: #9AA494; margin: 0; }
        .lp-header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .lp-btn-primary {
          padding: 10px 20px; background: var(--p); color: var(--bg);
          border: none; border-radius: 8px; font-family: inherit;
          font-size: 14px; font-weight: 700; cursor: pointer;
          transition: background .15s; white-space: nowrap;
        }
        .lp-btn-primary:hover { background: var(--s); }
        .lp-btn-green {
          padding: 10px 18px; background: #2A6B2D; color: white;
          border: none; border-radius: 8px; font-family: inherit;
          font-size: 14px; font-weight: 700; cursor: pointer;
          transition: background .15s; white-space: nowrap;
          animation: lpPop .2s cubic-bezier(.2,.8,.3,1.3);
        }
        .lp-btn-green:hover { background: #1e5021; }
        .lp-btn-red {
          padding: 10px 18px; background: #8B1A1A; color: white;
          border: none; border-radius: 8px; font-family: inherit;
          font-size: 14px; font-weight: 700; cursor: pointer;
          transition: background .15s, opacity .15s; white-space: nowrap;
          animation: lpPop .2s cubic-bezier(.2,.8,.3,1.3);
        }
        .lp-btn-red:hover:not(:disabled) { background: #681111; }
        .lp-btn-red:disabled { opacity: 0.6; cursor: not-allowed; }
        @keyframes lpPop { from{transform:scale(.9);opacity:0} to{transform:scale(1);opacity:1} }
        .lp-toast {
          background: var(--s); color: white; padding: 12px 20px;
          border-radius: 8px; font-size: 14px; font-weight: 600;
          margin-bottom: 20px; animation: lpFade .2s ease;
        }
        @keyframes lpFade { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .lp-filters { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
        .lp-search-wrap { position: relative; max-width: 460px; }
        .lp-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; }
        .lp-search {
          width: 100%; padding: 9px 14px 9px 36px;
          background: white; border: 1.5px solid var(--border);
          border-radius: 8px; font-size: 13px; color: var(--text);
          outline: none; box-sizing: border-box; font-family: inherit;
          transition: border-color .15s;
        }
        .lp-search:focus { border-color: var(--s); }
        .lp-tag-filters { display: flex; flex-wrap: wrap; gap: 6px; }
        .lp-tag-btn {
          padding: 5px 12px; border-radius: 20px;
          border: 1.5px solid var(--border); background: transparent;
          font-size: 12px; font-weight: 600; color: var(--text);
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .lp-tag-btn:hover { border-color: var(--s); }
        .lp-tag-btn.active { background: var(--tag-c, var(--s)); border-color: var(--tag-c, var(--s)); color: white; }
        .lp-table-container {
          background: white; border-radius: 12px;
          border: 1px solid var(--border); overflow: hidden;
        }
        .lp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .lp-table thead tr { background: var(--p); }
        .lp-table thead th {
          padding: 12px 14px; text-align: left;
          font-size: 11px; font-weight: 700; letter-spacing: .05em;
          text-transform: uppercase; color: rgba(228,230,219,.8); white-space: nowrap;
        }
        .lp-table tbody tr {
          border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background .1s;
        }
        .lp-table tbody tr:last-child { border-bottom: none; }
        .lp-table tbody tr:hover { background: #F8FAF7; }
        .lp-table tbody tr.selected { background: rgba(78,101,80,.08); }
        .lp-table td { padding: 10px 14px; vertical-align: middle; color: var(--text); }
        .lp-checkbox { width: 15px; height: 15px; accent-color: var(--s); cursor: pointer; }
        .lp-lead-name { font-weight: 700; color: var(--p); font-size: 14px; }
        .lp-campaign-line { margin: 4px 0; }
        .lp-campaign-badge {
          display: inline-flex; align-items: center; justify-content: center;
          background: #2A6B2D; color: white; font-size: 10px; font-weight: 800;
          padding: 2px 8px; border-radius: 4px; border: none;
          text-transform: uppercase; letter-spacing: 0.02em;
        }
        .lp-lead-url { font-size: 11px; color: #7A9E7D; text-decoration: none; display: block; margin-top: 2px; }
        .lp-lead-url:hover { text-decoration: underline; }
        .lp-state {
          display: inline-block; margin-left: 4px; padding: 1px 5px;
          background: rgba(40,53,42,.08); border-radius: 4px;
          font-size: 10px; font-weight: 700; color: var(--p);
        }
        .lp-phone { color: #2A6B2D; text-decoration: none; font-size: 12px; }
        .lp-phone:hover { text-decoration: underline; }
        .lp-email { color: #1E4A8A; text-decoration: none; font-size: 12px; }
        .lp-email:hover { text-decoration: underline; }
        .lp-muted { color: #CCC; }
        .lp-category {
          font-size: 11px; color: var(--s);
          background: rgba(78,101,80,.1); padding: 2px 8px; border-radius: 4px;
          white-space: nowrap;
        }
        .lp-address { font-size: 11px; margin-top: 4px; }
        .lp-maps-link { color: #58595B; text-decoration: none; transition: color 0.15s; }
        .lp-maps-link:hover { color: var(--s); text-decoration: underline; }
        .lp-reviews { font-size: 10px; color: #9AA494; white-space: nowrap; }
        .lp-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .lp-tag {
          padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 700;
          background: var(--tag-c, var(--s)); color: white; white-space: nowrap;
        }
        .lp-score { color: #B8860B; font-weight: 600; font-size: 12px; }
        .lp-status {
          display: inline-block; padding: 3px 9px; border-radius: 20px;
          font-size: 11px; font-weight: 700; white-space: nowrap;
        }
        .lp-empty {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 60px 20px; gap: 8px; color: var(--text);
        }
        .lp-empty-icon { font-size: 40px; }
        .lp-empty-title { font-size: 17px; font-weight: 700; color: var(--p); margin: 0; }
        .lp-empty-sub { font-size: 13px; color: #9AA494; margin: 0; }
        .lp-spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(78,101,80,.2);
          border-top-color: var(--s); border-radius: 50%;
          animation: lpSpin .8s linear infinite;
        }
        @keyframes lpSpin { to { transform: rotate(360deg); } }
        .lp-footer {
          padding: 12px 20px; font-size: 12px; color: #9AA494;
          display: flex; align-items: center; justify-content: space-between;
        }
      `}</style>
    </>
  );
}
