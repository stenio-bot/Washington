import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildReferenceAnalysis } from "../../lib/llm/reference-analysis";
import { fixtureConfig, fixtureSnapshot } from "../../lib/meta/fixtures";
import { normalizeSnapshot } from "../../lib/report/metrics";
import { createReportPdfBytes } from "../../lib/report/pdf";

test("gera relatório PDF auditável com exatamente cinco páginas", async () => {
  for (const objective of ["ecommerce", "leads"] as const) {
    const snapshot = await normalizeSnapshot(fixtureConfig(objective), fixtureSnapshot(objective));
    const analysis = buildReferenceAnalysis(snapshot);
    const bytes = await createReportPdfBytes(snapshot, analysis);
    const pdf = await PDFDocument.load(bytes);

    assert.equal(pdf.getPageCount(), 5);
    assert.equal(pdf.getSubject(), `sourceHash:${snapshot.sourceHash}`);
    assert.match(pdf.getTitle() ?? "", /Projeto Washington/);
    assert.ok(bytes.length > 10_000);
  }
});
