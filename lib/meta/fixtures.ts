import type { RawMetaSnapshot, RawMetricRow, ReportConfig, ReportObjective } from "../report/types";

const ecommerceCurrent: RawMetricRow[] = [
  {
    level: "campaign",
    entityId: "cmp_ecom_1",
    entityName: "Advantage+ Shopping",
    spend: 18400,
    impressions: 1_120_000,
    reach: 730_000,
    linkClicks: 18_200,
    purchases: 276,
    purchaseValue: 78_400,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_2",
    entityName: "Remarketing 30d",
    spend: 8100,
    impressions: 510_000,
    reach: 260_000,
    linkClicks: 9_100,
    purchases: 137,
    purchaseValue: 35_300,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_3",
    entityName: "Prospecting Video",
    spend: 12800,
    impressions: 910_000,
    reach: 720_000,
    linkClicks: 10_400,
    purchases: 128,
    purchaseValue: 37_500,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_4",
    entityName: "Catálogo Always On",
    spend: 8900,
    impressions: 560_000,
    reach: 390_000,
    linkClicks: 7_300,
    purchases: 81,
    purchaseValue: 27_300,
    leads: null,
  },
];

const ecommercePrevious: RawMetricRow[] = [
  {
    level: "campaign",
    entityId: "cmp_ecom_1",
    entityName: "Advantage+ Shopping",
    spend: 16100,
    impressions: 1_030_000,
    reach: 690_000,
    linkClicks: 15_900,
    purchases: 241,
    purchaseValue: 65_400,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_2",
    entityName: "Remarketing 30d",
    spend: 7600,
    impressions: 475_000,
    reach: 250_000,
    linkClicks: 8_200,
    purchases: 121,
    purchaseValue: 31_200,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_3",
    entityName: "Prospecting Video",
    spend: 11500,
    impressions: 840_000,
    reach: 680_000,
    linkClicks: 9_800,
    purchases: 116,
    purchaseValue: 31_100,
    leads: null,
  },
  {
    level: "campaign",
    entityId: "cmp_ecom_4",
    entityName: "Catálogo Always On",
    spend: 7680,
    impressions: 510_000,
    reach: 360_000,
    linkClicks: 6_400,
    purchases: 89,
    purchaseValue: 22_426,
    leads: null,
  },
];

const leadsCurrent: RawMetricRow[] = [
  {
    level: "campaign",
    entityId: "cmp_leads_1",
    entityName: "Conversão — Formulário",
    spend: 9200,
    impressions: 590_000,
    reach: 420_000,
    linkClicks: 10_800,
    purchases: null,
    purchaseValue: null,
    leads: 334,
  },
  {
    level: "campaign",
    entityId: "cmp_leads_2",
    entityName: "Remarketing — WhatsApp",
    spend: 5100,
    impressions: 290_000,
    reach: 180_000,
    linkClicks: 5_400,
    purchases: null,
    purchaseValue: null,
    leads: 191,
  },
  {
    level: "campaign",
    entityId: "cmp_leads_3",
    entityName: "Prospecção — Vídeo",
    spend: 7500,
    impressions: 710_000,
    reach: 560_000,
    linkClicks: 8_600,
    purchases: null,
    purchaseValue: null,
    leads: 159,
  },
];

const leadsPrevious: RawMetricRow[] = [
  {
    level: "campaign",
    entityId: "cmp_leads_1",
    entityName: "Conversão — Formulário",
    spend: 8300,
    impressions: 550_000,
    reach: 400_000,
    linkClicks: 9_300,
    purchases: null,
    purchaseValue: null,
    leads: 282,
  },
  {
    level: "campaign",
    entityId: "cmp_leads_2",
    entityName: "Remarketing — WhatsApp",
    spend: 4866,
    impressions: 278_000,
    reach: 176_000,
    linkClicks: 4_900,
    purchases: null,
    purchaseValue: null,
    leads: 171,
  },
  {
    level: "campaign",
    entityId: "cmp_leads_3",
    entityName: "Prospecção — Vídeo",
    spend: 7000,
    impressions: 680_000,
    reach: 540_000,
    linkClicks: 7_900,
    purchases: null,
    purchaseValue: null,
    leads: 143,
  },
];

const ecommerceAdNames = [
  { audience: "[FRIO] Broad", ad: "[FRIO] [VIDEO] Oferta principal 01" },
  { audience: "[RMKT] Visitantes 30d", ad: "[RMKT] [CARROSSEL] Produtos vistos 01" },
  { audience: "[FRIO] Prospecting", ad: "[FRIO] [REELS] Prova social 02" },
  { audience: "[QUENTE] Carrinho", ad: "[QUENTE] [CATALOGO] Always On 01" },
];

