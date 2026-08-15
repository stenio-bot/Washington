import type {
  CampaignMetricSummary,
  CreativeAnalysis,
  EvidenceMetric,
  MetricComparison,
  MetricKey,
  MetricValues,
  NormalizedSnapshot,
  QualityAlert,
  RawMetaSnapshot,
  RawMetricRow,
  ReportConfig,
  ReportObjective,
} from "./types";
import { assessPerformance, buildContextEvidence } from "./performance";
import {
  classifyAdTaxonomy,
  TAXONOMY_CONVENTION,
  TAXONOMY_RULES_VERSION,
  taxonomyLabel,
} from "./taxonomy";

export const metricKeys: MetricKey[] = [
  "spend",
  "impressions",
  "reach",
  "linkClicks",
  "purchases",
  "purchaseValue",
  "leads",
  "cpm",
  "cpc",
  "ctr",
  "frequency",
  "costPerPurchase",
  "roas",
  "averageOrderValue",
  "costPerLead",
  "conversionRate",
];

export const metricLabels: Record<MetricKey, string> = {
  spend: "Investimento",
  impressions: "Impressões",
  reach: "Alcance",
  linkClicks: "Cliques no link",
  purchases: "Compras",
  purchaseValue: "Receita atribuída",
  leads: "Leads",
  cpm: "CPM",
  cpc: "CPC",
  ctr: "CTR",
  frequency: "Frequência",
  costPerPurchase: "Custo por compra",
  roas: "ROAS",
  averageOrderValue: "Valor médio por compra",
  costPerLead: "Custo por lead",
  conversionRate: "Taxa de conversão",
};

const currencyMetrics = new Set<MetricKey>([
  "spend",
  "purchaseValue",
  "cpm",
  "cpc",
  "costPerPurchase",
  "averageOrderValue",
  "costPerLead",
]);
const percentMetrics = new Set<MetricKey>(["ctr", "conversionRate"]);
const integerMetrics = new Set<MetricKey>([
  "impressions",
  "reach",
  "linkClicks",
  "purchases",
  "leads",
]);

function safeDivide(numerator: number | null, denominator: number | null, factor = 1) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * factor;
}

