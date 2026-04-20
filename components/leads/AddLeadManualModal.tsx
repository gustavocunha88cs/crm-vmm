import { useState } from "react";
import type { ScraperLead } from "@/types";
import { apiFetch } from "@/lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddLeadManualModal({ isOpen, onClose, onSuccess }: Props) {
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity]   = useState("");
  const [email, setEmail] = useState("");
  const [categoryName, setCategoryName] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !phone.trim()) {
      setError("Empresa e Telefone são obrigatórios.");
      return;
    }
    setError("");
    setLoading(true);

    const lead: ScraperLead = {
      title,
      phone,
      city,
      email,
      categoryName,
      address: "",
      state: "",
      website: "",
      url: "",
      totalScore: 0,
      reviewsCount: 0,
    };

    try {
      const res = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: [lead], tagIds: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar lead.");
      
      onSuccess();
      setTitle("");
      setPhone("");
      setCity("");
      setEmail("");
      setCategoryName("");
    } catch (err: any) {
      setError(err.message || "Falha na comunicação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="al-overlay">
      <div className="al-modal">
        <div className="al-header">
          <h2 className="al-title">Adicionar Lead Manualmente</h2>
          <button className="al-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="al-error">{error}</div>}

        <form onSubmit={handleSubmit} className="al-form">
          <div className="al-field">
            <label>Empresa *</label>
            <input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Nome da empresa ou contato" 
              autoFocus 
            />
          </div>

          <div className="al-field">
            <label>Telefone / WhatsApp *</label>
            <input 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              placeholder="Ex: 11999999999" 
            />
          </div>

          <div className="al-row">
            <div className="al-field">
              <label>Cidade</label>
              <input 
                value={city} 
                onChange={e => setCity(e.target.value)} 
                placeholder="Ex: São Paulo" 
              />
            </div>
            <div className="al-field">
              <label>Categoria</label>
              <input 
                value={categoryName} 
                onChange={e => setCategoryName(e.target.value)} 
                placeholder="Ex: Restaurante" 
              />
            </div>
          </div>

          <div className="al-field">
            <label>E-mail</label>
            <input 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="contato@empresa.com" 
              type="email"
            />
          </div>

          <div className="al-footer">
            <button type="button" className="al-btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="al-btn-submit" disabled={loading}>
              {loading ? "Salvando..." : "Adicionar Lead"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .al-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(11,16,23,0.7); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .al-modal {
          background: var(--surface); border-radius: 12px;
          width: 90%; max-width: 460px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          animation: alFadeIn .2s ease;
        }
        .al-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 20px 24px; border-bottom: 1px solid var(--border);
        }
        .al-title { font-size: 18px; font-weight: 800; color: var(--dark); margin: 0; }
        .al-close {
          background: none; border: none; font-size: 18px;
          color: var(--text); cursor: pointer;
        }
        .al-close:hover { color: var(--s); }
        .al-error {
          margin: 20px 24px 0; padding: 10px 14px;
          background: #fdecea; color: #b91c1c;
          border: 1px solid #f5c6c3; border-radius: 8px;
          font-size: 13px; font-weight: 600;
        }
        .al-form { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
        .al-row { display: flex; gap: 12px; }
        .al-row > * { flex: 1; }
        .al-field { display: flex; flex-direction: column; gap: 6px; }
        .al-field label { font-size: 12px; font-weight: 700; color: var(--p); text-transform: uppercase; letter-spacing: 0.05em; }
        .al-field input {
          padding: 10px 14px; border: 1.5px solid var(--border);
          border-radius: 8px; background: var(--bg); color: var(--dark);
          font-family: inherit; font-size: 14px; transition: border-color .15s; outline: none;
        }
        .al-field input:focus { border-color: var(--s); }
        .al-footer {
          display: flex; justify-content: flex-end; gap: 10px;
          margin-top: 10px;
        }
        .al-btn-cancel {
          padding: 10px 16px; border: 1.5px solid var(--border);
          background: transparent; border-radius: 8px;
          font-family: inherit; font-size: 13px; font-weight: 700;
          color: var(--text); cursor: pointer; transition: all .15s;
        }
        .al-btn-cancel:hover { border-color: var(--s); color: var(--dark); }
        .al-btn-submit {
          padding: 10px 20px; background: var(--p);
          border: none; border-radius: 8px;
          font-family: inherit; font-size: 13px; font-weight: 700;
          color: var(--bg); cursor: pointer; transition: background .15s;
        }
        .al-btn-submit:hover:not(:disabled) { background: var(--s); }
        .al-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        @keyframes alFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
