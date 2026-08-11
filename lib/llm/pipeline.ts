import type { AnalysisValidation, LlmRunResult, NormalizedSnapshot } from "../report/types";
import type { LlmProvider } from "./provider";
import { validateAnalysis } from "./validator";

export class AnalysisValidationError extends Error {
  constructor(
    message: string,
    readonly validation: AnalysisValidation,
  ) {
    super(message);
    this.name = "AnalysisValidationError";
  }
}

export interface ValidatedAnalysisResult {
  llm: LlmRunResult;
  validation: AnalysisValidation;
  attempts: number;
}

export async function runValidatedAnalysis(
  provider: LlmProvider,
  snapshot: NormalizedSnapshot,
): Promise<ValidatedAnalysisResult> {
  if (snapshot.quality.status === "blocked") {
    throw new Error("A análise foi bloqueada porque faltam métricas centrais.");
  }

  let lastValidation: AnalysisValidation | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await provider.analyze(snapshot, lastValidation?.errors);
    const validation = validateAnalysis(result.analysis, snapshot);
    if (validation.valid) return { llm: result, validation, attempts: attempt };
    lastValidation = validation;
  }

  throw new AnalysisValidationError(
    "A resposta da LLM permaneceu inconsistente após a tentativa de correção.",
    lastValidation ?? { valid: false, errors: ["Falha desconhecida."], warnings: [], checkedEvidenceRefs: [] },
  );
}
