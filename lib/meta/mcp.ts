import type { DateRange, RawMetaSnapshot, RawMetricRow, ReportConfig } from "../report/types";
import { mapInsightRow } from "./marketing-api";
import type { MetaProvider } from "./provider";

type JsonObject = Record<string, unknown>;

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
}

interface McpOptions {
  endpoint: string;
  accessToken: string;
  listAccountsTool?: string;
  insightsTool?: string;
  fetchImpl?: typeof fetch;
}

function objectsFrom(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonObject => Boolean(item && typeof item === "object"));
  if (!value || typeof value !== "object") return [];
  const object = value as JsonObject;
  for (const key of ["data", "accounts", "rows", "results", "insights"]) {
    const nested = objectsFrom(object[key]);
    if (nested.length > 0) return nested;
  }
  return [object];
}

function parseMcpContent(result: JsonObject) {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const text = (item as JsonObject).text;
    if (typeof text === "string") {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        continue;
      }
    }
  }
  return result;
}

function isReadOnlyTool(tool: McpTool) {
  return !/(create|update|delete|remove|pause|publish|write|mutate|edit)/i.test(
    `${tool.name} ${tool.description ?? ""}`,
  );
}

class McpClient {
  private id = 0;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(
    private readonly endpoint: string,
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private parseResponse(text: string) {
    const sseData = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
    return JSON.parse(sseData.at(-1) ?? text) as JsonObject;
  }

  private async post(body: JsonObject, notification = false) {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
    this.sessionId = response.headers.get("Mcp-Session-Id") ?? this.sessionId;
    const text = await response.text();
    if (!response.ok) throw new Error(`Meta MCP: ${response.status} ${response.statusText}`);
    if (notification || !text.trim()) return {};
    const payload = this.parseResponse(text);
    if (payload.error) {
      const error = payload.error as JsonObject;
      throw new Error(`Meta MCP: ${String(error.message ?? "erro na ferramenta")}`);
    }
    return (payload.result ?? payload) as JsonObject;
  }

  async initialize() {
    if (this.initialized) return;
    await this.post({
      jsonrpc: "2.0",
      id: ++this.id,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "projeto-washington", version: "0.1.0" },
      },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, true);
    this.initialized = true;
  }

  async tools() {
    await this.initialize();
    const result = await this.post({ jsonrpc: "2.0", id: ++this.id, method: "tools/list", params: {} });
    return (Array.isArray(result.tools) ? result.tools : []) as McpTool[];
  }

  async call(name: string, args: JsonObject) {
    await this.initialize();
    return this.post({
      jsonrpc: "2.0",
      id: ++this.id,
      method: "tools/call",
      params: { name, arguments: args },
    });
  }
}

function matchTool(tools: McpTool[], explicit: string | undefined, pattern: RegExp) {
  const tool = explicit ? tools.find((item) => item.name === explicit) : tools.find((item) => pattern.test(`${item.name} ${item.description ?? ""}`));
  if (!tool) throw new Error("O Meta MCP conectado não oferece a ferramenta de leitura necessária.");
  if (!isReadOnlyTool(tool)) throw new Error("Uma ferramenta de escrita foi recusada pelo adapter Meta.");
  return tool;
}

function argumentsFor(tool: McpTool, accountId: string, range: DateRange, level: RawMetricRow["level"]) {
  const properties = (tool.inputSchema?.properties ?? {}) as JsonObject;
  const args: JsonObject = {};
  for (const name of Object.keys(properties)) {
    if (/^(ad_?)?account_?id$/i.test(name)) args[name] = accountId;
    else if (/^(since|start|start_date|date_start)$/i.test(name)) args[name] = range.start;
    else if (/^(until|end|end_date|date_end)$/i.test(name)) args[name] = range.end;
    else if (/^level$/i.test(name)) args[name] = level;
    else if (/^time_range$/i.test(name)) args[name] = { since: range.start, until: range.end };
  }
  return args;
}

export class MetaMcpProvider implements MetaProvider {
  readonly name = "meta_mcp";
  private readonly client: McpClient;

  constructor(private readonly options: McpOptions) {
    if (!options.endpoint || !options.accessToken) throw new Error("Endpoint e autenticação OAuth do Meta MCP são obrigatórios.");
    this.client = new McpClient(options.endpoint, options.accessToken, options.fetchImpl ?? fetch);
  }

  private async resolvedTools() {
    const tools = await this.client.tools();
    return {
      accounts: matchTool(tools, this.options.listAccountsTool, /(list|get|fetch).*(ad.?accounts?)|ad.?accounts?.*(list|get|fetch)/i),
      insights: matchTool(tools, this.options.insightsTool, /(insights?|report|performance)/i),
    };
  }

  async listAccounts() {
    const { accounts } = await this.resolvedTools();
    const result = parseMcpContent(await this.client.call(accounts.name, {}));
    return objectsFrom(result).map((item) => ({
      id: String(item.id ?? item.account_id ?? item.ad_account_id),
      name: String(item.name ?? item.account_name ?? item.id),
      currency: String(item.currency ?? "BRL"),
      timezone: String(item.timezone ?? item.timezone_name ?? "UTC"),
    }));
  }

  private async insights(tool: McpTool, config: ReportConfig, range: DateRange, level: RawMetricRow["level"]) {
    const result = parseMcpContent(
      await this.client.call(tool.name, argumentsFor(tool, config.accountId, range, level)),
    );
    return objectsFrom(result).map((row) => mapInsightRow(row, level));
  }

  async fetchSnapshot(config: ReportConfig): Promise<RawMetaSnapshot> {
    const tools = await this.resolvedTools();
    const accounts = await this.listAccounts();
    const account = accounts.find((item) => item.id === config.accountId) ?? accounts.find((item) => item.id.replace(/^act_/, "") === config.accountId.replace(/^act_/, ""));
    if (!account) throw new Error("A conta selecionada não está autorizada no Meta MCP.");
    const levels: RawMetricRow["level"][] = ["account", "campaign", "adset", "ad"];
    const [current, previous] = await Promise.all([
      Promise.all(levels.map((level) => this.insights(tools.insights, config, config.period, level))),
      config.comparisonPeriod
        ? Promise.all(levels.map((level) => this.insights(tools.insights, config, config.comparisonPeriod!, level)))
        : Promise.resolve(levels.map(() => [] as RawMetricRow[])),
    ]);
    return {
      source: "meta_mcp",
      capturedAt: new Date().toISOString(),
      account: {
        ...account,
        attribution: {
          clickDays: null,
          viewDays: null,
          description: "Janela de atribuição não informada pelo MCP",
        },
      },
      period: config.period,
      comparisonPeriod: config.comparisonPeriod,
      current: current.flat(),
      previous: previous.flat(),
      rawReference: `meta-mcp://${config.accountId}/${config.period.start}/${config.period.end}`,
      warnings: ["O MCP não informou a janela de atribuição; confirme no Gerenciador de Anúncios."],
    };
  }
}
