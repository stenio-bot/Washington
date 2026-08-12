import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildReferenceAnalysis } from "../lib/llm/reference-analysis";
import { fixtureConfig, fixtureSnapshot } from "../lib/meta/fixtures";
import { normalizeSnapshot } from "../lib/report/metrics";
import { createReportPdfBytes } from "../lib/report/pdf";
import type { ReportAudience } from "../lib/report/types";

const outputDirectory = resolve("output/pdf");
await mkdir(outputDirectory, { recursive: true });

for (const audience of ["client", "internal"] satisfies ReportAudience[]) {
  const base = fixtureConfig("ecommerce");
  const config = {
    ...base,
    clientId: "client_duracril",
    clientName: "Duracril",
    audience,
    goals: {},
    context:
      "A queda está concentrada entre clique e compra. Tráfego e frequência permaneceram saudáveis.",
    actionsTaken:
      "Meta: verba concentrada nas frentes de melhor desempenho. Ajuste aplicado em 11/08.",
    nextSteps:
      "Acompanhar a nova composição e validar página, oferta e rastreamento antes de ampliar verba.",
    pendingInputs: "Confirmar o ajuste exato no Meta, o teto do PMax e a margem do produto.",
  };
  const raw = fixtureSnapshot("ecommerce");
  raw.current = raw.current.map((row) => ({
    ...row,
    purchases: row.purchases === null ? null : Math.round(row.purchases * 0.45),
    purchaseValue: row.purchaseValue === null ? null : row.purchaseValue * 0.45,
  }));
  const snapshot = await normalizeSnapshot(config, raw);
  const analysis = buildReferenceAnalysis(snapshot);
  const bytes = await createReportPdfBytes(snapshot, analysis);
  const outputPath = resolve(
    outputDirectory,
    `projeto-washington-duracril-${audience === "client" ? "cliente" : "interno"}.pdf`,
  );
  await writeFile(outputPath, bytes);
  process.stdout.write(`${outputPath}\n`);
}
