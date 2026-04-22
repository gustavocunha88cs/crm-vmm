"use client";

import { useState, useEffect } from "react";
import { Lead, LeadStatus, LeadTemperature } from "@/types";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const COLUMNS = [
  { id: "novo", title: "Lista de Disparo", color: "#607D8B" },
  { id: "contatados", title: "Contatados", color: "#2196F3" },
  { id: "atendimento", title: "Em Atendimento", color: "#FF9800" },
  { id: "oportunidade", title: "Oportunidade", color: "#F44336" }, // Vermelho para Quente
  { id: "ganhou", title: "Fechado/Ganhou", color: "#4CAF50" },
  { id: "perdido", title: "Perdido/Spam", color: "#9E9E9E" },
];

interface LeadsKanbanProps {
  leads: Lead[];
  onLeadsUpdate?: () => void;
  onlyShowValidWA?: boolean;
}

export default function LeadsKanban({ 
  leads, 
  onLeadsUpdate,
  onlyShowValidWA = false 
}: LeadsKanbanProps) {

  // We don't need fetchLeads internally anymore, we use leads from props

  const getColumnLeads = (colId: string) => {
    return leads.filter((l) => {
      // Apply WhatsApp Filter
      if (onlyShowValidWA && l.wa_status !== "VALIDADO") return false;

      if (colId === "novo") return l.status === "novo";
      if (colId === "contatados") return ["enviado", "entregue", "lido"].includes(l.status);
      if (colId === "atendimento") return l.status === "respondido" || l.temperature === "morno";
      if (colId === "oportunidade") return l.status === "oportunidade" || l.temperature === "quente";
      if (colId === "ganhou") return l.status === "fechado";
      if (colId === "perdido") return l.status === "perdido" || l.status === "invalido";
      return false;
    });
  };

  async function onDragEnd(result: any) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newCol = destination.droppableId;

    // Atualizar localmente
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead) return;

    let newStatus: LeadStatus = lead.status;
    if (newCol === "novo") newStatus = "novo";
    if (newCol === "contatados") newStatus = "enviado";
    if (newCol === "atendimento") newStatus = "respondido";
    if (newCol === "oportunidade") newStatus = "oportunidade";
    if (newCol === "ganhou") newStatus = "fechado";
    if (newCol === "perdido") newStatus = "perdido";

    // Update in DB
    try {
      await fetch(`/api/leads/${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      onLeadsUpdate?.();
    } catch {}
  }

  if (!leads.length) return <div className="kb-loading">Nenhum lead encontrado para os filtros atuais.</div>;

  return (
    <div className="kb-container">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kb-board">
          {COLUMNS.map((col) => (
            <div key={col.id} className="kb-col">
              <div className="kb-col-header" style={{ borderTop: `4px solid ${col.color}` }}>
                {col.title}
                <span className="kb-col-count">{getColumnLeads(col.id).length}</span>
              </div>
              
              <Droppable droppableId={col.id}>
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="kb-col-content">
                    {getColumnLeads(col.id).map((lead, index) => (
                      <Draggable key={lead.id} draggableId={lead.id!} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`kb-card ${lead.temperature === "quente" ? "hot" : ""}`}
                          >
                            <div className="kb-card-top">
                               <span className={`kb-temp-tag ${lead.temperature || 'frio'}`}>
                                  {lead.temperature === 'quente' ? '🔥 QUENTE' : lead.temperature === 'morno' ? '☁️ MORNO' : '❄️ FRIO'}
                               </span>
                               <span className="kb-status-label">{lead.status}</span>
                            </div>
                            <h4 className="kb-card-title">{lead.title}</h4>
                            <p className="kb-card-phone">{lead.phone}</p>
                            {lead.city && <p className="kb-card-loc">{lead.city}, {lead.state}</p>}
                            
                            {(lead as any).campaignContacted && (
                              <div className="kb-campaign-info">
                                🚀 {(lead as any).lastCampaignName || 'Campanha'}
                              </div>
                            )}
                            
                            {lead.tags?.length > 0 && (
                                <div className="kb-card-tags">
                                    {lead.tags.slice(0, 2).map(t => <span key={t} className="kb-tag">#{t}</span>)}
                                </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      <style jsx>{`
        .kb-container { overflow-x: auto; height: calc(100vh - 120px); padding: 10px 0; }
        .kb-board { display: flex; gap: 16px; min-width: max-content; padding: 0 20px; height: 100%; }
        .kb-col { width: 280px; background: #f4f5f1; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
        .kb-col-header { 
            padding: 16px; font-weight: 800; font-size: 14px; color: #28352A;
            background: rgba(255,255,255,0.5); display: flex; justify-content: space-between; align-items: center;
        }
        .kb-col-count { background: rgba(0,0,0,0.05); padding: 2px 8px; border-radius: 8px; font-size: 11px; }
        .kb-col-content { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        
        .kb-card { 
            background: white; border-radius: 10px; padding: 12px; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1.5px solid transparent;
            transition: all 0.2s;
        }
        .kb-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .kb-card.hot { border-color: #F44336; background: #fff8f8; }
        
        .kb-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .kb-temp-tag { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
        .kb-temp-tag.hot { background: #FFEBEE; color: #D32F2F; }
        .kb-temp-tag.morno { background: #E3F2FD; color: #1976D2; }
        .kb-temp-tag.frio { background: #F5F5F5; color: #757575; }
        
        .kb-status-label { font-size: 9px; color: #9AA494; text-transform: uppercase; }
        .kb-card-title { margin: 0; font-size: 14px; font-weight: 700; color: #28352A; }
        .kb-card-phone { margin: 4px 0 0; font-size: 12px; color: #58595B; }
        .kb-card-loc { margin: 2px 0 0; font-size: 10px; color: #9AA494; }
        .kb-campaign-info { 
            margin-top: 6px; font-size: 10px; font-weight: 800; color: #2E7D32; 
            background: #E8F5E9; padding: 2px 6px; border-radius: 4px; display: inline-block;
            border: 1px solid #C8E6C9; text-transform: uppercase;
        }
        .kb-card-tags { display: flex; gap: 4px; margin-top: 8px; }
        .kb-tag { font-size: 9px; color: var(--s); background: rgba(78,101,80,0.08); padding: 1px 6px; border-radius: 4px; }
        
        .kb-loading { padding: 100px; text-align: center; color: #888; }
      `}</style>
    </div>
  );
}
