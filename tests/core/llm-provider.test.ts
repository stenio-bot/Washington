import assert from "node:assert/strict";
import test from "node:test";
import { buildReferenceAnalysis } from "../../lib/llm/reference-analysis";
import { OpenAiLlmProvider } from "../../lib/llm/provider";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";

test("envia snapshot normalizado à Responses API com output estruturado", async () => {
  const snapshot = await normalizeSnapshot(fixtureConfig("ecommerce"), fixtureSnapshot("ecommerce"));
  const analysis = buildReferenceAnalysis(snapshot);
  const originalFetch = globalThis.fetch;
  const capturedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    capturedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify(analysis),
        usage: { input_tokens: 1200, output_tokens: 420 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new OpenAiLlmProvider({
      apiKey: "test-key",
      endpoint: "https://example.test/v1/responses",
      model: "gpt-5.6-terra",
    });
    const result = await provider.analyze(snapshot, ["corrigir evidência"]);

    assert.equal(result.analysis.executiveSummary, analysis.executiveSummary);
    assert.equal(result.inputTokens, 1200);
    assert.equal(result.outputTokens, 420);
    const capturedBody = capturedBodies[0];
    assert.ok(capturedBody);
    assert.equal(capturedBody.store, false);
    assert.equal(capturedBody.model, "gpt-5.6-terra");
    const text = capturedBody.text as Record<string, unknown>;
    const format = text.format as Record<string, unknown>;
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    assert.equal(JSON.stringify(capturedBody).includes("corrigir evidência"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
