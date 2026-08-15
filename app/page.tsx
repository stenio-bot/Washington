"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { downloadPdf } from "../lib/report/download";
import { performanceLabels } from "../lib/report/performance";
import type {
  AnalysisValidation,
  EvidenceMetric,
  MetricKey,
  NormalizedSnapshot,
  PerformanceStatusSelection,
  ReportAnalysis,
  ReportAudience,
  ReportFocus,
  ReportObjective,
  ReportTone,
  TaxonomyDimension,
  TaxonomyMode,
} from "../lib/report/types";

type PreviewTab = "overview" | "diagnosis" | "plan" | "outlook" | "followup";
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

const clientTabs: Array<{ id: PreviewTab; label: string; page: number }> = [
  { id: "overview", label: "Onde estamos", page: 1 },
  { id: "diagnosis", label: "Diagnóstico", page: 2 },
  { id: "plan", label: "Plano", page: 3 },
  { id: "outlook", label: "Expectativa", page: 4 },
  { id: "followup", label: "Próxima leitura", page: 5 },
];

const internalTabs: Array<{ id: PreviewTab; label: string; page: number }> = [
  { id: "overview", label: "Resumo", page: 1 },
  { id: "diagnosis", label: "Indicadores", page: 2 },
  { id: "plan", label: "Ações", page: 3 },
  { id: "outlook", label: "Hipóteses", page: 4 },
  { id: "followup", label: "Pendências", page: 5 },
];

const campaignLabels = {
  highlight: "Destaque",
  attention: "Atenção",
  stable: "Estável",
  insufficient_volume: "Volume insuficiente",
};

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

