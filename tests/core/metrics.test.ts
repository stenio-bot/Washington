import assert from "node:assert/strict";
import test from "node:test";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";

test("calcula métricas de e-commerce sem depender da LLM", async () => {
  const config = fixtureConfig("ecommerce");
  const snapshot = await normalizeSnapshot(config, fixtureSnapshot("ecommerce"));

  assert.equal(snapshot.metrics.spend, 48_200);
  assert.equal(snapshot.metrics.purchaseValue, 178_500);
  assert.equal(snapshot.metrics.purchases, 622);
  assert.ok(Math.abs((snapshot.metrics.roas ?? 0) - 178_500 / 48_200) < 0.000001);
  assert.ok(Math.abs((snapshot.metrics.costPerPurchase ?? 0) - 48_200 / 622) < 0.000001);
  assert.equal(snapshot.quality.status, "ready");
  assert.equal(snapshot.campaigns.some((item) => item.classification === "highlight"), true);
  assert.equal(snapshot.campaigns.some((item) => item.classification === "attention"), true);
});

test("calcula métricas de leads e respeita volume relevante", async () => {
  const config = fixtureConfig("leads");
  const snapshot = await normalizeSnapshot(config, fixtureSnapshot("leads"));

  assert.equal(snapshot.metrics.spend, 21_800);
  assert.equal(snapshot.metrics.leads, 684);
  assert.ok(Math.abs((snapshot.metrics.costPerLead ?? 0) - 21_800 / 684) < 0.000001);
  assert.equal(snapshot.quality.status, "ready");
  assert.equal(snapshot.campaigns.find((item) => item.id === "cmp_leads_2")?.classification, "highlight");
  assert.equal(snapshot.campaigns.find((item) => item.id === "cmp_leads_3")?.classification, "attention");
});

test("diferencia ausência de dado de zero e bloqueia KPI central ausente", async () => {
  const config = fixtureConfig("ecommerce");
  const raw = fixtureSnapshot("ecommerce");
  raw.current = raw.current.map((row) => ({ ...row, purchaseValue: null }));
  const snapshot = await normalizeSnapshot(config, raw);

  assert.equal(snapshot.metrics.purchaseValue, null);
  assert.equal(snapshot.metrics.roas, null);
  assert.equal(snapshot.quality.status, "blocked");
  assert.equal(snapshot.quality.alerts.some((alert) => alert.code === "missing_purchaseValue"), true);
});
