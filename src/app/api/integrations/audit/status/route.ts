import { NextRequest, NextResponse } from "next/server";
import {
  getIntegration,
  updateIntegrationAuditStatus,
  updateIntegrationHealth,
  addActivityLogEntry,
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
  title: string;
  structured_output: Record<string, unknown> | null;
}

interface AuditResult {
  health: IntegrationHealth;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary: string;
}

export async function POST(req: NextRequest) {
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
    const body = (await req.json()) as { integration_id: string };

    if (!body.integration_id) {
      return NextResponse.json(
        { error: "integration_id is required" },
        { status: 400 },
      );
    }

    const integration = await getIntegration(body.integration_id);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 },
      );
    }

    if (!integration.audit_session_id) {
      return NextResponse.json(
        {
          status: integration.audit_status,
          message: "No audit session found for this integration",
        },
        { status: 200 },
      );
    }

    // Poll Devin API for session status
    const sessionId = integration.audit_session_id;
    const devinResponse = await fetch(
      `https://api.devin.ai/v1/session/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${devinApiKey}`,
        },
      },
    );

    if (!devinResponse.ok) {
      const errorText = await devinResponse.text();
      console.error("[Audit Status] Devin API error:", errorText);
      return NextResponse.json(
        { error: `Devin API error: ${devinResponse.status}` },
        { status: 502 },
      );
    }

    const session = (await devinResponse.json()) as DevinSessionResponse;

    // Map Devin session status to our audit status
    const isFinished =
      session.status_enum === "stopped" ||
      session.status_enum === "finished" ||
      session.status === "finished" ||
      session.status === "stopped";

    const isFailed =
      session.status_enum === "failed" || session.status === "failed";

    if (isFailed) {
      await updateIntegrationAuditStatus(
        body.integration_id,
        "failed",
        { result: JSON.stringify({ summary: "Audit session failed" }) },
      );

      await addActivityLogEntry({
        actor: "system",
        action: "audit_completed",
        target_type: "integration",
        target_id: body.integration_id,
        target_name: integration.name,
        details: "Audit session failed",
        pr_url: null,
      });

      return NextResponse.json({
        status: "failed",
        session_status: session.status_enum || session.status,
      });
    }

    if (isFinished) {
      // Try to read structured output
      const auditResult = session.structured_output as AuditResult | null;

      if (auditResult) {
        // Update integration health based on audit result
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
          body.integration_id,
          auditResult.health,
          healthUpdate,
        );
      }

      // Update audit status to completed
      await updateIntegrationAuditStatus(
        body.integration_id,
        "completed",
        {
          result: auditResult
            ? JSON.stringify(auditResult)
            : JSON.stringify({ summary: "Session completed without structured output" }),
        },
      );

      await addActivityLogEntry({
        actor: "system",
        action: "audit_completed",
        target_type: "integration",
        target_id: body.integration_id,
        target_name: integration.name,
        details: auditResult
          ? `Audit completed: ${auditResult.health} — ${auditResult.summary}`
          : "Audit completed (no structured output)",
        pr_url: null,
      });

      return NextResponse.json({
        status: "completed",
        result: auditResult ?? null,
        session_status: session.status_enum || session.status,
      });
    }

    // Still running
    return NextResponse.json({
      status: "running",
      session_status: session.status_enum || session.status,
      session_url: integration.audit_session_url,
    });
  } catch (error) {
    console.error("[Audit Status] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
