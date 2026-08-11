"use client";

import { FormEvent, useMemo, useState } from "react";

type Objective = "ecommerce" | "leads";
type PreviewTab = "resumo" | "campanhas" | "acoes";

const ecommerceMetrics = [
  { label: "Investimento", value: "R$ 48,2 mil", delta: "+12,4%", tone: "positive" },
  { label: "Receita atribuída", value: "R$ 178,5 mil", delta: "+18,9%", tone: "positive" },
  { label: "ROAS", value: "3,70", delta: "+5,8%", tone: "positive" },
  { label: "Custo por compra", value: "R$ 77,54", delta: "+2,5%", tone: "attention" },
];

const leadMetrics = [
  { label: "Investimento", value: "R$ 21,8 mil", delta: "+8,1%", tone: "positive" },
  { label: "Leads", value: "684", delta: "+14,7%", tone: "positive" },
  { label: "Custo por lead", value: "R$ 31,87", delta: "-5,8%", tone: "positive" },
  { label: "CTR do link", value: "1,92%", delta: "+0,18 pp", tone: "positive" },
];

const campaignRows = [
  { name: "Advantage+ Shopping", spend: "R$ 18,4 mil", result: "R$ 78,4 mil", efficiency: "4,25", status: "Destaque" },
  { name: "Remarketing 30d", spend: "R$ 8,1 mil", result: "R$ 35,3 mil", efficiency: "4,35", status: "Destaque" },
  { name: "Prospecting Video", spend: "R$ 12,8 mil", result: "R$ 37,5 mil", efficiency: "2,94", status: "Atenção" },
];

const actions = [
  {
    title: "Proteger o ganho de eficiência",
    detail: "Manter Advantage+ como principal motor e avaliar uma realocação gradual de até 10% da verba.",
    impact: "Alto",
  },
  {
    title: "Renovar a prospecção",
    detail: "Revisar criativos das campanhas com custo acima da meta antes de ampliar investimento.",
    impact: "Alto",
  },
  {
    title: "Validar o valor dos pedidos",
    detail: "Confirmar ticket médio e atribuição antes de tratar o crescimento como tendência consolidada.",
    impact: "Médio",
  },
];

