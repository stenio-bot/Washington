"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { downloadPdf } from "../lib/report/download";
import type {
  AnalysisValidation,
  MetricKey,
  NormalizedSnapshot,
  ReportAnalysis,
  ReportFocus,
  ReportObjective,
  ReportTone,
} from "../lib/report/types";

type PreviewTab = "resumo" | "indicadores" | "campanhas" | "acoes" | "metodologia";
type Account = { id: string; name: string; currency: string; timezone: string };

interface ReportRunResponse {
  runId: string;
  versionId: string;
  mode: "demo_without_llm" | "real_with_llm";
  source: string;
  snapshot: NormalizedSnapshot;
  analysis: ReportAnalysis;
  validation: AnalysisValidation;
  attempts: number;
  model: string;
}

const tabs: Array<{ id: PreviewTab; label: string; page: number }> = [
  { id: "resumo", label: "Resumo", page: 1 },
  { id: "indicadores", label: "Indicadores", page: 2 },
  { id: "campanhas", label: "Campanhas", page: 3 },
  { id: "acoes", label: "Ações", page: 4 },
  { id: "metodologia", label: "Metodologia", page: 5 },
];

function previousEquivalent(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const duration = endDate.getTime() - startDate.getTime();
  const previousEnd = new Date(startDate.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - duration);
  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
}

function centralMetricRefs(objective: ReportObjective): MetricKey[] {
  return objective === "ecommerce"
    ? ["spend", "purchaseValue", "roas", "costPerPurchase"]
    : ["spend", "leads", "costPerLead", "ctr"];
}

function reportFilename(clientName: string) {
  const safe = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `projeto-washington-${safe || "relatorio"}.pdf`;
}

