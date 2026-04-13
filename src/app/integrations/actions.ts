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
  fetchAuditHistory,
  fetchActivityForIntegration,
} from "@/lib/firebase-integrations";
import {
  pollDevinSession,
  completeAudit,
  spawnDevinSession,
  buildAuditPrompt,
  AUDIT_STRUCTURED_OUTPUT_SCHEMA,
} from "@/lib/devin-session";
import { getAllCronJobStates } from "@/lib/firebase-cron";
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
import type { CronJobState } from "@/types/cron";

export type {
  Integration,
  ScoutRepo,
  ActivityLogEntry,
  ManagerSummary,
  ScoutSummary,
  SdkState,
  CronJobState,
};

interface ActionResult {
  success: boolean;
  error?: string;
}

// ─── Read actions ────────────────────────────────────────────────

export async function getInitialManagerData(): Promise<{
  integrations: Integration[];
  sdkState: SdkState | null;
  cronStates: CronJobState[];
}> {
  const [integrations, sdkState, cronStates] = await Promise.all([
    fetchIntegrations(),
    getSdkState(),
    getAllCronJobStates(),
  ]);
  return { integrations, sdkState, cronStates };
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

// ─── Audit actions (uses shared devin-session helpers) ─────────────────

export async function triggerAudit(
  integrationId: string,
): Promise<ActionResult & { session_id?: string; session_url?: string }> {
  try {
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
    const session = await spawnDevinSession(
      prompt,
      `Audit: ${integration.name}`,
      AUDIT_STRUCTURED_OUTPUT_SCHEMA,
    );

    await updateIntegrationAuditStatus(integrationId, "running", {
      session_id: session.session_id,
      session_url: session.url,
    });

    await addActivityLogEntry({
      actor: "dashboard",
      action: "audit_triggered",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: `Audit session started: ${session.url}`,
      pr_url: null,
    });

    return {
      success: true,
      session_id: session.session_id,
      session_url: session.url,
    };
  } catch (error) {
    console.error("[Integrations] triggerAudit failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkAuditStatus(
  integrationId: string,
): Promise<ActionResult & { audit_status?: string; result?: unknown; session_url?: string }> {
  try {
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

    const sessionState = await pollDevinSession(integration.audit_session_id);

    if (sessionState.isFailed || sessionState.isFinished) {
      await completeAudit(integration, sessionState, "manual");
      return {
        success: true,
        audit_status: sessionState.isFailed ? "failed" : "completed",
        result: sessionState.structured_output ?? null,
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
