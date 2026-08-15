import assert from "node:assert/strict";
import test from "node:test";
import { buildReferenceAnalysis } from "../../lib/llm/reference-analysis";
import { validateAnalysis } from "../../lib/llm/validator";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";
import { classifyAdTaxonomy } from "../../lib/report/taxonomy";
import type { RawMetricRow } from "../../lib/report/types";

test("classifica público e formato somente por tokens explícitos", () => {
  const row: RawMetricRow = {
    level: "ad",
    entityId: "ad_1",
    entityName: "[FRIO] [VIDEO] Prova social 01",
    campaignName: "Aquisição",
    adsetName: "[FRIO] Broad",
    adName: "[FRIO] [VIDEO] Prova social 01",
  };
  const result = classifyAdTaxonomy(row, undefined);

  assert.equal(result.audience.value, "cold");
  assert.equal(result.audience.status, "explicit");
  assert.equal(result.format.value, "video");
  assert.equal(result.format.status, "explicit");
});

test("não escolhe uma categoria quando o mesmo nome é ambíguo", () => {
  const row: RawMetricRow = {
    level: "ad",
    entityId: "ad_2",
    entityName: "Peça 02",
    adsetName: "[FRIO] [RMKT] Misturado",
    adName: "Peça 02",
  };
  const result = classifyAdTaxonomy(row, undefined);

  assert.equal(result.audience.value, "unclassified");
  assert.equal(result.audience.status, "ambiguous");
  assert.equal(result.format.value, "unclassified");
});

test("agrega investimento por público e formato antes da LLM", async () => {
  const snapshot = await normalizeSnapshot(
    fixtureConfig("ecommerce"),
    fixtureSnapshot("ecommerce"),
  );
  const audienceSpend = snapshot.creativeAnalysis.audience.reduce(
    (total, item) => total + (item.current.spend ?? 0),
    0,
  );

  assert.equal(audienceSpend, snapshot.metrics.spend);
  assert.equal(snapshot.creativeAnalysis.coverage.audience.rateBySpend, 1);
  assert.equal(snapshot.creativeAnalysis.coverage.format.rateBySpend, 1);
  assert.equal(snapshot.evidence["breakdown.audience.cold.spend"].current, 31_200);
});

test("bloqueia conclusões por público quando a nomenclatura tem baixa cobertura", async () => {
  const config = { ...fixtureConfig("ecommerce"), focus: "criativos" as const };
  const raw = fixtureSnapshot("ecommerce");
  raw.current = raw.current.map((row) =>
    row.level === "ad"
      ? { ...row, entityName: "Peça sem padrão", adName: "Peça sem padrão", adsetName: "Conjunto geral", campaignName: "Campanha geral" }
      : row,
  );
  const snapshot = await normalizeSnapshot(config, raw);
  const analysis = buildReferenceAnalysis(snapshot);
  const validation = validateAnalysis(analysis, snapshot);

  assert.equal(snapshot.creativeAnalysis.coverage.audience.eligibleForNarrative, false);
  assert.equal(snapshot.quality.status, "partial");
  assert.equal(analysis.narrative.findings.some((item) => item.evidenceRefs.some((ref) => ref.startsWith("breakdown.audience."))), false);
  assert.equal(validation.valid, true);
});
