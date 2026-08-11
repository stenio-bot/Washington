import assert from "node:assert/strict";
import test from "node:test";
import { buildReferenceAnalysis } from "../../lib/llm/reference-analysis";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";
import { validateAnalysis } from "../../lib/llm/validator";

test("análise de referência passa por validação factual", async () => {
  for (const objective of ["ecommerce", "leads"] as const) {
    const snapshot = await normalizeSnapshot(fixtureConfig(objective), fixtureSnapshot(objective));
    const analysis = buildReferenceAnalysis(snapshot);
    const validation = validateAnalysis(analysis, snapshot);

    assert.deepEqual(validation.errors, []);
    assert.equal(validation.valid, true);
    assert.ok(validation.checkedEvidenceRefs.length >= 3);
    assert.ok(analysis.recommendations.length <= 3);
  }
});

test("validador bloqueia número inventado e referência inexistente", async () => {
  const snapshot = await normalizeSnapshot(fixtureConfig("ecommerce"), fixtureSnapshot("ecommerce"));
  const analysis = buildReferenceAnalysis(snapshot);
  analysis.facts.push({
    text: "Uma campanha cresceu 99% sem sustentação nos dados.",
    evidenceRefs: ["campaign.inexistente.roas"],
  });
  const validation = validateAnalysis(analysis, snapshot);

  assert.equal(validation.valid, false);
  assert.equal(validation.errors.some((error) => error.includes("inexistente")), true);
  assert.equal(validation.errors.some((error) => error.includes("99")), true);
});
