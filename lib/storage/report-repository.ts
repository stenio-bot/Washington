import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  auditLogs,
  normalizedSnapshots,
  rawSnapshots,
  reportAnalyses,
  reportArtifacts,
  reportRuns,
  reportVersions,
} from "../../db/schema";
import type {
  AnalysisValidation,
  LlmRunResult,
  NormalizedSnapshot,
  RawMetaSnapshot,
  ReportAnalysis,
  ReportConfig,
} from "../report/types";

const RETENTION_MONTHS = 12;

function now() {
  return new Date().toISOString();
}

function expiresAt() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + RETENTION_MONTHS);
  return date.toISOString();
}

export interface ReportRunIdentity {
  runId: string;
  workspaceId: string;
  actorId: string;
}

export async function createReportRun(
  identity: ReportRunIdentity,
  config: ReportConfig,
) {
  const db = getDb();
  const timestamp = now();
  await db.insert(reportRuns).values({
    id: identity.runId,
    workspaceId: identity.workspaceId,
    clientId: config.clientId,
    adAccountId: config.accountId,
    requestedBy: identity.actorId,
    status: "extracting",
    configJson: JSON.stringify(config),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    workspaceId: identity.workspaceId,
    actorId: identity.actorId,
    action: "report_run.created",
    entityType: "report_run",
    entityId: identity.runId,
    metadataJson: JSON.stringify({ objective: config.objective, accountId: config.accountId }),
    createdAt: timestamp,
  });
}

export async function storeSnapshot(
  identity: ReportRunIdentity,
  raw: RawMetaSnapshot,
  snapshot: NormalizedSnapshot,
) {
  const db = getDb();
  const timestamp = now();
  const expiry = expiresAt();
  await db.batch([
    db.insert(rawSnapshots).values({
      id: crypto.randomUUID(),
      reportRunId: identity.runId,
      workspaceId: identity.workspaceId,
      source: raw.source,
      sourceHash: snapshot.sourceHash,
      rawReference: raw.rawReference,
      payloadJson: JSON.stringify(raw),
      expiresAt: expiry,
      createdAt: timestamp,
    }),
    db.insert(normalizedSnapshots).values({
      id: snapshot.id,
      reportRunId: identity.runId,
      workspaceId: identity.workspaceId,
      source: snapshot.source,
      sourceHash: snapshot.sourceHash,
      periodStart: snapshot.config.period.start,
      periodEnd: snapshot.config.period.end,
      currency: snapshot.account.currency,
      timezone: snapshot.account.timezone,
      attributionJson: JSON.stringify(snapshot.account.attribution),
      snapshotJson: JSON.stringify(snapshot),
      qualityScore: snapshot.quality.score,
      expiresAt: expiry,
      createdAt: timestamp,
    }),
    db
      .update(reportRuns)
      .set({ status: "analyzing", updatedAt: timestamp })
      .where(eq(reportRuns.id, identity.runId)),
  ]);
}

export async function storeAnalysisAndDraft(
  identity: ReportRunIdentity,
  snapshot: NormalizedSnapshot,
  llm: LlmRunResult,
  validation: AnalysisValidation,
) {
  const db = getDb();
  const timestamp = now();
  const versionId = crypto.randomUUID();
  await db.batch([
    db.insert(reportAnalyses).values({
      id: crypto.randomUUID(),
      reportRunId: identity.runId,
      snapshotId: snapshot.id,
      provider: llm.provider,
      model: llm.model,
      promptVersion: llm.promptVersion,
      outputJson: JSON.stringify(llm.analysis),
      validationJson: JSON.stringify(validation),
      durationMs: llm.durationMs,
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
      estimatedCostMicros: null,
      createdAt: timestamp,
    }),
    db.insert(reportVersions).values({
      id: versionId,
      reportRunId: identity.runId,
      versionNumber: 1,
      contentJson: JSON.stringify(llm.analysis),
      status: "draft",
      createdBy: identity.actorId,
      createdAt: timestamp,
    }),
    db
      .update(reportRuns)
      .set({ status: "review", updatedAt: timestamp })
      .where(eq(reportRuns.id, identity.runId)),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId: identity.workspaceId,
      actorId: identity.actorId,
      action: "report_analysis.validated",
      entityType: "report_run",
      entityId: identity.runId,
      metadataJson: JSON.stringify({
        provider: llm.provider,
        model: llm.model,
        promptVersion: llm.promptVersion,
      }),
      createdAt: timestamp,
    }),
  ]);
  return versionId;
}

