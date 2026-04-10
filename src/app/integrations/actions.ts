"use server";

import {
  fetchIntegrations,
  updateIntegrationHealth,
  updateIntegrationApproval,
  addIntegration,
  updateIntegrationContext,
  deleteIntegration,
  getIntegration,
  fetchScoutRepos,
  getScoutSummary,
  updateScoutRepoOutreach,
  fetchActivityLog,
  addActivityLogEntry,
  getSdkState,
  updateIntegrationAuditStatus,
  addAuditHistoryEntry,
  fetchAuditHistory,
  fetchActivityForIntegration,
} from "@/lib/firebase-integrations";
import type {
  Integration,
  IntegrationType,
  IntegrationUpdateContext,
  ScoutRepo,
  ActivityLogEntry,
  AuditHistoryEntry,
  ManagerSummary,
  ScoutSummary,
  SdkState,
  IntegrationHealth,
  ActivityAction,
} from "@/types/integrations";

export type {
  Integration,
  ScoutRepo,
  ActivityLogEntry,
  ManagerSummary,
  ScoutSummary,
  SdkState,
};

interface ActionResult {
  success: boolean;
  error?: string;
}

// ─── Read actions ────────────────────────────────────────────────

export async function getInitialManagerData(): Promise<{
  integrations: Integration[];
  sdkState: SdkState | null;
}> {
  const [integrations, sdkState] = await Promise.all([
    fetchIntegrations(),
    getSdkState(),
  ]);
  return { integrations, sdkState };
}

export async function getInitialScoutData(): Promise<{
  repos: ScoutRepo[];
  summary: ScoutSummary;
}> {
  const [repos, summary] = await Promise.all([
    fetchScoutRepos({ limit: 200 }),
    getScoutSummary(),
  ]);
  return { repos, summary };
}

export async function getInitialActivityData(): Promise<{
  entries: ActivityLogEntry[];
}> {
  const entries = await fetchActivityLog({ limit: 100 });
  return { entries };
}

// ─── Write actions ───────────────────────────────────────────────

