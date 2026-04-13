import { NextRequest, NextResponse } from "next/server";
import { fetchIntegrations } from "@/lib/firebase-integrations";
import {
  acquireTickLock,
  releaseTickLock,
  recordCronSpawn,
  recordCronError,
  updateScoutSession,
} from "@/lib/firebase-cron";
import {
  pollDevinSession,
  completeAudit,
  spawnDevinSession,
  buildAuditPrompt,
  buildScoutPrompt,
  isSessionStuck,
  AUDIT_STRUCTURED_OUTPUT_SCHEMA,
  SCOUT_STRUCTURED_OUTPUT_SCHEMA,
} from "@/lib/devin-session";
import {
  updateIntegrationAuditStatus,
  updateIntegrationHealth,
  addActivityLogEntry,
  upsertScoutRepos,
  getKnownRepoSlugs,
  updateGhostPrStatus,
} from "@/lib/firebase-integrations";
import type { CronJobState } from "@/types/cron";
import type { Integration } from "@/types/integrations";
import {
  notifyAuditCompleted,
  notifyStrongScoutFinds,
} from "@/lib/slack";

// ─── Constants ───────────────────────────────────────────────────

const MAX_POLLS_PER_TICK = 5; // Max running sessions to poll per tick
const MAX_SPAWNS_PER_TICK = 2; // Max new audit sessions to spawn per tick

// ─── Auth ────────────────────────────────────────────────────────

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

