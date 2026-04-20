"use client";

import { useState, useEffect } from "react";
import type { Lead, Tag } from "@/types";

interface LeadEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onSuccess: (updated: Lead) => void;
  availableTags: Tag[];
}

export default function LeadEditModal({
  isOpen,
  onClose,
  lead,
  onSuccess,
  availableTags,
}: LeadEditModalProps) {
  const [formData, setFormData] = useState<Partial<Lead>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lead) {
      setFormData({
        title: lead.title || "",
        phone: lead.phone || "",
        email: lead.email || "",
        city: lead.city || "",
        state: lead.state || "",
        address: lead.address || "",
        website: lead.website || "",
        url: lead.url || "",
        categoryName: lead.categoryName || "",
        totalScore: lead.totalScore || 0,
        reviewsCount: lead.reviewsCount || 0,
        status: lead.status || "novo",
        temperature: lead.temperature || "frio",
        tags: lead.tags || [],
      });
    } else {
      setFormData({});
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  async function handleSubmit(e: React.FormEvent) {
    if (!lead) return;
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erro ao atualizar lead");
      }

      onSuccess({ ...lead, ...formData } as Lead);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(tagId: string) {
    setFormData((prev) => {
      const current = prev.tags || [];
      if (current.includes(tagId)) {
        return { ...prev, tags: current.filter((id) => id !== tagId) };
      }
      return { ...prev, tags: [...current, tagId] };
    });
  }

  return (
    <div className="mdl-overlay" onClick={onClose}>
      <div className="mdl-box" onClick={(e) => e.stopPropagation()}>
        <div className="mdl-header">
          <h2>Editar Lead</h2>
          <button className="mdl-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="mdl-form">
          {error && <div className="mdl-error">{error}</div>}

          <div className="mdl-grid">
            <div className="mdl-field">
              <label>Nome / Empresa</label>
              <input
                type="text"
                required
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="mdl-field">
              <label>Telefone</label>
              <input
                type="text"
                required
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="mdl-field">
              <label>E-mail</label>
              <input
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="mdl-field">
              <label>Status</label>
              <select
                value={formData.status || "novo"}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                <option value="novo">Novo</option>
                <option value="enviado">Enviado</option>
                <option value="entregue">Entregue</option>
                <option value="lido">Lido</option>
                <option value="respondido">Respondido</option>
                <option value="oportunidade">Oportunidade</option>
                <option value="fechado">Fechado</option>
                <option value="perdido">Perdido</option>
                <option value="invalido">Inválido</option>
              </select>
            </div>

            <div className="mdl-field">
              <label>Temperatura</label>
              <select
                value={formData.temperature || "frio"}
                onChange={(e) => setFormData({ ...formData, temperature: e.target.value as any })}
              >
                <option value="gelado">❄️ Gelado</option>
                <option value="frio">❄️ Frio</option>
                <option value="morno">☁️ Morno</option>
                <option value="quente">🔥 Quente</option>
              </select>
            </div>
          </div>

          <div className="mdl-field" style={{ marginTop: 12 }}>
            <label>Endereço Completo</label>
            <input
              type="text"
              value={formData.address || ""}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Rua, número, bairro..."
            />
          </div>

          <div className="mdl-grid" style={{ marginTop: 12 }}>
            <div className="mdl-field">
              <label>Cidade</label>
              <input
                type="text"
                value={formData.city || ""}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div className="mdl-field">
              <label>Estado</label>
              <input
                type="text"
                value={formData.state || ""}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
          </div>

          <div className="mdl-grid" style={{ marginTop: 12 }}>
            <div className="mdl-field">
              <label>Website</label>
              <input
                type="text"
                value={formData.website || ""}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              />
            </div>
            <div className="mdl-field">
              <label>Link Google Maps (URL)</label>
              <input
                type="text"
                value={formData.url || ""}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
          </div>

          <div className="mdl-grid" style={{ marginTop: 12 }}>
            <div className="mdl-field">
              <label>Categoria</label>
              <input
                type="text"
                value={formData.categoryName || ""}
                onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
              />
            </div>
            <div className="mdl-field">
              <label>Avaliações (Contagem)</label>
               <input
                type="number"
                value={formData.reviewsCount || 0}
                onChange={(e) => setFormData({ ...formData, reviewsCount: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mdl-field" style={{ marginTop: 12 }}>
            <label>Tags</label>
            <div className="mdl-tags-selection">
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`mdl-tag-item ${formData.tags?.includes(tag.id!) ? "active" : ""}`}
                  style={{ "--tag-c": tag.color } as any}
                  onClick={() => toggleTag(tag.id!)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mdl-footer">
            <button type="button" className="btn-sec" onClick={onClose} style={{ marginRight: 'auto' }}>Fechar</button>
            <button type="submit" className="btn-pri" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .mdl-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
          backdrop-filter: blur(4px);
        }
        .mdl-box {
          background: white; width: 100%; max-width: 600px;
          border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.2);
          max-height: 90vh; display: flex; flex-direction: column;
        }
        .mdl-header {
          padding: 20px; border-bottom: 1px solid #eee;
          display: flex; align-items: center; justify-content: space-between;
        }
        .mdl-header h2 { margin: 0; font-size: 18px; color: #28352A; font-weight: 800; }
        .mdl-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #888; }
        .mdl-form { padding: 20px; overflow-y: auto; flex: 1; }
        .mdl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mdl-field { display: flex; flex-direction: column; gap: 6px; }
        .mdl-field label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #58595B; }
        .mdl-field input, .mdl-field select {
          padding: 10px; border: 1.5px solid #E4E6DB; border-radius: 8px;
          font-family: inherit; font-size: 14px; outline: none;
        }
        .mdl-field input:focus { border-color: #4E6550; }
        .mdl-error { background: #fdecea; color: #c0392b; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; font-weight: 600; }
        .mdl-tags-selection { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
        .mdl-tag-item {
          padding: 4px 10px; border-radius: 20px; border: 1.5px solid #E4E6DB;
          background: transparent; font-size: 12px; font-weight: 600; color: #58595B;
          cursor: pointer; transition: all .15s;
        }
        .mdl-tag-item.active { background: var(--tag-c); border-color: var(--tag-c); color: white; }
        .mdl-footer { padding-top: 20px; display: flex; justify-content: flex-end; gap: 10px; }
        .btn-sec { padding: 10px 16px; background: #f5f5f5; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .btn-pri { padding: 10px 20px; background: #28352A; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; }
        .btn-pri:disabled { opacity: 0.5; }
      `}</style>
    </div>
  );
}
