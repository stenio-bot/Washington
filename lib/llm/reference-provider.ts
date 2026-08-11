import type { LlmRunResult, NormalizedSnapshot } from "../report/types";
import { PROMPT_VERSION } from "./prompt";
import { buildReferenceAnalysis } from "./reference-analysis";
import type { LlmProvider } from "./provider";

/**
 * Deterministic provider for the explicit demo flow. It never represents itself
 * as an LLM call and must not be selected for a real report.
 */
export class ReferenceAnalysisProvider implements LlmProvider {
  readonly name = "reference_without_llm";

  async analyze(snapshot: NormalizedSnapshot): Promise<LlmRunResult> {
    const analysis = buildReferenceAnalysis(snapshot);
    return {
      analysis,
      provider: this.name,
      model: "deterministic-reference",
      promptVersion: PROMPT_VERSION,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      rawResponse: analysis,
    };
  }
}
