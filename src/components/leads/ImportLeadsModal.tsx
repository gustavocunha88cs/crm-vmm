"use client";

import { useState, useEffect, useRef } from "react";
import type { ScraperLead, Tag } from "@/types";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
}

type Step = "search" | "review";

// ─── Tag colors ───────────────────────────────────────────────────────────────
const TAG_COLORS = [
  "#4E6550", "#28352A", "#6B8F6E", "#3D5C40",
  "#8BA888", "#2C4A2E", "#5C7A5F", "#7A9E7D",
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportLeadsModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportLeadsModalProps) {
  const [step, setStep] = useState<Step>("search");

  // Search form
  const [nicho, setNicho] = useState("");
  const [cidades, setCidades] = useState("");
  const [maxPer, setMaxPer] = useState(20);
  const [scrapeEmails, setScrapeEmails] = useState(false);

  // Results
  const [leads, setLeads] = useState<ScraperLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Tags
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showNewTagForm, setShowNewTagForm] = useState(false);

  // Loading / error
  const [loading, setLoading] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [validationProgress, setValidationProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [saveResult, setSaveResult] = useState<{
    saved: number;
    skipped: number;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Load tags on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      fetchTags();
      resetModal();
    }
  }, [isOpen]);

  function resetModal() {
    setStep("search");
    setLeads([]);
    setSelectedIds(new Set());
    setSelectedTagIds([]);
    setNewTagName("");
    setShowNewTagForm(false);
    setError("");
    setSaveResult(null);
    setEmailProgress({ current: 0, total: 0 });
  }

  async function fetchTags() {
    try {
      const res = await apiFetch("/api/tags");
      const data = await res.json();
      setTags(data.tags ?? []);
    } catch {
      // non-critical
    }
  }

  // ── Step 1: Run scraping ───────────────────────────────────────────────────
  async function handleSearch() {
    if (!nicho.trim() || !cidades.trim()) {
      setError("Preencha o nicho e ao menos uma cidade.");
      return;
    }
    setError("");
    setLoading(true);

    const cidadeList = cidades
      .split(/[,\n]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    const queries = cidadeList.map((c) => `${nicho.trim()} ${c}`);

    try {
      abortRef.current = new AbortController();
      const res = await apiFetch("/api/scraper/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries, maxPer }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erro no scraper");
      }

      const data = await res.json();
      const rawLeads: ScraperLead[] = Array.isArray(data) ? data : data.leads ?? [];

      if (!rawLeads.length) {
        setError("Nenhum resultado encontrado. Tente outros termos.");
        setLoading(false);
        return;
      }

      let processedLeads = rawLeads;

      if (scrapeEmails) {
        const withWebsite = rawLeads.filter((l) => l.website);
        setEmailProgress({ current: 0, total: withWebsite.length });

        processedLeads = await scrapeEmailsForLeads(rawLeads, (done) => {
          setEmailProgress((p) => ({ ...p, current: done }));
        });
      }

      setLeads(processedLeads);
      setSelectedIds(new Set(processedLeads.map((_, i) => i)));
      setStep("review");
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message ?? "Erro inesperado");
      }
    } finally {
      setLoading(false);
    }
  }


  async function downloadTemplate(type: "csv" | "xlsx") {
    const { utils, writeFile } = await import("xlsx");
    const headers = [["empresa", "telefone", "email", "cidade", "estado", "endereco", "website", "categoria"]];
    const example = [["Agência VMM", "558299999999", "contato@agenciavmm.com.br", "Maceió", "AL", "Rua Exemplo 123", "https://agenciavmm.com.br", "Marketing"]];
    
    const ws = utils.aoa_to_sheet([...headers, ...example]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Modelo");
    
    if (type === "xlsx") {
      writeFile(wb, "modelo_importacao_vmm.xlsx");
    } else {
      writeFile(wb, "modelo_importacao_vmm.csv", { bookType: 'csv' });
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");

    try {
      const { read, utils } = await import("xlsx");
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const data = event.target?.result;
          const workbook = read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (rows.length < 2) throw new Error("Planilha inválida ou vazia.");

          const header = rows[0].map(h => String(h).toLowerCase().trim());
          const dataRows = rows.slice(1);

          const parsedLeads = dataRows.map(row => {
            const lead: any = { tags: [], status: "novo", createdAt: new Date().toISOString() };
            header.forEach((col, i) => {
              const val = String(row[i] || "").trim();
              if (!val) return;
              if (col.includes("empresa") || col.includes("nome") || col.includes("title")) lead.title = val;
              else if (col.includes("fone") || col.includes("telefone") || col.includes("phone")) lead.phone = val.replace(/\D/g, "");
              else if (col.includes("email")) lead.email = val;
              else if (col.includes("cidade") || col.includes("city")) lead.city = val;
              else if (col.includes("estado") || col.includes("state")) lead.state = val;
              else if (col.includes("endereco") || col.includes("address")) lead.address = val;
              else if (col.includes("website")) lead.website = val;
              else if (col.includes("categoria")) lead.categoryName = val;
            });
            return lead as ScraperLead;
          }).filter(l => l.title || l.phone);

          setLeads(parsedLeads);
          setSelectedIds(new Set(parsedLeads.map((_, i) => i)));
          setStep("review");
          setLoading(false);
          
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err: any) {
      setError("Erro ao carregar biblioteca de leitura.");
      setLoading(false);
    }
  }

  async function validateLeadsInBatches(targetLeads: ScraperLead[]): Promise<{valid: string[], invalid: string[]}> {
    const BATCH_SIZE = 10;
    const allValid: string[] = [];
    const allInvalid: string[] = [];
    const leadsToValidate = targetLeads.filter(l => l.phone);
    
    setValidationProgress({ current: 0, total: leadsToValidate.length });
    
    for (let i = 0; i < leadsToValidate.length; i += BATCH_SIZE) {
      const chunk = leadsToValidate.slice(i, i + BATCH_SIZE);
      const phones = chunk.map(l => l.phone);
      
      try {
        const res = await apiFetch("/api/leads/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers: phones })
        });
        const data = await res.json();
        if (data.valid) allValid.push(...data.valid);
        if (data.invalid) allInvalid.push(...data.invalid);
      } catch (e) {
        console.error("Batch validation error", e);
      }
      
      setValidationProgress(prev => ({ ...prev, current: Math.min(prev.total, i + BATCH_SIZE) }));
    }
    
    return { valid: allValid, invalid: allInvalid };
  }

  // Scrape emails with concurrency limit of 5
  async function scrapeEmailsForLeads(
    rawLeads: ScraperLead[],
    onProgress: (done: number) => void
  ): Promise<ScraperLead[]> {
    const results = [...rawLeads];
    let done = 0;
    const queue = rawLeads.map((lead, idx) => ({ lead, idx }));
    const CONCURRENCY = 5;

    async function processOne(item: { lead: ScraperLead; idx: number }) {
      if (!item.lead.website) {
        done++;
        onProgress(done);
        return;
      }
      try {
        console.log(`[EmailScraper] Solicitando e-mail para site: ${item.lead.website}`);
        const res = await apiFetch("/api/scraper/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: item.lead.website }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.email) {
            console.log(`[EmailScraper] E-mail recebido para ${item.lead.website}: ${d.email}`);
            results[item.idx] = { ...results[item.idx], email: d.email };
          } else {
            console.log(`[EmailScraper] Nenhum e-mail retornado para ${item.lead.website}`);
          }
        } else {
          console.error(`[EmailScraper] Erro na API: status ${res.status}`);
        }
      } catch (err) {
        console.error(`[EmailScraper] Falha na requisição para ${item.lead.website}:`, err);
      } finally {
        done++;
        onProgress(done);
      }
    }

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      await Promise.all(queue.slice(i, i + CONCURRENCY).map(processOne));
    }

    return results;
  }

  // ── Step 2: Select/deselect leads ─────────────────────────────────────────
  function toggleLead(idx: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((_, i) => i)));
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const data = await res.json();
      if (data.tag) {
        setTags((prev) => [...prev, data.tag]);
        setSelectedTagIds((prev) => [...prev, data.tag.id]);
        setNewTagName("");
        setShowNewTagForm(false);
      }
    } catch {
      setError("Erro ao criar tag");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Save to Firebase ───────────────────────────────────────────────
  async function handleSave() {
    const selectedLeads = leads.filter((_, i) => selectedIds.has(i));
    if (!selectedLeads.length) {
      setError("Selecione ao menos um lead para importar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          leads: selectedLeads, 
          tagIds: selectedTagIds
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erro ao salvar leads");
      }

      const result = await res.json();
      onImportSuccess(result.saved);
      handleClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  if (!isOpen) return null;

  // ── Stats for review step ─────────────────────────────────────────────────
  const selectedLeads = leads.filter((_, i) => selectedIds.has(i));
  const withPhone = selectedLeads.filter((l) => l.phone).length;
  const withEmail = selectedLeads.filter((l) => l.email).length;
  const withWebsite = selectedLeads.filter((l) => l.website).length;

  return (
    <div className="vmm-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="vmm-modal">
        {/* ── Header ── */}
        <div className="vmm-modal-header">
          <div>
            <h2 className="vmm-modal-title">
              {step === "search" && "Importar Leads"}
              {step === "review" && `${leads.length} leads encontrados`}
            </h2>
            <div className="vmm-steps">
              {(["search", "review"] as Step[]).map((s, i) => (
                <span key={s} className={`vmm-step ${step === s ? "active" : ""}`}>
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
          <button className="vmm-close-btn" onClick={handleClose}>✕</button>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="vmm-error-banner">
            <span>⚠ {error}</span>
            <button onClick={() => setError("")}>✕</button>
          </div>
        )}

        {/* ── STEP 1: Search ── */}
        {step === "search" && (
          <div className="vmm-modal-body">
            <div className="vmm-field">
              <label className="vmm-label">Nicho / Categoria</label>
              <input
                className="vmm-input"
                placeholder="Ex: moda feminina, academia, restaurante…"
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <span className="vmm-hint">Será combinado com cada cidade</span>
            </div>

            <div className="vmm-field">
              <label className="vmm-label">Cidades</label>
              <textarea
                className="vmm-input vmm-textarea"
                placeholder="Maceió&#10;Arapiraca&#10;Palmeira dos Índios"
                value={cidades}
                onChange={(e) => setCidades(e.target.value)}
                rows={4}
              />
              <span className="vmm-hint">Uma por linha ou separadas por vírgula</span>
            </div>

            <div className="vmm-row">
              <div className="vmm-field" style={{ flex: 1 }}>
                <label className="vmm-label">Máx. por busca</label>
                <select
                  className="vmm-input vmm-select"
                  value={maxPer}
                  onChange={(e) => setMaxPer(Number(e.target.value))}
                >
                  {[10, 20, 30, 50].map((v) => (
                    <option key={v} value={v}>{v} leads</option>
                  ))}
                </select>
              </div>

              <div className="vmm-field" style={{ flex: 2 }}>
                <label className="vmm-label">Enriquecimento</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="vmm-checkbox-label">
                    <input
                      type="checkbox"
                      checked={scrapeEmails}
                      onChange={(e) => setScrapeEmails(e.target.checked)}
                      className="vmm-checkbox"
                    />
                    <span>Extrair e-mails</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="vmm-import-section">
               <div className="vmm-template-box">
                  <div className="vmm-template-info">
                    <strong>Baixe o modelo da planilha</strong>
                    <p>Preencha com seus dados para garantir uma importação correta.</p>
                  </div>
                  <div className="vmm-template-actions">
                    <button className="vmm-btn-mini" onClick={() => downloadTemplate("xlsx")}>Excel (.xlsx)</button>
                    <button className="vmm-btn-mini" onClick={() => downloadTemplate("csv")}>CSV (.csv)</button>
                  </div>
               </div>

               <div className="vmm-field vmm-upload-field">
                  <input 
                      type="file" 
                      accept=".csv, .xlsx, .xls" 
                      onChange={handleFileUpload} 
                      className="vmm-file-input"
                      id="file-upload"
                      style={{ display: 'none' }}
                  />
                  <label htmlFor="file-upload" className="vmm-csv-dropzone">
                      <span className="vmm-upload-icon">📁</span>
                      <div className="vmm-upload-text">
                        <strong>Arraste ou clique para importar</strong>
                        <span>Suporta .csv, .xls e .xlsx</span>
                      </div>
                  </label>
               </div>
            </div>

            <div className="vmm-modal-footer">
              <button className="vmm-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button
                className="vmm-btn-primary"
                onClick={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <span className="vmm-loading-row">
                    <span className="vmm-spinner" />
                    {scrapeEmails && emailProgress.total > 0
                      ? `Buscando e-mails… ${emailProgress.current}/${emailProgress.total}`
                      : validationProgress.total > 0
                        ? `Validando WhatsApp… ${validationProgress.total} números`
                        : "Processando…"}
                  </span>
                ) : (
                  <>🔍 Buscar Leads</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Review ── */}
        {step === "review" && (
          <div className="vmm-modal-body vmm-review">
            {/* Stats bar */}
            <div className="vmm-stats-row">
              <div className="vmm-stat">
                <span className="vmm-stat-value">{selectedIds.size}</span>
                <span className="vmm-stat-label">selecionados</span>
              </div>
              <div className="vmm-stat">
                <span className="vmm-stat-value">{withPhone}</span>
                <span className="vmm-stat-label">com telefone</span>
              </div>
              <div className="vmm-stat">
                <span className="vmm-stat-value">{withEmail}</span>
                <span className="vmm-stat-label">com e-mail</span>
              </div>
              <div className="vmm-stat">
                <span className="vmm-stat-value">{withWebsite}</span>
                <span className="vmm-stat-label">com site</span>
              </div>
            </div>

            {/* Tags selector */}
            <div className="vmm-field">
              <label className="vmm-label">Tags para este lote</label>
              <div className="vmm-tags-row">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    className={`vmm-tag-chip ${selectedTagIds.includes(tag.id!) ? "selected" : ""}`}
                    style={{ "--tag-color": tag.color } as React.CSSProperties}
                    onClick={() => toggleTag(tag.id!)}
                  >
                    {tag.name}
                  </button>
                ))}
                <button
                  className="vmm-tag-chip vmm-tag-new"
                  onClick={() => setShowNewTagForm(true)}
                >
                  + Nova tag
                </button>
              </div>

              </div>

              {showNewTagForm && (
                <div className="vmm-new-tag-form">
                  <input
                    className="vmm-input"
                    placeholder="Nome da tag"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                    autoFocus
                  />
                  <div className="vmm-color-swatches">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`vmm-swatch ${newTagColor === c ? "selected" : ""}`}
                        style={{ background: c }}
                        onClick={() => setNewTagColor(c)}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      className="vmm-btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => setShowNewTagForm(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="vmm-btn-primary"
                      style={{ flex: 2 }}
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim() || loading}
                    >
                      Criar tag
                    </button>
                  </div>
                </div>
              )}

            {/* Leads table */}
            <div className="vmm-table-wrap">
              <table className="vmm-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === leads.length && leads.length > 0}
                        onChange={toggleAll}
                        className="vmm-checkbox"
                      />
                    </th>
                    <th>Empresa</th>
                    <th>Cidade/UF</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th>Nota</th>
                    <th>Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr
                      key={i}
                      className={selectedIds.has(i) ? "selected" : ""}
                      onClick={() => toggleLead(i)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(i)}
                          onChange={() => toggleLead(i)}
                          className="vmm-checkbox"
                        />
                      </td>
                      <td>
                        <div className="vmm-lead-name">{lead.title}</div>
                        {lead.website && (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="vmm-lead-site"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {lead.website.replace(/^https?:\/\//, "").slice(0, 30)}
                          </a>
                        )}
                      </td>
                      <td>
                        {lead.city && <span>{lead.city}</span>}
                        {lead.state && <span className="vmm-state-badge">{lead.state}</span>}
                      </td>
                      <td>
                        {lead.phone ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span className="vmm-badge vmm-badge-green" style={{ width: 'fit-content' }}>{lead.phone}</span>
                            {lead.wa_status === "VALIDADO" && (
                              <span style={{ fontSize: '9px', color: '#2A6B2D', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                ✅ WHATSAPP OK
                              </span>
                            )}
                            {lead.wa_status === "INVÁLIDO" && (
                              <span style={{ fontSize: '9px', color: '#8B1A1A', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                ❌ INVÁLIDO
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="vmm-badge vmm-badge-gray">—</span>
                        )}
                      </td>
                      <td>
                        {lead.email ? (
                          <span className="vmm-badge vmm-badge-blue" title={lead.email}>
                            {lead.email.length > 22 ? lead.email.slice(0, 22) + "…" : lead.email}
                          </span>
                        ) : (
                          <span className="vmm-badge vmm-badge-gray">—</span>
                        )}
                      </td>
                      <td>
                        {lead.totalScore ? (
                          <span className="vmm-score">
                            ★ {lead.totalScore.toFixed(1)}
                            <span className="vmm-reviews">({lead.reviewsCount})</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {lead.categoryName && (
                          <span className="vmm-category">{lead.categoryName}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="vmm-modal-footer">
              <button
                className="vmm-btn-secondary"
                onClick={() => setStep("search")}
              >
                ← Voltar
              </button>
              <button
                className="vmm-btn-primary"
                onClick={handleSave}
                disabled={selectedIds.size === 0}
              >
                💾 Importar {selectedIds.size} leads
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* ── Tokens ── */
        .vmm-modal-overlay {
          --c-primary:   #28352A;
          --c-secondary: #4E6550;
          --c-bg:        #E4E6DB;
          --c-dark:      #0B1017;
          --c-text:      #58595B;
          --c-border:    #C8CCC0;
          --c-surface:   #F2F3EE;
          --c-accent:    #4E6550;
          --radius:      10px;
          --shadow:      0 20px 60px rgba(11,16,23,0.25), 0 4px 16px rgba(11,16,23,0.12);
          font-family: 'Syne', sans-serif;
        }

        /* ── Overlay ── */
        .vmm-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(11,16,23,0.65);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
          animation: fadeIn .18s ease;
        }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }

        /* ── Modal Shell ── */
        .vmm-modal {
          background: var(--c-bg);
          border-radius: 16px;
          box-shadow: var(--shadow);
          width: 100%;
          max-width: 880px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          animation: slideUp .22s cubic-bezier(.2,.8,.3,1);
          overflow: hidden;
        }
        @keyframes slideUp { from { transform: translateY(24px); opacity:0 } to { transform: translateY(0); opacity:1 } }

        /* ── Header ── */
        .vmm-modal-header {
          padding: 24px 28px 16px;
          background: var(--c-primary);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .vmm-modal-title {
          font-family: 'Syne', sans-serif;
          font-size: 20px;
          font-weight: 700;
          color: #E4E6DB;
          margin: 0 0 10px;
        }
        .vmm-steps {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .vmm-step {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(228,230,219,0.15);
          color: rgba(228,230,219,0.5);
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all .2s;
        }
        .vmm-step.active {
          background: #4E6550;
          color: #E4E6DB;
        }
        .vmm-step.done {
          background: rgba(78,101,80,0.4);
          color: #A8C4AA;
        }
        .vmm-close-btn {
          background: rgba(228,230,219,0.1);
          border: none;
          color: rgba(228,230,219,0.7);
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all .15s;
          flex-shrink: 0;
        }
        .vmm-close-btn:hover { background: rgba(228,230,219,0.2); color: #E4E6DB; }

        /* ── Body ── */
        .vmm-modal-body {
          padding: 24px 28px;
          overflow-y: auto;
          flex: 1;
        }
        .vmm-modal-body.vmm-review { padding-bottom: 0; }
        .vmm-modal-body.vmm-centered {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          min-height: 280px;
        }

        /* ── Error ── */
        .vmm-error-banner {
          margin: 0;
          padding: 10px 20px;
          background: #fdecea;
          border-bottom: 1px solid #f5c6c3;
          color: #b91c1c;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .vmm-error-banner button {
          background: none;
          border: none;
          color: #b91c1c;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }

        /* ── Form Fields ── */
        .vmm-field { margin-bottom: 18px; }
        .vmm-csv-dropzone {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 24px; border: 2px dashed var(--c-border); border-radius: 12px;
          background: white; cursor: pointer; transition: all .15s; gap: 8px;
          text-align: center;
        }
        .vmm-csv-dropzone:hover { border-color: var(--c-secondary); background: #fdfdfd; }
        .vmm-csv-dropzone strong { font-size: 14px; color: var(--c-primary); }
        .vmm-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--c-primary);
          margin-bottom: 6px;
        }
        .vmm-hint {
          display: block;
          font-size: 11px;
          color: #9AA494;
          margin-top: 4px;
        }
        .vmm-input {
          width: 100%;
          padding: 10px 14px;
          background: white;
          border: 1.5px solid var(--c-border);
          border-radius: var(--radius);
          font-size: 14px;
          color: var(--c-text);
          outline: none;
          transition: border-color .15s;
          box-sizing: border-box;
          font-family: inherit;
        }
        .vmm-input:focus { border-color: var(--c-secondary); box-shadow: 0 0 0 3px rgba(78,101,80,0.12); }
        .vmm-textarea { resize: vertical; min-height: 90px; }
        .vmm-select { cursor: pointer; }
        .vmm-row { display: flex; gap: 16px; }

        /* ── Checkbox ── */
        .vmm-checkbox {
          width: 16px;
          height: 16px;
          accent-color: var(--c-secondary);
          cursor: pointer;
        }
        .vmm-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--c-text);
          cursor: pointer;
          padding-top: 8px;
        }

        /* ── Buttons ── */
        .vmm-btn-primary {
          padding: 11px 22px;
          background: var(--c-primary);
          color: var(--c-bg);
          border: none;
          border-radius: var(--radius);
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all .15s;
          white-space: nowrap;
        }
        .vmm-btn-primary:hover:not(:disabled) { background: var(--c-secondary); }
        .vmm-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .vmm-btn-secondary {
          padding: 11px 18px;
          background: transparent;
          color: var(--c-text);
          border: 1.5px solid var(--c-border);
          border-radius: var(--radius);
          font-family: 'Syne', sans-serif;
          font-size: 14px;
          cursor: pointer;
          transition: all .15s;
        }
        .vmm-btn-secondary:hover { border-color: var(--c-secondary); color: var(--c-primary); }

        /* ── Footer ── */
        .vmm-modal-footer {
          padding: 16px 28px;
          background: var(--c-surface);
          border-top: 1px solid var(--c-border);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          flex-shrink: 0;
        }

        /* ── Loading ── */
        .vmm-loading-row { display: flex; align-items: center; gap: 8px; }
        .vmm-spinner {
          width: 16px; height: 16px;
          border: 2.5px solid rgba(228,230,219,0.3);
          border-top-color: #E4E6DB;
          border-radius: 50%;
          animation: spin .8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .vmm-big-spinner {
          width: 52px; height: 52px;
          border: 4px solid rgba(78,101,80,0.2);
          border-top-color: var(--c-secondary);
          border-radius: 50%;
          animation: spin .9s linear infinite;
        }
        .vmm-save-text { font-size: 17px; font-weight: 700; color: var(--c-primary); margin: 0; }
        .vmm-save-sub { font-size: 13px; color: #9AA494; margin: 4px 0 0; }
        .vmm-save-animation { display: flex; flex-direction: column; align-items: center; gap: 14px; }

        .vmm-progress-container {
          width: 100%; max-width: 300px; height: 8px; background: #e0e0e0;
          border-radius: 4px; overflow: hidden; margin-top: 10px;
        }
        .vmm-progress-fill {
          height: 100%; background: var(--c-secondary); transition: width 0.3s ease;
        }

        /* ── Header ── */
        .vmm-stats-row {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        .vmm-stat {
          flex: 1;
          min-width: 90px;
          background: white;
          border: 1px solid var(--c-border);
          border-radius: var(--radius);
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .vmm-stat-value { font-size: 24px; font-weight: 800; color: var(--c-primary); line-height: 1; }
        .vmm-stat-label { font-size: 11px; color: #9AA494; text-transform: uppercase; letter-spacing: .04em; }

        /* ── Tags ── */
        .vmm-tags-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }
        .vmm-tag-chip {
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid var(--tag-color, var(--c-border));
          color: var(--tag-color, var(--c-text));
          background: transparent;
          transition: all .15s;
          font-family: inherit;
        }
        .vmm-tag-chip:hover { opacity: .8; }
        .vmm-tag-chip.selected {
          background: var(--tag-color, var(--c-secondary));
          color: white;
        }
        .vmm-tag-new {
          border-style: dashed;
          border-color: var(--c-border);
          color: var(--c-text);
        }
        .vmm-new-tag-form {
          background: white;
          border: 1px solid var(--c-border);
          border-radius: var(--radius);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
        }
        .vmm-color-swatches { display: flex; gap: 6px; flex-wrap: wrap; }
        .vmm-swatch {
          width: 24px; height: 24px;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
          transition: transform .1s;
        }
        .vmm-swatch:hover { transform: scale(1.15); }
        .vmm-swatch.selected { border-color: var(--c-dark); transform: scale(1.15); }

        /* ── Table ── */
        .vmm-table-wrap {
          overflow: auto;
          border: 1px solid var(--c-border);
          border-radius: var(--radius);
          margin-bottom: 0;
          max-height: 360px;
        }
        .vmm-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .vmm-table thead tr {
          background: var(--c-primary);
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .vmm-table thead th {
          padding: 10px 12px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .05em;
          text-transform: uppercase;
          color: rgba(228,230,219,0.8);
          white-space: nowrap;
        }
        .vmm-table tbody tr {
          border-bottom: 1px solid var(--c-border);
          transition: background .1s;
          cursor: pointer;
        }
        .vmm-table tbody tr:last-child { border-bottom: none; }
        .vmm-table tbody tr:hover { background: rgba(78,101,80,0.06); }
        .vmm-table tbody tr.selected { background: rgba(78,101,80,0.1); }
        .vmm-table td {
          padding: 9px 12px;
          color: var(--c-text);
          vertical-align: middle;
        }
        .vmm-lead-name { font-weight: 600; color: var(--c-dark); font-size: 13px; }
        .vmm-lead-site {
          font-size: 11px;
          color: #7A9E7D;
          text-decoration: none;
          display: block;
          margin-top: 2px;
        }
        .vmm-lead-site:hover { text-decoration: underline; }
        .vmm-state-badge {
          display: inline-block;
          margin-left: 4px;
          padding: 1px 5px;
          background: rgba(40,53,42,0.1);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          color: var(--c-primary);
        }
        .vmm-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          white-space: nowrap;
        }
        .vmm-badge-green { background: #E8F2E8; color: #2A6B2D; }
        .vmm-badge-blue { background: #E8EFF8; color: #1E4A8A; }
        .vmm-badge-gray { background: #F0F0EE; color: #AAA; }
        .vmm-score { font-size: 12px; color: #B8860B; white-space: nowrap; }
        .vmm-reviews { color: #BBB; margin-left: 2px; }
        .vmm-category {
          font-size: 11px;
          color: var(--c-secondary);
          background: rgba(78,101,80,0.1);
          padding: 2px 7px;
          border-radius: 4px;
          white-space: nowrap;
        }

        /* ── Done state ── */
        .vmm-done-animation { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .vmm-checkmark {
          width: 64px; height: 64px;
          background: var(--c-secondary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: white;
          animation: popIn .4s cubic-bezier(.2,.8,.3,1.4);
        }
        @keyframes popIn { from { transform: scale(0); opacity:0 } to { transform: scale(1); opacity:1 } }
        .vmm-done-title { font-size: 20px; font-weight: 800; color: var(--c-primary); margin: 0; }
        .vmm-done-stats { display: flex; gap: 24px; margin-top: 4px; }
        .vmm-done-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .vmm-done-value { font-size: 32px; font-weight: 800; color: var(--c-primary); line-height: 1; }
        .vmm-done-value.vmm-muted { color: #AAA; }
        .vmm-done-label { font-size: 12px; color: #9AA494; }
        .vmm-done-tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }

        .vmm-import-section {
          margin-top: 24px; border-top: 1px dashed var(--c-border); padding-top: 24px;
        }
        .vmm-template-box {
          background: white; border: 1.5px solid var(--c-border); border-radius: 12px;
          padding: 16px; display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px; transition: transform .15s;
        }
        .vmm-template-box:hover { transform: translateY(-2px); border-color: var(--c-secondary); }
        .vmm-template-info strong { display: block; font-size: 14px; color: var(--c-primary); margin-bottom: 4px; }
        .vmm-template-info p { font-size: 12px; color: var(--c-text); margin: 0; }
        .vmm-template-actions { display: flex; gap: 8px; }
        .vmm-btn-mini {
          background: var(--c-secondary); color: white; border: none; padding: 6px 12px; border-radius: 6px;
          font-size: 11px; font-weight: 700; cursor: pointer; transition: opacity .15s;
        }
        .vmm-btn-mini:hover { opacity: 0.9; }

        .vmm-upload-field { margin: 0; }
        .vmm-csv-dropzone {
          height: 120px; border: 2px dashed var(--c-border); border-radius: 12px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; cursor: pointer; transition: all .15s; background: rgba(255,255,255,0.4);
        }
        .vmm-csv-dropzone:hover { border-color: var(--c-secondary); background: white; }
        .vmm-upload-icon { font-size: 32px; }
        .vmm-upload-text { text-align: center; }
        .vmm-upload-text strong { display: block; font-size: 14px; color: var(--c-primary); }
        .vmm-upload-text span { font-size: 11px; color: #999; }
      `}</style>
    </div>
  );
}
