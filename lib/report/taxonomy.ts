import type {
  AudienceCategory,
  CreativeFormat,
  RawMetaSnapshot,
  RawMetricRow,
  TaxonomyClassification,
} from "./types";

export const TAXONOMY_RULES_VERSION = "washington-taxonomy-v1";
export const TAXONOMY_CONVENTION =
  "[PUBLICO] [FORMATO] Nome livre — exemplo: [FRIO] [VIDEO] Prova social 01";

const audienceLabels: Record<AudienceCategory, string> = {
  cold: "Público frio",
  warm: "Público morno",
  hot: "Público quente",
  remarketing: "Remarketing",
  unclassified: "Não classificado",
};

const formatLabels: Record<CreativeFormat, string> = {
  video: "Vídeo",
  static: "Estático",
  carousel: "Carrossel",
  reels: "Reels",
  stories: "Stories",
  catalog: "Catálogo",
  collection: "Coleção",
  unclassified: "Não classificado",
};

const audienceAliases: Record<Exclude<AudienceCategory, "unclassified">, string[]> = {
  cold: ["frio", "cold", "prospecting", "prospeccao", "broad", "aberto"],
  warm: ["morno", "warm", "engajados", "engaged", "lal", "lookalike"],
  hot: ["quente", "hot"],
  remarketing: ["remarketing", "retargeting", "retarget", "rmkt"],
};

const formatAliases: Record<Exclude<CreativeFormat, "unclassified">, string[]> = {
  video: ["video", "vid"],
  static: ["estatico", "static", "imagem", "image"],
  carousel: ["carrossel", "carousel"],
  reels: ["reels", "reel"],
  stories: ["stories", "story"],
  catalog: ["catalogo", "catalog", "dpa"],
  collection: ["colecao", "collection"],
};

function tokens(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function classifyAtSources<T extends string>(
  sources: Array<{ source: TaxonomyClassification["source"]; value: string | null | undefined }>,
  aliases: Record<string, string[]>,
  labels: Record<string, string>,
): TaxonomyClassification {
  for (const item of sources) {
    const sourceTokens = tokens(item.value);
    const matches = Object.entries(aliases)
      .map(([key, values]) => ({
        key,
        tokens: values.filter((alias) => sourceTokens.has(alias)),
      }))
      .filter((match) => match.tokens.length > 0);
    if (matches.length === 1) {
      const match = matches[0];
      return {
        value: match.key as T,
        label: labels[match.key],
        status: "explicit",
        source: item.source,
        matchedTokens: match.tokens,
      };
    }
    if (matches.length > 1) {
      return {
        value: "unclassified",
        label: labels.unclassified,
        status: "ambiguous",
        source: item.source,
        matchedTokens: matches.flatMap((match) => match.tokens),
      };
    }
  }
  return {
    value: "unclassified",
    label: labels.unclassified,
    status: "unclassified",
    source: null,
    matchedTokens: [],
  };
}

export function classifyAdTaxonomy(
  row: RawMetricRow,
  creative: NonNullable<RawMetaSnapshot["creatives"]>[number] | undefined,
) {
  const audience = classifyAtSources<AudienceCategory>(
    [
      { source: "adset_name", value: row.adsetName },
      { source: "campaign_name", value: row.campaignName },
      { source: "ad_name", value: row.adName ?? row.entityName },
    ],
    audienceAliases,
    audienceLabels,
  );
  const format = classifyAtSources<CreativeFormat>(
    [
      { source: "ad_name", value: row.adName ?? row.entityName },
      { source: "creative_name", value: creative?.creativeName },
      { source: "campaign_name", value: row.campaignName },
    ],
    formatAliases,
    formatLabels,
  );
  return { audience, format };
}

export function taxonomyLabel(value: AudienceCategory | CreativeFormat) {
  return audienceLabels[value as AudienceCategory] ?? formatLabels[value as CreativeFormat] ?? value;
}
