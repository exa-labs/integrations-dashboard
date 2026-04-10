import { NextRequest, NextResponse } from "next/server";
import {
  upsertIntegrations,
  upsertScoutRepos,
  addActivityLogEntry,
  updateSdkState,
} from "@/lib/firebase-integrations";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

interface SyncPayload {
  integrations?: Array<Record<string, unknown>>;
  scout_repos?: Array<Record<string, unknown>>;
  sdk_state?: {
    exa_py_version: string;
    exa_js_version: string;
    exa_py_types_hash?: string;
    exa_js_types_hash?: string;
  };
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SyncPayload;
    const results: Record<string, number> = {};

    if (body.integrations?.length) {
      results.integrations_synced = await upsertIntegrations(
        body.integrations,
      );

      const outdated = body.integrations.filter(
        (i) => i.health === "outdated",
      );
      for (const integration of outdated) {
        await addActivityLogEntry({
          actor: "devin-sync",
          action: "mark_outdated",
          target_type: "integration",
          target_id: integration.slug as string,
          target_name: integration.name as string,
          details: `Detected as outdated during sync`,
          pr_url: null,
        });
      }
    }

    if (body.scout_repos?.length) {
      results.repos_synced = await upsertScoutRepos(body.scout_repos);
    }

    if (body.sdk_state) {
      await updateSdkState({
        exa_py_version: body.sdk_state.exa_py_version,
        exa_js_version: body.sdk_state.exa_js_version,
        exa_py_types_hash: body.sdk_state.exa_py_types_hash ?? "",
        exa_js_types_hash: body.sdk_state.exa_js_types_hash ?? "",
      });
      results.sdk_state_updated = 1;
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("[Sync API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
