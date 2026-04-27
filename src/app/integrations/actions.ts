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
  updateGhostPrStatus,
  fetchAuditHistory,
  fetchActivityForIntegration,
  updateIntegrationBenchmark,
  clearIntegrationBenchmark,
} from "@/lib/firebase-integrations";
import { computeBenchmark } from "@/lib/api-surface";
import {
  pollDevinSession,
  completeAudit,
  spawnDevinSession,
  buildAuditPrompt,
  buildGhostPrPrompt,
  AUDIT_STRUCTURED_OUTPUT_SCHEMA,
  GHOST_PR_STRUCTURED_OUTPUT_SCHEMA,
} from "@/lib/devin-session";
import { getAllCronJobStates } from "@/lib/firebase-cron";
import type {
  Integration,
  IntegrationType,
  BaselineType,
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
  baselineType?: BaselineType,
): Promise<ActionResult> {
  try {
    await addIntegration({ name, slug, type, baseline_type: baselineType, repo, update_context: updateContext });

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: slug,
      target_name: name,
      details: `Added integration: ${name}`,
      pr_url: null,
    });

    if (updateContext.capabilities) {
      const result = computeBenchmark(type, updateContext.capabilities, false, baselineType);
      await updateIntegrationBenchmark(slug, {
        score: result.score,
        endpoint_coverage: result.endpoint_coverage,
        search_type_coverage: updateContext.capabilities.supported_search_types,
        content_option_coverage: updateContext.capabilities.supported_content_options,
        missing_endpoints: result.missing_endpoints,
        missing_search_types: result.missing_search_types,
        missing_content_options: result.missing_content_options,
        sdk_version_match: false,
      });
    }

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
  extra?: { name?: string; type?: IntegrationType; repo?: string; baseline_type?: BaselineType },
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

    if (context.capabilities) {
      const integration = await getIntegration(integrationId);
      if (integration) {
        const type = extra?.type ?? integration.type;
        const sdkVersionMatch =
          !!integration.current_sdk_version &&
          !!integration.latest_sdk_version &&
          integration.current_sdk_version === integration.latest_sdk_version;

        const result = computeBenchmark(type, context.capabilities, sdkVersionMatch, extra?.baseline_type ?? integration.baseline_type);

        await updateIntegrationBenchmark(integrationId, {
          score: result.score,
          endpoint_coverage: result.endpoint_coverage,
          search_type_coverage: context.capabilities.supported_search_types,
          content_option_coverage: context.capabilities.supported_content_options,
          missing_endpoints: result.missing_endpoints,
          missing_search_types: result.missing_search_types,
          missing_content_options: result.missing_content_options,
          sdk_version_match: sdkVersionMatch,
        });
      }
    } else {
      await clearIntegrationBenchmark(integrationId);
    }

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

// ─── Benchmark actions ────────────────────────────────────────────

