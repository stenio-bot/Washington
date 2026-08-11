import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildReferenceAnalysis } from "../lib/llm/reference-analysis";
import { fixtureConfig, fixtureSnapshot } from "../lib/meta/fixtures";
import { normalizeSnapshot } from "../lib/report/metrics";
import { createReportPdfBytes } from "../lib/report/pdf";

const snapshot = await normalizeSnapshot(fixtureConfig("ecommerce"), fixtureSnapshot("ecommerce"));
const analysis = buildReferenceAnalysis(snapshot);
const bytes = await createReportPdfBytes(snapshot, analysis);
const outputDirectory = resolve("output/pdf");
const outputPath = resolve(outputDirectory, "projeto-washington-relatorio-exemplo.pdf");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, bytes);
process.stdout.write(`${outputPath}\n`);
