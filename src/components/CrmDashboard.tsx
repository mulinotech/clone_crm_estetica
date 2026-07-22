import React, { useState, useEffect, useMemo, FormEvent } from "react";
import { X, Lock, Sparkles, ShieldCheck, FileText, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Navbar from "./Navbar";
import PipelineKanban from "./PipelineKanban";
import ClientDirectory from "./ClientDirectory";
import ChatConsole from "./ChatConsole";
import EvolutionHub from "./EvolutionHub";
import DashboardOverview from "./DashboardOverview";
import CrmSettings from "./CrmSettings";
import { Client, Lead, Interaction, Treatment, TreatmentCatalog, TreatmentPlan, TreatmentSession } from "../types";

interface CrmDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  leads: Lead[];
  onUpdateLeadStatus: (leadId: string, newStatus: Lead["status"], phone?: string, email?: string) => void;
  onDeleteLead: (leadId: string) => void;
}

export default function CrmDashboard({
  isOpen,
  onClose,
  leads: parentLeads,
  onUpdateLeadStatus: parentUpdateStatus,
  onDeleteLead,
}: CrmDashboardProps) {
  const [password, setPassword] = useState<string>("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("crm_estetica_auth") === "true";
  });
  const [authError, setAuthError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Keep localStorage synced when auth state changes
  useEffect(() => {
    localStorage.setItem("crm_estetica_auth", String(isAuthenticated));
  }, [isAuthenticated]);

  // CRM State variables
  const [clients, setClients] = useState<Client[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlan[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [localLeads, setLocalLeads] = useState<Lead[]>([]);
  const [treatmentCatalog, setTreatmentCatalog] = useState<TreatmentCatalog[]>([]);
  const [isAiConfigured, setIsAiConfigured] = useState<boolean>(false);
  const [isEvolutionConfigured, setIsEvolutionConfigured] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Active Lead Details Drawer inside CRM
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [chatView, setChatView] = useState<'crm' | 'evolution'>('crm');

  // Lead Drawer Edit States
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  useEffect(() => {
    if (selectedLead) {
      setEditPhone(selectedLead.phone || "");
      setEditEmail(selectedLead.email || "");
      setIsEditingPhone(false);
      setIsEditingEmail(false);
    } else {
      setEditPhone("");
      setEditEmail("");
      setIsEditingPhone(false);
      setIsEditingEmail(false);
    }
  }, [selectedLead]);

  const fetchCrmData = async (silent = false) => {
    if (!silent) setLoadingData(true);
    try {
      const t = Date.now();
      const headers = {
        'x-user-role': localStorage.getItem('userRole') || '',
        'x-salesperson-id': localStorage.getItem('salespersonId') || ''
      };
      const [resClients, resTreatments, resInteractions, resConfig, resLeads, resCatalog, resPlans] = await Promise.all([
        fetch(`/api/clients?_t=${t}`, { headers }),
        fetch(`/api/treatments?_t=${t}`, { headers }),
        fetch(`/api/interactions?_t=${t}`, { headers }),
        fetch(`/api/config?_t=${t}`, { headers }),
        fetch(`/api/leads?_t=${t}`, { headers }),
        fetch(`/api/treatment-catalog?_t=${t}`, { headers }),
        fetch(`/api/treatment-plans?_t=${t}`, { headers }),
      ]);

      if (resClients.ok && resTreatments.ok && resInteractions.ok && resConfig.ok && resLeads.ok && resCatalog.ok && resPlans.ok) {
        setClients(await resClients.json());
        setTreatments(await resTreatments.json());
        setInteractions(await resInteractions.json());
        const rawCatalog = await resCatalog.json();
        setTreatmentCatalog(rawCatalog.map((item: any) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          packagePrice: item.package_price ? Number(item.package_price) : undefined,
          duration: item.duration ? Number(item.duration) : undefined,
          description: item.description || "",
          indicatedRegions: item.target_regions || "",
          restrictions: item.restrictions || ""
        })));
        setTreatmentPlans(await resPlans.json());
        const rawLeads = await resLeads.json();
        const mappedLeads = rawLeads.map((item: any) => ({
          id: item.id,
          name: item.name,
          phone: item.whatsapp,
          email: item.email || "",
          interest: item.treatment,
          status: item.status || "new",
          source: item.source || "site",
          scoreResult: item.score_result,
          createdAt: item.date || new Date().toISOString()
        }));
        setLocalLeads(mappedLeads);
        const config = await resConfig.json();
        setIsAiConfigured(config.hasGemini);
        setIsEvolutionConfigured(config.hasEvolution);
      }
    } catch (e) {
      console.error("Error loading CRM unifed data:", e);
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  const handleUpdateLeadStatus = async (id: string, status: Lead['status'], phone?: string, email?: string) => {
    try {
      const statusMapping: Record<string, string> = {
        "new": "novo",
        "contacted": "contatado",
        "proposal_sent": "agendado",
        "converted": "arquivado",
        "lost": "perdido"
      };
      const mappedStatus = statusMapping[status] || status || "novo";

      const response = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: mappedStatus,
          whatsapp: phone !== undefined ? phone : undefined,
          email: email !== undefined ? email : undefined
        })
      });
      if (response.ok) {
        if (mappedStatus === 'arquivado') {
          const leadToConvert = localLeads.find(l => l.id === id);
          const finalPhone = phone !== undefined ? phone : (leadToConvert?.phone || "");
          const finalEmail = email !== undefined ? email : (leadToConvert?.email || "");
          const clientExists = clients.some(c => c.phone === finalPhone);
          if (leadToConvert && !clientExists) {
            await handleAddClient({
              name: leadToConvert.name,
              phone: finalPhone,
              email: finalEmail,
              salespersonId: leadToConvert.salespersonId
            });
          }
        }
        await fetchCrmData();
        parentUpdateStatus(id, status, phone, email);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAuthenticated && isOpen) {
      fetchCrmData();
    }
  }, [isAuthenticated, isOpen]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (response.ok) {
        setIsAuthenticated(true);
        setAuthError("");
        localStorage.setItem("userRole", data.role);
        if (data.salespersonId) {
          localStorage.setItem("salespersonId", data.salespersonId);
          localStorage.setItem("salespersonName", data.salespersonName || "");
        } else {
          localStorage.removeItem("salespersonId");
          localStorage.removeItem("salespersonName");
        }
        await fetchCrmData();
      } else {
        setAuthError(data.error || "Senha incorreta. Por favor, tente novamente.");
      }
    } catch (err) {
      setAuthError("Erro ao conectar com o servidor.");
    }
  };

  const handleClose = () => {
    setIsAuthenticated(false);
    setPassword("");
    localStorage.removeItem("crm_estetica_auth");
    localStorage.removeItem("userRole");
    localStorage.removeItem("salespersonId");
    localStorage.removeItem("salespersonName");
    onClose();
  };

  const handleAddClient = async (clientData: Omit<Client, "id" | "createdAt" | "updatedAt">) => {
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTreatment = async (treatmentData: Omit<Treatment, "id">) => {
    try {
      const response = await fetch("/api/treatments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(treatmentData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTreatment = async (id: string, treatmentData: Partial<Treatment>) => {
    try {
      const response = await fetch(`/api/treatments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(treatmentData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (clientId: string, content: string) => {
    try {
      const response = await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          type: "whatsapp",
          content,
          direction: "out",
        }),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateClient = async (id: string, clientData: Partial<Client>) => {
    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLead = async (id: string) => {
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTreatmentPlan = async (planData: Omit<TreatmentPlan, "id" | "createdAt">) => {
    try {
      const response = await fetch("/api/treatment-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTreatmentPlan = async (id: string, planData: Partial<TreatmentPlan>) => {
    try {
      const response = await fetch(`/api/treatment-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTreatmentPlan = async (id: string) => {
    try {
      const response = await fetch(`/api/treatment-plans/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTreatmentSession = async (id: string, sessionData: Partial<TreatmentSession>) => {
    try {
      const response = await fetch(`/api/treatment-sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData),
      });
      if (response.ok) {
        await fetchCrmData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateReport = async (aba: string) => {
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aba }),
      });
      if (!response.ok) {
        alert('Erro ao obter dados do relatório.');
        return;
      }
      const report = await response.json();
      const { data, periodo } = report;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor, permita popups para visualizar o relatório.');
        return;
      }

      const inicioStr = new Date(periodo.inicio).toLocaleDateString('pt-BR');
      const fimStr = new Date(periodo.fim).toLocaleDateString('pt-BR');

      let contentHtml = '';

      if (report.aba === 'VISÃO GERAL') {
        contentHtml = `
          <div class="report-header">
            <h2>Relatório de Gestão Comercial & Financeira</h2>
            <p class="subtitle">CRM Estética SaaS | Concierge & Skin AI</p>
            <p class="period">Período: ${inicioStr} a ${fimStr}</p>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="label">Faturamento Total</span>
              <span class="value font-serif">R$ ${data.faturamentoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="metric-card">
              <span class="label">Ticket Médio por Sessão</span>
              <span class="value font-serif">R$ ${data.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="metric-card">
              <span class="label">Conversão Geral</span>
              <span class="value font-serif">${data.taxaConversao.toFixed(1)}%</span>
            </div>
            <div class="metric-card">
              <span class="label">Pacientes Ativos</span>
              <span class="value font-serif">${data.totalPacientesAtivos}</span>
            </div>
          </div>
          <div class="section-title">Top 3 Procedimentos por Faturamento</div>
          <table>
            <thead>
              <tr>
                <th>Procedimento / Tipo de Sessão</th>
                <th style="text-align: right;">Total Faturado</th>
              </tr>
            </thead>
            <tbody>
              ${data.top3ProcedimentosPorFaturamento.map((p: any) => `
                <tr>
                  <td style="font-weight: bold;">${p.nome}</td>
                  <td style="text-align: right; color: #10B981; font-weight: bold;">R$ ${p.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else if (report.aba === 'FUNIL') {
        contentHtml = `
          <div class="report-header">
            <h2>Relatório de Leads & Funil de Atração</h2>
            <p class="subtitle">CRM Estética SaaS | Concierge & Skin AI</p>
            <p class="period">Período: ${inicioStr} a ${fimStr}</p>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="label">Tempo Médio de Conversão</span>
              <span class="value font-serif">${data.tempoMedioConversaoEmDias} dias</span>
            </div>
          </div>
          <div class="section-title">Distribuição de Leads por Estágio</div>
          <table>
            <thead>
              <tr>
                <th>Estágio do Funil</th>
                <th style="text-align: right;">Quantidade de Leads</th>
              </tr>
            </thead>
            <tbody>
              ${data.distribuicaoPorEstagio.map((s: any) => `
                <tr>
                  <td style="font-weight: bold; text-transform: uppercase;">${s.estagio}</td>
                  <td style="text-align: right;">${s.quantidade} leads</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="section-title">Performance por Canal de Aquisição</div>
          <table>
            <thead>
              <tr>
                <th>Canal / Origem</th>
                <th style="text-align: right;">Total Leads</th>
                <th style="text-align: right;">Convertidos</th>
                <th style="text-align: right;">Taxa Conversão</th>
              </tr>
            </thead>
            <tbody>
              ${data.performancePorCanal.map((c: any) => {
                const tx = c.leads > 0 ? (c.convertidos / c.leads) * 100 : 0;
                return `
                  <tr>
                    <td style="font-weight: bold;">${c.nome}</td>
                    <td style="text-align: right;">${c.leads}</td>
                    <td style="text-align: right;">${c.convertidos}</td>
                    <td style="text-align: right; color: #b45309; font-weight: bold;">${tx.toFixed(1)}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else if (report.aba === 'PACIENTES') {
        contentHtml = `
          <div class="report-header">
            <h2>Relatório de Análise de Fichas & Retorno</h2>
            <p class="subtitle">CRM Estética SaaS | Concierge & Skin AI</p>
            <p class="period">Período: ${inicioStr} a ${fimStr}</p>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="label">Taxa Geral de Retorno</span>
              <span class="value font-serif">${data.taxaRetorno}%</span>
            </div>
          </div>
          <div class="section-title">Top 10 Pacientes com Maior Investimento no Período</div>
          <table>
            <thead>
              <tr>
                <th>Nome da Paciente</th>
                <th style="text-align: right;">Total Investido</th>
              </tr>
            </thead>
            <tbody>
              ${data.top10MaioresInvestidores.map((inv: any) => `
                <tr>
                  <td style="font-weight: bold;">${inv.nome}</td>
                  <td style="text-align: right; color: #10B981; font-weight: bold;">R$ ${inv.totalInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="section-title">Pacientes Inativos (Sem sessões nos últimos 60 dias)</div>
          <table>
            <thead>
              <tr>
                <th>Nome da Paciente</th>
                <th>WhatsApp</th>
                <th style="text-align: right;">Última Sessão</th>
              </tr>
            </thead>
            <tbody>
              ${data.listaInativos.map((i: any) => `
                <tr>
                  <td>${i.nome}</td>
                  <td style="font-family: monospace;">${i.telefone}</td>
                  <td style="text-align: right; font-weight: bold; color: #dc2626;">${i.ultimoAtendimento}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="section-title">Aniversariantes do Mês</div>
          <table>
            <thead>
              <tr>
                <th>Nome da Paciente</th>
                <th>WhatsApp</th>
                <th style="text-align: right;">Data do Aniversário</th>
              </tr>
            </thead>
            <tbody>
              ${data.alertasAniversario.map((a: any) => `
                <tr>
                  <td>${a.nome}</td>
                  <td style="font-family: monospace;">${a.telefone}</td>
                  <td style="text-align: right; font-weight: bold; color: #d97706;">${a.dataAniversario}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else if (report.aba === 'ATENDIMENTO') {
        contentHtml = `
          <div class="report-header">
            <h2>Relatório de Conversas WhatsApp & SAC</h2>
            <p class="subtitle">CRM Estética SaaS | Concierge & Skin AI</p>
            <p class="period">Período: ${inicioStr} a ${fimStr}</p>
          </div>
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="label">Tempo Médio de Resposta</span>
              <span class="value font-serif">${data.tempoMedioResposta}</span>
            </div>
            <div class="metric-card">
              <span class="label">Total de Mensagens Trocadas</span>
              <span class="value font-serif">${data.totalMensagens}</span>
            </div>
            <div class="metric-card">
              <span class="label">Horário de Pico</span>
              <span class="value font-serif">${data.horarioPico}</span>
            </div>
            <div class="metric-card">
              <span class="label">Satisfação Média (CSAT)</span>
              <span class="value font-serif">${data.satisfacaoMedia}</span>
            </div>
          </div>
        `;
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Relatório CRM Estética - ${report.aba}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap');
            body {
              font-family: 'Plus Jakarta Sans', sans-serif;
              color: #4A3C31;
              background-color: #ffffff;
              margin: 40px;
              padding: 0;
            }
            .font-serif {
              font-family: 'Playfair Display', serif;
            }
            .report-header {
              text-align: center;
              border-bottom: 2px solid #D4AF37;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .report-header h2 {
              font-family: 'Playfair Display', serif;
              font-size: 24px;
              color: #4A3C31;
              margin: 0 0 5px 0;
            }
            .report-header .subtitle {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #D4AF37;
              margin: 0 0 10px 0;
              font-weight: 600;
            }
            .report-header .period {
              font-size: 11px;
              color: #7A695E;
              margin: 0;
            }
            .metrics-grid {
              display: grid;
              grid-template-cols: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 40px;
            }
            .metric-card {
              background: #FAF7F5;
              border: 1px solid #E8DED3;
              border-radius: 12px;
              padding: 18px;
              text-align: center;
            }
            .metric-card .label {
              font-size: 10px;
              text-transform: uppercase;
              color: #7A695E;
              letter-spacing: 1px;
              display: block;
              margin-bottom: 6px;
            }
            .metric-card .value {
              font-size: 20px;
              color: #4A3C31;
              font-weight: bold;
            }
            .section-title {
              font-family: 'Playfair Display', serif;
              font-size: 16px;
              border-bottom: 1px solid #E8DED3;
              padding-bottom: 8px;
              margin: 30px 0 15px 0;
              font-weight: bold;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th, td {
              padding: 10px 12px;
              text-align: left;
              font-size: 12px;
              border-bottom: 1px solid #FAF7F5;
            }
            th {
              background-color: #FAF7F5;
              color: #7A695E;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 1px;
            }
            tr:nth-child(even) {
              background-color: #FCFAF8;
            }
            .footer {
              text-align: center;
              font-size: 9px;
              color: #7A695E;
              margin-top: 50px;
              border-top: 1px dashed #E8DED3;
              padding-top: 20px;
              opacity: 0.7;
            }
            @media print {
              body { margin: 20px; }
              .metric-card { background: #FAF7F5 !important; -webkit-print-color-adjust: exact; }
              th { background: #FAF7F5 !important; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${contentHtml}
          <div class="footer">
            <p>Relatório gerado automaticamente pelo CRM Estética SaaS em ${new Date().toLocaleString('pt-BR')}. Documento confidencial.</p>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(fullHtml);
      printWindow.document.close();

    } catch (e) {
      console.error(e);
      alert('Erro ao gerar PDF do relatório.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-brand-beige animate-fade-in">
      <div className="relative w-full h-full overflow-hidden flex flex-col justify-between bg-brand-beige">
        


        {/* Security barrier screen */}
        {!isAuthenticated ? (
          <div className="p-10 flex flex-col items-center justify-center space-y-6 text-center flex-1 my-12">
            <Lock className="w-10 h-10 text-brand-brown animate-pulse" />
            <div className="space-y-2 max-w-md">
              <h4 className="text-xs font-bold text-brand-brown uppercase tracking-widest">Acesso de Altíssima Segurança</h4>
              <p className="text-[11px] text-brand-brown/70 font-light leading-relaxed">
                Insira a chave de acesso comercial para acessar os prontuários, fichas anamnese e logs do CRM.
              </p>
            </div>

            <form onSubmit={handleLogin} className="w-full max-w-xs space-y-3.5">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha de Acesso Comercial"
                className="w-full bg-white border border-brand-gold/30 rounded px-4 py-2.5 text-center text-xs text-brand-brown focus:outline-none focus:border-brand-brown transition-colors"
                autoFocus
              />
              {authError && <p className="text-[10px] text-red-650 font-semibold">{authError}</p>}
              <button
                type="submit"
                className="w-full bg-brand-brown hover:bg-brand-brown/90 text-brand-beige font-extrabold uppercase text-[10px] tracking-widest py-2.5 rounded cursor-pointer transition-colors"
              >
                Desbloquear Painel
              </button>
            </form>
          </div>
        ) : (
          /* CRM Dashboard content area */
          <div className="flex-1 flex flex-col overflow-hidden">
            <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isAiConfigured={isAiConfigured} onClose={handleClose} />
            
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-brand-beige/50">
              {/* PDF Report generation banner */}
              {['dashboard', 'pipeline', 'clients', 'chat'].includes(activeTab) && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 bg-white border border-brand-gold/15 p-4 rounded-2xl shadow-xs">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-serif font-bold text-brand-brown uppercase tracking-wider">
                      {activeTab === 'dashboard' ? 'Painel de Visão Geral' :
                       activeTab === 'pipeline' ? 'Funil & Gestão de Leads' :
                       activeTab === 'clients' ? 'Diretório de Pacientes' : 'Central de Atendimento'}
                    </h3>
                    <p className="text-[10px] text-brand-brown/65">Análise e consolidação de métricas do mês atual</p>
                  </div>
                  <button
                    onClick={() => handleGenerateReport(activeTab)}
                    className="flex items-center space-x-1.5 bg-brand-brown hover:bg-brand-brown/95 text-brand-beige px-4 py-2 rounded-xl text-xxs font-bold transition-all shadow-sm font-serif border border-brand-gold/20"
                  >
                    <FileText className="h-3.5 w-3.5 text-brand-gold" />
                    <span>Gerar Relatório PDF</span>
                  </button>
                </div>
              )}

              {loadingData ? (
                <div className="flex flex-col items-center justify-center h-full py-16">
                  <Sparkles className="h-8 w-8 text-brand-gold animate-spin mb-2" />
                  <p className="text-[11px] font-mono text-brand-brown tracking-widest uppercase">Atualizando base CRM...</p>
                </div>
              ) : (
                <div className="h-full">
                  {activeTab === 'dashboard' && (
                    <DashboardOverview leads={localLeads} clients={clients} treatments={treatments} treatmentCatalog={treatmentCatalog} />
                  )}

                  {activeTab === 'pipeline' && (
                    <PipelineKanban 
                      leads={localLeads} 
                      onAddLead={async (data) => {
                        const statusMapping: Record<string, string> = {
                          "new": "novo",
                          "contacted": "contatado",
                          "proposal_sent": "agendado",
                          "converted": "arquivado"
                        };
                        const mappedStatus = statusMapping[data.status] || data.status || "novo";

                        await fetch("/api/leads", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: data.name,
                            whatsapp: data.phone,
                            email: data.email,
                            treatment: data.interest,
                            status: mappedStatus,
                            source: data.source || "site",
                            message: "Paciente inserido manualmente pelo Kanban comercial."
                          })
                        });
                        await fetchCrmData();
                      }} 
                      onUpdateLeadStatus={handleUpdateLeadStatus}
                      onSelectLead={(lead) => setSelectedLead(lead)}
                    />
                  )}

                  {activeTab === 'clients' && (
                    <ClientDirectory 
                      clients={clients} 
                      treatments={treatments} 
                      onAddClient={handleAddClient}
                      onAddTreatment={handleAddTreatment}
                      isAiConfigured={isAiConfigured}
                      onUpdateClientData={() => fetchCrmData(true)}
                      treatmentCatalog={treatmentCatalog}
                      onUpdateClient={handleUpdateClient}
                      onDeleteClient={handleDeleteClient}
                      treatmentPlans={treatmentPlans}
                      onAddTreatmentPlan={handleAddTreatmentPlan}
                      onUpdateTreatmentPlan={handleUpdateTreatmentPlan}
                      onDeleteTreatmentPlan={handleDeleteTreatmentPlan}
                      onUpdateTreatmentSession={handleUpdateTreatmentSession}
                    />
                  )}

                  {activeTab === 'chat' && (
                    <div className="flex flex-col h-full space-y-4">
                      <div className="flex justify-end space-x-2">
                        <button 
                          onClick={() => setChatView('crm')}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-300 ${chatView === 'crm' ? 'bg-brand-brown text-brand-beige shadow-sm scale-102 font-bold' : 'bg-brand-brown/5 text-brand-brown/85 hover:bg-brand-beige hover:text-brand-brown'}`}
                        >
                          Atendimento CRM
                        </button>
                        <button 
                          onClick={() => setChatView('evolution')}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-300 ${chatView === 'evolution' ? 'bg-brand-brown text-brand-beige shadow-sm scale-102 font-bold' : 'bg-brand-brown/5 text-brand-brown/85 hover:bg-brand-beige hover:text-brand-brown'}`}
                        >
                          Gerenciador WhatsApp
                        </button>
                      </div>
                      
                      {chatView === 'crm' ? (
                        <ChatConsole 
                          clients={clients} 
                          leads={localLeads} 
                          interactions={interactions}
                          onSendMessage={handleSendMessage}
                          isAiConfigured={isAiConfigured}
                          onDeleteLead={handleDeleteLead}
                        />
                      ) : (
                        <div className="flex-1 bg-white rounded-2xl border border-brand-gold/15 p-1 shadow-xs h-[calc(100vh-200px)] overflow-hidden">
                          <iframe 
                            src={import.meta.env.VITE_EVOLUTION_MANAGER_URL || "http://eapi.mulinotech.com/manager"}
                            className="w-full h-full border-0 rounded-xl animate-fade-in"
                            title="Evolution Manager"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'evolution' && (
                    <EvolutionHub onWebhookTriggered={fetchCrmData} />
                  )}

                  {activeTab === 'settings' && (
                    <CrmSettings />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Selected Lead Details Drawer */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="absolute inset-0 bg-brand-brown/40 backdrop-blur-xs"
            />
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-md bg-white border-l border-brand-gold/25 shadow-2xl flex flex-col h-full"
              >
                <div className="p-6 border-b border-brand-beige flex justify-between items-center bg-brand-cream/15">
                  <div>
                    <span className="text-[10px] tracking-widest uppercase font-semibold text-brand-gold font-mono">Ficha do Lead</span>
                    <h3 className="font-serif font-bold text-brand-brown text-base">{selectedLead.name}</h3>
                  </div>
                  <button onClick={() => setSelectedLead(null)} className="p-2 text-brand-brown/60 hover:text-brand-brown rounded-full">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="bg-brand-beige border border-brand-gold/15 p-4 rounded-xl space-y-4">
                    <h4 className="text-[9px] font-mono font-bold text-brand-gold uppercase tracking-wider">Contato</h4>
                    
                    {/* Phone field */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-semibold text-brand-brown/70 uppercase">Telefone</label>
                        <button 
                          type="button" 
                          onClick={() => setIsEditingPhone(!isEditingPhone)} 
                          className="p-1 text-brand-brown/60 hover:text-brand-brown hover:bg-brand-beige/50 rounded-md transition-colors cursor-pointer"
                          title="Editar Telefone"
                        >
                          <Pencil className="h-3.5 w-3.5 text-brand-gold" />
                        </button>
                      </div>
                      {isEditingPhone ? (
                        <input 
                          type="tel" 
                          value={editPhone} 
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full px-3 py-2 border border-brand-gold/30 rounded-xl text-xs text-brand-brown focus:outline-none focus:ring-2 focus:ring-brand-gold bg-white font-mono"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xs text-brand-brown font-mono">{editPhone || 'Sem telefone'}</p>
                      )}
                    </div>

                    {/* Email field */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-semibold text-brand-brown/70 uppercase">E-mail</label>
                        <button 
                          type="button" 
                          onClick={() => setIsEditingEmail(!isEditingEmail)} 
                          className="p-1 text-brand-brown/60 hover:text-brand-brown hover:bg-brand-beige/50 rounded-md transition-colors cursor-pointer"
                          title="Editar E-mail"
                        >
                          <Pencil className="h-3.5 w-3.5 text-brand-gold" />
                        </button>
                      </div>
                      {isEditingEmail ? (
                        <input 
                          type="email" 
                          value={editEmail} 
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-3 py-2 border border-brand-gold/30 rounded-xl text-xs text-brand-brown focus:outline-none focus:ring-2 focus:ring-brand-gold bg-white"
                          placeholder="Ex: paciente@email.com"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xs text-brand-brown">{editEmail || 'Sem e-mail cadastrado'}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-mono font-bold text-brand-gold uppercase tracking-wider">Procedimento Desejado</h4>
                    <div className="p-3.5 rounded-xl bg-brand-beige text-xs text-brand-brown font-serif font-semibold">
                      ✨ {selectedLead.interest}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-mono font-bold text-brand-gold uppercase tracking-wider">Mudar Estágio</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'novo', label: 'Lead Novo' },
                        { id: 'contatado', label: 'Pré-Agendado' },
                        { id: 'agendado', label: 'Proposta Enviada' },
                        { id: 'arquivado', label: 'Venda Fechada' },
                        { id: 'perdido', label: 'Perdido' },
                      ].map((stage) => {
                        const isCurrent = selectedLead.status === stage.id;
                        return (
                          <button
                            key={stage.id}
                            onClick={() => {
                              setSelectedLead(prev => prev ? { ...prev, status: stage.id as any } : null);
                            }}
                            className={`px-3 py-2 rounded-lg text-xxs font-medium transition-all text-center border ${
                              isCurrent 
                                ? 'bg-brand-brown border-brand-brown text-brand-beige font-semibold shadow-xs' 
                                : 'bg-white border-brand-gold/10 hover:border-brand-gold text-brand-brown/80'
                            }`}
                          >
                            {stage.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-6 border-t border-brand-gold/15 flex justify-end">
                    <button
                      onClick={() => {
                        if (selectedLead) {
                          handleUpdateLeadStatus(selectedLead.id, selectedLead.status as any, editPhone, editEmail);
                        }
                        setSelectedLead(null);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all flex items-center space-x-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>Salvar e Fechar</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
