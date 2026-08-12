import type {
  NormalizedSnapshot,
  OperationalUpdate,
  PerformanceStatus,
  ReportAnalysis,
} from "../report/types";

function evidence(snapshot: NormalizedSnapshot, ref: string) {
  const item = snapshot.evidence[ref];
  if (!item) throw new Error(`Evidência ausente na análise de referência: ${ref}`);
  return item;
}

const headlines: Record<PerformanceStatus, string> = {
  critical: "Queda relevante exige correção e acompanhamento próximo",
  attention: "Resultado sob pressão, com pontos de correção mapeados",
  recovery: "Sinais de melhora, ainda em fase de confirmação",
  stable: "Resultado estável, com espaço para otimização gradual",
  strong: "Resultado positivo, com eficiência para preservar",
  inconclusive: "Base insuficiente para concluir a direção do resultado",
};

function whereWeAreText(
  snapshot: NormalizedSnapshot,
  result: ReturnType<typeof evidence>,
  efficiency: ReturnType<typeof evidence>,
) {
  const status = snapshot.performance.status;
  const base = `${result.label} ficou em ${result.formattedCurrent}, variação de ${result.formattedPercentChange}; ${efficiency.label.toLowerCase()} encerrou em ${efficiency.formattedCurrent}, variação de ${efficiency.formattedPercentChange}.`;
  const closing: Record<PerformanceStatus, string> = {
    critical: "A queda é relevante e pede correção focada, acompanhamento próximo e uma nova leitura antes de qualquer conclusão sobre recuperação.",
    attention: "O sinal pede ajuste preventivo e acompanhamento antes de ampliar investimento.",
    recovery: "A direção melhorou, mas ainda precisa se sustentar em uma nova janela de dados.",
    stable: "Não há mudança material suficiente para justificar uma intervenção ampla neste momento.",
    strong: "O cenário é positivo, com prioridade para preservar a eficiência antes de avaliar escala gradual.",
    inconclusive: "A base disponível não permite classificar o resultado com segurança.",
  };
  return `${base} ${closing[status]}`;
}

function statusFromActionText(value: string): OperationalUpdate["status"] {
  if (/em andamento|andamento|iniciad/i.test(value)) return "em_andamento";
  if (/a confirmar|confirmar|valida/i.test(value)) return "a_confirmar";
  return "aplicado";
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
  const whereWeAre = whereWeAreText(snapshot, result, efficiency);
  const efficiencyImproved =
    efficiency.percentChange !== null &&
    (ecommerce ? efficiency.percentChange >= 0 : efficiency.percentChange <= 0);

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
      text: efficiencyImproved
        ? ecommerce
          ? "A relação entre receita atribuída e investimento melhorou dentro da mensuração do Meta."
          : "O custo por lead melhorou dentro da mensuração do Meta."
        : ecommerce
          ? "A relação entre receita atribuída e investimento piorou dentro da mensuração do Meta."
          : "O custo por lead piorou dentro da mensuração do Meta.",
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
      expectedImpact: "Maior participação do investimento na frente mais eficiente observada, sem promessa de resultado.",
      risk: "Uma alteração brusca pode mudar a entrega e a eficiência.",
      validation: "Comparar eficiência e volume após uma janela estável de veiculação.",
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
      expectedImpact: "Reduzir desperdício potencial ou identificar uma hipótese criativa mais eficiente.",
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
    expectedImpact: "Tomar a decisão de mídia com uma leitura mais completa do negócio.",
    risk: "A ausência da fonte externa pode levar a uma conclusão excessivamente otimista.",
    validation: ecommerce
      ? "Conciliar pedidos e receita com a plataforma de vendas."
      : "Conciliar leads com qualificação, oportunidades e vendas no CRM.",
  });

  const actionsTaken: OperationalUpdate[] = snapshot.contextEvidence["context.actions_taken"]
    ? [
        {
          title: "Ajuste informado pela equipe",
          status: statusFromActionText(snapshot.config.actionsTaken),
          detail: snapshot.config.actionsTaken,
          evidenceRefs: ["context.actions_taken"],
        },
      ]
    : [];
  const nextSteps: OperationalUpdate[] = snapshot.contextEvidence["context.next_steps"]
    ? [
        {
          title: "Próximo passo informado",
          status: "planejado",
          detail: snapshot.config.nextSteps,
          evidenceRefs: ["context.next_steps"],
        },
      ]
    : recommendations.slice(0, 2).map((item) => ({
        title: item.action,
        status: "recomendado" as const,
        detail: item.validation,
        evidenceRefs: item.evidenceRefs,
      }));

  const outlookText: Record<PerformanceStatus, string> = {
    critical:
      "Existe perspectiva de melhora se as correções incidirem sobre as frentes que concentram a perda, mas a direção só deve ser confirmada na próxima leitura.",
    attention:
      "A pressão parece concentrada em frentes identificáveis, o que permite testar correções sem alterar toda a operação.",
    recovery:
      "Os sinais atuais são favoráveis, mas a melhora ainda precisa se repetir antes de ser tratada como novo patamar.",
    stable:
      "A estabilidade permite priorizar testes pequenos e preservar o que já funciona.",
    strong:
      "O resultado permite avaliar escala gradual, desde que eficiência e volume continuem acompanhados em conjunto.",
    inconclusive:
      "A próxima decisão deve aguardar uma base comparável e a confirmação das métricas centrais.",
  };
  const nextReview = snapshot.contextEvidence["context.next_review"]
    ? {
        text: `Próxima leitura: ${snapshot.config.nextReviewDate}, para confirmar a direção antes de uma nova decisão de verba.`,
        evidenceRefs: ["context.next_review", primaryResultRef, efficiencyRef],
      }
    : {
        text: "A próxima leitura deve ocorrer após uma nova janela comparável de dados.",
        evidenceRefs: [primaryResultRef, efficiencyRef],
      };
  const internalNeeds =
    snapshot.config.audience === "internal"
      ? [
          snapshot.contextEvidence["context.pending_inputs"]
            ? {
                text: snapshot.config.pendingInputs,
                evidenceRefs: ["context.pending_inputs"],
              }
            : {
                text: ecommerce
                  ? "Confirmar margem e receita fora do Meta antes de concluir sobre rentabilidade."
                  : "Confirmar qualidade, oportunidades e vendas no CRM antes de concluir sobre retorno comercial.",
                evidenceRefs: [primaryResultRef, efficiencyRef],
              },
        ]
      : [];

  return {
    narrative: {
      status: snapshot.performance.status,
      headline: headlines[snapshot.performance.status],
      whereWeAre: {
        text: whereWeAre,
        evidenceRefs: [primaryResultRef, efficiencyRef],
      },
      findings: facts.slice(0, 3),
      actionsTaken,
      nextSteps,
      outlook: [
        {
          text: outlookText[snapshot.performance.status],
          evidenceRefs: [primaryResultRef, efficiencyRef],
        },
      ],
      nextReview,
      internalNeeds,
    },
    executiveSummary: whereWeAre,
    facts,
    interpretations,
    hypotheses: [
      {
        text: ecommerce
          ? "O contexto comercial pode ter contribuído para o resultado, mas o Meta isoladamente não comprova causalidade."
          : "A melhora de captação pode não representar melhora comercial sem dados de qualificação.",
        evidenceRefs: snapshot.contextEvidence["context.business"]
          ? ["context.business", primaryResultRef, efficiencyRef]
          : [primaryResultRef, efficiencyRef],
        validation: ecommerce
          ? "Comparar pedidos, valor médio e margem com a plataforma de vendas."
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
