import { env } from "cloudflare:workers";
import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { parseReportAnalysis } from "../../../../../lib/llm/schema";
import { createReportPdfBytes } from "../../../../../lib/report/pdf";
import {
  getApprovedReportForArtifact,
  storeArtifactMetadata,
} from "../../../../../lib/storage/report-repository";

export const dynamic = "force-dynamic";

interface ReportsBucket {
  put(
    key: string,
    value: Uint8Array,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<unknown>;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Autenticação obrigatória." }, { status: 401 });
  try {
    const { runId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const versionId = typeof payload.versionId === "string" ? payload.versionId : "";
    if (!versionId) throw new Error("Versão obrigatória.");
    const report = await getApprovedReportForArtifact("washington_internal", runId, versionId);
    const analysis = parseReportAnalysis(report.analysis);
    const bytes = await createReportPdfBytes(report.snapshot, analysis);
    if (bytes.length < 100 || bytes.length > 20_000_000) throw new Error("Arquivo PDF inválido.");
    const verification = await PDFDocument.load(bytes);
    if (verification.getPageCount() !== 5) {
      throw new Error("O relatório precisa ter exatamente cinco páginas.");
    }
    if (verification.getSubject() !== `sourceHash:${report.snapshot.sourceHash}`) {
      throw new Error("O PDF não corresponde ao snapshot aprovado.");
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    const checksum = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const runtime = env as unknown as Record<string, unknown>;
    const bucket = runtime.REPORTS as ReportsBucket | undefined;
    if (!bucket) throw new Error("Armazenamento privado de relatórios não configurado.");
    const objectKey = `reports/${runId}/${versionId}.pdf`;
    await bucket.put(objectKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { checksum, runId, versionId },
    });
    await storeArtifactMetadata(
      { runId, workspaceId: "washington_internal", actorId: user.userId },
      versionId,
      objectKey,
      bytes.length,
      checksum,
    );
    const filename = `projeto-washington-${runId}.pdf`;
    return new Response(bytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "X-Report-Checksum": checksum,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível armazenar o PDF." },
      { status: 500 },
    );
  }
}