const leadsAdNames = [
  { audience: "[FRIO] Broad", ad: "[FRIO] [VIDEO] Formulário 01" },
  { audience: "[RMKT] Engajados", ad: "[RMKT] [STATIC] WhatsApp 01" },
  { audience: "[MORNO] LAL", ad: "[MORNO] [REELS] Depoimento 01" },
];

function adRows(rows: RawMetricRow[], names: Array<{ audience: string; ad: string }>) {
  return rows.map((row, index) => ({
    ...row,
    level: "ad" as const,
    entityId: `ad_${row.entityId}`,
    entityName: names[index].ad,
    campaignId: row.entityId,
    campaignName: row.entityName,
    adsetId: `adset_${row.entityId}`,
    adsetName: names[index].audience,
    adId: `ad_${row.entityId}`,
    adName: names[index].ad,
  }));
}

export function fixtureConfig(objective: ReportObjective): ReportConfig {
  const ecommerce = objective === "ecommerce";
  return {
    workspaceId: "ws_demo",
    clientId: ecommerce ? "client_aurora" : "client_horizonte",
    clientName: ecommerce ? "Loja Aurora" : "Clínica Horizonte",
    accountId: ecommerce ? "act_2094000108" : "act_4851000322",
    accountName: ecommerce ? "Loja Aurora — Principal" : "Clínica Horizonte — Leads",
    objective,
    period: { start: "2026-07-01", end: "2026-07-31" },
    comparisonPeriod: { start: "2026-06-01", end: "2026-06-30" },
    tone: "executivo",
    focus: "geral",
    audience: "client",
    performanceStatus: "auto",
    taxonomyMode: "strict",
    context: ecommerce
      ? "O cliente realizou uma promoção sazonal durante a segunda quinzena."
      : "A qualidade comercial dos leads ainda precisa ser validada no CRM.",
    actionsTaken: ecommerce
      ? "Verba concentrada gradualmente nas campanhas com maior eficiência observada."
      : "Distribuição revisada para reduzir diluição entre frentes de captação.",
    nextSteps: "Acompanhar a nova composição e revisar eficiência após uma janela completa de dados.",
    pendingInputs: ecommerce
      ? "Confirmar margem e receita na plataforma de vendas."
      : "Confirmar qualidade, oportunidades e vendas no CRM.",
    nextReviewDate: "2026-08-18",
    goals: ecommerce ? { roas: 3.5, costPerPurchase: 80 } : { costPerLead: 35 },
  };
}

export function fixtureSnapshot(objective: ReportObjective): RawMetaSnapshot {
  const config = fixtureConfig(objective);
  return {
    source: "fixture",
    capturedAt: "2026-08-11T12:00:00.000Z",
    account: {
      id: config.accountId,
      name: config.accountName,
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      attribution: {
        clickDays: 7,
        viewDays: 1,
        description: "7 dias após clique e 1 dia após visualização",
      },
    },
    period: config.period,
    comparisonPeriod: config.comparisonPeriod,
    current: objective === "ecommerce"
      ? [...ecommerceCurrent, ...adRows(ecommerceCurrent, ecommerceAdNames)]
      : [...leadsCurrent, ...adRows(leadsCurrent, leadsAdNames)],
    previous: objective === "ecommerce"
      ? [...ecommercePrevious, ...adRows(ecommercePrevious, ecommerceAdNames)]
      : [...leadsPrevious, ...adRows(leadsPrevious, leadsAdNames)],
    creatives: (objective === "ecommerce" ? ecommerceAdNames : leadsAdNames).map((item, index) => ({
      adId: objective === "ecommerce" ? `ad_cmp_ecom_${index + 1}` : `ad_cmp_leads_${index + 1}`,
      adName: item.ad,
      campaignId: objective === "ecommerce" ? `cmp_ecom_${index + 1}` : `cmp_leads_${index + 1}`,
      adsetId: objective === "ecommerce" ? `adset_cmp_ecom_${index + 1}` : `adset_cmp_leads_${index + 1}`,
      creativeId: `creative_${objective}_${index + 1}`,
      creativeName: item.ad,
      thumbnailUrl: null,
    })),
    rawReference: `fixture://${objective}/2026-07`,
    warnings: [],
  };
}