function sumPresent(rows: RawMetricRow[], key: keyof RawMetricRow) {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

export function rawToMetrics(rows: RawMetricRow[], objective: ReportObjective): MetricValues {
  const spend = sumPresent(rows, "spend");
  const impressions = sumPresent(rows, "impressions");
  const reach = sumPresent(rows, "reach");
  const linkClicks = sumPresent(rows, "linkClicks");
  const purchases = sumPresent(rows, "purchases");
  const purchaseValue = sumPresent(rows, "purchaseValue");
  const leads = sumPresent(rows, "leads");

  return {
    spend,
    impressions,
    reach,
    linkClicks,
    purchases,
    purchaseValue,
    leads,
    cpm: safeDivide(spend, impressions, 1000),
    cpc: safeDivide(spend, linkClicks),
    ctr: safeDivide(linkClicks, impressions, 100),
    frequency: safeDivide(impressions, reach),
    costPerPurchase: safeDivide(spend, purchases),
    roas: safeDivide(purchaseValue, spend),
    averageOrderValue: safeDivide(purchaseValue, purchases),
    costPerLead: safeDivide(spend, leads),
    conversionRate: safeDivide(
      objective === "ecommerce" ? purchases : leads,
      linkClicks,
      100,
    ),
  };
}

function compare(current: number | null, previous: number | null): MetricComparison {
  return {
    current,
    previous,
    absoluteChange:
      current === null || previous === null ? null : current - previous,
    percentChange:
      current === null || previous === null || previous === 0
        ? null
        : ((current - previous) / Math.abs(previous)) * 100,
  };
}

function comparisons(current: MetricValues, previous: MetricValues) {
  return Object.fromEntries(
    metricKeys.map((key) => [key, compare(current[key], previous[key])]),
  ) as Record<MetricKey, MetricComparison>;
}

function campaignRows(rows: RawMetricRow[]) {
  const direct = rows.filter((row) => row.level === "campaign");
  return direct.length > 0 ? direct : rows.filter((row) => row.campaignId);
}

function groupCampaigns(rows: RawMetricRow[]) {
  const grouped = new Map<string, RawMetricRow[]>();
  for (const row of campaignRows(rows)) {
    const id = row.level === "campaign" ? row.entityId : row.campaignId;
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  return grouped;
}

function classifyCampaign(
  objective: ReportObjective,
  current: MetricValues,
  account: MetricValues,
  shareOfSpend: number | null,
) {
  const resultVolume = objective === "ecommerce" ? current.purchases : current.leads;
  const minimumResults = objective === "ecommerce" ? 10 : 20;
  const relevantVolume =
    shareOfSpend !== null && shareOfSpend >= 0.05 && resultVolume !== null && resultVolume >= minimumResults;

  if (!relevantVolume) {
    return { relevantVolume, classification: "insufficient_volume" as const };
  }

  if (objective === "ecommerce" && current.roas !== null && account.roas !== null) {
    if (current.roas >= account.roas * 1.1) return { relevantVolume, classification: "highlight" as const };
    if (current.roas <= account.roas * 0.8) return { relevantVolume, classification: "attention" as const };
  }

  if (objective === "leads" && current.costPerLead !== null && account.costPerLead !== null) {
    if (current.costPerLead <= account.costPerLead * 0.9) return { relevantVolume, classification: "highlight" as const };
    if (current.costPerLead >= account.costPerLead * 1.2) return { relevantVolume, classification: "attention" as const };
  }

  return { relevantVolume, classification: "stable" as const };
}

function buildCampaigns(
  currentRows: RawMetricRow[],
  previousRows: RawMetricRow[],
  objective: ReportObjective,
  accountMetrics: MetricValues,
): CampaignMetricSummary[] {
  const currentGroups = groupCampaigns(currentRows);
  const previousGroups = groupCampaigns(previousRows);
  const ids = new Set([...currentGroups.keys(), ...previousGroups.keys()]);

  return [...ids]
    .map((id) => {
      const currentGroup = currentGroups.get(id) ?? [];
      const previousGroup = previousGroups.get(id) ?? [];
      const current = rawToMetrics(currentGroup, objective);
      const previous = rawToMetrics(previousGroup, objective);
      const first = currentGroup[0] ?? previousGroup[0];
      const name =
        first?.level === "campaign"
          ? first.entityName
          : first?.campaignName ?? `Campanha ${id}`;
      const shareOfSpend = safeDivide(current.spend, accountMetrics.spend);
      const classification = classifyCampaign(objective, current, accountMetrics, shareOfSpend);
      return {
        id,
        name,
        current,
        previous,
        comparisons: comparisons(current, previous),
        shareOfSpend,
        ...classification,
      };
    })
    .sort((a, b) => (b.current.spend ?? 0) - (a.current.spend ?? 0));
}

function emptyCoverage(): CreativeAnalysis["coverage"]["audience"] {
  return {
    eligibleAds: 0,
    classifiedAds: 0,
    totalSpend: null,
    classifiedSpend: null,
    rateByAds: null,
    rateBySpend: null,
    eligibleForNarrative: false,
  };
}

function buildCreativeAnalysis(
  config: ReportConfig,
  raw: RawMetaSnapshot,
): CreativeAnalysis {
  if (config.taxonomyMode === "disabled") {
    return {
      mode: "disabled",
      rulesVersion: TAXONOMY_RULES_VERSION,
      convention: TAXONOMY_CONVENTION,
      audience: [],
      format: [],
      coverage: { audience: emptyCoverage(), format: emptyCoverage() },
    };
  }

  const creativeByAd = new Map((raw.creatives ?? []).map((item) => [item.adId, item]));
  const currentAds = raw.current.filter((row) => row.level === "ad");
  const previousAds = raw.previous.filter((row) => row.level === "ad");

  function classifiedRows(rows: RawMetricRow[], dimension: "audience" | "format") {
    return rows.map((row) => {
      const creative = creativeByAd.get(row.adId ?? row.entityId);
      return { row, classification: classifyAdTaxonomy(row, creative)[dimension] };
    });
  }

  function buildDimension(dimension: "audience" | "format") {
    const current = classifiedRows(currentAds, dimension);
    const previous = classifiedRows(previousAds, dimension);
    const keys = new Set([
      ...current.map((item) => item.classification.value),
      ...previous.map((item) => item.classification.value),
    ]);
    const summaries = [...keys]
      .map((key) => {
        const currentRows = current.filter((item) => item.classification.value === key).map((item) => item.row);
        const previousRows = previous.filter((item) => item.classification.value === key).map((item) => item.row);
        const currentMetrics = rawToMetrics(currentRows, config.objective);
        const previousMetrics = rawToMetrics(previousRows, config.objective);
        const totalSpend = sumPresent(currentAds, "spend");
        return {
          dimension,
          key,
          label: taxonomyLabel(key),
          current: currentMetrics,
          previous: previousMetrics,
          comparisons: comparisons(currentMetrics, previousMetrics),
          shareOfSpend: safeDivide(currentMetrics.spend, totalSpend),
          adCount: new Set(currentRows.map((row) => row.adId ?? row.entityId)).size,
        };
      })
      .sort((a, b) => (b.current.spend ?? 0) - (a.current.spend ?? 0));

    const classified = current.filter((item) => item.classification.status === "explicit");
    const totalSpend = sumPresent(currentAds, "spend");
    const classifiedSpend = sumPresent(classified.map((item) => item.row), "spend");
    const rateByAds = current.length === 0 ? null : classified.length / current.length;
    const rateBySpend = safeDivide(classifiedSpend, totalSpend);
    return {
      summaries,
      coverage: {
        eligibleAds: current.length,
        classifiedAds: classified.length,
        totalSpend,
        classifiedSpend,
        rateByAds,
        rateBySpend,
        eligibleForNarrative: rateBySpend !== null && rateBySpend >= 0.7,
      },
    };
  }

  const audience = buildDimension("audience");
  const format = buildDimension("format");
  return {
    mode: "strict",
    rulesVersion: TAXONOMY_RULES_VERSION,
    convention: TAXONOMY_CONVENTION,
    audience: audience.summaries,
    format: format.summaries,
    coverage: { audience: audience.coverage, format: format.coverage },
  };
}

export function formatMetric(metric: MetricKey, value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (currencyMetrics.has(metric)) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (percentMetrics.has(metric)) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
  }
  if (integerMetrics.has(metric)) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function buildEvidence(
  metrics: MetricValues,
  allComparisons: Record<MetricKey, MetricComparison>,
  campaigns: CampaignMetricSummary[],
  creativeAnalysis: CreativeAnalysis,
  accountId: string,
  accountName: string,
  currency: string,
) {
  const evidence: Record<string, EvidenceMetric> = {};

  for (const key of metricKeys) {
    const comparison = allComparisons[key];
    const ref = `account.${key}`;
    evidence[ref] = {
      ref,
      label: metricLabels[key],
      metric: key,
      scope: "account",
      entityId: accountId,
      entityName: accountName,
      current: metrics[key],
      previous: comparison.previous,
      percentChange: comparison.percentChange,
      formattedCurrent: formatMetric(key, metrics[key], currency),
      formattedPrevious: formatMetric(key, comparison.previous, currency),
      formattedPercentChange: formatChange(comparison.percentChange),
    };
  }

  for (const campaign of campaigns) {
    for (const key of metricKeys) {
      const ref = `campaign.${campaign.id}.${key}`;
      const comparison = campaign.comparisons[key];
      evidence[ref] = {
        ref,
        label: metricLabels[key],
        metric: key,
        scope: "campaign",
        entityId: campaign.id,
        entityName: campaign.name,
        current: campaign.current[key],
        previous: campaign.previous[key],
        percentChange: comparison.percentChange,
        formattedCurrent: formatMetric(key, campaign.current[key], currency),
        formattedPrevious: formatMetric(key, campaign.previous[key], currency),
        formattedPercentChange: formatChange(comparison.percentChange),
      };
    }
  }
  for (const breakdown of [...creativeAnalysis.audience, ...creativeAnalysis.format]) {
    for (const key of metricKeys) {
      const ref = `breakdown.${breakdown.dimension}.${breakdown.key}.${key}`;
      const comparison = breakdown.comparisons[key];
      evidence[ref] = {
        ref,
        label: metricLabels[key],
        metric: key,
        scope: "breakdown",
        entityId: `${breakdown.dimension}:${breakdown.key}`,
        entityName: breakdown.label,
        current: breakdown.current[key],
        previous: breakdown.previous[key],
        percentChange: comparison.percentChange,
        formattedCurrent: formatMetric(key, breakdown.current[key], currency),
        formattedPrevious: formatMetric(key, breakdown.previous[key], currency),
        formattedPercentChange: formatChange(comparison.percentChange),
      };
    }
  }
  return evidence;
}

function assessQuality(
  config: ReportConfig,
  raw: RawMetaSnapshot,
  metrics: MetricValues,
  creativeAnalysis: CreativeAnalysis,
): NormalizedSnapshot["quality"] {
  const alerts: QualityAlert[] = [];
  const required: MetricKey[] =
    config.objective === "ecommerce"
      ? ["spend", "purchases", "purchaseValue", "roas"]
      : ["spend", "leads", "costPerLead"];

  for (const metric of required) {
    if (metrics[metric] === null) {
      alerts.push({
        code: `missing_${metric}`,
        severity: "blocking",
        message: `${metricLabels[metric]} não está disponível para o período selecionado.`,
        affectedMetrics: [metric],
      });
    }
  }

  if (metrics.spend === 0) {
    alerts.push({
      code: "zero_spend",
      severity: "blocking",
      message: "O investimento é zero; não há base suficiente para avaliar eficiência.",
      affectedMetrics: ["spend"],
    });
  }

  const resultVolume = config.objective === "ecommerce" ? metrics.purchases : metrics.leads;
  const lowVolumeLimit = config.objective === "ecommerce" ? 30 : 50;
  if (resultVolume !== null && resultVolume < lowVolumeLimit) {
    alerts.push({
      code: "low_volume",
      severity: "warning",
      message: "O volume é baixo; hipóteses e recomendações devem ter confiança reduzida.",
      affectedMetrics: [config.objective === "ecommerce" ? "purchases" : "leads"],
    });
  }

  if (raw.account.attribution.clickDays === null && raw.account.attribution.viewDays === null) {
    alerts.push({
      code: "missing_attribution",
      severity: "warning",
      message: "A janela de atribuição não foi informada pela fonte.",
      affectedMetrics: config.objective === "ecommerce" ? ["purchaseValue", "purchases"] : ["leads"],
    });
  }

  if (!config.comparisonPeriod || raw.previous.length === 0) {
    alerts.push({
      code: "missing_comparison",
      severity: "info",
      message: "Não há período anterior equivalente para comparação.",
      affectedMetrics: [],
    });
  }

  if (config.taxonomyMode === "strict") {
    const coverageValues = Object.values(creativeAnalysis.coverage);
    if (coverageValues.every((coverage) => coverage.eligibleAds === 0)) {
      alerts.push({
        code: "missing_ad_level_data",
        severity: config.focus === "criativos" ? "warning" : "info",
        message: "A fonte não retornou dados no nível de anúncio; a leitura por público e formato foi omitida.",
        affectedMetrics: [],
      });
    } else if (coverageValues.some((coverage) => !coverage.eligibleForNarrative)) {
      alerts.push({
        code: "low_taxonomy_coverage",
        severity: config.focus === "criativos" ? "warning" : "info",
        message: "A nomenclatura não atingiu a cobertura mínima do investimento em todos os recortes; conclusões incompletas foram bloqueadas.",
        affectedMetrics: [],
      });
    }
  }

  for (const warning of raw.warnings) {
    alerts.push({
      code: "source_warning",
      severity: "warning",
      message: warning,
      affectedMetrics: [],
    });
  }

  const deductions = alerts.reduce((total, alert) => {
    if (alert.severity === "blocking") return total + 30;
    if (alert.severity === "warning") return total + 10;
    return total + 3;
  }, 0);
  const score = Math.max(0, 100 - deductions);
  const status = alerts.some((alert) => alert.severity === "blocking")
    ? "blocked"
    : alerts.some((alert) => alert.severity === "warning")
      ? "partial"
      : "ready";
  return { score, status, alerts };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeSnapshot(
  config: ReportConfig,
  raw: RawMetaSnapshot,
): Promise<NormalizedSnapshot> {
  const currentRows = campaignRows(raw.current);
  const previousRows = campaignRows(raw.previous);
  const metrics = rawToMetrics(currentRows, config.objective);
  const previousMetrics = rawToMetrics(previousRows, config.objective);
  const allComparisons = comparisons(metrics, previousMetrics);
  const campaigns = buildCampaigns(
    currentRows,
    previousRows,
    config.objective,
    metrics,
  );
  const creativeAnalysis = buildCreativeAnalysis(config, raw);
  const sourceHash = await sha256(JSON.stringify({ raw, config }));
  const evidence = buildEvidence(
    metrics,
    allComparisons,
    campaigns,
    creativeAnalysis,
    raw.account.id,
    raw.account.name,
    raw.account.currency,
  );

  const contextEvidence = buildContextEvidence(config);
  if (creativeAnalysis.mode === "strict") {
    for (const dimension of ["audience", "format"] as const) {
      const coverage = creativeAnalysis.coverage[dimension];
      const label = dimension === "audience" ? "público" : "formato";
      const rate = coverage.rateBySpend === null
        ? "indisponível"
        : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(coverage.rateBySpend * 100)}%`;
      contextEvidence[`taxonomy.coverage.${dimension}`] = {
        ref: `taxonomy.coverage.${dimension}`,
        label: `Cobertura da nomenclatura por ${label}`,
        text: `A nomenclatura classificou ${rate} do investimento no recorte de ${label}.`,
        source: "system",
      };
    }
  }
  const baseSnapshot = {
    id: crypto.randomUUID(),
    source: raw.source,
    sourceHash,
    capturedAt: raw.capturedAt,
    config,
    account: raw.account,
    metrics,
    previousMetrics,
    comparisons: allComparisons,
    campaigns,
    creativeAnalysis,
    evidence,
    contextEvidence,
    quality: assessQuality(config, raw, metrics, creativeAnalysis),
    sourceWarnings: raw.warnings,
  };
  return {
    ...baseSnapshot,
    performance: assessPerformance(baseSnapshot),
  };
}
