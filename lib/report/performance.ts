import type {
  ContextEvidence,
  MetricKey,
  NormalizedSnapshot,
  PerformanceAssessment,
  PerformanceStatus,
  ReportConfig,
} from "./types";

export const performanceLabels: Record<PerformanceStatus, string> = {
  critical: "Crítico",
  attention: "Atenção",
  recovery: "Em recuperação",
  stable: "Estável",
  strong: "Positivo",
  inconclusive: "Dados insuficientes",
};

export const performanceToneGuides: Record<PerformanceStatus, string> = {
  critical:
    "Seja transparente e sereno. Reconheça a queda sem dramatizar, priorize causas sustentadas, ações sob controle e o próximo marco. Não prometa recuperação.",
  attention:
    "Seja direto e preventivo. Mostre onde surgiu a pressão, o que será acompanhado e quais correções são proporcionais ao sinal observado.",
  recovery:
    "Use otimismo cauteloso. Mostre os sinais de melhora, mas diga que a direção ainda precisa se consolidar antes de escalar ou concluir.",
  stable:
    "Seja conciso e sóbrio. Não invente urgência. Explique o que permaneceu consistente e foque proteção do resultado e testes incrementais.",
  strong:
    "Seja confiante sem triunfalismo. Evidencie o que funcionou, proteja as alavancas vencedoras e proponha escala gradual com critérios de parada.",
  inconclusive:
    "Seja neutro e metodológico. Não classifique o resultado como bom ou ruim; explique o dado ausente e qual leitura permitirá concluir.",
};

function primaryMetrics(config: ReportConfig): {
  result: MetricKey;
  efficiency: MetricKey;
  efficiencyHigherIsBetter: boolean;
} {
  return config.objective === "ecommerce"
    ? { result: "purchaseValue", efficiency: "roas", efficiencyHigherIsBetter: true }
    : { result: "leads", efficiency: "costPerLead", efficiencyHigherIsBetter: false };
}

function meetsGoal(
  snapshot: Pick<NormalizedSnapshot, "config" | "metrics">,
  metric: MetricKey,
  higherIsBetter: boolean,
) {
  const goal = snapshot.config.goals[metric];
  const current = snapshot.metrics[metric];
  if (goal === undefined || current === null) return false;
  return higherIsBetter ? current >= goal : current <= goal;
}

export function assessPerformance(
  snapshot: Pick<NormalizedSnapshot, "config" | "metrics" | "comparisons" | "quality">,
): PerformanceAssessment {
  const { result, efficiency, efficiencyHigherIsBetter } = primaryMetrics(snapshot.config);
  const evidenceRefs = [`account.${result}`, `account.${efficiency}`];
  const selection = snapshot.config.performanceStatus;
  if (selection !== "auto") {
    return {
      status: selection,
      source: "manual",
      label: performanceLabels[selection],
      rationale:
        "Classificação definida pela equipe. Os números permanecem bloqueados e a narrativa deve explicar qualquer diferença entre o sinal automático e a leitura manual.",
      evidenceRefs,
    };
  }

  const resultChange = snapshot.comparisons[result].percentChange;
  const rawEfficiencyChange = snapshot.comparisons[efficiency].percentChange;
  if (
    snapshot.quality.status === "blocked" ||
    resultChange === null ||
    rawEfficiencyChange === null
  ) {
    return {
      status: "inconclusive",
      source: "automatic",
      label: performanceLabels.inconclusive,
      rationale: "Não existe base comparável suficiente para classificar a direção do resultado com segurança.",
      evidenceRefs,
    };
  }

  const efficiencyChange = efficiencyHigherIsBetter
    ? rawEfficiencyChange
    : -rawEfficiencyChange;
  let status: PerformanceStatus;
  if (resultChange <= -35 || efficiencyChange <= -25) status = "critical";
  else if (resultChange <= -10 || efficiencyChange <= -10) status = "attention";
  else if (
    (meetsGoal(snapshot, efficiency, efficiencyHigherIsBetter) && resultChange >= -5) ||
    (resultChange >= 25 && efficiencyChange >= 10)
  ) status = "strong";
  else if (resultChange >= 10 || efficiencyChange >= 10) status = "recovery";
  else status = "stable";

  return {
    status,
    source: "automatic",
    label: performanceLabels[status],
    rationale:
      "Classificação automática baseada na variação do resultado principal e da eficiência frente ao período comparado.",
    evidenceRefs,
  };
}

export function buildContextEvidence(config: ReportConfig) {
  const candidates: Array<[string, string, string]> = [
    ["context.business", "Contexto do período", config.context],
    ["context.actions_taken", "Ações informadas pela equipe", config.actionsTaken],
    ["context.next_steps", "Próximos passos informados pela equipe", config.nextSteps],
    ["context.pending_inputs", "Pendências informadas pela equipe", config.pendingInputs],
    ["context.next_review", "Data da próxima leitura", config.nextReviewDate],
  ];
  return Object.fromEntries(
    candidates
      .filter(([, , text]) => text.trim().length > 0)
      .map(([ref, label, text]) => [
        ref,
        { ref, label, text: text.trim(), source: "operator" } satisfies ContextEvidence,
      ]),
  );
}
