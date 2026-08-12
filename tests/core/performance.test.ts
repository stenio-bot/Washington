import assert from "node:assert/strict";
import test from "node:test";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";

test("classifica automaticamente um resultado positivo", async () => {
  const snapshot = await normalizeSnapshot(
    fixtureConfig("ecommerce"),
    fixtureSnapshot("ecommerce"),
  );

  assert.equal(snapshot.performance.status, "strong");
  assert.equal(snapshot.performance.source, "automatic");
});

test("classifica uma queda forte como crítica", async () => {
  const config = { ...fixtureConfig("ecommerce"), goals: {} };
  const raw = fixtureSnapshot("ecommerce");
  raw.current = raw.current.map((row) => ({
    ...row,
    purchases: row.purchases === null ? null : Math.round(row.purchases * 0.45),
    purchaseValue: row.purchaseValue === null ? null : row.purchaseValue * 0.45,
  }));
  const snapshot = await normalizeSnapshot(config, raw);

  assert.equal(snapshot.performance.status, "critical");
});

test("aceita classificação editorial manual sem alterar métricas", async () => {
  const base = fixtureConfig("leads");
  const snapshot = await normalizeSnapshot(
    { ...base, performanceStatus: "attention" },
    fixtureSnapshot("leads"),
  );

  assert.equal(snapshot.performance.status, "attention");
  assert.equal(snapshot.performance.source, "manual");
  assert.equal(snapshot.metrics.leads, 684);
});

test("não força tom positivo quando faltam dados comparáveis", async () => {
  const config = fixtureConfig("ecommerce");
  const raw = fixtureSnapshot("ecommerce");
  raw.previous = [];
  const snapshot = await normalizeSnapshot(config, raw);

  assert.equal(snapshot.performance.status, "inconclusive");
});
