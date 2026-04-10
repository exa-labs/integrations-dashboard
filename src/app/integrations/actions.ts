"use server";

import {
  fetchIntegrations,
  updateIntegrationHealth,
  updateIntegrationApproval,
  fetchScoutRepos,
  getScoutSummary,
  updateScoutRepoOutreach,
  fetchActivityLog,
  addActivityLogEntry,
  getSdkState,
} from "@/lib/firebase-integrations";
import type {
  Integration,
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
