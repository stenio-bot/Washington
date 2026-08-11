import type { ReportAnalysis } from "../report/types";

const claimSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "evidenceRefs"],
  properties: {
    text: { type: "string" },
    evidenceRefs: { type: "array", items: { type: "string" } },
  },
} as const;

export const reportAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
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
    executiveSummary: { type: "string" },
    facts: { type: "array", items: claimSchema },
    interpretations: { type: "array", items: claimSchema },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceRefs", "validation"],
        properties: {
          text: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string" } },
          validation: { type: "string" },
        },
      },
    },
    campaignHighlights: { type: "array", items: claimSchema },
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
  return typeof claim.text === "string" && isStringArray(claim.evidenceRefs);
}

export function parseReportAnalysis(value: unknown): ReportAnalysis {
  if (!value || typeof value !== "object") throw new Error("A resposta da LLM não é um objeto.");
  const data = value as Record<string, unknown>;
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
