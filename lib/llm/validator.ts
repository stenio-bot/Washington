import type {
  AnalysisClaim,
  AnalysisValidation,
  NormalizedSnapshot,
  ReportAnalysis,
} from "../report/types";

function allClaims(analysis: ReportAnalysis): AnalysisClaim[] {
  return [
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

function allowedNumbers(snapshot: NormalizedSnapshot, evidenceRefs?: string[]) {
  const allowed: number[] = [];
  const collect = (text: string) => {
    for (const token of numericTokens(text)) {
      const parsed = canonicalNumber(token);
      if (parsed !== null) allowed.push(parsed);
    }
  };
  const selectedEvidence = evidenceRefs
    ? evidenceRefs.map((ref) => snapshot.evidence[ref]).filter(Boolean)
    : Object.values(snapshot.evidence);
  for (const evidence of selectedEvidence) {
    for (const value of [evidence.current, evidence.previous, evidence.percentChange]) {
      if (value !== null) {
        allowed.push(value, Math.round(value), Number(value.toFixed(1)), Number(value.toFixed(2)));
      }
    }
    collect(evidence.formattedCurrent);
    collect(evidence.formattedPrevious);
    collect(evidence.formattedPercentChange);
    collect(evidence.entityName);
  }
  collect(snapshot.config.period.start);
  collect(snapshot.config.period.end);
  if (snapshot.config.comparisonPeriod) {
    collect(snapshot.config.comparisonPeriod.start);
    collect(snapshot.config.comparisonPeriod.end);
  }
  collect(snapshot.account.attribution.description);
  return allowed;
}

function numberIsAllowed(value: number, allowed: number[]) {
  return allowed.some((candidate) => {
    const tolerance = Math.max(0.011, Math.abs(candidate) * 0.0005);
    return Math.abs(candidate - value) <= tolerance;
  });
}

export function validateAnalysis(
  analysis: ReportAnalysis,
  snapshot: NormalizedSnapshot,
): AnalysisValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checkedEvidenceRefs = new Set<string>();
  const claims = allClaims(analysis);

  if (analysis.recommendations.length > 3) {
    errors.push("A análise possui mais de três recomendações.");
  }

  for (const claim of claims) {
    if (claim.evidenceRefs.length === 0) {
      errors.push(`Afirmação sem evidência: ${claim.text}`);
      continue;
    }
    for (const ref of claim.evidenceRefs) {
      if (!snapshot.evidence[ref]) errors.push(`Referência de evidência inexistente: ${ref}`);
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
  for (const text of [analysis.executiveSummary, ...analysis.limitations]) {
    for (const token of numericTokens(text)) {
      const parsed = canonicalNumber(token);
      if (parsed !== null && !numberIsAllowed(parsed, globalAllowed)) {
        errors.push(`Número não verificável na análise: ${token}`);
      }
    }
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checkedEvidenceRefs: [...checkedEvidenceRefs],
  };
}
