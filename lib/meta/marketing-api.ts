import type {
  AttributionSetting,
  DateRange,
  RawMetaSnapshot,
  RawMetricRow,
  ReportConfig,
} from "../report/types";
import type { MetaProvider } from "./provider";

interface MarketingApiOptions {
  accessToken: string;
  apiVersion: string;
  graphBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

type GraphObject = Record<string, unknown>;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actionValue(
  actions: unknown,
  priority: string[],
) {
  if (!Array.isArray(actions)) return null;
  for (const actionType of priority) {
    const match = actions.find(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as GraphObject).action_type === actionType,
    ) as GraphObject | undefined;
    const value = numberOrNull(match?.value);
    if (value !== null) return value;
  }
  return null;
}

const purchaseActions = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
];
const leadActions = [
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "lead",
];

export function mapInsightRow(row: GraphObject, level: RawMetricRow["level"]): RawMetricRow {
  const idByLevel = {
    account: row.account_id,
    campaign: row.campaign_id,
    adset: row.adset_id,
    ad: row.ad_id,
  };
  const nameByLevel = {
    account: row.account_name,
    campaign: row.campaign_name,
    adset: row.adset_name,
    ad: row.ad_name,
  };
  return {
    level,
    entityId: String(idByLevel[level] ?? "unknown"),
    entityName: String(nameByLevel[level] ?? idByLevel[level] ?? "Sem nome"),
    campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
    campaignName: row.campaign_name ? String(row.campaign_name) : undefined,
    adsetId: row.adset_id ? String(row.adset_id) : undefined,
    adsetName: row.adset_name ? String(row.adset_name) : undefined,
    adId: row.ad_id ? String(row.ad_id) : undefined,
    adName: row.ad_name ? String(row.ad_name) : undefined,
    spend: numberOrNull(row.spend),
    impressions: numberOrNull(row.impressions),
    reach: numberOrNull(row.reach),
    linkClicks: numberOrNull(row.inline_link_clicks),
    purchases: actionValue(row.actions, purchaseActions),
    purchaseValue: actionValue(row.action_values, purchaseActions),
    leads: actionValue(row.actions, leadActions),
  };
}

function parseAttribution(value: unknown): AttributionSetting {
  const specs = Array.isArray(value) ? value : [];
  let clickDays: number | null = null;
  let viewDays: number | null = null;
  for (const item of specs) {
    if (!item || typeof item !== "object") continue;
    const spec = item as GraphObject;
    const days = numberOrNull(spec.window_days);
    if (spec.event_type === "CLICK_THROUGH") clickDays = days;
    if (spec.event_type === "VIEW_THROUGH") viewDays = days;
  }
  const parts = [
    clickDays === null ? null : `${clickDays} dias após clique`,
    viewDays === null ? null : `${viewDays} dias após visualização`,
  ].filter(Boolean);
  return {
    clickDays,
    viewDays,
    description: parts.length > 0 ? parts.join(" e ") : "Janela de atribuição não informada",
  };
}

export class MetaMarketingApiProvider implements MetaProvider {
  readonly name = "marketing_api";
  private readonly accessToken: string;
  private readonly root: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: MarketingApiOptions) {
    if (!options.accessToken) throw new Error("Token de leitura da Marketing API não configurado.");
    if (!/^v\d+\.\d+$/.test(options.apiVersion)) {
      throw new Error("META_GRAPH_API_VERSION deve usar o formato vNN.N.");
    }
    this.accessToken = options.accessToken;
    this.root = `${(options.graphBaseUrl ?? "https://graph.facebook.com").replace(/\/$/, "")}/${options.apiVersion}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(pathOrUrl: string, params?: Record<string, string>) {
    const url = new URL(pathOrUrl.startsWith("http") ? pathOrUrl : `${this.root}/${pathOrUrl.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const payload = (await response.json()) as GraphObject;
    if (!response.ok || payload.error) {
      const error = payload.error as GraphObject | undefined;
      throw new Error(`Meta Marketing API: ${String(error?.message ?? response.statusText)}`);
    }
    return payload;
  }

  private async paginated(path: string, params: Record<string, string>) {
    const rows: GraphObject[] = [];
    let payload: GraphObject | null = await this.request(path, params);
    while (payload) {
      const data = Array.isArray(payload.data) ? payload.data : [];
      rows.push(...(data.filter((item): item is GraphObject => Boolean(item && typeof item === "object"))));
      const paging = payload.paging as GraphObject | undefined;
      const next = typeof paging?.next === "string" ? paging.next : null;
      payload = next ? await this.request(next) : null;
    }
    return rows;
  }

  async listAccounts() {
    const rows = await this.paginated("me/adaccounts", {
      fields: "id,name,currency,timezone_name,account_status",
      limit: "200",
    });
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? row.id),
      currency: String(row.currency ?? "BRL"),
      timezone: String(row.timezone_name ?? "UTC"),
    }));
  }

  private async insights(accountId: string, range: DateRange, level: RawMetricRow["level"]) {
    const fields = [
      "account_id",
      "account_name",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "reach",
      "inline_link_clicks",
      "actions",
      "action_values",
    ].join(",");
    const rows = await this.paginated(`${accountId}/insights`, {
      fields,
      level,
      time_range: JSON.stringify({ since: range.start, until: range.end }),
      use_account_attribution_setting: "true",
      limit: "500",
    });
    return rows.map((row) => mapInsightRow(row, level));
  }

  private async creatives(accountId: string) {
    const rows = await this.paginated(`${accountId}/ads`, {
      fields: "id,name,campaign_id,adset_id,creative{id,name,thumbnail_url}",
      limit: "500",
    });
    return rows.map((row) => {
      const creative = row.creative as GraphObject | undefined;
      return {
        adId: String(row.id),
        adName: String(row.name ?? row.id),
        campaignId: row.campaign_id ? String(row.campaign_id) : null,
        adsetId: row.adset_id ? String(row.adset_id) : null,
        creativeId: creative?.id ? String(creative.id) : null,
        creativeName: creative?.name ? String(creative.name) : null,
        thumbnailUrl: creative?.thumbnail_url ? String(creative.thumbnail_url) : null,
      };
    });
  }

  async fetchSnapshot(config: ReportConfig): Promise<RawMetaSnapshot> {
    const accountId = config.accountId.startsWith("act_") ? config.accountId : `act_${config.accountId}`;
    const account = await this.request(accountId, {
      fields: "id,name,currency,timezone_name,attribution_spec",
    });
    const levels: RawMetricRow["level"][] = ["account", "campaign", "adset", "ad"];
    const [currentByLevel, previousByLevel, creatives] = await Promise.all([
      Promise.all(levels.map((level) => this.insights(accountId, config.period, level))),
      config.comparisonPeriod
        ? Promise.all(levels.map((level) => this.insights(accountId, config.comparisonPeriod!, level)))
        : Promise.resolve(levels.map(() => [] as RawMetricRow[])),
      this.creatives(accountId),
    ]);
    return {
      source: "marketing_api",
      capturedAt: new Date().toISOString(),
      account: {
        id: String(account.id ?? accountId),
        name: String(account.name ?? config.accountName),
        currency: String(account.currency ?? "BRL"),
        timezone: String(account.timezone_name ?? "UTC"),
        attribution: parseAttribution(account.attribution_spec),
      },
      period: config.period,
      comparisonPeriod: config.comparisonPeriod,
      current: currentByLevel.flat(),
      previous: previousByLevel.flat(),
      creatives,
      rawReference: `meta-graph://${accountId}/${config.period.start}/${config.period.end}`,
      warnings: [],
    };
  }
}