export async function markReportFailed(
  identity: ReportRunIdentity,
  code: string,
  message: string,
) {
  const db = getDb();
  await db
    .update(reportRuns)
    .set({
      status: "failed",
      errorCode: code,
      errorMessage: message,
      updatedAt: now(),
    })
    .where(eq(reportRuns.id, identity.runId));
}

export async function approveReportVersion(
  identity: ReportRunIdentity,
  versionId: string,
  content: ReportAnalysis,
) {
  const db = getDb();
  const timestamp = now();
  const version = await db
    .select()
    .from(reportVersions)
    .where(eq(reportVersions.id, versionId))
    .limit(1);
  if (!version[0] || version[0].reportRunId !== identity.runId) {
    throw new Error("Versão não encontrada para esta execução.");
  }
  await db.batch([
    db
      .update(reportVersions)
      .set({
        contentJson: JSON.stringify(content),
        status: "approved",
        approvedBy: identity.actorId,
        approvedAt: timestamp,
      })
      .where(eq(reportVersions.id, versionId)),
    db
      .update(reportRuns)
      .set({ status: "approved", updatedAt: timestamp })
      .where(eq(reportRuns.id, identity.runId)),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId: identity.workspaceId,
      actorId: identity.actorId,
      action: "report_version.approved",
      entityType: "report_version",
      entityId: versionId,
      metadataJson: "{}",
      createdAt: timestamp,
    }),
  ]);
}

export async function getSnapshotForRun(workspaceId: string, runId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(normalizedSnapshots)
    .where(eq(normalizedSnapshots.reportRunId, runId))
    .limit(1);
  const row = rows[0];
  if (!row || row.workspaceId !== workspaceId) throw new Error("Snapshot não encontrado.");
  return JSON.parse(row.snapshotJson) as NormalizedSnapshot;
}

export async function getApprovedReportForArtifact(
  workspaceId: string,
  runId: string,
  versionId: string,
) {
  const db = getDb();
  const runRows = await db
    .select()
    .from(reportRuns)
    .where(eq(reportRuns.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run || run.workspaceId !== workspaceId) {
    throw new Error("Execução não encontrada neste workspace.");
  }
  const versionRows = await db
    .select()
    .from(reportVersions)
    .where(eq(reportVersions.id, versionId))
    .limit(1);
  const version = versionRows[0];
  if (!version || version.reportRunId !== runId || version.status !== "approved") {
    throw new Error("Somente uma versão aprovada pode gerar o PDF.");
  }
  return {
    snapshot: await getSnapshotForRun(workspaceId, runId),
    analysis: JSON.parse(version.contentJson) as ReportAnalysis,
  };
}

export async function storeArtifactMetadata(
  identity: ReportRunIdentity,
  versionId: string,
  objectKey: string,
  sizeBytes: number,
  checksum: string,
) {
  const db = getDb();
  const timestamp = now();
  await db.batch([
    db
      .insert(reportArtifacts)
      .values({
        id: crypto.randomUUID(),
        reportRunId: identity.runId,
        reportVersionId: versionId,
        objectKey,
        contentType: "application/pdf",
        sizeBytes,
        checksum,
        createdAt: timestamp,
      })
      .onConflictDoUpdate({
        target: reportArtifacts.reportVersionId,
        set: { objectKey, sizeBytes, checksum, createdAt: timestamp },
      }),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      workspaceId: identity.workspaceId,
      actorId: identity.actorId,
      action: "report_artifact.created",
      entityType: "report_version",
      entityId: versionId,
      metadataJson: JSON.stringify({ objectKey, sizeBytes, checksum }),
      createdAt: timestamp,
    }),
  ]);
}
