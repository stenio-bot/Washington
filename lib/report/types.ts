export type ReportObjective = "ecommerce" | "leads";
export type DataSource = "fixture" | "meta_mcp" | "marketing_api";
export type ReportTone = "executivo" | "consultivo" | "direto";
export type ReportFocus = "geral" | "eficiencia" | "escala" | "criativos";

export interface DateRange {
  start: string;
  end: string;
}

export interface AttributionSetting {
  clickDays: number | null;
  viewDays: number | null;
  description: string;
}

export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "linkClicks"
  | "purchases"
  | "purchaseValue"
  | "leads"
  | "cpm"
  | "cpc"
  | "ctr"
  | "frequency"
  | "costPerPurchase"
  | "roas"
  | "averageOrderValue"
  | "costPerLead"
  | "conversionRate";

export interface ReportConfig {
  workspaceId: string;
  clientId: string;
  clientName: string;
  accountId: string;
  accountName: string;
  objective: ReportObjective;
  period: DateRange;
  comparisonPeriod: DateRange | null;
  tone: ReportTone;
  focus: ReportFocus;
  context: string;
  goals: Partial<Record<MetricKey, number>>;
}

export interface RawMetricRow {
  level: "account" | "campaign" | "adset" | "ad";
  entityId: string;
  entityName: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  spend?: number | null;
  impressions?: number | null;
  reach?: number | null;
  linkClicks?: number | null;
  purchases?: number | null;
  purchaseValue?: number | null;
  leads?: number | null;
}

export interface RawMetaSnapshot {
  source: DataSource;
  capturedAt: string;
  account: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    attribution: AttributionSetting;
  };
  period: DateRange;
  comparisonPeriod: DateRange | null;
  current: RawMetricRow[];
  previous: RawMetricRow[];
  creatives?: Array<{
    adId: string;
    adName: string;
    campaignId: string | null;
    adsetId: string | null;
    creativeId: string | null;
    creativeName: string | null;
    thumbnailUrl: string | null;
  }>;
  rawReference?: string;
  warnings: string[];
}

export type MetricValues = Record<MetricKey, number | null>;

export interface MetricComparison {
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export interface CampaignMetricSummary {
  id: string;
  name: string;
  current: MetricValues;
  previous: MetricValues;
  comparisons: Record<MetricKey, MetricComparison>;
  shareOfSpend: number | null;
  relevantVolume: boolean;
  classification: "highlight" | "attention" | "stable" | "insufficient_volume";
}

export interface QualityAlert {
  code: string;
  severity: "info" | "warning" | "blocking";
  message: string;
  affectedMetrics: MetricKey[];
}

export interface EvidenceMetric {
  ref: string;
  label: string;
  metric: MetricKey;
  scope: "account" | "campaign";
  entityId: string;
  entityName: string;
  current: number | null;
  previous: number | null;
  percentChange: number | null;
  formattedCurrent: string;
  formattedPrevious: string;
  formattedPercentChange: string;
}

export interface NormalizedSnapshot {
  id: string;
  source: DataSource;
  sourceHash: string;
  capturedAt: string;
  config: ReportConfig;
  account: RawMetaSnapshot["account"];
  metrics: MetricValues;
  previousMetrics: MetricValues;
  comparisons: Record<MetricKey, MetricComparison>;
  campaigns: CampaignMetricSummary[];
  evidence: Record<string, EvidenceMetric>;
  quality: {
    score: number;
    status: "ready" | "partial" | "blocked";
    alerts: QualityAlert[];
  };
  sourceWarnings: string[];
}

export interface AnalysisClaim {
  text: string;
  evidenceRefs: string[];
}

export interface AnalysisHypothesis extends AnalysisClaim {
  validation: string;
}

export interface AnalysisRecommendation {
  priority: "alta" | "media" | "baixa";
  action: string;
  evidenceRefs: string[];
  rationale: string;
  expectedImpact: string;
  risk: string;
  validation: string;
}

export interface ReportAnalysis {
  executiveSummary: string;
  facts: AnalysisClaim[];
  interpretations: AnalysisClaim[];
  hypotheses: AnalysisHypothesis[];
  campaignHighlights: AnalysisClaim[];
  recommendations: AnalysisRecommendation[];
  limitations: string[];
  confidence: "alta" | "media" | "baixa";
}

export interface AnalysisValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checkedEvidenceRefs: string[];
}

export interface LlmRunResult {
  analysis: ReportAnalysis;
  provider: string;
  model: string;
  promptVersion: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  rawResponse: unknown;
}
