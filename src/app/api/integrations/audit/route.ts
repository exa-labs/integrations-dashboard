import { NextRequest, NextResponse } from "next/server";
import {
  getIntegration,
  updateIntegrationAuditStatus,
  addActivityLogEntry,
} from "@/lib/firebase-integrations";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

function buildAuditPrompt(integration: {
  name: string;
  slug: string;
  type: string;
  repo: string;
  current_sdk_version: string | null;
  latest_sdk_version: string | null;
  missing_features: string[];
  update_context: {
    notes: string;
    key_files: string[];
    build_cmd: string;
    test_cmd: string;
    publish_cmd: string;
    external_repo?: string;
  };
}): string {
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

    // Prevent concurrent audits on the same integration
    if (integration.audit_status === "running") {
      return NextResponse.json(
        {
          error: "Audit already running",
          session_id: integration.audit_session_id,
          session_url: integration.audit_session_url,
        },
        { status: 409 },
      );
    }

    // Build the audit prompt with full integration context
    const prompt = buildAuditPrompt(integration);

    // Spawn a Devin session
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
      console.error("[Audit API] Devin API error:", errorText);
      return NextResponse.json(
        { error: `Devin API error: ${devinResponse.status}` },
        { status: 502 },
      );
    }

    const devinData = (await devinResponse.json()) as {
      session_id: string;
      url: string;
    };

    // Update Firestore with session info
    await updateIntegrationAuditStatus(body.integration_id, "running", {
      session_id: devinData.session_id,
      session_url: devinData.url,
    });

    // Log audit triggered activity
    await addActivityLogEntry({
      actor: "dashboard",
      action: "audit_triggered",
      target_type: "integration",
      target_id: body.integration_id,
      target_name: integration.name,
      details: `Audit session started: ${devinData.url}`,
      pr_url: null,
    });

    return NextResponse.json({
      success: true,
      session_id: devinData.session_id,
      session_url: devinData.url,
    });
  } catch (error) {
    console.error("[Audit API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
