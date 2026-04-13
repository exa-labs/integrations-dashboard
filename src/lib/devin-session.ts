import {
  updateIntegrationAuditStatus,
  updateIntegrationHealth,
  addAuditHistoryEntry,
  addActivityLogEntry,
} from "./firebase-integrations";
import type {
  Integration,
  IntegrationHealth,
  AuditTriggerSource,
} from "@/types/integrations";

// ─── Devin API Types ─────────────────────────────────────────────

export interface DevinSessionResponse {
  session_id: string;
  status: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
}

export interface DevinSessionState {
  session_id: string;
  status: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
  isFinished: boolean;
  isFailed: boolean;
  isRunning: boolean;
}

export interface AuditResult {
  health: IntegrationHealth;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary: string;
}

export interface ScoutResult {
  repos: Array<{
    full_name: string;
    url: string;
    stars: number;
    star_velocity: number;
    score: "strong" | "medium" | "weak";
    uses_search: string | null;
    readme_summary: string;
    integration_pattern: string | null;
    key_reviewers: string[];
  }>;
  summary: string;
}

// ─── Devin API Helpers ───────────────────────────────────────────

function getDevinApiKey(): string {
  const key = process.env.DEVIN_API_KEY;
  if (!key) throw new Error("DEVIN_API_KEY not configured");
  return key;
}

/**
 * Poll a Devin session and determine its state.
 * Centralizes the isTerminal/isBlocked/isFinished logic.
 */
export async function pollDevinSession(
  sessionId: string,
): Promise<DevinSessionState> {
  const apiKey = getDevinApiKey();

  const response = await fetch(
    `https://api.devin.ai/v1/session/${sessionId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (!response.ok) {
    throw new Error(`Devin API error: ${response.status}`);
  }

  const session = (await response.json()) as DevinSessionResponse;

  // Devin sessions can end in several states:
  // - "stopped"/"finished" = terminal
  // - "blocked" ("awaiting instructions") = session done with work, has structured output
  const isTerminal =
    session.status_enum === "stopped" ||
    session.status_enum === "finished" ||
    session.status === "finished" ||
    session.status === "stopped";

  const isBlocked =
    session.status_enum === "blocked" || session.status === "blocked";

  const isFinished =
    isTerminal || (isBlocked && session.structured_output !== null);

  const isFailed =
    session.status_enum === "failed" || session.status === "failed";

  const isRunning = !isFinished && !isFailed;

  return {
    session_id: session.session_id,
    status: session.status,
    status_enum: session.status_enum,
    structured_output: session.structured_output,
    isFinished,
    isFailed,
    isRunning,
  };
}

/**
 * Spawn a new Devin session with a prompt and structured output schema.
 */
export async function spawnDevinSession(
  prompt: string,
  title: string,
  schema: object,
): Promise<{ session_id: string; url: string }> {
  const apiKey = getDevinApiKey();

  const response = await fetch("https://api.devin.ai/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      title,
      structured_output_schema: schema,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Devin API error: ${response.status} — ${errorText}`);
  }

  const data = (await response.json()) as { session_id: string; url: string };
  return data;
}

// ─── Shared Completion Logic ─────────────────────────────────────

/**
 * Complete an audit for an integration. Handles:
 * - Updating integration health from audit result
 * - Updating audit status to completed/failed
 * - Writing audit history entry (idempotent via session_id)
 * - Writing activity log entry
 * - Setting last_audit_completed_at
 *
 * Called by both the cron orchestrator and the manual checkAuditStatus action.
 * Idempotent — safe to call multiple times for the same audit.
 */
export async function completeAudit(
  integration: Integration,
  sessionState: DevinSessionState,
  triggeredBy: AuditTriggerSource,
): Promise<void> {
  const integrationId = integration._id;
  const sessionId = integration.audit_session_id ?? "";
  const sessionUrl = integration.audit_session_url ?? "";

  if (sessionState.isFailed) {
    await updateIntegrationAuditStatus(integrationId, "failed", {
      result: JSON.stringify({ summary: "Audit session failed" }),
    });

    await addAuditHistoryEntry(integrationId, {
      session_id: sessionId,
      session_url: sessionUrl,
      started_at: integration.audit_started_at ?? null,
      completed_at: new Date(),
      status: "failed",
      result: JSON.stringify({ summary: "Audit session failed" }),
      health_at_completion: integration.health,
      triggered_by: triggeredBy,
    });

    await addActivityLogEntry({
      actor: triggeredBy === "cron" ? "cron/orchestrator" : "system",
      action: "audit_completed",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: "Audit session failed",
      pr_url: null,
    });

    return;
  }

  if (sessionState.isFinished) {
    const auditResult = sessionState.structured_output as AuditResult | null;

    if (auditResult) {
      const healthUpdate: Record<string, unknown> = {};
      if (auditResult.current_sdk_version !== undefined) {
        healthUpdate.current_sdk_version = auditResult.current_sdk_version;
      }
      if (auditResult.latest_sdk_version !== undefined) {
        healthUpdate.latest_sdk_version = auditResult.latest_sdk_version;
      }
      if (auditResult.missing_features !== undefined) {
        healthUpdate.missing_features = auditResult.missing_features;
      }
      if (auditResult.health === "outdated") {
        healthUpdate.outdated_since = new Date();
      }
      await updateIntegrationHealth(
        integrationId,
        auditResult.health,
        healthUpdate,
      );
    }

    const resultJson = auditResult
      ? JSON.stringify(auditResult)
      : JSON.stringify({
          summary: "Session completed without structured output",
        });

    await updateIntegrationAuditStatus(integrationId, "completed", {
      result: resultJson,
    });

    // Set last_audit_completed_at — used by scheduler for priority ordering
    const { getFirestore } = await import("./firebase");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = getFirestore();
    if (db) {
      await db
        .collection("integrations")
        .doc(integrationId)
        .update({
          last_audit_completed_at: FieldValue.serverTimestamp(),
        });
    }

    await addAuditHistoryEntry(integrationId, {
      session_id: sessionId,
      session_url: sessionUrl,
      started_at: integration.audit_started_at ?? null,
      completed_at: new Date(),
      status: "completed",
      result: resultJson,
      health_at_completion: auditResult?.health ?? integration.health,
      triggered_by: triggeredBy,
    });

    await addActivityLogEntry({
      actor: triggeredBy === "cron" ? "cron/orchestrator" : "system",
      action: "audit_completed",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: auditResult
        ? `Audit completed: ${auditResult.health} — ${auditResult.summary}`
        : "Audit completed (no structured output)",
      pr_url: null,
    });
  }
}