export default function Home() {
  const [objective, setObjective] = useState<Objective>("ecommerce");
  const [tab, setTab] = useState<PreviewTab>("resumo");
  const [generated, setGenerated] = useState(false);
  const [exported, setExported] = useState(false);
  const [clientName, setClientName] = useState("Loja Aurora");

  const metrics = objective === "ecommerce" ? ecommerceMetrics : leadMetrics;
  const objectiveLabel = objective === "ecommerce" ? "E-commerce" : "Geração de leads";

  const summary = useMemo(() => {
    if (objective === "leads") {
      return "O volume de leads cresceu acima do investimento e reduziu o CPL. A próxima ação é validar qualidade comercial antes de aumentar a verba.";
    }
    return "A receita cresceu acima do investimento e elevou o ROAS para 3,70. O ganho veio de Advantage+ e remarketing, enquanto a prospecção pede revisão criativa.";
  }, [objective]);

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerated(true);
    setExported(false);
    setTab("resumo");
  }

  function handleExport() {
    setExported(true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span>Projeto Washington</span>
        </div>

        <nav className="nav-list">
          <button className="nav-item active" type="button">
            <span className="nav-symbol">⌁</span>
            Novo relatório
          </button>
          <button className="nav-item" type="button">
            <span className="nav-symbol">▦</span>
            Histórico
          </button>
          <button className="nav-item" type="button">
            <span className="nav-symbol">◎</span>
            Clientes e contas
          </button>
        </nav>

        <div className="connection-card">
          <div className="connection-heading">
            <span className="status-dot" aria-hidden="true" />
            Meta conectado
          </div>
          <p>3 de até 20 contas</p>
          <button type="button">Gerenciar conexão</button>
        </div>

        <div className="user-card">
          <div className="avatar">SZ</div>
          <div>
            <strong>Stênio</strong>
            <span>Sessão de demonstração</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">RELATÓRIOS META ADS</p>
            <h1>Novo relatório</h1>
            <p className="subtitle">Configure a análise e revise o texto antes de gerar o PDF.</p>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">Dados simulados</span>
            <button className="secondary-button" type="button">Salvar modelo</button>
          </div>
        </header>

        <div className="content-grid">
          <form className="config-panel glass-panel" onSubmit={handleGenerate}>
            <div className="panel-heading">
              <div>
                <span className="step">01</span>
                <h2>Configuração</h2>
              </div>
              <span className="required-note">* obrigatório</span>
            </div>

            <label>
              Cliente
              <select value={clientName} onChange={(event) => setClientName(event.target.value)}>
                <option>Loja Aurora</option>
                <option>Clínica Horizonte</option>
                <option>Instituto Nexo</option>
              </select>
            </label>

            <label>
              Conta de anúncios
              <select>
                <option>Loja Aurora — act_2094•••108</option>
                <option>Conta principal — act_4851•••322</option>
              </select>
            </label>

            <fieldset>
              <legend>Objetivo</legend>
              <div className="segmented-control">
                <button
                  type="button"
                  className={objective === "ecommerce" ? "selected" : ""}
                  onClick={() => setObjective("ecommerce")}
                >
                  E-commerce
                </button>
                <button
                  type="button"
                  className={objective === "leads" ? "selected" : ""}
                  onClick={() => setObjective("leads")}
                >
                  Leads
                </button>
              </div>
            </fieldset>

            <div className="date-grid">
              <label>
                Data inicial *
                <input type="date" defaultValue="2026-07-01" required />
              </label>
              <label>
                Data final *
                <input type="date" defaultValue="2026-07-31" required />
              </label>
            </div>

            <label className="checkbox-row">
              <input type="checkbox" defaultChecked />
              <span>
                Comparar com período anterior equivalente
                <small>01–30 jun 2026</small>
              </span>
            </label>

            <div className="field-grid">
              <label>
                Tom
                <select defaultValue="executivo">
                  <option value="executivo">Executivo</option>
                  <option value="consultivo">Consultivo</option>
                  <option value="direto">Direto</option>
                </select>
              </label>
              <label>
                Foco
                <select defaultValue="geral">
                  <option value="geral">Visão geral</option>
                  <option value="eficiencia">Eficiência</option>
                  <option value="escala">Escala</option>
                  <option value="criativos">Criativos</option>
                </select>
              </label>
            </div>

            <label>
              Contexto de outras fontes <span className="optional">opcional</span>
              <textarea
                rows={3}
                placeholder="Ex.: Google Ads ativo, promoção no período, CRM mostra queda na qualidade dos leads..."
              />
            </label>

            <div className="attribution-note">
              <span>i</span>
              <p><strong>Atribuição da conta:</strong> 7 dias após clique e 1 dia após visualização. Ela será exibida e poderá ser questionada na análise.</p>
            </div>

            <button className="primary-button" type="submit">
              {generated ? "Gerar novamente" : "Gerar relatório"}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <section className="preview-panel glass-panel" aria-label="Prévia do relatório">
            <div className="panel-heading preview-heading">
              <div>
                <span className="step">02</span>
                <h2>Prévia do output</h2>
              </div>
              <span className={`run-status ${generated ? "ready" : ""}`}>
                {generated ? "Atualizado agora" : "Exemplo preenchido"}
              </span>
            </div>

            <div className="report-toolbar">
              <div className="preview-tabs" role="tablist" aria-label="Seções do relatório">
                {(["resumo", "campanhas", "acoes"] as PreviewTab[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={tab === item}
                    className={tab === item ? "active" : ""}
                    onClick={() => setTab(item)}
                  >
                    {item === "resumo" ? "Resumo" : item === "campanhas" ? "Campanhas" : "Ações"}
                  </button>
                ))}
              </div>
              <span>Página {tab === "resumo" ? "1" : tab === "campanhas" ? "3" : "4"} de 5</span>
            </div>

            <article className="report-sheet">
              <div className="report-header">
                <div className="mini-brand"><span /> PROJETO WASHINGTON</div>
                <span>{objectiveLabel}</span>
              </div>

              {tab === "resumo" && (
                <>
                  <div className="report-title-row">
                    <div>
                      <p>RELATÓRIO DE PERFORMANCE</p>
                      <h3>{clientName}</h3>
                      <span>01–31 jul 2026 vs. período anterior</span>
                    </div>
                    <span className="quality-score">Qualidade dos dados: 92%</span>
                  </div>

                  <div className="executive-summary">
                    <span>LEITURA EXECUTIVA</span>
                    <p contentEditable suppressContentEditableWarning>{summary}</p>
                  </div>

                  <div className="metric-grid">
                    {metrics.map((metric) => (
                      <div className="metric-card" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <small className={metric.tone}>{metric.delta}</small>
                      </div>
                    ))}
                  </div>

                  <div className="evidence-strip">
                    <div><span>Fato</span><p>O resultado cresceu acima do investimento.</p></div>
                    <div><span>Hipótese</span><p>O mix de campanhas pode explicar o ganho.</p></div>
                    <div><span>Validação</span><p>Conferir estabilidade e contexto de outras fontes.</p></div>
                  </div>
                </>
              )}

              {tab === "campanhas" && (
                <div className="report-section">
                  <p className="section-kicker">DISTRIBUIÇÃO</p>
                  <h3>Onde o resultado foi produzido</h3>
                  <p className="section-intro">A leitura prioriza campanhas com volume relevante, melhores resultados e exceções que exigem atenção.</p>
                  <div className="campaign-table">
                    <div className="campaign-row table-head">
                      <span>Campanha</span><span>Investimento</span><span>Resultado</span><span>Eficiência</span>
                    </div>
                    {campaignRows.map((row) => (
                      <div className="campaign-row" key={row.name}>
                        <span><strong>{row.name}</strong><small>{row.status}</small></span>
                        <span>{row.spend}</span><span>{row.result}</span><span className={row.status === "Atenção" ? "attention" : "positive"}>{row.efficiency}</span>
                      </div>
                    ))}
                  </div>
                  <div className="editor-note" contentEditable suppressContentEditableWarning>
                    Advantage+ e remarketing concentram o ganho. Prospecting Video mantém volume, mas opera abaixo da eficiência média da conta.
                  </div>
                </div>
              )}

              {tab === "acoes" && (
                <div className="report-section">
                  <p className="section-kicker">PRIORIDADES</p>
                  <h3>Três ações simples para avaliar</h3>
                  <p className="section-intro">Recomendações baseadas nos dados. Nenhuma alteração foi executada na conta.</p>
                  <div className="action-list">
                    {actions.map((action, index) => (
                      <div className="action-card" key={action.title}>
                        <span className="action-number">{index + 1}</span>
                        <div contentEditable suppressContentEditableWarning>
                          <strong>{action.title}</strong>
                          <p>{action.detail}</p>
                        </div>
                        <span className={`impact ${action.impact === "Médio" ? "medium" : ""}`}>{action.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <footer className="report-footer">
                <span>Dados simulados para protótipo</span>
                <span>Meta Ads • BRL • GMT-3</span>
              </footer>
            </article>

            <div className="preview-actions">
              <div>
                <span className="lock-icon" aria-hidden="true">◇</span>
                <p><strong>Texto editável</strong><small>Métricas permanecem bloqueadas.</small></p>
              </div>
              <button className="secondary-button" type="button">Salvar rascunho</button>
              <button className="primary-button compact" type="button" onClick={handleExport}>
                {exported ? "PDF pronto" : "Aprovar e gerar PDF"}
              </button>
            </div>
          </section>
        </div>

        <section className="recent-section">
          <div>
            <p className="eyebrow">ÚLTIMAS EXECUÇÕES</p>
            <h2>Relatórios recentes</h2>
          </div>
          <div className="recent-list">
            <div><span className="client-initial">LA</span><p><strong>Loja Aurora</strong><small>E-commerce • 01–31 jul</small></p><span className="status-pill">Aprovado</span></div>
            <div><span className="client-initial">CH</span><p><strong>Clínica Horizonte</strong><small>Leads • 15–31 jul</small></p><span className="status-pill draft">Rascunho</span></div>
            <div><span className="client-initial">IN</span><p><strong>Instituto Nexo</strong><small>Leads • 01–30 jun</small></p><span className="status-pill">Exportado</span></div>
          </div>
        </section>
      </section>
    </main>
  );
}
