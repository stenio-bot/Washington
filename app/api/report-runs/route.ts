import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { OpenAiLlmProvider } from "../../../lib/llm/provider";
import { runValidatedAnalysis } from "../../../lib/llm/pipeline";
import { ReferenceAnalysisProvider } from "../../../lib/llm/reference-provider";
import { createMetaProvider } from "../../../lib/meta/factory";
import { normalizeSnapshot } from "../../../lib/report/metrics";
import type {
  DateRange,
  PerformanceStatusSelection,
  ReportAudience,
  ReportConfig,
  ReportFocus,
  ReportObjective,
  ReportTone,
  TaxonomyMode,
} from "../../../lib/report/types";
import {
  createReportRun,
  markReportFailed,
  storeAnalysisAndDraft,
  storeSnapshot,
} from "../../../lib/storage/report-repository";

export const dynamic = "force-dynamic";

type RuntimeEnv = Record<string, unknown>;

function runtimeString(runtime: RuntimeEnv, key: string) {
  const value = runtime[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringField(value: unknown, label: string, maxLength = 160) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} é obrigatório.`);
  return value.trim().slice(0, maxLength);
}

function optionalString(value: unknown, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function dateRange(value: unknown, label: string): DateRange {
  if (!value || typeof value !== "object") throw new Error(`${label} é obrigatório.`);
  const range = value as Record<string, unknown>;
  const start = stringField(range.start, `${label}: data inicial`, 10);
  const end = stringField(range.end, `${label}: data final`, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new Error(`${label} é inválido.`);
  }
  return { start, end };
}

function parseConfig(payload: Record<string, unknown>): ReportConfig {
  const objective = payload.objective;
  const tone = payload.tone;
  const focus = payload.focus;
  const audience = payload.audience;
  const performanceStatus = payload.performanceStatus;
  const taxonomyMode = payload.taxonomyMode;
  if (!(["ecommerce", "leads"] as unknown[]).includes(objective)) throw new Error("Objetivo inválido.");
  if (!(["executivo", "consultivo", "direto"] as unknown[]).includes(tone)) throw new Error("Tom inválido.");
  if (!(["geral", "eficiencia", "escala", "criativos"] as unknown[]).includes(focus)) throw new Error("Foco inválido.");
  if (!(["client", "internal"] as unknown[]).includes(audience)) throw new Error("Destinatário inválido.");
  if (!(["auto", "critical", "attention", "recovery", "stable", "strong"] as unknown[]).includes(performanceStatus)) {
    throw new Error("Leitura do resultado inválida.");
  }
  if (!(["strict", "disabled"] as unknown[]).includes(taxonomyMode)) {
    throw new Error("Leitura de nomenclatura inválida.");
  }
  const nextReviewDate = optionalString(payload.nextReviewDate, 10);
  if (nextReviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextReviewDate)) {
    throw new Error("Data da próxima leitura inválida.");
  }
  return {
    workspaceId: "washington_internal",
    clientId: stringField(payload.clientId, "Cliente"),
    clientName: stringField(payload.clientName, "Nome do cliente"),
    accountId: stringField(payload.accountId, "Conta de anúncios"),
    accountName: stringField(payload.accountName, "Nome da conta"),
    objective: objective as ReportObjective,
    period: dateRange(payload.period, "Período"),
    comparisonPeriod: payload.comparisonPeriod
      ? dateRange(payload.comparisonPeriod, "Período comparado")
      : null,
    tone: tone as ReportTone,
    focus: focus as ReportFocus,
    audience: audience as ReportAudience,
    performanceStatus: performanceStatus as PerformanceStatusSelection,
    taxonomyMode: taxonomyMode as TaxonomyMode,
    context: optionalString(payload.context),
    actionsTaken: optionalString(payload.actionsTaken),
    nextSteps: optionalString(payload.nextSteps),
    pendingInputs: optionalString(payload.pendingInputs),
    nextReviewDate,
    goals:
      payload.goals && typeof payload.goals === "object"
        ? (payload.goals as ReportConfig["goals"])
        : {},
  };
}

export async function POST(request: Request) {
  const runId = crypto.randomUUID();
  const runtime = env as unknown as RuntimeEnv;
  let identity: { runId: string; workspaceId: string; actorId: string } | null = null;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const demo = payload.demo === true;
    const user = await getChatGPTUser();
    if (!user && !demo) {
      return NextResponse.json({ error: "Autenticação obrigatória." }, { status: 401 });
    }
    const config = parseConfig(payload);
    identity = {
      runId,
      workspaceId: config.workspaceId,
      actorId: user?.userId ?? "local_demo",
    };
    await createReportRun(identity, config);

    const configuredMetaProvider = runtimeString(runtime, "META_PROVIDER") === "marketing_api"
      ? "marketing_api"
      : "mcp";
    const meta = demo
      ? createMetaProvider({ provider: "fixture" })
      : createMetaProvider({
          provider: configuredMetaProvider,
          accessToken: runtimeString(runtime, "META_ACCESS_TOKEN"),
          graphApiVersion: runtimeString(runtime, "META_GRAPH_API_VERSION"),
          mcpEndpoint: runtimeString(runtime, "META_MCP_ENDPOINT"),
          mcpListAccountsTool: runtimeString(runtime, "META_MCP_LIST_ACCOUNTS_TOOL"),
          mcpInsightsTool: runtimeString(runtime, "META_MCP_INSIGHTS_TOOL"),
        });
    const raw = await meta.fetchSnapshot(config);
    const snapshot = await normalizeSnapshot(config, raw);
    await storeSnapshot(identity, raw, snapshot);

    const llm = demo
      ? new ReferenceAnalysisProvider()
      : new OpenAiLlmProvider({
          apiKey: runtimeString(runtime, "OPENAI_API_KEY") ?? "",
          model: runtimeString(runtime, "OPENAI_MODEL") ?? "gpt-5.6-terra",
        });
    const result = await runValidatedAnalysis(llm, snapshot);
    const versionId = await storeAnalysisAndDraft(identity, snapshot, result.llm, result.validation);

    return NextResponse.json({
      runId,
      versionId,
      mode: demo ? "demo_without_llm" : "real_with_llm",
      source: raw.source,
      snapshot,
      analysis: result.llm.analysis,
      validation: result.validation,
      attempts: result.attempts,
      model: result.llm.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao gerar relatório.";
    if (identity) {
      try {
        await markReportFailed(identity, "REPORT_GENERATION_FAILED", message);
      } catch {
        // The original error is more useful when persistence itself is unavailable.
      }
    }
    return NextResponse.json(
      { error: message, runId },
      { status: message.includes("obrigat") || message.includes("inválid") ? 422 : 500 },
    );
  }
}
