import type {
  AnalysisClaim,
  AnalysisValidation,
  NormalizedSnapshot,
  ReportAnalysis,
} from "../report/types";

function allClaims(analysis: ReportAnalysis): AnalysisClaim[] {
  const operational = [
    ...analysis.narrative.actionsTaken,
    ...analysis.narrative.nextSteps,
  ].map((item) => ({
    text: `${item.title} ${item.detail}`,
    evidenceRefs: item.evidenceRefs,
  }));
  return [
    analysis.narrative.whereWeAre,
    ...analysis.narrative.findings,
    ...operational,
    ...analysis.narrative.outlook,
    analysis.narrative.nextReview,
    ...analysis.narrative.internalNeeds,
    ...analysis.facts,
    ...analysis.interpretations,
    ...analysis.hypotheses,
    ...analysis.campaignHighlights,
    ...analysis.recommendations.map((item) => ({
      text: [item.action, item.rationale, item.expectedImpact, item.risk, item.validation].join(" "),
      evidenceRefs: item.evidenceRefs,
    })),
  ];
}

function numericTokens(value: string) {
  return value.match(/(?<![\p{L}\d])[+-]?\d[\d.,]*(?![\p{L}\d])/gu) ?? [];
}

function canonicalNumber(token: string) {
  const stripped = token.replace(/[+\s]/g, "");
  const hasComma = stripped.includes(",");
  const dots = (stripped.match(/\./g) ?? []).length;
  const normalized = hasComma
    ? stripped.replace(/\./g, "").replace(",", ".")
    : dots > 1
      ? stripped.replace(/\./g, "")
      : stripped;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function collectNumbers(text: string, target: number[]) {
  for (const token of numericTokens(text)) {
    const parsed = canonicalNumber(token);
    if (parsed !== null) target.push(parsed);
  }
}

function evidenceExists(snapshot: NormalizedSnapshot, ref: string) {
  return Boolean(snapshot.evidence[ref] || snapshot.contextEvidence[ref]);
}

function allowedNumbers(snapshot: NormalizedSnapshot, evidenceRefs?: string[]) {
  const allowed: number[] = [];
  const refs = evidenceRefs ?? [
    ...Object.keys(snapshot.evidence),
    ...Object.keys(snapshot.contextEvidence),
  ];
  for (const ref of refs) {
    const metric = snapshot.evidence[ref];
    if (metric) {
      for (const value of [metric.current, metric.previous, metric.percentChange]) {
        if (value !== null) {
          allowed.push(value, Math.round(value), Number(value.toFixed(1)), Number(value.toFixed(2)));
        }
      }
      collectNumbers(metric.formattedCurrent, allowed);
      collectNumbers(metric.formattedPrevious, allowed);
      collectNumbers(metric.formattedPercentChange, allowed);
      collectNumbers(metric.entityName, allowed);
    }
    const context = snapshot.contextEvidence[ref];
    if (context) collectNumbers(context.text, allowed);
  }
  collectNumbers(snapshot.config.period.start, allowed);
  collectNumbers(snapshot.config.period.end, allowed);
  if (snapshot.config.comparisonPeriod) {
    collectNumbers(snapshot.config.comparisonPeriod.start, allowed);
    collectNumbers(snapshot.config.comparisonPeriod.end, allowed);
  }
  collectNumbers(snapshot.account.attribution.description, allowed);
  return allowed;
}

function numberIsAllowed(value: number, allowed: number[]) {
  return allowed.some((candidate) => {
    const tolerance = Math.max(0.011, Math.abs(candidate) * 0.0005);
    return Math.abs(candidate - value) <= tolerance;
  });
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateAnalysis(
  analysis: ReportAnalysis,
  snapshot: NormalizedSnapshot,
): AnalysisValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checkedEvidenceRefs = new Set<string>();
  const claims = allClaims(analysis);

  if (analysis.narrative.status !== snapshot.performance.status) {
    errors.push("A narrativa alterou a classificação determinística do resultado.");
  }
  if (analysis.executiveSummary !== analysis.narrative.whereWeAre.text) {
    errors.push("O resumo executivo diverge da seção Onde estamos.");
  }
  if (wordCount(analysis.narrative.headline) > 12) {
    errors.push("O título da narrativa possui mais de 12 palavras.");
  }
  if (wordCount(analysis.narrative.whereWeAre.text) > 80) {
    errors.push("A seção Onde estamos possui mais de 80 palavras.");
  }
  if (analysis.narrative.findings.length > 3 || analysis.narrative.outlook.length > 3) {
    errors.push("A narrativa excedeu o limite de três pontos por seção.");
  }
  if (analysis.recommendations.length > 3) {
    errors.push("A análise possui mais de três recomendações.");
  }
  if (snapshot.config.audience === "client" && analysis.narrative.internalNeeds.length > 0) {
    errors.push("Um relatório para cliente não pode expor pendências internas.");
  }
  if (
    snapshot.config.audience === "client" &&
    claims.some((claim) => claim.evidenceRefs.includes("context.pending_inputs"))
  ) {
    errors.push("Um relatório para cliente não pode usar pendências internas na narrativa.");
  }
  for (const update of analysis.narrative.actionsTaken) {
    if (!update.evidenceRefs.includes("context.actions_taken")) {
      errors.push(`Ação realizada sem confirmação da equipe: ${update.title}`);
    }
    if (!["aplicado", "em_andamento", "a_confirmar"].includes(update.status)) {
      errors.push(`Status incompatível com ação já realizada: ${update.status}`);
    }
  }
  if (
    analysis.narrative.actionsTaken.length > 0 &&
    !snapshot.contextEvidence["context.actions_taken"]
  ) {
    errors.push("A análise inventou ações realizadas sem contexto operacional.");
  }

  for (const claim of claims) {
    if (claim.evidenceRefs.length === 0) {
      errors.push(`Afirmação sem evidência: ${claim.text}`);
      continue;
    }
    for (const ref of claim.evidenceRefs) {
      if (!evidenceExists(snapshot, ref)) errors.push(`Referência de evidência inexistente: ${ref}`);
      else checkedEvidenceRefs.add(ref);
    }
  }

  for (const claim of claims) {
    const allowed = allowedNumbers(snapshot, claim.evidenceRefs);
    for (const token of numericTokens(claim.text)) {
      const parsed = canonicalNumber(token);
      if (parsed !== null && !numberIsAllowed(parsed, allowed)) {
        errors.push(`Número não verificável na afirmação: ${token}`);
      }
    }
  }
  const globalAllowed = allowedNumbers(snapshot);
  for (const text of [
    analysis.narrative.headline,
    analysis.executiveSummary,
    ...analysis.limitations,
  ]) {
    for (const token of numericTokens(text)) {
      const parsed = canonicalNumber(token);
      if (parsed !== null && !numberIsAllowed(parsed, globalAllowed)) {
        errors.push(`Número não verificável na análise: ${token}`);
      }
    }
  }

  const promisePattern = /\b(vai recuperar|irá recuperar|retomará|recuperação garantida|resultado garantido|tempo suficiente para recuperar)\b/i;
  const externalNarrative = [
    analysis.narrative.headline,
    analysis.narrative.whereWeAre.text,
    ...analysis.narrative.outlook.map((item) => item.text),
  ].join(" ");
  if (promisePattern.test(externalNarrative)) {
    errors.push("A narrativa contém promessa de resultado ou recuperação.");
  }

  if (snapshot.quality.status !== "ready" && analysis.confidence === "alta") {
    errors.push("A confiança não pode ser alta quando a qualidade dos dados não está pronta.");
  }
  if (snapshot.quality.alerts.length > 0 && analysis.limitations.length === 0) {
    errors.push("A análise omitiu limitações conhecidas dos dados.");
  }
  if (analysis.hypotheses.some((item) => item.validation.trim().length < 8)) {
    warnings.push("Há hipótese sem forma clara de validação.");
  }
  if (
    snapshot.performance.source === "manual" &&
    snapshot.performance.status !== "inconclusive"
  ) {
    warnings.push("A classificação do resultado foi definida manualmente pela equipe.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedEvidenceRefs: [...checkedEvidenceRefs],
  };
}
