import { NextRequest, NextResponse } from "next/server";
import {
  getIntegration,
  fetchIntegrations,
  updateIntegrationApproval,
  addActivityLogEntry,
} from "@/lib/firebase-integrations";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const integrations = await fetchIntegrations();
    const approved = integrations.filter(
      (i) => i.approval_status === "approved",
    );

    return NextResponse.json({
      approved: approved.map((i) => ({
        id: i._id,
        name: i.name,
        slug: i.slug,
        repo: i.repo,
        type: i.type,
        current_sdk_version: i.current_sdk_version,
        latest_sdk_version: i.latest_sdk_version,
        missing_features: i.missing_features,
        update_context: i.update_context,
        approved_by: i.approved_by,
        approved_at: i.approved_at,
      })),
    });
  } catch (error) {
    console.error("[Approve API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      integration_id: string;
      status: "in_progress" | "none";
      pr_url?: string;
    };

    const integration = await getIntegration(body.integration_id);
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 },
      );
    }

    await updateIntegrationApproval(body.integration_id, body.status);

    if (body.pr_url) {
      await addActivityLogEntry({
        actor: integration.approved_by ?? "ghost-mode",
        action: "pr_created",
        target_type: "integration",
        target_id: body.integration_id,
        target_name: integration.name,
        details: "Ghost-mode PR created",
        pr_url: body.pr_url,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Approve API] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
