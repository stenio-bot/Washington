import type { NormalizedSnapshot, ReportAnalysis } from "../report/types";

function evidence(snapshot: NormalizedSnapshot, ref: string) {
  const item = snapshot.evidence[ref];
  if (!item) throw new Error(`Evidência ausente na análise de referência: ${ref}`);
  return item;
}

export function buildReferenceAnalysis(snapshot: NormalizedSnapshot): ReportAnalysis {
  const ecommerce = snapshot.config.objective === "ecommerce";
  const spend = evidence(snapshot, "account.spend");
  const result = evidence(snapshot, ecommerce ? "account.purchaseValue" : "account.leads");
  const efficiency = evidence(snapshot, ecommerce ? "account.roas" : "account.costPerLead");
  const primaryResultRef = ecommerce ? "account.purchaseValue" : "account.leads";
  const efficiencyRef = ecommerce ? "account.roas" : "account.costPerLead";
  const highlights = snapshot.campaigns.filter((item) => item.classification === "highlight").slice(0, 2);
  const attention = snapshot.campaigns.find((item) => item.classification === "attention");
  const primaryCampaignMetric = ecommerce ? "roas" : "costPerLead";

  const executiveSummary = ecommerce
    ? `A receita atribuída chegou a ${result.formattedCurrent}, com ROAS de ${efficiency.formattedCurrent}. A leitura deve considerar a atribuição do Meta e o contexto de outras fontes.`
    : `O período gerou ${result.formattedCurrent} leads, com custo por lead de ${efficiency.formattedCurrent}. A qualidade comercial ainda precisa ser confirmada fora do Meta.`;

  const facts: ReportAnalysis["facts"] = [
    {
      text: `O investimento foi de ${spend.formattedCurrent}, variação de ${spend.formattedPercentChange} frente ao período anterior.`,
      evidenceRefs: ["account.spend"],
    },
    {
      text: `${result.label} ficou em ${result.formattedCurrent}, variação de ${result.formattedPercentChange}.`,
      evidenceRefs: [primaryResultRef],
    },
    {
      text: `${efficiency.label} encerrou em ${efficiency.formattedCurrent}, variação de ${efficiency.formattedPercentChange}.`,
      evidenceRefs: [efficiencyRef],
    },
  ];

  const interpretations: ReportAnalysis["interpretations"] = [
    {
      text: ecommerce
        ? "A receita atribuída cresceu acima do investimento, indicando melhora de eficiência dentro da mensuração do Meta."
        : "O volume de leads cresceu acima do investimento, indicando melhora de eficiência na captação.",
      evidenceRefs: ["account.spend", primaryResultRef, efficiencyRef],
    },
  ];

  const campaignHighlights = highlights.map((campaign) => {
    const ref = `campaign.${campaign.id}.${primaryCampaignMetric}`;
    const item = evidence(snapshot, ref);
    return {
      text: `${campaign.name} aparece como destaque com ${item.label.toLowerCase()} de ${item.formattedCurrent} e volume relevante.`,
      evidenceRefs: [ref, `campaign.${campaign.id}.spend`],
    };
  });
  if (attention) {
    const ref = `campaign.${attention.id}.${primaryCampaignMetric}`;
    const item = evidence(snapshot, ref);
    campaignHighlights.push({
      text: `${attention.name} exige atenção: ${item.label.toLowerCase()} de ${item.formattedCurrent}, com investimento relevante.`,
      evidenceRefs: [ref, `campaign.${attention.id}.spend`],
    });
  }

  const recommendations: ReportAnalysis["recommendations"] = [];
  if (highlights[0]) {
    recommendations.push({
      priority: "alta",
      action: `Preservar a estabilidade de ${highlights[0].name} e avaliar realocação gradual de verba.`,
      evidenceRefs: [
        `campaign.${highlights[0].id}.${primaryCampaignMetric}`,
        `campaign.${highlights[0].id}.spend`,
      ],
      rationale: "A campanha combina eficiência e volume relevante.",
      expectedImpact: "Maior participação dos investimentos com melhor eficiência observada, sem promessa de resultado.",
      risk: "Uma alteração brusca pode mudar a entrega e a eficiência.",
      validation: "Comparar eficiência e volume após um ciclo estável de veiculação.",
    });
  }
  if (attention) {
    recommendations.push({
      priority: "alta",
      action: `Revisar criativos e distribuição de investimento de ${attention.name} antes de ampliar verba.`,
      evidenceRefs: [
        `campaign.${attention.id}.${primaryCampaignMetric}`,
        `campaign.${attention.id}.spend`,
      ],
      rationale: "A campanha consome investimento relevante com eficiência abaixo da referência da conta.",
      expectedImpact: "Redução de desperdício potencial ou identificação de uma hipótese criativa mais eficiente.",
      risk: "Pausar ou reduzir cedo demais pode eliminar aprendizado ainda útil.",
      validation: "Testar uma variável por vez e comparar com uma campanha de referência.",
    });
  }
  recommendations.push({
    priority: "media",
    action: ecommerce
      ? "Confirmar receita e valor médio em outra fonte antes de ampliar investimento."
      : "Confirmar a qualidade dos leads no CRM antes de ampliar investimento.",
    evidenceRefs: [primaryResultRef, efficiencyRef],
    rationale: ecommerce
      ? "A receita apresentada é atribuída pelo Meta e pode divergir de outras fontes."
      : "Quantidade e custo por lead não comprovam oportunidade ou receita.",
    expectedImpact: "Decisão de mídia apoiada em uma leitura mais completa do negócio.",
    risk: "A ausência da fonte externa pode levar a uma conclusão excessivamente otimista.",
    validation: ecommerce
      ? "Conciliar pedidos e receita com a plataforma de vendas."
      : "Conciliar leads com qualificação, oportunidades e vendas no CRM.",
  });

  return {
    executiveSummary,
    facts,
    interpretations,
    hypotheses: [
      {
        text: ecommerce
          ? "A promoção do período pode ter contribuído para o resultado, mas o Meta isoladamente não comprova causalidade."
          : "A melhora de captação pode não representar melhora comercial sem dados de qualificação.",
        evidenceRefs: [primaryResultRef, efficiencyRef],
        validation: ecommerce
          ? "Comparar pedidos, ticket e margem da promoção com a plataforma de vendas."
          : "Comparar qualificação, oportunidades e vendas no CRM.",
      },
    ],
    campaignHighlights,
    recommendations: recommendations.slice(0, 3),
    limitations: [
      `A fonte usa atribuição de ${snapshot.account.attribution.description}.`,
      ecommerce
        ? "O Meta não deve ser tratado como fonte definitiva de receita quando existem outros canais."
        : "Sem CRM, volume e custo não demonstram qualidade, oportunidade ou receita.",
      ...snapshot.quality.alerts.map((alert) => alert.message),
    ],
    confidence:
      snapshot.quality.status === "ready"
        ? "alta"
        : snapshot.quality.status === "partial"
          ? "media"
          : "baixa",
  };
}