export async function markIntegrationFixed(
  integrationId: string,
  notes: string,
  prUrl?: string,
): Promise<ActionResult> {
  try {
    await updateIntegrationHealth(integrationId, "healthy");

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "mark_fixed",
      target_type: "integration",
      target_id: integrationId,
      target_name: integrationId,
      details: notes || "Marked as fixed",
      pr_url: prUrl ?? null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] markFixed failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function markRepoContacted(
  repoId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await updateScoutRepoOutreach(repoId, "contacted", "dashboard-user");

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "outreach_sent",
      target_type: "scout_repo",
      target_id: repoId,
      target_name: repoId.replace("__", "/"),
      details: notes || "Outreach sent",
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] markContacted failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function logManualAction(
  action: ActivityAction,
  targetType: "integration" | "scout_repo" | "general",
  targetId: string | null,
  targetName: string,
  details: string,
  prUrl?: string,
): Promise<ActionResult> {
  try {
    await addActivityLogEntry({
      actor: "dashboard-user",
      action,
      target_type: targetType,
      target_id: targetId,
      target_name: targetName,
      details,
      pr_url: prUrl ?? null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] logAction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function approveIntegrationUpdate(
  integrationId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await updateIntegrationApproval(
      integrationId,
      "approved",
      "dashboard-user",
    );

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "update_approved",
      target_type: "integration",
      target_id: integrationId,
      target_name: integrationId,
      details: notes || "Update approved — ghost-mode PR will be triggered",
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] approve failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Integration CRUD ────────────────────────────────────────────

export async function addNewIntegration(
  name: string,
  slug: string,
  type: IntegrationType,
  repo: string,
  updateContext: IntegrationUpdateContext,
): Promise<ActionResult> {
  try {
    await addIntegration({ name, slug, type, repo, update_context: updateContext });

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: slug,
      target_name: name,
      details: `Added integration: ${name}`,
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] addNew failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function editIntegrationContext(
  integrationId: string,
  integrationName: string,
  context: IntegrationUpdateContext,
  extra?: { name?: string; type?: IntegrationType; repo?: string },
): Promise<ActionResult> {
  try {
    await updateIntegrationContext(integrationId, context, extra);

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: integrationId,
      target_name: integrationName,
      details: "Updated integration context",
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] editContext failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function removeIntegration(
  integrationId: string,
  integrationName: string,
): Promise<ActionResult> {
  try {
    await deleteIntegration(integrationId);

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: integrationId,
      target_name: integrationName,
      details: `Removed integration: ${integrationName}`,
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] remove failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Audit actions (direct Devin API + Firebase, no HTTP round-trip) ─────

function buildAuditPrompt(integration: Integration): string {
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

export async function triggerAudit(
  integrationId: string,
): Promise<ActionResult & { session_id?: string; session_url?: string }> {
  try {
    const devinApiKey = process.env.DEVIN_API_KEY;
    if (!devinApiKey) {
      return { success: false, error: "DEVIN_API_KEY not configured" };
    }

    const integration = await getIntegration(integrationId);
    if (!integration) {
      return { success: false, error: "Integration not found" };
    }

    if (integration.audit_status === "running") {
      return {
        success: false,
        error: "Audit already running",
        session_id: integration.audit_session_id ?? undefined,
        session_url: integration.audit_session_url ?? undefined,
      };
    }

    const prompt = buildAuditPrompt(integration);

    const devinResponse = await fetch("https://api.devin.ai/v1/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${devinApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        title: `Audit: ${integration.name}`,
        structured_output_schema: {
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
        },
      }),
    });

    if (!devinResponse.ok) {
      const errorText = await devinResponse.text();
      console.error("[Audit] Devin API error:", errorText);
      return { success: false, error: `Devin API error: ${devinResponse.status}` };
    }

    const devinData = (await devinResponse.json()) as {
      session_id: string;
      url: string;
    };

    await updateIntegrationAuditStatus(integrationId, "running", {
      session_id: devinData.session_id,
      session_url: devinData.url,
    });

    await addActivityLogEntry({
      actor: "dashboard",
      action: "audit_triggered",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: `Audit session started: ${devinData.url}`,
      pr_url: null,
    });

    return {
      success: true,
      session_id: devinData.session_id,
      session_url: devinData.url,
    };
  } catch (error) {
    console.error("[Integrations] triggerAudit failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface AuditResult {
  health: IntegrationHealth;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary: string;
}

export async function checkAuditStatus(
  integrationId: string,
): Promise<ActionResult & { audit_status?: string; result?: unknown; session_url?: string }> {
  try {
    const devinApiKey = process.env.DEVIN_API_KEY;
    if (!devinApiKey) {
      return { success: false, error: "DEVIN_API_KEY not configured" };
    }

    const integration = await getIntegration(integrationId);
    if (!integration) {
      return { success: false, error: "Integration not found" };
    }

    if (!integration.audit_session_id) {
      return {
        success: true,
        audit_status: integration.audit_status,
        session_url: integration.audit_session_url ?? undefined,
      };
    }

    // Don't re-process already-completed/failed audits
    if (integration.audit_status === "completed" || integration.audit_status === "failed") {
      return {
        success: true,
        audit_status: integration.audit_status,
        session_url: integration.audit_session_url ?? undefined,
      };
    }

    const devinResponse = await fetch(
      `https://api.devin.ai/v1/session/${integration.audit_session_id}`,
      {
        headers: { Authorization: `Bearer ${devinApiKey}` },
      },
    );

    if (!devinResponse.ok) {
      const errorText = await devinResponse.text();
      console.error("[Audit Status] Devin API error:", errorText);
      return { success: false, error: `Devin API error: ${devinResponse.status}` };
    }

    const session = (await devinResponse.json()) as {
      session_id: string;
      status: string;
      status_enum: string;
      structured_output: Record<string, unknown> | null;
    };

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

    const isFinished = isTerminal || (isBlocked && session.structured_output !== null);

    const isFailed =
      session.status_enum === "failed" || session.status === "failed";

    if (isFailed) {
      await updateIntegrationAuditStatus(integrationId, "failed", {
        result: JSON.stringify({ summary: "Audit session failed" }),
      });
      await addAuditHistoryEntry(integrationId, {
        session_id: integration.audit_session_id ?? "",
        session_url: integration.audit_session_url ?? "",
        started_at: integration.audit_started_at ?? null,
        completed_at: new Date(),
        status: "failed",
        result: JSON.stringify({ summary: "Audit session failed" }),
        health_at_completion: integration.health,
      });
      await addActivityLogEntry({
        actor: "system",
        action: "audit_completed",
        target_type: "integration",
        target_id: integrationId,
        target_name: integration.name,
        details: "Audit session failed",
        pr_url: null,
      });
      return { success: true, audit_status: "failed" };
    }

    if (isFinished) {
      const auditResult = session.structured_output as AuditResult | null;

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
        await updateIntegrationHealth(
          integrationId,
          auditResult.health,
          healthUpdate,
        );
      }

      const resultJson = auditResult
        ? JSON.stringify(auditResult)
        : JSON.stringify({ summary: "Session completed without structured output" });

      await updateIntegrationAuditStatus(integrationId, "completed", {
        result: resultJson,
      });

      await addAuditHistoryEntry(integrationId, {
        session_id: integration.audit_session_id ?? "",
        session_url: integration.audit_session_url ?? "",
        started_at: integration.audit_started_at ?? null,
        completed_at: new Date(),
        status: "completed",
        result: resultJson,
        health_at_completion: auditResult?.health ?? integration.health,
      });

      await addActivityLogEntry({
        actor: "system",
        action: "audit_completed",
        target_type: "integration",
        target_id: integrationId,
        target_name: integration.name,
        details: auditResult
          ? `Audit completed: ${auditResult.health} — ${auditResult.summary}`
          : "Audit completed (no structured output)",
        pr_url: null,
      });

      return {
        success: true,
        audit_status: "completed",
        result: auditResult ?? null,
      };
    }

    // Still running
    return {
      success: true,
      audit_status: "running",
      session_url: integration.audit_session_url ?? undefined,
    };
  } catch (error) {
    console.error("[Integrations] checkAuditStatus failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getIntegrationData(
  integrationId: string,
): Promise<Integration | null> {
  return getIntegration(integrationId);
}

// ─── Filtered fetches ────────────────────────────────────────────

export async function fetchFilteredActivity(options: {
  actor?: string;
  action?: ActivityAction;
  since?: string;
}): Promise<ActivityLogEntry[]> {
  return fetchActivityLog({
    actor: options.actor,
    action: options.action,
    since: options.since ? new Date(options.since) : undefined,
  });
}

export async function fetchFilteredIntegrations(
  healthFilter?: IntegrationHealth,
): Promise<Integration[]> {
  return fetchIntegrations(healthFilter);
}

// ─── Detail page actions ─────────────────────────────────────────

export async function getIntegrationDetail(integrationId: string): Promise<{
  integration: Integration | null;
  auditHistory: AuditHistoryEntry[];
  activity: ActivityLogEntry[];
}> {
  const integration = await getIntegration(integrationId);
  if (!integration) {
    return { integration: null, auditHistory: [], activity: [] };
  }

  const [auditHistory, activity] = await Promise.all([
    fetchAuditHistory(integrationId),
    fetchActivityForIntegration(integrationId),
  ]);

  return { integration, auditHistory, activity };
}

export async function fetchAuditHistoryAction(
  integrationId: string,
): Promise<AuditHistoryEntry[]> {
  return fetchAuditHistory(integrationId);
}

export async function fetchIntegrationActivityAction(
  integrationId: string,
): Promise<ActivityLogEntry[]> {
  return fetchActivityForIntegration(integrationId);
}
