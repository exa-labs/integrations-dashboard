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
} from "@/lib/firebase-integrations";
import type {
  Integration,
  IntegrationType,
  IntegrationUpdateContext,
  ScoutRepo,
  ActivityLogEntry,
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
  summary: ManagerSummary;
  sdkState: SdkState | null;
}> {
  const [integrations, sdkState] = await Promise.all([
    fetchIntegrations(),
    getSdkState(),
  ]);
  const summary: ManagerSummary = {
    total: integrations.length,
    outdated: integrations.filter((i) => i.health === "outdated").length,
    healthy: integrations.filter((i) => i.health === "healthy").length,
    needs_audit: integrations.filter((i) => i.health === "needs_audit").length,
  };
  return { integrations, summary, sdkState };
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

// ─── Audit actions ──────────────────────────────────────────────

export async function triggerAudit(
  integrationId: string,
): Promise<ActionResult & { session_id?: string; session_url?: string }> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { success: false, error: "CRON_SECRET not configured" };
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
    if (!baseUrl) {
      return { success: false, error: "BASE_URL not configured (set NEXT_PUBLIC_BASE_URL or VERCEL_URL)" };
    }
    const protocol = baseUrl.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${baseUrl}/api/integrations/audit`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integration_id: integrationId }),
    });

    const data = (await response.json()) as {
      success?: boolean;
      error?: string;
      session_id?: string;
      session_url?: string;
    };

    if (!response.ok) {
      return {
        success: false,
        error: data.error ?? `HTTP ${response.status}`,
        session_id: data.session_id,
        session_url: data.session_url,
      };
    }

    return {
      success: true,
      session_id: data.session_id,
      session_url: data.session_url,
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
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { success: false, error: "CRON_SECRET not configured" };
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
    if (!baseUrl) {
      return { success: false, error: "BASE_URL not configured (set NEXT_PUBLIC_BASE_URL or VERCEL_URL)" };
    }
    const protocol = baseUrl.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${baseUrl}/api/integrations/audit/status`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integration_id: integrationId }),
    });

    const data = (await response.json()) as {
      status?: string;
      result?: unknown;
      session_url?: string;
      error?: string;
    };

    if (!response.ok) {
      return { success: false, error: data.error ?? `HTTP ${response.status}` };
    }

    return {
      success: true,
      audit_status: data.status,
      result: data.result,
      session_url: data.session_url,
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
