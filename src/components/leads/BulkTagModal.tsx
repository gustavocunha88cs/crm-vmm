"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface BulkTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedLeadIds: string[];
  availableTags: any[];
}

export default function BulkTagModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  selectedLeadIds, 
  availableTags 
}: BulkTagModalProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#4E6550");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"add" | "set">("add");

  if (!isOpen) return null;

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTagIds(prev => [...prev, data.tag.id]);
        setNewTagName("");
        // Resetting tags list would be better, but we rely on parent update or local state
        alert("Tag criada e selecionada!");
        window.location.reload(); // Simplest way to sync for now
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (selectedTagIds.length === 0 && !newTagName) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/leads/bulk-tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ids: selectedLeadIds, 
          tagIds: selectedTagIds, 
          mode 
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleClearTags() {
    if (!confirm("Isso irá REMOVER TODAS as tags dos leads selecionados. Tem certeza?")) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/leads/bulk-tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ids: selectedLeadIds, 
          tagIds: [], 
          mode: "set" 
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleTag(id: string) {
    setSelectedTagIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  return (
    <div className="btm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="btm-modal">
        <div className="btm-header">
          <h3>🏷️ Alterar Tags em Massa</h3>
          <p>{selectedLeadIds.length} leads selecionados</p>
        </div>

        <div className="btm-body">
          <div className="btm-mode-switch">
             <button className={mode === 'add' ? 'active' : ''} onClick={() => setMode('add')}>Adicionar às existentes</button>
             <button className={mode === 'set' ? 'active' : ''} onClick={() => setMode('set')}>Substituir todas</button>
          </div>

          <label className="btm-label">Selecione as Tags:</label>
          <div className="btm-tags-grid">
            {availableTags.map(tag => (
              <button 
                key={tag.id}
                className={`btm-tag-btn ${selectedTagIds.includes(tag.id) ? 'active' : ''}`}
                style={{ "--tc": tag.color } as any}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>

          <div className="btm-new-tag">
            <label className="btm-label">Ou crie uma nova:</label>
            <div className="btm-new-row">
              <input 
                type="text" 
                placeholder="Nome da tag..." 
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <input 
                type="color" 
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
              />
              <button onClick={handleCreateTag} disabled={loading || !newTagName}>Criar</button>
            </div>
          </div>
        </div>

        <div className="btm-footer">
          <button className="btm-cancel" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btm-clear" onClick={handleClearTags} disabled={loading}>🗑️ Remover todas as Tags</button>
          <button 
            className="btm-save" 
            onClick={handleSubmit}
            disabled={loading || (selectedTagIds.length === 0 && !newTagName)}
          >
            {loading ? "Processando..." : "Aplicar"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .btm-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1100;
        }
        .btm-modal { 
          background: white; border-radius: 16px; width: 100%; max-width: 450px; 
          box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden;
        }
        .btm-header { padding: 20px; background: #28352A; color: white; }
        .btm-header h3 { margin: 0; font-size: 18px; }
        .btm-header p { margin: 4px 0 0; font-size: 12px; opacity: 0.7; }
        
        .btm-body { padding: 20px; }
        .btm-mode-switch { display: flex; gap: 4px; background: #f0f0f0; padding: 4px; border-radius: 8px; margin-bottom: 20px; }
        .btm-mode-switch button { flex: 1; border: none; background: transparent; padding: 6px; font-size: 12px; font-weight: 700; cursor: pointer; border-radius: 6px; }
        .btm-mode-switch button.active { background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

        .btm-label { display: block; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #888; margin-bottom: 8px; }
        .btm-tags-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; max-height: 150px; overflow-y: auto; }
        .btm-tag-btn { 
          padding: 6px 12px; border-radius: 20px; border: 1.5px solid var(--border, #eee);
          background: transparent; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.1s;
        }
        .btm-tag-btn.active { background: var(--tc); border-color: var(--tc); color: white; }
        
        .btm-new-tag { border-top: 1px solid #eee; pt: 15px; }
        .btm-new-row { display: flex; gap: 8px; }
        .btm-new-row input[type="text"] { flex: 1; padding: 8px; border: 1.5px solid #eee; border-radius: 8px; outline: none; }
        .btm-new-row input[type="color"] { width: 40px; height: 38px; padding: 2px; border: 1.5px solid #eee; border-radius: 8px; cursor: pointer; }
        .btm-new-row button { padding: 0 16px; background: #4E6550; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }

        .btm-footer { padding: 16px 20px; background: #f9f9f9; display: flex; justify-content: space-between; gap: 10px; align-items: center; }
        .btm-cancel { background: transparent; border: none; font-weight: 700; color: #888; cursor: pointer; }
        .btm-clear { background: #fdecea; color: #c0392b; border: 1.5px solid #f5c6c3; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .btm-clear:hover { background: #f5c6c3; }
        .btm-save { background: #28352A; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; }
      `}</style>
    </div>
  );
}
