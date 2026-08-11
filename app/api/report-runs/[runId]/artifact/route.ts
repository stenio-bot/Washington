import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { storeArtifactMetadata } from "../../../../../lib/storage/report-repository";

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
    const versionId = request.headers.get("x-report-version-id");
    if (!versionId) throw new Error("Versão obrigatória.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 20_000_000) throw new Error("Arquivo PDF inválido.");
    const signature = new TextDecoder().decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") throw new Error("O arquivo enviado não é um PDF.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
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
    return NextResponse.json({ stored: true, checksum });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível armazenar o PDF." },
      { status: 500 },
    );
  }
}
