import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    externalUserId: text("external_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_users_external_user_id").on(table.externalUserId),
    index("idx_users_workspace_id").on(table.workspaceId),
  ],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    objective: text("objective", { enum: ["ecommerce", "leads"] }).notNull(),
    settingsJson: text("settings_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [index("idx_clients_workspace_id").on(table.workspaceId)],
);

export const metaConnections = sqliteTable(
  "meta_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    provider: text("provider", { enum: ["mcp", "marketing_api"] }).notNull(),
    status: text("status", { enum: ["pending", "active", "expired", "error"] }).notNull(),
    credentialRef: text("credential_ref"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    lastCheckedAt: text("last_checked_at"),
    ...timestamps,
  },
  (table) => [index("idx_meta_connections_workspace_id").on(table.workspaceId)],
);

export const adAccounts = sqliteTable(
  "ad_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    clientId: text("client_id").notNull(),
    connectionId: text("connection_id"),
    metaAccountId: text("meta_account_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    attributionJson: text("attribution_json").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_ad_accounts_workspace_meta").on(table.workspaceId, table.metaAccountId),
    index("idx_ad_accounts_client_id").on(table.clientId),
  ],
);

export const reportRuns = sqliteTable(
  "report_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    clientId: text("client_id").notNull(),
    adAccountId: text("ad_account_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    status: text("status", {
      enum: ["queued", "extracting", "analyzing", "review", "approved", "failed"],
    }).notNull(),
    configJson: text("config_json").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    index("idx_report_runs_workspace_created").on(table.workspaceId, table.createdAt),
    index("idx_report_runs_status").on(table.status),
  ],
);

export const normalizedSnapshots = sqliteTable(
  "normalized_snapshots",
  {
    id: text("id").primaryKey(),
    reportRunId: text("report_run_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    source: text("source").notNull(),
    sourceHash: text("source_hash").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    attributionJson: text("attribution_json").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    qualityScore: integer("quality_score").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_snapshots_report_run").on(table.reportRunId),
    index("idx_snapshots_workspace_created").on(table.workspaceId, table.createdAt),
  ],
);

export const rawSnapshots = sqliteTable(
  "raw_snapshots",
  {
    id: text("id").primaryKey(),
    reportRunId: text("report_run_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    source: text("source").notNull(),
    sourceHash: text("source_hash").notNull(),
    rawReference: text("raw_reference"),
    payloadJson: text("payload_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_raw_snapshots_report_run").on(table.reportRunId),
    index("idx_raw_snapshots_workspace_created").on(table.workspaceId, table.createdAt),
  ],
);

export const reportAnalyses = sqliteTable(
  "report_analyses",
  {
    id: text("id").primaryKey(),
    reportRunId: text("report_run_id").notNull(),
    snapshotId: text("snapshot_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputJson: text("output_json").notNull(),
    validationJson: text("validation_json").notNull(),
    durationMs: integer("duration_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostMicros: integer("estimated_cost_micros"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_report_analyses_report_run").on(table.reportRunId)],
);

export const reportVersions = sqliteTable(
  "report_versions",
  {
    id: text("id").primaryKey(),
    reportRunId: text("report_run_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    contentJson: text("content_json").notNull(),
    status: text("status", { enum: ["draft", "approved"] }).notNull(),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_report_versions_run_number").on(table.reportRunId, table.versionNumber),
  ],
);

export const reportArtifacts = sqliteTable(
  "report_artifacts",
  {
    id: text("id").primaryKey(),
    reportRunId: text("report_run_id").notNull(),
    reportVersionId: text("report_version_id").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_report_artifacts_version").on(table.reportVersionId)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_audit_logs_workspace_created").on(table.workspaceId, table.createdAt)],
);