function metricTrendClass(metric: EvidenceMetric) {
  if (metric.percentChange === null || metric.metric === "spend") return "neutral";
  const lowerIsBetter = ["costPerPurchase", "costPerLead", "cpc", "cpm"].includes(metric.metric);
  const favorable = lowerIsBetter ? metric.percentChange <= 0 : metric.percentChange >= 0;
  return favorable ? "positive" : "attention";
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

function coverageLabel(value: number | null) {
  if (value === null) return "Sem dados";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value * 100)}% classificado`;
}

export default function Home() {
  const [objective, setObjective] = useState<ReportObjective>("ecommerce");
  const [audience, setAudience] = useState<ReportAudience>("client");
  const [performanceStatus, setPerformanceStatus] =
    useState<PerformanceStatusSelection>("auto");
  const [tab, setTab] = useState<PreviewTab>("overview");
  const [demo, setDemo] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [clientName, setClientName] = useState("Loja Aurora");
  const [periodStart, setPeriodStart] = useState("2026-07-01");
  const [periodEnd, setPeriodEnd] = useState("2026-07-31");
  const [compare, setCompare] = useState(true);
  const [tone, setTone] = useState<ReportTone>("executivo");
  const [focus, setFocus] = useState<ReportFocus>("geral");
  const [taxonomyMode, setTaxonomyMode] = useState<TaxonomyMode>("strict");
  const [context, setContext] = useState(
    "O cliente realizou uma promoção sazonal durante a segunda quinzena.",
  );
  const [actionsTaken, setActionsTaken] = useState(
    "Meta: verba concentrada nas campanhas com melhor eficiência. Ajuste aplicado em 11/08.",
  );
  const [nextSteps, setNextSteps] = useState(
    "Acompanhar a nova composição e revisar eficiência antes de ampliar verba.",
  );
  const [pendingInputs, setPendingInputs] = useState(
    "Confirmar receita, valor médio por pedido e margem fora do Meta.",
  );
  const [nextReviewDate, setNextReviewDate] = useState("2026-08-18");
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
        if (!active) return;
        setAccounts([]);
        setAccountId("");
        setError(reason instanceof Error ? reason.message : "Não foi possível listar as contas.");
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
    setContext(
      nextObjective === "ecommerce"
        ? "O cliente realizou uma promoção sazonal durante a segunda quinzena."
        : "A qualidade comercial dos leads ainda precisa ser validada no CRM.",
    );
    setPendingInputs(
      nextObjective === "ecommerce"
        ? "Confirmar receita, valor médio por pedido e margem fora do Meta."
        : "Confirmar qualidade, oportunidades e vendas no CRM.",
    );
  }

  const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const objectiveLabel = objective === "ecommerce" ? "E-commerce" : "Geração de leads";
  const reportAudience = report?.snapshot.config.audience ?? audience;
  const tabs = reportAudience === "client" ? clientTabs : internalTabs;
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
          audience,
          performanceStatus,
          taxonomyMode,
          period: { start: periodStart, end: periodEnd },
          comparisonPeriod: compare ? previousEquivalent(periodStart, periodEnd) : null,
          tone,
          focus,
          context,
          actionsTaken,
          nextSteps,
          pendingInputs,
          nextReviewDate,
          goals: {},
        }),
      });
      const payload = (await response.json()) as ReportRunResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o relatório.");
      setReport(payload);
      setDraft(structuredClone(payload.analysis));
      setTab("overview");
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
      downloadPdf(await upload.blob(), reportFilename(report.snapshot.config.clientName));
      setExported(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível aprovar e gerar o PDF.");
    } finally {
      setBusy(null);
    }
  }

  function updateSummary(value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            executiveSummary: value,
            narrative: {
              ...current.narrative,
              whereWeAre: { ...current.narrative.whereWeAre, text: value },
            },
          }
        : current,
    );
  }

  function updateRecommendation(index: number, action: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            recommendations: current.recommendations.map((item, itemIndex) =>
              itemIndex === index ? { ...item, action } : item,
            ),
          }
        : current,
    );
  }

  function taxonomyBlock(dimension: TaxonomyDimension) {
    if (!report) return null;
    const analysis = report.snapshot.creativeAnalysis;
    const coverage = analysis.coverage[dimension];
    const title = dimension === "audience" ? "Por tipo de público" : "Por formato de anúncio";
    const resultMetric = report.snapshot.config.objective === "ecommerce" ? "purchases" : "leads";
    const efficiencyMetric = report.snapshot.config.objective === "ecommerce" ? "roas" : "costPerLead";
    const sourceRows = dimension === "audience" ? analysis.audience : analysis.format;
    const rows = sourceRows
      .filter((item) => reportAudience === "internal" || item.key !== "unclassified")
      .slice(0, 5);

    return (
      <div className="taxonomy-block">
        <div className="taxonomy-block-heading">
          <h4>{title}</h4>
          <span className={coverage.eligibleForNarrative ? "coverage-ready" : "coverage-low"}>
            {coverageLabel(coverage.rateBySpend)}
          </span>
        </div>
        {reportAudience === "client" && !coverage.eligibleForNarrative ? (
          <p className="taxonomy-empty">
            A nomenclatura ainda não cobre investimento suficiente para uma conclusão segura.
          </p>
        ) : rows.length === 0 ? (
          <p className="taxonomy-empty">Nenhum anúncio classificado neste recorte.</p>
        ) : (
          <div className="taxonomy-table">
            <div className="taxonomy-row taxonomy-head">
              <span>Grupo</span><span>Investimento</span><span>Resultados</span><span>Eficiência</span>
            </div>
            {rows.map((item) => {
              const prefix = `breakdown.${dimension}.${item.key}`;
              return (
                <div className="taxonomy-row" key={`${dimension}-${item.key}`}>
                  <span><strong>{item.label}</strong><small>{item.adCount} anúncio(s)</small></span>
                  <span>{report.snapshot.evidence[`${prefix}.spend`].formattedCurrent}</span>
                  <span>{report.snapshot.evidence[`${prefix}.${resultMetric}`].formattedCurrent}</span>
                  <span>{report.snapshot.evidence[`${prefix}.${efficiencyMetric}`].formattedCurrent}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
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
          <div><p className="eyebrow">RELATÓRIOS META ADS</p><h1>Novo relatório</h1><p className="subtitle">O mesmo dado, com linguagem adequada ao cliente ou à equipe.</p></div>
          <div className="topbar-actions"><span className={`demo-badge ${demo ? "" : "real"}`}>{demo ? "Demonstração • sem LLM" : "Meta real • análise por LLM"}</span></div>
        </header>

        {error && <div className="error-banner" role="alert"><strong>Não foi possível concluir.</strong><span>{error}</span></div>}

        <div className="content-grid">
          <form className="config-panel glass-panel" onSubmit={handleGenerate}>
            <div className="panel-heading"><div><span className="step">01</span><h2>Configuração</h2></div><span className="required-note">* obrigatório</span></div>
            <label>Cliente<input value={clientName} onChange={(event) => setClientName(event.target.value)} required /></label>
            <label>Conta de anúncios<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy === "accounts" || accounts.length === 0}>{accounts.length === 0 && <option value="">Nenhuma conta disponível</option>}{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>

            <fieldset>
              <legend>Destinatário do relatório</legend>
              <div className="segmented-control">
                <button type="button" className={audience === "client" ? "selected" : ""} onClick={() => setAudience("client")}>Cliente</button>
                <button type="button" className={audience === "internal" ? "selected" : ""} onClick={() => setAudience("internal")}>Equipe interna</button>
              </div>
              <p className="field-help">Cliente recebe linguagem simples e perspectiva condicional. Interno recebe hipóteses, riscos e pendências.</p>
            </fieldset>

            <fieldset><legend>Objetivo</legend><div className="segmented-control"><button type="button" className={objective === "ecommerce" ? "selected" : ""} onClick={() => chooseObjective("ecommerce")}>E-commerce</button><button type="button" className={objective === "leads" ? "selected" : ""} onClick={() => chooseObjective("leads")}>Leads</button></div></fieldset>
            <div className="date-grid"><label>Data inicial *<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label><label>Data final *<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label></div>
            <label className="checkbox-row"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /><span>Comparar com período anterior equivalente<small>{compare ? `${previousEquivalent(periodStart, periodEnd).start} a ${previousEquivalent(periodStart, periodEnd).end}` : "Comparação desativada"}</small></span></label>

            <div className="field-grid">
              <label>Leitura do resultado<select value={performanceStatus} onChange={(event) => setPerformanceStatus(event.target.value as PerformanceStatusSelection)}><option value="auto">Automática (recomendado)</option><option value="critical">Crítico</option><option value="attention">Atenção</option><option value="recovery">Em recuperação</option><option value="stable">Estável</option><option value="strong">Positivo</option></select></label>
              <label>Estilo de escrita<select value={tone} onChange={(event) => setTone(event.target.value as ReportTone)}><option value="executivo">Executivo</option><option value="consultivo">Consultivo</option><option value="direto">Direto</option></select></label>
            </div>
            <label>Foco da análise<select value={focus} onChange={(event) => setFocus(event.target.value as ReportFocus)}><option value="geral">Visão geral</option><option value="eficiencia">Eficiência</option><option value="escala">Escala</option><option value="criativos">Criativos</option></select></label>

            <label>Leitura da nomenclatura<select value={taxonomyMode} onChange={(event) => setTaxonomyMode(event.target.value as TaxonomyMode)}><option value="strict">Estrita — sem inferência</option><option value="disabled">Desativada</option></select></label>
            <div className="naming-guide"><strong>Padrão Washington v1</strong><span>[PÚBLICO] [FORMATO] Nome livre</span><small>Ex.: [FRIO] [VIDEO] Prova social 01. O que não corresponder fica como “não classificado”.</small></div>

            <div className="form-divider"><span>Brief operacional</span><small>A LLM não inventa o que não estiver aqui.</small></div>
            <label>Contexto do período <span className="optional">opcional</span><textarea rows={2} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Ex.: promoção, mudança de oferta, falha de página ou contexto do CRM." /></label>
            <label>Ações já realizadas <span className="optional">opcional</span><textarea rows={2} value={actionsTaken} onChange={(event) => setActionsTaken(event.target.value)} placeholder="Ex.: Campanha X — orçamento ampliado em 11/08." /></label>
            <label>Próximos passos <span className="optional">opcional</span><textarea rows={2} value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} placeholder="Ex.: acompanhar por sete dias e revisar a distribuição." /></label>
            <div className="date-grid"><label>Próxima leitura<input type="date" value={nextReviewDate} onChange={(event) => setNextReviewDate(event.target.value)} /></label><label>Pendências internas<textarea rows={2} value={pendingInputs} onChange={(event) => setPendingInputs(event.target.value)} placeholder="Ex.: margem, CRM, detalhe do ajuste." /></label></div>
            <p className="privacy-note">Pendências internas nunca aparecem na versão para cliente.</p>

            <div className="attribution-note"><span>i</span><p><strong>Somente leitura:</strong> métricas são calculadas antes da LLM. Ações realizadas só aparecem quando informadas pela equipe.</p></div>
            <button className="primary-button" type="submit" disabled={Boolean(busy) || !selectedAccount}>{busy === "generating" ? "Extraindo e analisando..." : report ? "Gerar novamente" : "Gerar relatório"}<span aria-hidden="true">→</span></button>
          </form>

          <section className="preview-panel glass-panel" aria-label="Prévia do relatório">
            <div className="panel-heading preview-heading"><div><span className="step">02</span><h2>Prévia do output</h2></div><span className={`run-status ${report ? "ready" : ""}`}>{report ? `Validado • ${report.snapshot.quality.score}%` : "Aguardando geração"}</span></div>
            <div className="report-toolbar"><div className="preview-tabs" role="tablist" aria-label="Seções do relatório">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div><span>Página {currentPage} de 5</span></div>

            {!report || !draft ? (
              <article className="report-sheet empty-report"><div><span className="empty-mark">W</span><h3>Configure o destinatário e gere o relatório</h3><p>O tom muda conforme o resultado, mas fatos, métricas e limitações permanecem iguais.</p></div></article>
            ) : (
              <article className={`report-sheet status-${report.snapshot.performance.status}`}>
                <div className="report-header"><div className="mini-brand"><span /> PROJETO WASHINGTON</div><span>{reportAudience === "client" ? "Versão para cliente" : "Uso interno"} • {objectiveLabel}</span></div>

                {tab === "overview" && <>
                  <div className="report-title-row"><div><p>ATUALIZAÇÃO DE PERFORMANCE</p><h3>{report.snapshot.config.clientName}</h3><span>{report.snapshot.config.period.start}–{report.snapshot.config.period.end} vs. período anterior</span></div><span className={`performance-pill ${report.snapshot.performance.status}`}>{performanceLabels[report.snapshot.performance.status]}</span></div>
                  <div className="status-headline"><span>LEITURA DO PERÍODO</span><h4>{draft.narrative.headline}</h4></div>
                  <div className="executive-summary"><span>ONDE ESTAMOS • EDITÁVEL</span><textarea value={draft.executiveSummary} onChange={(event) => updateSummary(event.target.value)} /></div>
                  <div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.ref}><span>{metric.label}</span><strong>{metric.formattedCurrent}</strong><small className={metricTrendClass(metric)}>{metric.formattedPercentChange}</small></div>)}</div>
                  <p className="status-rationale">{report.snapshot.performance.rationale}</p>
                </>}

                {tab === "diagnosis" && <div className="report-section">
                  <p className="section-kicker">O QUE IDENTIFICAMOS</p>
                  <h3>{reportAudience === "client" ? "Os pontos que explicam a leitura" : "Sinais, recortes e hipóteses"}</h3>
                  <div className="claim-list">
                    {draft.narrative.findings.map((finding, index) => <div key={`${finding.text}-${index}`}><span>Ponto {index + 1}</span><p>{finding.text}</p></div>)}
                    {reportAudience === "internal" && draft.interpretations.map((item) => <div key={item.text}><span>Interpretação</span><p>{item.text}</p></div>)}
                  </div>
                  {report.snapshot.creativeAnalysis.mode === "strict" && <div className="taxonomy-analysis">
                    <div className="taxonomy-intro"><div><strong>Leitura por nomenclatura</strong><span>Recortes determinísticos; não representam o targeting real do Meta.</span></div><span>{report.snapshot.creativeAnalysis.rulesVersion}</span></div>
                    {taxonomyBlock("audience")}
                    {taxonomyBlock("format")}
                  </div>}
                  {reportAudience === "internal" && <div className="hypothesis-box"><strong>Hipóteses a validar</strong>{draft.hypotheses.map((item) => <p key={item.text}>{item.text}<small>Como validar: {item.validation}</small></p>)}</div>}
                </div>}

                {tab === "plan" && <div className="report-section"><p className="section-kicker">PLANO DE AÇÃO</p><h3>O que foi feito e o que vem agora</h3><div className="plan-columns"><div><h4>O que já foi feito</h4>{draft.narrative.actionsTaken.length === 0 ? <p className="empty-section">Nenhuma ação foi confirmada pela equipe.</p> : draft.narrative.actionsTaken.map((item) => <div className="operational-card" key={`${item.title}-${item.status}`}><div><strong>{item.title}</strong><p>{item.detail}</p></div><span className={`operation-status ${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>)}</div><div><h4>Próximos passos</h4>{draft.narrative.nextSteps.map((item) => <div className="operational-card" key={`${item.title}-${item.status}`}><div><strong>{item.title}</strong><p>{item.detail}</p></div><span className={`operation-status ${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>)}</div></div></div>}

                {tab === "outlook" && <div className="report-section"><p className="section-kicker">O QUE ESPERAR</p><h3>{reportAudience === "client" ? "Perspectiva, sem promessa" : "Cenário e decisões de mídia"}</h3><div className="outlook-list">{draft.narrative.outlook.map((item, index) => <div key={`${item.text}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item.text}</p></div>)}</div><div className="action-list">{draft.recommendations.map((action, index) => <div className="action-card" key={`${action.priority}-${index}`}><span className="action-number">{index + 1}</span><div><textarea value={action.action} onChange={(event) => updateRecommendation(index, event.target.value)} /><p>{action.rationale}</p><small>Risco: {action.risk}</small><small>Como validar: {action.validation}</small></div><span className={`impact ${action.priority === "media" ? "medium" : ""}`}>{action.priority}</span></div>)}</div></div>}

                {tab === "followup" && <div className="report-section"><p className="section-kicker">PRÓXIMA LEITURA</p><h3>O próximo marco de decisão</h3><div className="next-review-card"><span>QUANDO E POR QUÊ</span><p>{draft.narrative.nextReview.text}</p></div>{reportAudience === "internal" ? <><div className="internal-needs"><strong>O que ainda precisamos</strong>{draft.narrative.internalNeeds.length === 0 ? <p>Nenhuma pendência interna declarada.</p> : draft.narrative.internalNeeds.map((item) => <p key={item.text}>{item.text}</p>)}</div><div className="campaign-table compact-table"><div className="campaign-row table-head"><span>Campanha</span><span>Investimento</span><span>Eficiência</span><span>Leitura</span></div>{report.snapshot.campaigns.slice(0, 5).map((campaign) => { const efficiencyRef = report.snapshot.config.objective === "ecommerce" ? `campaign.${campaign.id}.roas` : `campaign.${campaign.id}.costPerLead`; return <div className="campaign-row" key={campaign.id}><span><strong>{campaign.name}</strong></span><span>{report.snapshot.evidence[`campaign.${campaign.id}.spend`].formattedCurrent}</span><span>{report.snapshot.evidence[efficiencyRef].formattedCurrent}</span><span>{campaignLabels[campaign.classification]}</span></div>; })}</div></> : <><div className="method-grid"><div><span>Fonte</span><strong>{report.source}</strong></div><div><span>Atribuição</span><strong>{report.snapshot.account.attribution.description}</strong></div><div><span>Moeda e fuso</span><strong>{report.snapshot.account.currency} • {report.snapshot.account.timezone}</strong></div><div><span>Validação</span><strong>{report.validation.checkedEvidenceRefs.length} referências verificadas</strong></div></div><div className="limitations"><strong>Limitações da leitura</strong>{draft.limitations.map((item) => <p key={item}>• {item}</p>)}</div></>}</div>}

                <footer className="report-footer"><span>{report.mode === "real_with_llm" ? `Análise ${report.model}` : "Análise de referência sem LLM"}</span><span>Snapshot {report.snapshot.sourceHash.slice(0, 10)}</span></footer>
              </article>
            )}

            <div className="preview-actions"><div><span className="lock-icon" aria-hidden="true">◇</span><p><strong>Texto revisável</strong><small>Métricas e status permanecem bloqueados.</small></p></div><button className="primary-button compact" type="button" onClick={approveAndExport} disabled={!report || busy === "approving"}>{busy === "approving" ? "Validando e gerando..." : exported ? "PDF armazenado" : "Aprovar e gerar PDF"}</button></div>
          </section>
        </div>
      </section>
    </main>
  );
}