export async function recalculateBenchmark(
  integrationId: string,
): Promise<ActionResult> {
  try {
    const integration = await getIntegration(integrationId);
    if (!integration) {
      return { success: false, error: "Integration not found" };
    }

    const caps = integration.update_context.capabilities;
    if (!caps) {
      return { success: false, error: "No capabilities declared for this integration" };
    }

    const sdkVersionMatch =
      !!integration.current_sdk_version &&
      !!integration.latest_sdk_version &&
      integration.current_sdk_version === integration.latest_sdk_version;

    const result = computeBenchmark(integration.type, caps, sdkVersionMatch, integration.baseline_type);

    await updateIntegrationBenchmark(integrationId, {
      score: result.score,
      endpoint_coverage: result.endpoint_coverage,
      search_type_coverage: caps.supported_search_types,
      content_option_coverage: caps.supported_content_options,
      missing_endpoints: result.missing_endpoints,
      missing_search_types: result.missing_search_types,
      missing_content_options: result.missing_content_options,
      sdk_version_match: sdkVersionMatch,
    });

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: `Benchmark recalculated: ${result.score}/100`,
      pr_url: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[Integrations] recalculateBenchmark failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function recalculateAllBenchmarks(): Promise<ActionResult & { updated?: number; skipped?: number }> {
  try {
    const integrations = await fetchIntegrations();
    let updated = 0;
    let skipped = 0;

    for (const integration of integrations) {
      const caps = integration.update_context.capabilities;
      if (!caps) {
        skipped++;
        continue;
      }

      const sdkVersionMatch =
        !!integration.current_sdk_version &&
        !!integration.latest_sdk_version &&
        integration.current_sdk_version === integration.latest_sdk_version;

      const result = computeBenchmark(integration.type, caps, sdkVersionMatch, integration.baseline_type);

      await updateIntegrationBenchmark(integration._id, {
        score: result.score,
        endpoint_coverage: result.endpoint_coverage,
        search_type_coverage: caps.supported_search_types,
        content_option_coverage: caps.supported_content_options,
        missing_endpoints: result.missing_endpoints,
        missing_search_types: result.missing_search_types,
        missing_content_options: result.missing_content_options,
        sdk_version_match: sdkVersionMatch,
      });
      updated++;
    }

    await addActivityLogEntry({
      actor: "dashboard-user",
      action: "note",
      target_type: "integration",
      target_id: "bulk",
      target_name: "All Integrations",
      details: `Bulk benchmark recalculation: ${updated} updated, ${skipped} skipped`,
      pr_url: null,
    });

    return { success: true, updated, skipped };
  } catch (error) {
    console.error("[Integrations] recalculateAllBenchmarks failed:", error);
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

// ─── Bulk Audit ─────────────────────────────────────────────────

export async function triggerBulkAudit(): Promise<
  ActionResult & { triggered: number; skipped: number; errors: string[] }
> {
  try {
    const integrations = await fetchIntegrations();
    const eligible = integrations.filter(
      (i) => i.audit_status !== "running" && i.approval_status !== "in_progress"
        && i.baseline_type !== "first_party" && i.baseline_type !== "na",
    );
    const skipped = integrations.length - eligible.length;

    let triggered = 0;
    const errors: string[] = [];

    for (const integration of eligible) {
      try {
        const prompt = buildAuditPrompt(integration);
        const session = await spawnDevinSession(
          prompt,
          `Audit: ${integration.name}`,
          AUDIT_STRUCTURED_OUTPUT_SCHEMA,
        );

        await updateIntegrationAuditStatus(integration._id, "running", {
          session_id: session.session_id,
          session_url: session.url,
        });

        await addActivityLogEntry({
          actor: "dashboard",
          action: "audit_triggered",
          target_type: "integration",
          target_id: integration._id,
          target_name: integration.name,
          details: `Bulk audit session started: ${session.url}`,
          pr_url: null,
        });

        triggered++;
      } catch (err) {
        errors.push(
          `${integration.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    return { success: true, triggered, skipped, errors };
  } catch (error) {
    console.error("[Integrations] triggerBulkAudit failed:", error);
    return {
      success: false,
      triggered: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Ghost-mode PR ──────────────────────────────────────────────

export async function triggerGhostPr(
  integrationId: string,
): Promise<ActionResult & { session_id?: string; session_url?: string }> {
  try {
    if (!process.env.GHOST_GITHUB_TOKEN) {
      return { success: false, error: "GHOST_GITHUB_TOKEN not configured" };
    }

    const integration = await getIntegration(integrationId);
    if (!integration) {
      return { success: false, error: "Integration not found" };
    }

    if (integration.approval_status !== "approved") {
      return { success: false, error: "Integration must be approved before creating a ghost PR" };
    }

    const prompt = buildGhostPrPrompt(integration);
    const session = await spawnDevinSession(
      prompt,
      `Ghost PR: ${integration.name}`,
      GHOST_PR_STRUCTURED_OUTPUT_SCHEMA,
    );

    await updateGhostPrStatus(integrationId, {
      ghost_pr_session_id: session.session_id,
      ghost_pr_session_url: session.url,
      ghost_pr_started_at: new Date(),
      ghost_pr_url: null,
      approval_status: "in_progress",
    });

    await addActivityLogEntry({
      actor: "dashboard",
      action: "ghost_pr_started",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: `Ghost PR session started: ${session.url}`,
      pr_url: null,
    });

    return {
      success: true,
      session_id: session.session_id,
      session_url: session.url,
    };
  } catch (error) {
    console.error("[Integrations] triggerGhostPr failed:", error);
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