export default function Home() {
  const [objective, setObjective] = useState<ReportObjective>("ecommerce");
  const [tab, setTab] = useState<PreviewTab>("resumo");
  const [demo, setDemo] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [clientName, setClientName] = useState("Loja Aurora");
  const [periodStart, setPeriodStart] = useState("2026-07-01");
  const [periodEnd, setPeriodEnd] = useState("2026-07-31");
  const [compare, setCompare] = useState(true);
  const [tone, setTone] = useState<ReportTone>("executivo");
  const [focus, setFocus] = useState<ReportFocus>("geral");
  const [context, setContext] = useState("");
  const [report, setReport] = useState<ReportRunResponse | null>(null);
  const [draft, setDraft] = useState<ReportAnalysis | null>(null);
  const [busy, setBusy] = useState<"accounts" | "generating" | "approving" | null>(null);
  const [error, setError] = useState("");
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setBusy("accounts");
        setError("");
        return fetch(`/api/meta/accounts${demo ? "?demo=1" : ""}`);
      })
      .then(async (response) => {
        if (!response) return [];
        const payload = (await response.json()) as { accounts?: Account[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível listar as contas.");
        return payload.accounts ?? [];
      })
      .then((items) => {
        if (!active) return;
        setAccounts(items);
        setAccountId(items[0]?.id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) {
          setAccounts([]);
          setAccountId("");
          setError(reason instanceof Error ? reason.message : "Não foi possível listar as contas.");
        }
      })
      .finally(() => active && setBusy(null));
    return () => {
      active = false;
    };
  }, [demo]);

  function chooseObjective(nextObjective: ReportObjective) {
    setObjective(nextObjective);
    if (!demo) return;
    const preferred = nextObjective === "ecommerce" ? accounts[0] : accounts[1] ?? accounts[0];
    if (preferred) setAccountId(preferred.id);
    setClientName(nextObjective === "ecommerce" ? "Loja Aurora" : "Clínica Horizonte");
  }

  const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const objectiveLabel = objective === "ecommerce" ? "E-commerce" : "Geração de leads";
  const currentPage = tabs.find((item) => item.id === tab)?.page ?? 1;
  const metrics = useMemo(() => {
    if (!report) return [];
    return centralMetricRefs(report.snapshot.config.objective).map(
      (key) => report.snapshot.evidence[`account.${key}`],
    );
  }, [report]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return setError("Selecione uma conta de anúncios.");
    setBusy("generating");
    setError("");
    setExported(false);
    try {
      const response = await fetch("/api/report-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demo,
          clientId: clientName.toLowerCase().replace(/\W+/g, "_") || "cliente",
          clientName,
          accountId: selectedAccount.id,
          accountName: selectedAccount.name,
          objective,
          period: { start: periodStart, end: periodEnd },
          comparisonPeriod: compare ? previousEquivalent(periodStart, periodEnd) : null,
          tone,
          focus,
          context,
          goals: {},
        }),
      });
      const payload = (await response.json()) as ReportRunResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o relatório.");
      setReport(payload);
      setDraft(structuredClone(payload.analysis));
      setTab("resumo");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o relatório.");
    } finally {
      setBusy(null);
    }
  }

  async function approveAndExport() {
    if (!report || !draft) return;
    setBusy("approving");
    setError("");
    try {
      const approval = await fetch(`/api/report-runs/${report.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: report.versionId, analysis: draft }),
      });
      const approvalPayload = (await approval.json()) as { error?: string };
      if (!approval.ok) throw new Error(approvalPayload.error ?? "A aprovação falhou.");

      const upload = await fetch(`/api/report-runs/${report.runId}/artifact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: report.versionId }),
      });
      if (!upload.ok) {
        const uploadPayload = (await upload.json()) as { error?: string };
        throw new Error(uploadPayload.error ?? "A geração do PDF falhou.");
      }
      const pdf = await upload.blob();
      downloadPdf(pdf, reportFilename(report.snapshot.config.clientName));
      setExported(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível aprovar e gerar o PDF.");
    } finally {
      setBusy(null);
    }
  }

  function updateSummary(value: string) {
    setDraft((current) => (current ? { ...current, executiveSummary: value } : current));
  }

  function updateRecommendation(index: number, action: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        recommendations: current.recommendations.map((item, itemIndex) =>
          itemIndex === index ? { ...item, action } : item,
        ),
      };
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand"><span className="brand-dot" aria-hidden="true" /><span>Projeto Washington</span></div>
        <nav className="nav-list">
          <button className="nav-item active" type="button"><span className="nav-symbol">⌁</span>Novo relatório</button>
          <button className="nav-item" type="button"><span className="nav-symbol">▦</span>Histórico</button>
          <button className="nav-item" type="button"><span className="nav-symbol">◎</span>Clientes e contas</button>
        </nav>
        <div className="connection-card">
          <div className="connection-heading"><span className={`status-dot ${demo ? "demo" : ""}`} aria-hidden="true" />{demo ? "Demonstração ativa" : "Conexão real"}</div>
          <p>{accounts.length} conta(s) disponível(is)</p>
          <button type="button" onClick={() => setDemo((value) => !value)}>{demo ? "Usar Meta + LLM" : "Voltar à demonstração"}</button>
        </div>
        <div className="user-card"><div className="avatar">PW</div><div><strong>Equipe interna</strong><span>Ambiente privado</span></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">RELATÓRIOS META ADS</p><h1>Novo relatório</h1><p className="subtitle">Extração, métricas determinísticas, análise validada e PDF em cinco páginas.</p></div>
          <div className="topbar-actions">
            <span className={`demo-badge ${demo ? "" : "real"}`}>{demo ? "Demonstração • sem chamada à LLM" : "Meta real • análise por LLM"}</span>
          </div>
        </header>

        {error && <div className="error-banner" role="alert"><strong>Não foi possível concluir.</strong><span>{error}</span></div>}

        <div className="content-grid">
          <form className="config-panel glass-panel" onSubmit={handleGenerate}>
            <div className="panel-heading"><div><span className="step">01</span><h2>Configuração</h2></div><span className="required-note">* obrigatório</span></div>
            <label>Cliente<input value={clientName} onChange={(event) => setClientName(event.target.value)} required /></label>
            <label>Conta de anúncios<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy === "accounts" || accounts.length === 0}>{accounts.length === 0 && <option value="">Nenhuma conta disponível</option>}{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
            <fieldset><legend>Objetivo</legend><div className="segmented-control"><button type="button" className={objective === "ecommerce" ? "selected" : ""} onClick={() => chooseObjective("ecommerce")}>E-commerce</button><button type="button" className={objective === "leads" ? "selected" : ""} onClick={() => chooseObjective("leads")}>Leads</button></div></fieldset>
            <div className="date-grid"><label>Data inicial *<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label><label>Data final *<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label></div>
            <label className="checkbox-row"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /><span>Comparar com período anterior equivalente<small>{compare ? `${previousEquivalent(periodStart, periodEnd).start} a ${previousEquivalent(periodStart, periodEnd).end}` : "Comparação desativada"}</small></span></label>
            <div className="field-grid"><label>Tom<select value={tone} onChange={(event) => setTone(event.target.value as ReportTone)}><option value="executivo">Executivo</option><option value="consultivo">Consultivo</option><option value="direto">Direto</option></select></label><label>Foco<select value={focus} onChange={(event) => setFocus(event.target.value as ReportFocus)}><option value="geral">Visão geral</option><option value="eficiencia">Eficiência</option><option value="escala">Escala</option><option value="criativos">Criativos</option></select></label></div>
            <label>Contexto de outras fontes <span className="optional">opcional</span><textarea rows={3} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Ex.: promoção no período, CRM mostra queda na qualidade dos leads..." /></label>
            <div className="attribution-note"><span>i</span><p><strong>Somente leitura:</strong> o sistema consulta dados, mas não altera campanhas. A janela de atribuição será capturada e exibida no relatório.</p></div>
            <button className="primary-button" type="submit" disabled={Boolean(busy) || !selectedAccount}>{busy === "generating" ? "Extraindo e analisando..." : report ? "Gerar novamente" : "Gerar relatório"}<span aria-hidden="true">→</span></button>
          </form>

          <section className="preview-panel glass-panel" aria-label="Prévia do relatório">
            <div className="panel-heading preview-heading"><div><span className="step">02</span><h2>Prévia do output</h2></div><span className={`run-status ${report ? "ready" : ""}`}>{report ? `Validado • ${report.snapshot.quality.score}%` : "Aguardando geração"}</span></div>
            <div className="report-toolbar"><div className="preview-tabs" role="tablist" aria-label="Seções do relatório">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div><span>Página {currentPage} de 5</span></div>

            {!report || !draft ? (
              <article className="report-sheet empty-report"><div><span className="empty-mark">W</span><h3>Configure e gere o primeiro relatório</h3><p>Os números serão calculados antes da análise. Qualquer divergência da LLM será bloqueada antes da revisão.</p></div></article>
            ) : (
              <article className="report-sheet">
                <div className="report-header"><div className="mini-brand"><span /> PROJETO WASHINGTON</div><span>{objectiveLabel}</span></div>
                {tab === "resumo" && <><div className="report-title-row"><div><p>RELATÓRIO DE PERFORMANCE</p><h3>{report.snapshot.config.clientName}</h3><span>{report.snapshot.config.period.start}–{report.snapshot.config.period.end} vs. período anterior</span></div><span className="quality-score">Qualidade dos dados: {report.snapshot.quality.score}%</span></div><div className="executive-summary"><span>LEITURA EXECUTIVA • EDITÁVEL</span><textarea value={draft.executiveSummary} onChange={(event) => updateSummary(event.target.value)} /></div><div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.ref}><span>{metric.label}</span><strong>{metric.formattedCurrent}</strong><small className={metric.percentChange !== null && metric.percentChange < 0 ? "attention" : "positive"}>{metric.formattedPercentChange}</small></div>)}</div><div className="evidence-strip"><div><span>Fato</span><p>{draft.facts[0]?.text}</p></div><div><span>Hipótese</span><p>{draft.hypotheses[0]?.text}</p></div><div><span>Validação</span><p>{draft.hypotheses[0]?.validation}</p></div></div></>}
                {tab === "indicadores" && <div className="report-section"><p className="section-kicker">INDICADORES</p><h3>O que mudou nos números</h3><div className="claim-list">{draft.facts.map((fact) => <div key={fact.text}><span>Fato</span><p>{fact.text}</p></div>)}{draft.interpretations.map((item) => <div key={item.text}><span>Leitura</span><p>{item.text}</p></div>)}</div></div>}
                {tab === "campanhas" && <div className="report-section"><p className="section-kicker">DISTRIBUIÇÃO</p><h3>Onde o resultado foi produzido</h3><p className="section-intro">Somente campanhas com contribuição, investimento ou comportamento relevante.</p><div className="campaign-table"><div className="campaign-row table-head"><span>Campanha</span><span>Investimento</span><span>Resultado</span><span>Classificação</span></div>{report.snapshot.campaigns.slice(0, 6).map((campaign) => { const resultRef = report.snapshot.config.objective === "ecommerce" ? `campaign.${campaign.id}.purchaseValue` : `campaign.${campaign.id}.leads`; return <div className="campaign-row" key={campaign.id}><span><strong>{campaign.name}</strong><small>{Math.round((campaign.shareOfSpend ?? 0) * 100)}% da verba</small></span><span>{report.snapshot.evidence[`campaign.${campaign.id}.spend`].formattedCurrent}</span><span>{report.snapshot.evidence[resultRef].formattedCurrent}</span><span className={campaign.classification === "attention" ? "attention" : campaign.classification === "highlight" ? "positive" : ""}>{campaign.classification.replaceAll("_", " ")}</span></div>; })}</div><div className="editor-note">{draft.campaignHighlights.map((item) => item.text).join(" ")}</div></div>}
                {tab === "acoes" && <div className="report-section"><p className="section-kicker">PRIORIDADES</p><h3>Até três ações para avaliar</h3><p className="section-intro">Recomendações baseadas nos dados. Nenhuma alteração foi executada na conta.</p><div className="action-list">{draft.recommendations.map((action, index) => <div className="action-card" key={`${action.priority}-${index}`}><span className="action-number">{index + 1}</span><div><textarea value={action.action} onChange={(event) => updateRecommendation(index, event.target.value)} /><p>{action.rationale}</p><small>Risco: {action.risk}</small></div><span className={`impact ${action.priority === "media" ? "medium" : ""}`}>{action.priority}</span></div>)}</div></div>}
                {tab === "metodologia" && <div className="report-section"><p className="section-kicker">METODOLOGIA</p><h3>Até onde confiar nesta leitura</h3><div className="method-grid"><div><span>Fonte</span><strong>{report.source}</strong></div><div><span>Atribuição</span><strong>{report.snapshot.account.attribution.description}</strong></div><div><span>Moeda e fuso</span><strong>{report.snapshot.account.currency} • {report.snapshot.account.timezone}</strong></div><div><span>Validação</span><strong>{report.validation.checkedEvidenceRefs.length} referências verificadas</strong></div></div><div className="limitations"><strong>Limitações</strong>{draft.limitations.map((item) => <p key={item}>• {item}</p>)}</div></div>}
                <footer className="report-footer"><span>{report.mode === "real_with_llm" ? `Análise ${report.model}` : "Análise de referência sem LLM"}</span><span>Snapshot {report.snapshot.sourceHash.slice(0, 10)}</span></footer>
              </article>
            )}

            <div className="preview-actions"><div><span className="lock-icon" aria-hidden="true">◇</span><p><strong>Texto editável</strong><small>Métricas permanecem bloqueadas.</small></p></div><button className="primary-button compact" type="button" onClick={approveAndExport} disabled={!report || busy === "approving"}>{busy === "approving" ? "Validando e gerando..." : exported ? "PDF armazenado" : "Aprovar e gerar PDF"}</button></div>
          </section>
        </div>
      </section>
    </main>
  );
}
