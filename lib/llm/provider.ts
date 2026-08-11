import type { LlmRunResult, NormalizedSnapshot, ReportAnalysis } from "../report/types";
import { buildLlmInput, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { parseReportAnalysis, reportAnalysisJsonSchema } from "./schema";

export interface LlmProvider {
  readonly name: string;
  analyze(snapshot: NormalizedSnapshot, correctionErrors?: string[]): Promise<LlmRunResult>;
}

interface OpenAiProviderOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }
  throw new Error("A OpenAI não retornou conteúdo textual estruturado.");
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAiProviderOptions) {
    if (!options.apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-5.6-terra";
    this.endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async analyze(snapshot: NormalizedSnapshot, correctionErrors: string[] = []): Promise<LlmRunResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          reasoning: { effort: "medium" },
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                reportData: buildLlmInput(snapshot),
                correctionErrors,
                correctionInstruction:
                  correctionErrors.length > 0
                    ? "Corrija todos os erros de validação sem criar novas evidências ou números."
                    : null,
              }),
            },
          ],
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "washington_report_analysis",
              strict: true,
              schema: reportAnalysisJsonSchema,
            },
          },
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const error = payload.error as Record<string, unknown> | undefined;
        throw new Error(`OpenAI: ${String(error?.message ?? response.statusText)}`);
      }
      const parsed = parseReportAnalysis(JSON.parse(extractOutputText(payload)));
      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      return {
        analysis: parsed,
        provider: this.name,
        model: this.model,
        promptVersion: PROMPT_VERSION,
        durationMs: Date.now() - startedAt,
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : null,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : null,
        rawResponse: payload,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class StaticLlmProvider implements LlmProvider {
  readonly name = "static_test_double";
  constructor(private readonly output: ReportAnalysis) {}

  async analyze(): Promise<LlmRunResult> {
    return {
      analysis: this.output,
      provider: this.name,
      model: "deterministic-fixture",
      promptVersion: PROMPT_VERSION,
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      rawResponse: this.output,
    };
  }
}
