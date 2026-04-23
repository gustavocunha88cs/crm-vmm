"use client";

import { useState, useEffect, useRef } from "react";
import type { Campanha, TagRef } from "@/types/campanhas";
import type { Lead } from "@/types";
import { apiFetch } from "@/lib/api";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ─── Props ────────────────────────────────────────────────────────────────────
interface CampanhaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (campanha: Campanha) => void;
  editingCampanha?: Campanha | null;
  preSelectedLeads?: Lead[];
}

const VARIAVEIS = ["{nome}", "{empresa}"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CampanhaFormModal({
  isOpen,
  onClose,
  onSaved,
  editingCampanha,
  preSelectedLeads = [],
}: CampanhaFormModalProps) {
  // Form state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [mensagens, setMensagens] = useState<string[]>([""]);
  const [intervaloMin, setIntervaloMin] = useState(1); // 1 minuto
const [intervaloMax, setIntervaloMax] = useState(2); // 2 minutos
  const [filtroTags, setFiltroTags] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");

  // Lead selection
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadSearch, setLeadSearch] = useState("");
  const [leadsLoading, setLeadsLoading] = useState(false);

  // Tags
  const [tags, setTags] = useState<TagRef[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeMsgIdx, setActiveMsgIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editingCampanha;

  // ── Load on open ────────────────────────────────────────────────────────────
 useEffect(() => {
  if (!isOpen) return;
  fetchTags();
  if (editingCampanha) {
    setNome(editingCampanha.nome);
    setDescricao(editingCampanha.descricao ?? "");
    setMensagens(editingCampanha.mensagens.length ? editingCampanha.mensagens : [""]);
    
    // CONVERSÃO: Divide por 60 para transformar segundos do banco em minutos do dropdown
    const minNoBanco = editingCampanha.intervaloMin ?? 60;
    const maxNoBanco = editingCampanha.intervaloMax ?? 120;
    
    setIntervaloMin(Math.floor(minNoBanco / 60));
    setIntervaloMax(Math.floor(maxNoBanco / 60));
    
    setFiltroTags(editingCampanha.filtroTags ?? []);
    setSelectedLeadIds(new Set(editingCampanha.leadIds ?? []));
    setMediaUrl(editingCampanha.mediaUrl ?? "");
  } else {
    resetForm();
  }
}, [isOpen, editingCampanha]);

  // Re-fetch leads when tag filter changes
  useEffect(() => {
    if (isOpen) fetchLeads();
  }, [filtroTags, isOpen]);

  function resetForm() {
    setNome("");
  setDescricao("");
  setMensagens([""]);
  setIntervaloMin(1); // 1 minuto
  setIntervaloMax(2); // 2 minutos padrão
  setFiltroTags([]);
setSelectedLeadIds(
  preSelectedLeads.length > 0
    ? new Set(preSelectedLeads.map((l) => l.id!).filter(Boolean))
    : new Set()
);
    setLeadSearch("");
    setMediaUrl("");
    setError("");
    setActiveMsgIdx(0);
  }

  async function fetchTags() {
    try {
      const res = await apiFetch("/api/tags");
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch {}
  }

  async function fetchLeads() {
    setLeadsLoading(true);
    try {
      const url = filtroTags.length
        ? `/api/leads?tags=${filtroTags.join(",")}`
        : "/api/leads";
      const res = await apiFetch(url);
      const data = await res.json();
      const fetched: Lead[] = data.leads ?? [];
      const allIds = new Set(fetched.map((l) => l.id));
      const extras = preSelectedLeads.filter((l) => l.id && !allIds.has(l.id));
      const combined = [...fetched, ...extras];
      
      // ORDENAR: selecionados primeiro NA CARGA INICIAL
      setLeads(combined.sort((a, b) => {
         const aSel = selectedLeadIds.has(a.id!);
         const bSel = selectedLeadIds.has(b.id!);
         if (aSel === bSel) return 0;
         return aSel ? -1 : 1;
      }));
    } catch {} finally {
      setLeadsLoading(false);
    }
  }

  // ── Messages ────────────────────────────────────────────────────────────────
  function addMensagem() {
    if (mensagens.length >= 10) return;
    const next = [...mensagens, ""];
    setMensagens(next);
    setActiveMsgIdx(next.length - 1);
  }

  function removeMensagem(idx: number) {
    if (mensagens.length <= 1) return;
    const next = mensagens.filter((_, i) => i !== idx);
    setMensagens(next);
    setActiveMsgIdx(Math.min(activeMsgIdx, next.length - 1));
  }

  function updateMensagem(idx: number, val: string) {
    setMensagens((prev) => prev.map((m, i) => (i === idx ? val : m)));
  }

  function insertVariavel(variavel: string) {
    const ta = textareaRefs.current[activeMsgIdx];
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = mensagens[activeMsgIdx];
    const next = current.slice(0, start) + variavel + current.slice(end);
    updateMensagem(activeMsgIdx, next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + variavel.length, start + variavel.length);
    }, 0);
  }

  // ── Lead selection ───────────────────────────────────────────────────────────
  const filteredLeads = leads.filter((l) => {
    // RESTRIÇÃO: Apenas leads validados
    if (l.wa_status !== "VALIDADO") return false;

    if (!leadSearch.trim()) return true;
    const q = leadSearch.toLowerCase();
    return (
      l.title?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.phone?.includes(q)
    );
  });

  function toggleLead(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllLeads() {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id!)));
    }
  }

  function toggleFiltroTag(id: string) {
    setFiltroTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }


  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione apenas arquivos de imagem.");
      return;
    }

    // Máximo 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 5MB.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const storageRef = ref(storage, `campanhas/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setMediaUrl(url);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Erro ao fazer upload da imagem. Verifique se o Firebase Storage está ativado.");
    } finally {
      setUploading(false);
    }
  }


  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setError("");
    if (!nome.trim()) return setError("Nome da campanha é obrigatório.");
    const mensagensValidas = mensagens.filter((m) => m.trim());
    if (!mensagensValidas.length) return setError("Adicione ao menos uma mensagem.");
    if (!selectedLeadIds.size) return setError("Selecione ao menos um lead.");

    setSaving(true);
    const payload = {
  nome: nome.trim(),
  descricao: descricao.trim(),
  mensagens: mensagensValidas,
  intervaloSegundos: intervaloMin * 60, // Envia em segundos para a API
  intervaloMin: intervaloMin * 60,
  intervaloMax: intervaloMax * 60,
  filtroTags,
  leadIds: Array.from(selectedLeadIds),
  mediaUrl: mediaUrl.trim() || null,
};

    try {
      const url = isEditing ? `/api/campanhas/${editingCampanha!.id}` : "/api/campanhas";
      const method = isEditing ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erro ao salvar");
      }
      const data = await res.json();
      onSaved(data.campanha ?? { ...editingCampanha, ...payload, id: editingCampanha?.id });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function getRisco() {
    if (intervaloMin >= 5) return { label: "Risco baixo", color: "#2A6B2D", bg: "#E8F2E8", icon: "🟢" };
    if (intervaloMin >= 3) return { label: "Risco médio", color: "#7A5C00", bg: "#FFF7E0", icon: "🟡" };
    return { label: "Risco alto", color: "#b91c1c", bg: "#fdecea", icon: "🔴" };
  }

