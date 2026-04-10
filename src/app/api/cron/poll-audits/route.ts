import { NextRequest, NextResponse } from "next/server";
import {
  fetchIntegrations,
  updateIntegrationAuditStatus,
  updateIntegrationHealth,
  addActivityLogEntry,
  addAuditHistoryEntry,
} from "@/lib/firebase-integrations";
import type { IntegrationHealth } from "@/types/integrations";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

interface DevinSessionResponse {
  session_id: string;
  status: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
}

interface AuditResult {
  health: IntegrationHealth;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary: string;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devinApiKey = process.env.DEVIN_API_KEY;
  if (!devinApiKey) {
    return NextResponse.json(
      { error: "DEVIN_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const integrations = await fetchIntegrations();
    const running = integrations.filter(
      (i) => i.audit_status === "running" && i.audit_session_id,
    );

    if (running.length === 0) {
      return NextResponse.json({ success: true, polled: 0, completed: 0, failed: 0 });
    }

    let completed = 0;
    let failed = 0;

    for (const integration of running) {
      try {
        const devinResponse = await fetch(
          `https://api.devin.ai/v1/session/${integration.audit_session_id}`,
          {
            headers: { Authorization: `Bearer ${devinApiKey}` },
          },
        );

        if (!devinResponse.ok) {
          console.error(
            `[Cron Poll] Devin API error for ${integration.name}: ${devinResponse.status}`,
          );
          continue;
        }

        const session = (await devinResponse.json()) as DevinSessionResponse;

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

        // Skip already-completed/failed audits
        if (integration.audit_status === "completed" || integration.audit_status === "failed") {
          continue;
        }

        if (isFailed) {
          await updateIntegrationAuditStatus(integration._id, "failed", {
            result: JSON.stringify({ summary: "Audit session failed" }),
          });
          await addAuditHistoryEntry(integration._id, {
            session_id: integration.audit_session_id ?? "",
            session_url: integration.audit_session_url ?? "",
            started_at: integration.audit_started_at ?? null,
            completed_at: new Date(),
            status: "failed",
            result: JSON.stringify({ summary: "Audit session failed" }),
            health_at_completion: integration.health,
          });
          await addActivityLogEntry({
            actor: "cron/poll-audits",
            action: "audit_completed",
            target_type: "integration",
            target_id: integration._id,
            target_name: integration.name,
            details: "Audit session failed",
            pr_url: null,
          });
          failed++;
          continue;
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
            if (auditResult.health === "outdated") {
              healthUpdate.outdated_since = new Date();
            }
            await updateIntegrationHealth(
              integration._id,
              auditResult.health,
              healthUpdate,
            );
          }

          const resultJson = auditResult
            ? JSON.stringify(auditResult)
            : JSON.stringify({ summary: "Session completed without structured output" });

          await updateIntegrationAuditStatus(integration._id, "completed", {
            result: resultJson,
          });

          await addAuditHistoryEntry(integration._id, {
            session_id: integration.audit_session_id ?? "",
            session_url: integration.audit_session_url ?? "",
            started_at: integration.audit_started_at ?? null,
            completed_at: new Date(),
            status: "completed",
            result: resultJson,
            health_at_completion: auditResult?.health ?? integration.health,
          });

          await addActivityLogEntry({
            actor: "cron/poll-audits",
            action: "audit_completed",
            target_type: "integration",
            target_id: integration._id,
            target_name: integration.name,
            details: auditResult
              ? `Audit completed: ${auditResult.health} — ${auditResult.summary}`
              : "Audit completed (no structured output)",
            pr_url: null,
          });
          completed++;
        }
        // else still running — do nothing
      } catch (err) {
        console.error(`[Cron Poll] Error polling ${integration.name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      polled: running.length,
      completed,
      failed,
    });
  } catch (error) {
    console.error("[Cron Poll Audits] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
