import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { parseReportAnalysis } from "../../../../../lib/llm/schema";
import { validateAnalysis } from "../../../../../lib/llm/validator";
import {
  approveReportVersion,
  getSnapshotForRun,
} from "../../../../../lib/storage/report-repository";

export const dynamic = "force-dynamic";

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
    const analysis = parseReportAnalysis(payload.analysis);
    const snapshot = await getSnapshotForRun("washington_internal", runId);
    const validation = validateAnalysis(analysis, snapshot);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "A versão editada não passou pela validação.", validation },
        { status: 422 },
      );
    }
    await approveReportVersion(
      { runId, workspaceId: "washington_internal", actorId: user.userId },
      versionId,
      analysis,
    );
    return NextResponse.json({ approved: true, validation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível aprovar o relatório." },
      { status: 500 },
    );
  }
}
