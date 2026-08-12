import type {
  OperationalUpdate,
  PerformanceStatus,
  ReportAnalysis,
} from "../report/types";

const claimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "evidenceRefs"],
  properties: {
    text: { type: "string" },
    evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
  },
} as const;

const operationalUpdateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "status", "detail", "evidenceRefs"],
  properties: {
    title: { type: "string" },
    status: {
      type: "string",
      enum: ["aplicado", "em_andamento", "planejado", "recomendado", "a_confirmar"],
    },
    detail: { type: "string" },
    evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
  },
} as const;

const performanceStatuses: PerformanceStatus[] = [
  "critical",
  "attention",
  "recovery",
  "stable",
  "strong",
  "inconclusive",
];

export const reportAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "narrative",
    "executiveSummary",
    "facts",
    "interpretations",
    "hypotheses",
    "campaignHighlights",
    "recommendations",
    "limitations",
    "confidence",
  ],
  properties: {
    narrative: {
      type: "object",
      additionalProperties: false,
      required: [
        "status",
        "headline",
        "whereWeAre",
        "findings",
        "actionsTaken",
        "nextSteps",
        "outlook",
        "nextReview",
        "internalNeeds",
      ],
      properties: {
        status: { type: "string", enum: performanceStatuses },
        headline: { type: "string" },
        whereWeAre: claimSchema,
        findings: { type: "array", maxItems: 3, items: claimSchema },
        actionsTaken: { type: "array", maxItems: 4, items: operationalUpdateSchema },
        nextSteps: { type: "array", maxItems: 4, items: operationalUpdateSchema },
        outlook: { type: "array", maxItems: 3, items: claimSchema },
        nextReview: claimSchema,
        internalNeeds: { type: "array", maxItems: 5, items: claimSchema },
      },
    },
    executiveSummary: { type: "string" },
    facts: { type: "array", maxItems: 5, items: claimSchema },
    interpretations: { type: "array", maxItems: 3, items: claimSchema },
    hypotheses: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceRefs", "validation"],
        properties: {
          text: { type: "string" },
          evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
          validation: { type: "string" },
        },
      },
    },
    campaignHighlights: { type: "array", maxItems: 5, items: claimSchema },
    recommendations: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "priority",
          "action",
          "evidenceRefs",
          "rationale",
          "expectedImpact",
          "risk",
          "validation",
        ],
        properties: {
          priority: { type: "string", enum: ["alta", "media", "baixa"] },
          action: { type: "string" },
          evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
          rationale: { type: "string" },
          expectedImpact: { type: "string" },
          risk: { type: "string" },
          validation: { type: "string" },
        },
      },
    },
    limitations: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["alta", "media", "baixa"] },
  },
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isClaim(value: unknown): value is ReportAnalysis["facts"][number] {
  if (!value || typeof value !== "object") return false;
  const claim = value as Record<string, unknown>;
  return (
    typeof claim.text === "string" &&
    isStringArray(claim.evidenceRefs) &&
    claim.evidenceRefs.length > 0
  );
}

function isOperationalUpdate(value: unknown): value is OperationalUpdate {
  if (!value || typeof value !== "object") return false;
  const update = value as Record<string, unknown>;
  return (
    typeof update.title === "string" &&
    ["aplicado", "em_andamento", "planejado", "recomendado", "a_confirmar"].includes(
      String(update.status),
    ) &&
    typeof update.detail === "string" &&
    isStringArray(update.evidenceRefs) &&
    update.evidenceRefs.length > 0
  );
}

export function parseReportAnalysis(value: unknown): ReportAnalysis {
  if (!value || typeof value !== "object") throw new Error("A resposta da LLM não é um objeto.");
  const data = value as Record<string, unknown>;
  const narrative = data.narrative as Record<string, unknown> | undefined;
  if (
    !narrative ||
    !performanceStatuses.includes(String(narrative.status) as PerformanceStatus) ||
    typeof narrative.headline !== "string" ||
    !isClaim(narrative.whereWeAre) ||
    !Array.isArray(narrative.findings) ||
    narrative.findings.length > 3 ||
    !narrative.findings.every(isClaim) ||
    !Array.isArray(narrative.actionsTaken) ||
    narrative.actionsTaken.length > 4 ||
    !narrative.actionsTaken.every(isOperationalUpdate) ||
    !Array.isArray(narrative.nextSteps) ||
    narrative.nextSteps.length > 4 ||
    !narrative.nextSteps.every(isOperationalUpdate) ||
    !Array.isArray(narrative.outlook) ||
    narrative.outlook.length > 3 ||
    !narrative.outlook.every(isClaim) ||
    !isClaim(narrative.nextReview) ||
    !Array.isArray(narrative.internalNeeds) ||
    narrative.internalNeeds.length > 5 ||
    !narrative.internalNeeds.every(isClaim)
  ) {
    throw new Error("A narrativa da LLM não respeita o contrato.");
  }

  const claimArrays = ["facts", "interpretations", "campaignHighlights"] as const;
  for (const key of claimArrays) {
    if (!Array.isArray(data[key]) || !data[key].every(isClaim)) {
      throw new Error(`Campo inválido na resposta da LLM: ${key}.`);
    }
  }
  if (
    typeof data.executiveSummary !== "string" ||
    !isStringArray(data.limitations) ||
    !["alta", "media", "baixa"].includes(String(data.confidence)) ||
    !Array.isArray(data.hypotheses) ||
    !data.hypotheses.every(
      (item) =>
        isClaim(item) &&
        typeof (item as unknown as Record<string, unknown>).validation === "string",
    ) ||
    !Array.isArray(data.recommendations) ||
    data.recommendations.length > 3
  ) {
    throw new Error("A estrutura da análise da LLM é inválida.");
  }
  for (const item of data.recommendations as Array<Record<string, unknown>>) {
    if (
      !["alta", "media", "baixa"].includes(String(item.priority)) ||
      typeof item.action !== "string" ||
      !isStringArray(item.evidenceRefs) ||
      item.evidenceRefs.length === 0 ||
      typeof item.rationale !== "string" ||
      typeof item.expectedImpact !== "string" ||
      typeof item.risk !== "string" ||
      typeof item.validation !== "string"
    ) {
      throw new Error("Uma recomendação da LLM não respeita o contrato.");
    }
  }
  return data as unknown as ReportAnalysis;
}