// ─── Audit Prompt Builder ────────────────────────────────────────

export function buildAuditPrompt(integration: Integration): string {
  const ctx = integration.update_context;
  const lines = [
    `# Audit: ${integration.name} (${integration.slug})`,
    "",
    `**Type:** ${integration.type}`,
    `**Repo:** ${integration.repo}`,
    ctx.external_repo ? `**External Repo:** ${ctx.external_repo}` : null,
    `**Current SDK Version:** ${integration.current_sdk_version ?? "unknown"}`,
    `**Latest SDK Version:** ${integration.latest_sdk_version ?? "unknown"}`,
    "",
    "## Context",
    ctx.notes || "(no notes)",
    "",
    "## Key Files",
    ctx.key_files.length > 0
      ? ctx.key_files.map((f) => `- ${f}`).join("\n")
      : "(none specified)",
    "",
    "## Commands",
    ctx.build_cmd ? `- **Build:** \`${ctx.build_cmd}\`` : null,
    ctx.test_cmd ? `- **Test:** \`${ctx.test_cmd}\`` : null,
    ctx.publish_cmd ? `- **Publish:** \`${ctx.publish_cmd}\`` : null,
    "",
    integration.missing_features.length > 0
      ? `## Missing Features\n${integration.missing_features.map((f) => `- ${f}`).join("\n")}`
      : null,
    "",
    "## Task",
    "1. Clone the repository and check the current state of the integration.",
    "2. Check which version of the Exa SDK (exa-py or exa-js) is being used, if any.",
    "3. Compare against the latest published SDK version on PyPI/npm.",
    "4. Check if any new Exa API features are missing from this integration.",
    "5. Report your findings using the structured output schema.",
    "",
    "## Structured Output",
    "You MUST provide structured output with these fields:",
    "- `health`: one of 'healthy', 'outdated', 'needs_audit'",
    "- `current_sdk_version`: the version currently used (string or null)",
    "- `latest_sdk_version`: the latest available version (string or null)",
    "- `missing_features`: array of missing feature names",
    "- `summary`: a brief summary of the audit findings",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const AUDIT_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    health: {
      type: "string",
      enum: ["healthy", "outdated", "needs_audit"],
    },
    current_sdk_version: { type: ["string", "null"] },
    latest_sdk_version: { type: ["string", "null"] },
    missing_features: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
  },
  required: ["health", "summary"],
};

// ─── Scout Prompt Builder ────────────────────────────────────────

export function buildScoutPrompt(): string {
  return `# Scout: Discover Exa Integration Repos

## Task
Search for GitHub repositories that use the Exa API (via exa-py or exa-js SDK). Find repos that have meaningful integrations — not just basic examples.

## Steps
1. Search GitHub for repositories that import \`exa_py\` or \`exa-js\` or reference \`api.exa.ai\`
2. For each repo found:
   - Check the star count and recent commit activity
   - Determine the integration depth (simple search call vs deep integration)
   - Identify the integration pattern (search, contents, highlights, etc.)
   - Find key reviewers/maintainers from recent PRs
   - Write a brief summary of what the repo does
3. Score each repo: "strong" (>100 stars, active, deep integration), "medium" (some usage, moderate activity), "weak" (minimal usage or inactive)
4. Return your findings as structured output

## Structured Output
You MUST provide structured output with these fields:
- \`repos\`: array of discovered repos, each with:
  - \`full_name\`: "owner/repo" format
  - \`url\`: GitHub URL
  - \`stars\`: star count
  - \`star_velocity\`: approximate stars per week (0 if unknown)
  - \`score\`: "strong", "medium", or "weak"
  - \`uses_search\`: which Exa endpoints are used (e.g., "search, contents") or null
  - \`readme_summary\`: one-sentence description
  - \`integration_pattern\`: how Exa is used (e.g., "RAG pipeline", "search widget") or null
  - \`key_reviewers\`: array of GitHub usernames of active maintainers
- \`summary\`: brief summary of discovery results
`;
}

export const SCOUT_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    repos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          full_name: { type: "string" },
          url: { type: "string" },
          stars: { type: "number" },
          star_velocity: { type: "number" },
          score: { type: "string", enum: ["strong", "medium", "weak"] },
          uses_search: { type: ["string", "null"] },
          readme_summary: { type: "string" },
          integration_pattern: { type: ["string", "null"] },
          key_reviewers: { type: "array", items: { type: "string" } },
        },
        required: ["full_name", "url", "stars", "score", "readme_summary"],
      },
    },
    summary: { type: "string" },
  },
  required: ["repos", "summary"],
};

// ─── Stuck Session Detection ─────────────────────────────────────

const STUCK_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isSessionStuck(startedAt: Date | null): boolean {
  if (!startedAt) return false;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return elapsed > STUCK_SESSION_TIMEOUT_MS;
}