function getPrevisao() {
  const total = selectedLeadIds.size;
  if (total <= 1) return null;
  const minTotal = intervaloMin * (total - 1);
  const maxTotal = intervaloMax * (total - 1);
  
  if (maxTotal < 60) return `${minTotal}–${maxTotal} minutos`;
  return `${(minTotal / 60).toFixed(1)}–${(maxTotal / 60).toFixed(1)} horas`;
}

  if (!isOpen) return null;

  const leadsComTelefone = Array.from(selectedLeadIds).filter(
    (id) => leads.find((l) => l.id === id)?.phone
  ).length;

  return (
    <div
      className="cf-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cf-modal">
        {/* ── Header ── */}
        <div className="cf-header">
          <div>
            <h2 className="cf-title">
              {isEditing ? "Editar Campanha" : "Nova Campanha"}
            </h2>
            <p className="cf-subtitle">
              {isEditing
                ? "Atualize as configurações da campanha"
                : "Configure e selecione os leads para esta campanha"}
            </p>
          </div>
          <button className="cf-close" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="cf-error">
            <span>⚠ {error}</span>
            <button onClick={() => setError("")}>✕</button>
          </div>
        )}

        <div className="cf-body">
          {/* ── Left column ── */}
          <div className="cf-left">
            {/* Nome */}
            <div className="cf-field">
              <label className="cf-label">Nome da Campanha</label>
              <input
                className="cf-input"
                placeholder="Ex: Prospecção Moda Janeiro"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div className="cf-field">
              <label className="cf-label">Descrição <span className="cf-optional">(opcional)</span></label>
              <input
                className="cf-input"
                placeholder="Observações internas sobre esta campanha"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            {/* Imagem */}
            <div className="cf-field">
              <label className="cf-label">Imagem da Campanha <span className="cf-optional">(opcional)</span></label>
              
              <div className="cf-media-options" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                
                <button 
                  type="button"
                  className="cf-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    flex: 1, padding: '10px', background: '#F2F3EE', border: '1.5px dashed #C8CCC0',
                    borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#4E6550',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  {uploading ? (
                    <><span className="cf-spinner-sm" /> Carregando...</>
                  ) : (
                    <>📤 Fazer Upload</>
                  )}
                </button>

                <div style={{ flex: 2, position: 'relative' }}>
                  <input
                    className="cf-input"
                    placeholder="Ou cole a URL aqui..."
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    style={{ paddingRight: '30px' }}
                  />
                  {mediaUrl && (
                    <button 
                      onClick={() => setMediaUrl("")}
                      style={{ 
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: '#999', cursor: 'pointer' 
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {mediaUrl && (
                <div style={{ 
                  marginTop: '8px', padding: '12px', background: 'white', borderRadius: '8px', 
                  border: '1px solid #C8CCC0', display: 'flex', alignItems: 'center', gap: '12px' 
                }}>
                  <img src={mediaUrl} alt="Preview" style={{ height: '48px', width: '48px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#4E6550', textTransform: 'uppercase' }}>Preview da Imagem</div>
                    <div style={{ fontSize: '10px', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaUrl}</div>
                  </div>
                  <button 
                    onClick={() => setMediaUrl("")}
                    style={{ background: '#fdecea', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>

            {/* Intervalo */}
            {/* Intervalo */}
<div className="cf-field">
  <div className="cf-label-row">
    <label className="cf-label">Intervalo entre envios</label>
    <span className="cf-risco-badge" style={{ background: getRisco().bg, color: getRisco().color }}>
      {getRisco().icon} {getRisco().label}
    </span>
  </div>

  <div className="cf-interval-inputs">
  <div className="cf-interval-input-wrap">
    <label className="cf-interval-sub">Mínimo</label>
    <select 
      className="cf-input" 
      value={intervaloMin || 1}
      onChange={(e) => {
        const v = Number(e.target.value);
        setIntervaloMin(v);
        if (v >= intervaloMax) setIntervaloMax(v + 1);
      }}
    >
      {Array.from({ length: 20 }, (_, i) => i + 1).map(m => (
        <option key={m} value={m}>{m} {m === 1 ? 'minuto' : 'minutos'}</option>
      ))}
    </select>
  </div>

  <div className="cf-interval-divider">→</div>

  <div className="cf-interval-input-wrap">
    <label className="cf-interval-sub">Máximo</label>
    <select 
      className="cf-input"
      value={intervaloMax || 2}
      onChange={(e) => setIntervaloMax(Number(e.target.value))}
    >
      {Array.from({ length: 20 }, (_, i) => i + 1)
        .filter(m => m >= intervaloMin)
        .map(m => (
          <option key={m} value={m}>{m} {m === 1 ? 'minuto' : 'minutos'}</option>
      ))}
    </select>
  </div>
</div>



  {getPrevisao() && (
    <div className="cf-previsao">
      <span>⏱</span>
      <span>Previsão para <strong>{selectedLeadIds.size} leads</strong>: <strong>{getPrevisao()}</strong></span>
    </div>
  )}
</div>

            {/* Mensagens */}
            <div className="cf-field">
              <div className="cf-label-row">
                <label className="cf-label">
                  Variações de Mensagem
                  <span className="cf-count">{mensagens.filter(m=>m.trim()).length}/10</span>
                </label>
                {mensagens.length < 10 && (
                  <button className="cf-add-msg-btn" onClick={addMensagem}>
                    + Adicionar variação
                  </button>
                )}
              </div>

              {/* Variable chips removidos a pedido do usuário */}

              {/* Tabs */}
              <div className="cf-msg-tabs">
                {mensagens.map((_, i) => (
                  <button
                    key={i}
                    className={`cf-msg-tab ${activeMsgIdx === i ? "active" : ""}`}
                    onClick={() => setActiveMsgIdx(i)}
                  >
                    Msg {i + 1}
                    {mensagens.length > 1 && (
                      <span
                        className="cf-msg-tab-del"
                        onClick={(e) => { e.stopPropagation(); removeMensagem(i); }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Active message textarea */}
              {mensagens.map((msg, i) => (
                <textarea
                  key={i}
                  ref={(el) => { textareaRefs.current[i] = el; }}
                  className="cf-input cf-msg-textarea"
                  style={{ display: activeMsgIdx === i ? "block" : "none" }}
                  placeholder={`Olá {nome}, somos a VMM agência de marketing digital...\n\nUse {nome} para personalizar com o nome do lead.`}
                  value={msg}
                  onChange={(e) => updateMensagem(i, e.target.value)}
                  onFocus={() => setActiveMsgIdx(i)}
                  rows={6}
                />
              ))}

              {/* Preview removido a pedido do usuário */}
            </div>
          </div>

          {/* ── Right column: Lead selection ── */}
          <div className="cf-right">
            <div className="cf-field">
              <div className="cf-label-row">
                <label className="cf-label">
                  Leads (Apenas WhatsApp OK ✅)
                  {selectedLeadIds.size > 0 && (
                    <span className="cf-count">{selectedLeadIds.size} selecionados</span>
                  )}
                </label>
                {leadsComTelefone > 0 && (
                  <span className="cf-tel-badge">📱 {leadsComTelefone} com tel.</span>
                )}
              </div>

              {/* Tag filter */}
              <div className="cf-tag-filter">
                <span className="cf-tag-filter-label">Filtrar por tag:</span>
                <div className="cf-tag-chips">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`cf-tag-chip ${filtroTags.includes(tag.id) ? "active" : ""}`}
                      style={{ "--tc": tag.color } as React.CSSProperties}
                      onClick={() => toggleFiltroTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead search */}
              <input
                className="cf-input cf-lead-search"
                placeholder="🔍 Buscar lead por nome, cidade ou telefone…"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
              
              <div style={{ background: '#FFF8E1', padding: '10px', borderRadius: '8px', fontSize: '11px', marginBottom: '12px', border: '1px solid #FFE082', color: '#856404' }}>
                🛡️ <b>Segurança Ativada:</b> Apenas leads confirmados com WhatsApp Válido aparecem aqui. Se não encontrar um lead, verifique se ele já foi validado na tela de Leads.
              </div>

              {/* Lead list */}
              <div className="cf-leads-list">
                {leadsLoading ? (
                  <div className="cf-leads-loading">
                    <div className="cf-spinner" />
                    <span>Carregando leads…</span>
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="cf-leads-empty">
                    <span>📭</span>
                    <p>Nenhum lead encontrado.</p>
                    {filtroTags.length > 0 && (
                      <button
                        className="cf-clear-filter"
                        onClick={() => setFiltroTags([])}
                      >
                        Limpar filtro de tags
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="cf-leads-header">
                      <label className="cf-leads-select-all">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                          onChange={toggleAllLeads}
                          className="cf-checkbox"
                        />
                        <span>Selecionar todos ({filteredLeads.length})</span>
                      </label>
                    </div>

                    {filteredLeads.map((lead) => (
                      <label
                        key={lead.id}
                        className={`cf-lead-item ${selectedLeadIds.has(lead.id!) ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id!)}
                          onChange={() => toggleLead(lead.id!)}
                          className="cf-checkbox"
                        />
                        <div className="cf-lead-info">
                          <span className="cf-lead-name">{lead.title}</span>
                          <span className="cf-lead-meta">
                            {lead.city && <span>{lead.city}</span>}
                            {lead.phone
                              ? <span className="cf-lead-tel">📱 {lead.phone}</span>
                              : <span className="cf-lead-no-tel">sem telefone</span>
                            }
                          </span>
                        </div>
                        {lead.tags?.slice(0, 2).map((tid) => {
                          const tag = tags.find((t) => t.id === tid);
                          return tag ? (
                            <span
                              key={tid}
                              className="cf-lead-tag"
                              style={{ background: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ) : null;
                        })}
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="cf-footer">
          <div className="cf-footer-info">
            {selectedLeadIds.size > 0 && (
              <span>
                <strong>{selectedLeadIds.size}</strong> leads ·{" "}
                <strong>{mensagens.filter((m) => m.trim()).length}</strong> variações ·{" "}
                intervalo de <strong>{intervaloMin}min–{intervaloMax}min</strong>
              </span>
            )}
          </div>
          <div className="cf-footer-actions">
            <button className="cf-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="cf-btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <span className="cf-loading-row">
                  <span className="cf-spinner-sm" /> Salvando…
                </span>
              ) : isEditing ? (
                "💾 Salvar alterações"
              ) : (
                "🚀 Criar campanha"
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .cf-overlay {
          --p: #28352A; --s: #4E6550; --bg: #E4E6DB;
          --dark: #0B1017; --text: #58595B;
          --border: #C8CCC0; --surface: #F2F3EE;
          position: fixed; inset: 0;
          background: rgba(11,16,23,0.7);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
          animation: cfFadeIn .18s ease;
          font-family: 'Syne', sans-serif;
        }
        @keyframes cfFadeIn { from{opacity:0} to{opacity:1} }

        .cf-modal {
          background: var(--bg);
          border-radius: 16px;
          box-shadow: 0 24px 80px rgba(11,16,23,0.3);
          width: 100%; max-width: 1060px;
          max-height: 92vh;
          display: flex; flex-direction: column;
          animation: cfSlideUp .22s cubic-bezier(.2,.8,.3,1);
          overflow: hidden;
        }
        @keyframes cfSlideUp {
          from{transform:translateY(20px);opacity:0}
          to{transform:translateY(0);opacity:1}
        }

        /* Header */
        .cf-header {
          background: var(--p);
          padding: 22px 28px 18px;
          display: flex; align-items: flex-start;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .cf-title {
          font-size: 20px; font-weight: 800;
          color: #E4E6DB; margin: 0 0 4px;
        }
        .cf-subtitle { font-size: 13px; color: rgba(228,230,219,.55); margin: 0; }
        .cf-close {
          background: rgba(228,230,219,.12); border: none;
          color: rgba(228,230,219,.7); width: 32px; height: 32px;
          border-radius: 8px; cursor: pointer; font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          transition: all .15s; flex-shrink: 0;
        }
        .cf-close:hover { background: rgba(228,230,219,.2); color: #E4E6DB; }

        /* Error */
        .cf-error {
          padding: 10px 20px; background: #fdecea;
          border-bottom: 1px solid #f5c6c3; color: #b91c1c;
          font-size: 13px; display: flex;
          align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .cf-error button { background: none; border: none; color: #b91c1c; cursor: pointer; }

        /* Body: 2-col */
        .cf-body {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 0; flex: 1; overflow: hidden;
        }
        .cf-left {
          padding: 24px 24px 24px 28px;
          overflow-y: auto; border-right: 1px solid var(--border);
        }
        .cf-right { padding: 24px 28px 24px 24px; overflow-y: auto; }

        /* Fields */
        .cf-field { margin-bottom: 22px; }
        .cf-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 700;
          letter-spacing: .07em; text-transform: uppercase;
          color: var(--p); margin-bottom: 8px;
        }
        .cf-label-row {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 8px;
        }
        .cf-label-row .cf-label { margin-bottom: 0; }
        .cf-optional { font-weight: 400; text-transform: none; color: #aaa; font-size: 10px; letter-spacing: 0; }
        .cf-count {
          display: inline-block;
          background: var(--s); color: white;
          font-size: 10px; font-weight: 700;
          padding: 2px 7px; border-radius: 10px;
          letter-spacing: 0; text-transform: none;
        }
        .cf-input {
          width: 100%; padding: 10px 14px;
          background: white; border: 1.5px solid var(--border);
          border-radius: 8px; font-size: 14px;
          color: var(--text); outline: none;
          transition: border-color .15s;
          box-sizing: border-box; font-family: inherit;
        }
        .cf-input:focus { border-color: var(--s); box-shadow: 0 0 0 3px rgba(78,101,80,.1); }

        /* Interval grid */
        .cf-interval-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
        }
        .cf-interval-btn {
          padding: 8px 4px; border: 1.5px solid var(--border);
          border-radius: 7px; background: white;
          font-size: 12px; font-weight: 600; color: var(--text);
          cursor: pointer; transition: all .15s; font-family: inherit;
          text-align: center;
        }
        .cf-interval-btn:hover { border-color: var(--s); }
        .cf-interval-btn.active {
          background: var(--p); border-color: var(--p); color: #E4E6DB;
        }

        /* Message vars */
        .cf-vars {
          display: flex; align-items: center; flex-wrap: wrap;
          gap: 6px; margin-bottom: 10px;
        }
        .cf-vars-label { font-size: 11px; color: #999; }
        .cf-var-chip {
          padding: 3px 10px; border-radius: 14px;
          border: 1px dashed var(--s); background: transparent;
          font-size: 11px; font-weight: 700; color: var(--s);
          cursor: pointer; font-family: 'Courier New', monospace;
          transition: all .15s;
        }
        .cf-var-chip:hover { background: rgba(78,101,80,.08); }

        /* Message tabs */
        .cf-msg-tabs {
          display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
        }
        .cf-msg-tab {
          padding: 5px 12px; border-radius: 6px 6px 0 0;
          border: 1.5px solid var(--border); border-bottom: none;
          background: var(--surface); font-size: 12px; font-weight: 600;
          color: var(--text); cursor: pointer; font-family: inherit;
          transition: all .15s; display: flex; align-items: center; gap: 5px;
        }
        .cf-msg-tab.active { background: white; border-color: var(--s); color: var(--p); }
        .cf-msg-tab-del {
          font-size: 15px; line-height: 1; color: #bbb;
          border-radius: 50%; width: 16px; height: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: all .1s;
        }
        .cf-msg-tab-del:hover { background: #fde; color: #c00; }
        .cf-msg-textarea {
          min-height: 120px; resize: vertical;
          border-radius: 0 8px 8px 8px;
        }
        .cf-add-msg-btn {
          font-size: 12px; font-weight: 700; color: var(--s);
          background: none; border: none; cursor: pointer;
          font-family: inherit; transition: color .15s;
        }
        .cf-add-msg-btn:hover { color: var(--p); }

        /* Preview */
        .cf-msg-preview {
          margin-top: 8px; padding: 12px 14px;
          background: rgba(78,101,80,.06);
          border-left: 3px solid var(--s); border-radius: 0 8px 8px 0;
        }
        .cf-msg-preview-label {
          display: block; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .06em;
          color: var(--s); margin-bottom: 6px;
        }
        .cf-msg-preview p {
          font-size: 13px; color: var(--text);
          margin: 0; white-space: pre-wrap; line-height: 1.5;
        }

        /* Lead section */
        .cf-tel-badge {
          font-size: 11px; font-weight: 700; color: #2A6B2D;
          background: #E8F2E8; padding: 2px 8px; border-radius: 10px;
        }
        .cf-tag-filter { margin-bottom: 10px; }
        .cf-tag-filter-label {
          display: block; font-size: 11px; color: #999; margin-bottom: 6px;
        }
        .cf-tag-chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .cf-tag-chip {
          padding: 4px 10px; border-radius: 14px;
          border: 1.5px solid var(--tc, var(--border));
          color: var(--tc, var(--text));
          background: transparent; font-size: 11px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: all .15s;
        }
        .cf-tag-chip.active {
          background: var(--tc, var(--s)); color: white;
        }
        .cf-lead-search { margin-bottom: 8px; }

        /* Lead list */
        .cf-leads-list {
          border: 1px solid var(--border); border-radius: 8px;
          overflow-y: auto; max-height: 360px; background: white;
        }
        .cf-leads-header {
          padding: 8px 12px; border-bottom: 1px solid var(--border);
          background: var(--surface); position: sticky; top: 0; z-index: 1;
        }
        .cf-leads-select-all {
          display: flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 700; color: var(--p); cursor: pointer;
        }
        .cf-lead-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-bottom: 1px solid var(--border);
          cursor: pointer; transition: background .1s;
          flex-wrap: wrap;
        }
        .cf-lead-item:last-child { border-bottom: none; }
        .cf-lead-item:hover { background: #F8FAF7; }
        .cf-lead-item.selected { background: rgba(78,101,80,.08); }
        .cf-checkbox { width: 15px; height: 15px; accent-color: var(--s); cursor: pointer; flex-shrink: 0; }
        .cf-lead-info { flex: 1; min-width: 0; }
        .cf-lead-name { display: block; font-size: 13px; font-weight: 600; color: var(--dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cf-lead-meta { display: flex; gap: 8px; font-size: 11px; color: #999; margin-top: 2px; flex-wrap: wrap; }
        .cf-lead-tel { color: #2A6B2D; }
        .cf-lead-no-tel { color: #e87070; }
        .cf-lead-tag {
          padding: 1px 6px; border-radius: 8px; font-size: 10px;
          font-weight: 700; color: white; flex-shrink: 0;
        }
        .cf-leads-loading, .cf-leads-empty {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 8px; padding: 40px 20px;
          color: var(--text); font-size: 13px;
        }
        .cf-leads-empty span { font-size: 28px; }
        .cf-leads-empty p { margin: 0; }
        .cf-clear-filter {
          font-size: 12px; color: var(--s); background: none;
          border: 1px solid var(--s); border-radius: 6px;
          padding: 4px 10px; cursor: pointer; font-family: inherit;
        }

        /* Spinner */
        .cf-spinner {
          width: 24px; height: 24px;
          border: 3px solid rgba(78,101,80,.2);
          border-top-color: var(--s); border-radius: 50%;
          animation: cfSpin .8s linear infinite;
        }
        .cf-spinner-sm {
          width: 14px; height: 14px;
          border: 2px solid rgba(228,230,219,.3);
          border-top-color: #E4E6DB; border-radius: 50%;
          animation: cfSpin .8s linear infinite;
          display: inline-block;
        }
        @keyframes cfSpin { to{transform:rotate(360deg)} }
        .cf-loading-row { display: flex; align-items: center; gap: 8px; }

        /* Footer */
        .cf-footer {
          padding: 16px 28px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex; align-items: center;
          justify-content: space-between; flex-shrink: 0;
          gap: 16px; flex-wrap: wrap;
        }
        .cf-footer-info { font-size: 13px; color: #9AA494; }
        .cf-footer-info strong { color: var(--p); }
        .cf-footer-actions { display: flex; gap: 10px; }
        .cf-btn-primary {
          padding: 10px 22px; background: var(--p);
          color: var(--bg); border: none; border-radius: 8px;
          font-family: 'Syne', sans-serif; font-size: 14px;
          font-weight: 700; cursor: pointer; transition: background .15s;
          white-space: nowrap;
        }
        .cf-btn-primary:hover:not(:disabled) { background: var(--s); }
        .cf-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .cf-btn-secondary {
          padding: 10px 18px; background: transparent;
          border: 1.5px solid var(--border); border-radius: 8px;
          font-family: 'Syne', sans-serif; font-size: 14px;
          color: var(--text); cursor: pointer; transition: all .15s;
        }
        .cf-btn-secondary:hover { border-color: var(--s); color: var(--p); }

        @media (max-width: 700px) {
          .cf-body { grid-template-columns: 1fr; }
          .cf-left { border-right: none; border-bottom: 1px solid var(--border); }
          .cf-interval-grid { grid-template-columns: repeat(2,1fr); }
        }
          .cf-interval-inputs { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 10px; }
.cf-interval-input-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.cf-interval-sub { font-size: 11px; color: #9AA494; font-weight: 600; }
.cf-interval-number { text-align: center; font-size: 18px; font-weight: 800; padding: 10px; }
.cf-interval-divider { font-size: 18px; color: #9AA494; padding-bottom: 10px; flex-shrink: 0; }
.cf-risco-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.cf-risco-info { padding: 10px 12px; border-radius: 8px; border-left: 3px solid; margin-bottom: 10px; }
.cf-risco-info p { font-size: 12px; margin: 0; font-weight: 600; line-height: 1.4; }
.cf-previsao { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(78,101,80,.06); border-radius: 8px; font-size: 13px; color: #58595B; }
.cf-previsao strong { color: #28352A; }
      `}</style>
    </div>
  );
}