// ─── Main Handler ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // Process scout first (fast — one session check)
  try {
    const scoutResult = await processScoutJob();
    summary.scout = scoutResult;
  } catch (error) {
    console.error("[Orchestrator] Scout error:", error);
    summary.scout = {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Process audits (heavier — multiple sessions)
  try {
    const auditResult = await processAuditJob();
    summary.audit = auditResult;
  } catch (error) {
    console.error("[Orchestrator] Audit error:", error);
    summary.audit = {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  // Process ghost PRs (poll in-progress sessions)
  try {
    const ghostResult = await processGhostPrPolling();
    summary.ghost_prs = ghostResult;
  } catch (error) {
    console.error("[Orchestrator] Ghost PR error:", error);
    summary.ghost_prs = {
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return NextResponse.json({ success: true, ...summary });
}

// ─── Audit Job ───────────────────────────────────────────────────

interface AuditTickResult {
  skipped?: string;
  polled: number;
  completed: number;
  failed: number;
  spawned: number;
  stuckMarked: number;
}

async function processAuditJob(): Promise<AuditTickResult> {
  // Acquire transactional lock
  const state = await acquireTickLock("audit");
  if (!state) {
    return { skipped: "locked", polled: 0, completed: 0, failed: 0, spawned: 0, stuckMarked: 0 };
  }

  if (!state.enabled) {
    await releaseTickLock("audit");
    return { skipped: "disabled", polled: 0, completed: 0, failed: 0, spawned: 0, stuckMarked: 0 };
  }

  try {
    const integrations = await fetchIntegrations();
    const result: AuditTickResult = {
      polled: 0,
      completed: 0,
      failed: 0,
      spawned: 0,
      stuckMarked: 0,
    };

    // Phase 1: Poll running sessions
    const running = integrations.filter(
      (i) => i.audit_status === "running" && i.audit_session_id,
    );

    const toPoll = running.slice(0, MAX_POLLS_PER_TICK);
    for (const integration of toPoll) {
      try {
        // Check for stuck sessions first
        if (isSessionStuck(integration.audit_started_at)) {
          await handleStuckSession(integration);
          result.stuckMarked++;
          continue;
        }

        const sessionState = await pollDevinSession(
          integration.audit_session_id!,
        );
        result.polled++;

        if (sessionState.isFailed) {
          await completeAudit(integration, sessionState, "cron");
          result.failed++;
        } else if (sessionState.isFinished) {
          await completeAudit(integration, sessionState, "cron");
          result.completed++;

          // Slack notify for non-healthy audit results
          const auditOut = sessionState.structured_output as {
            health?: string;
            summary?: string;
          } | null;
          if (auditOut?.health && auditOut.health !== "healthy") {
            await notifyAuditCompleted(
              integration.name,
              integration.slug,
              auditOut.health,
              auditOut.summary ?? "Audit completed",
            ).catch((e) =>
              console.error("[Orchestrator] Slack audit notify error:", e),
            );
          }
        }
        // else still running — do nothing
      } catch (err) {
        console.error(
          `[Orchestrator] Error polling ${integration.name}:`,
          err,
        );
      }
    }

    // Phase 2: Spawn new audit sessions (if cooldown passed)
    const currentlyRunning = integrations.filter(
      (i) => i.audit_status === "running",
    ).length;

    const canSpawn =
      shouldSpawn(state) &&
      currentlyRunning < state.max_concurrent_sessions;

    if (canSpawn) {
      const candidates = getAuditCandidates(integrations, state);
      const toSpawn = candidates.slice(
        0,
        Math.min(
          MAX_SPAWNS_PER_TICK,
          state.max_concurrent_sessions - currentlyRunning,
        ),
      );

      for (const integration of toSpawn) {
        try {
          await spawnAuditSession(integration);
          result.spawned++;
        } catch (err) {
          console.error(
            `[Orchestrator] Error spawning audit for ${integration.name}:`,
            err,
          );
          await recordCronError(
            "audit",
            `Failed to spawn for ${integration.name}: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      }

      if (result.spawned > 0) {
        await recordCronSpawn("audit", result.spawned);
      }
    }

    await releaseTickLock("audit");
    return result;
  } catch (error) {
    await releaseTickLock("audit");
    throw error;
  }
}

// ─── Scout Job ───────────────────────────────────────────────────

interface ScoutTickResult {
  skipped?: string;
  action: string;
}

async function processScoutJob(): Promise<ScoutTickResult> {
  const state = await acquireTickLock("scout");
  if (!state) {
    return { skipped: "locked", action: "none" };
  }

  if (!state.enabled) {
    await releaseTickLock("scout");
    return { skipped: "disabled", action: "none" };
  }

  try {
    // If there's an active scout session, poll it
    if (
      state.active_session_status === "running" &&
      state.active_session_id
    ) {
      // Check for stuck scout session
      if (isSessionStuck(state.active_session_started_at)) {
        await updateScoutSession({
          active_session_status: "failed",
          active_session_result: JSON.stringify({
            summary: "Scout session timed out after 2 hours",
          }),
        });
        await recordCronError("scout", "Scout session timed out");
        await releaseTickLock("scout");
        return { action: "marked_stuck" };
      }

      try {
        const sessionState = await pollDevinSession(state.active_session_id);

        if (sessionState.isFailed) {
          await updateScoutSession({
            active_session_status: "failed",
            active_session_result: JSON.stringify({
              summary: "Scout session failed",
            }),
          });
          await addActivityLogEntry({
            actor: "cron/orchestrator",
            action: "scout_completed",
            target_type: "general",
            target_id: null,
            target_name: "Scout Discovery",
            details: "Scout session failed",
            pr_url: null,
          });
          await releaseTickLock("scout");
          return { action: "failed" };
        }

        if (sessionState.isFinished) {
          // Process scout results
          const scoutResult = sessionState.structured_output as {
            repos?: Array<{
              full_name: string;
              url: string;
              stars: number;
              star_velocity: number;
              exa_fit: "strong" | "medium";
              current_search_tool: string | null;
              readme_summary: string;
              integration_opportunity: string | null;
              key_reviewers: string[];
              outreach_note: string | null;
            }>;
            summary?: string;
          } | null;

          if (scoutResult?.repos) {
            await upsertScoutRepos(scoutResult.repos);

            // Slack notify for strong scout finds
            const strongRepos = (scoutResult.repos ?? []).filter(
              (r: { exa_fit?: string }) => r.exa_fit === "strong",
            );
            if (strongRepos.length > 0) {
              await notifyStrongScoutFinds(
                strongRepos as Array<{
                  full_name: string;
                  url: string;
                  exa_fit: string;
                  current_search_tool: string | null;
                  readme_summary: string;
                }>,
                scoutResult.summary ?? "",
              ).catch((e) =>
                console.error("[Orchestrator] Slack scout notify error:", e),
              );
            }
          }

          await updateScoutSession({
            active_session_status: "completed",
            active_session_result: JSON.stringify(
              scoutResult ?? { summary: "No structured output" },
            ),
          });

          await addActivityLogEntry({
            actor: "cron/orchestrator",
            action: "scout_completed",
            target_type: "general",
            target_id: null,
            target_name: "Scout Discovery",
            details: scoutResult
              ? `Discovered ${scoutResult.repos?.length ?? 0} repos — ${scoutResult.summary ?? ""}`
              : "Scout completed (no structured output)",
            pr_url: null,
          });

          await releaseTickLock("scout");
          return { action: "completed" };
        }

        // Still running
        await releaseTickLock("scout");
        return { action: "still_running" };
      } catch (err) {
        console.error("[Orchestrator] Error polling scout session:", err);
        await releaseTickLock("scout");
        return { action: "poll_error" };
      }
    }

    // If no active session and cooldown passed, spawn a new one
    if (shouldSpawn(state)) {
      try {
        // Fetch all known repo slugs to avoid re-discovering them
        const skipSlugs = await getKnownRepoSlugs();
        const prompt = buildScoutPrompt(skipSlugs);
        const session = await spawnDevinSession(
          prompt,
          "Scout: Find Exa Integration Opportunities",
          SCOUT_STRUCTURED_OUTPUT_SCHEMA,
        );

        await updateScoutSession({
          active_session_id: session.session_id,
          active_session_url: session.url,
          active_session_started_at: new Date(),
          active_session_status: "running",
          active_session_result: null,
        });

        await recordCronSpawn("scout", 1);

        await addActivityLogEntry({
          actor: "cron/orchestrator",
          action: "scout_started",
          target_type: "general",
          target_id: null,
          target_name: "Scout Discovery",
          details: `Scout session started: ${session.url}`,
          pr_url: null,
        });

        await releaseTickLock("scout");
        return { action: "spawned" };
      } catch (err) {
        console.error("[Orchestrator] Error spawning scout session:", err);
        await recordCronError(
          "scout",
          `Failed to spawn: ${err instanceof Error ? err.message : "Unknown"}`,
        );
        await releaseTickLock("scout");
        return { action: "spawn_error" };
      }
    }

    await releaseTickLock("scout");
    return { action: "cooldown" };
  } catch (error) {
    await releaseTickLock("scout");
    throw error;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

// ─── Ghost PR Polling ────────────────────────────────────────────

interface GhostPrTickResult {
  polled: number;
  completed: number;
  failed: number;
}

async function processGhostPrPolling(): Promise<GhostPrTickResult> {
  const integrations = await fetchIntegrations();
  const inProgress = integrations.filter(
    (i) => i.approval_status === "in_progress" && i.ghost_pr_session_id,
  );

  const result: GhostPrTickResult = { polled: 0, completed: 0, failed: 0 };

  for (const integration of inProgress) {
    try {
      // Check for stuck sessions first (same 2-hour timeout as audits)
      if (isSessionStuck(integration.ghost_pr_started_at)) {
        await updateGhostPrStatus(integration._id, {
          approval_status: "approved",
          ghost_pr_session_id: null,
          ghost_pr_session_url: null,
          ghost_pr_started_at: null,
        });
        await addActivityLogEntry({
          actor: "cron/orchestrator",
          action: "ghost_pr_completed",
          target_type: "integration",
          target_id: integration._id,
          target_name: integration.name,
          details: "Ghost PR session timed out after 2 hours — reset to approved for retry",
          pr_url: null,
        });
        result.failed++;
        continue;
      }

      const sessionState = await pollDevinSession(integration.ghost_pr_session_id!);
      result.polled++;

      if (sessionState.isFailed) {
        await updateGhostPrStatus(integration._id, {
          approval_status: "approved", // Reset to approved so user can retry
          ghost_pr_session_id: null,
          ghost_pr_session_url: null,
        });
        await addActivityLogEntry({
          actor: "cron/orchestrator",
          action: "ghost_pr_completed",
          target_type: "integration",
          target_id: integration._id,
          target_name: integration.name,
          details: "Ghost PR session failed",
          pr_url: null,
        });
        result.failed++;
      } else if (sessionState.isFinished) {
        const ghostResult = sessionState.structured_output as {
          pr_url?: string | null;
          summary?: string;
          success?: boolean;
        } | null;

        const prUrl = ghostResult?.pr_url ?? null;

        await updateGhostPrStatus(integration._id, {
          ghost_pr_url: prUrl,
          approval_status: prUrl ? "none" : "approved",
        });

        // If PR was created, mark integration as healthy
        if (prUrl) {
          await updateIntegrationHealth(integration._id, "healthy", {});
        }

        await addActivityLogEntry({
          actor: "cron/orchestrator",
          action: "ghost_pr_completed",
          target_type: "integration",
          target_id: integration._id,
          target_name: integration.name,
          details: ghostResult?.summary ?? "Ghost PR session completed",
          pr_url: prUrl,
        });
        result.completed++;
      }
    } catch (err) {
      console.error(
        `[Orchestrator] Error polling ghost PR for ${integration.name}:`,
        err,
      );
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────

function shouldSpawn(state: CronJobState): boolean {
  if (!state.last_spawn_at) return true; // Never spawned

  const cooldownMs = state.cooldown_minutes * 60 * 1000;
  const elapsed = Date.now() - new Date(state.last_spawn_at).getTime();
  return elapsed >= cooldownMs;
}

/**
 * Get integrations that need auditing, sorted by priority:
 * 1. health === "needs_audit" (never audited or explicitly marked)
 * 2. health === "outdated" (detected stale by sdk-check)
 * 3. health === "healthy" with oldest last_audit_completed_at (re-verify)
 *
 * Excludes: currently running, recently completed within cooldown
 */
function getAuditCandidates(
  integrations: Integration[],
  state: CronJobState,
): Integration[] {
  const cooldownMs = state.cooldown_minutes * 60 * 1000;
  const now = Date.now();

  const eligible = integrations.filter((i) => {
    // Skip currently running
    if (i.audit_status === "running") return false;

    // Skip recently audited (within cooldown)
    if (i.last_audit_completed_at) {
      const completedAt = new Date(i.last_audit_completed_at).getTime();
      if (now - completedAt < cooldownMs) return false;
    }

    return true;
  });

  // Sort by priority
  return eligible.sort((a, b) => {
    const priorityOrder: Record<string, number> = {
      needs_audit: 0,
      outdated: 1,
      healthy: 2,
    };

    const aPriority = priorityOrder[a.health] ?? 2;
    const bPriority = priorityOrder[b.health] ?? 2;

    if (aPriority !== bPriority) return aPriority - bPriority;

    // Within same priority: oldest audit first (nulls = never audited = highest)
    const aTime = a.last_audit_completed_at
      ? new Date(a.last_audit_completed_at).getTime()
      : 0;
    const bTime = b.last_audit_completed_at
      ? new Date(b.last_audit_completed_at).getTime()
      : 0;

    return aTime - bTime;
  });
}

async function spawnAuditSession(integration: Integration): Promise<void> {
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
    actor: "cron/orchestrator",
    action: "audit_triggered",
    target_type: "integration",
    target_id: integration._id,
    target_name: integration.name,
    details: `Cron-scheduled audit started: ${session.url}`,
    pr_url: null,
  });
}

async function handleStuckSession(integration: Integration): Promise<void> {
  await updateIntegrationAuditStatus(integration._id, "failed", {
    result: JSON.stringify({
      summary: "Audit session timed out after 2 hours",
    }),
  });

  const { addAuditHistoryEntry } = await import(
    "@/lib/firebase-integrations"
  );

  await addAuditHistoryEntry(integration._id, {
    session_id: integration.audit_session_id ?? "",
    session_url: integration.audit_session_url ?? "",
    started_at: integration.audit_started_at ?? null,
    completed_at: new Date(),
    status: "failed",
    result: JSON.stringify({
      summary: "Audit session timed out after 2 hours",
    }),
    health_at_completion: integration.health,
    triggered_by: "cron",
  });

  await addActivityLogEntry({
    actor: "cron/orchestrator",
    action: "audit_completed",
    target_type: "integration",
    target_id: integration._id,
    target_name: integration.name,
    details: "Audit session timed out after 2 hours — marked as failed",
    pr_url: null,
  });
}
