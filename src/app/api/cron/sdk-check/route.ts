import { NextRequest, NextResponse } from "next/server";
import {
  fetchIntegrations,
  updateIntegrationHealth,
  addActivityLogEntry,
  getSdkState,
  updateSdkState,
} from "@/lib/firebase-integrations";
import { notifyStaleIntegrations } from "@/lib/slack";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

interface PyPIResponse {
  info: { version: string };
}

interface NpmResponse {
  "dist-tags": { latest: string };
}

async function fetchLatestPyPIVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${pkg}/json`);
    if (!res.ok) return null;
    const data = (await res.json()) as PyPIResponse;
    return data.info.version;
  } catch {
    return null;
  }
}

async function fetchLatestNpmVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}`);
    if (!res.ok) return null;
    const data = (await res.json()) as NpmResponse;
    return data["dist-tags"].latest;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch latest SDK versions from PyPI and npm
    const [exaPyVersion, exaJsVersion] = await Promise.all([
      fetchLatestPyPIVersion("exa-py"),
      fetchLatestNpmVersion("exa-js"),
    ]);

    // 2. Update sdk_state in Firestore
    const currentSdkState = await getSdkState();
    if (exaPyVersion || exaJsVersion) {
      await updateSdkState({
        exa_py_version: exaPyVersion ?? currentSdkState?.exa_py_version ?? "unknown",
        exa_js_version: exaJsVersion ?? currentSdkState?.exa_js_version ?? "unknown",
        exa_py_types_hash: currentSdkState?.exa_py_types_hash ?? "",
        exa_js_types_hash: currentSdkState?.exa_js_types_hash ?? "",
      });
    }

    // 3. Check each integration's SDK version against latest
    const integrations = await fetchIntegrations();
    let markedOutdated = 0;
    const newlyOutdated: Array<{
      name: string;
      slug: string;
      current_sdk_version: string | null;
      latest_sdk_version: string | null;
    }> = [];

    for (const integration of integrations) {
      if (!integration.current_sdk_version) continue;

      const bl = integration.baseline_type;
      if (bl === "first_party" || bl === "na" || bl === "mcp" || bl === "api_direct" || bl === "docs" || bl === "websets_api") continue;

      const isPython = bl === "python_sdk";
      const isTypescript = bl === "typescript_sdk";
      const latestVersion = isPython ? exaPyVersion : isTypescript ? exaJsVersion : null;

      if (!latestVersion) continue;
      if (integration.current_sdk_version === latestVersion) {
        // Version matches latest — mark healthy if currently outdated
        if (integration.health === "outdated") {
          await updateIntegrationHealth(integration._id, "healthy", {
            latest_sdk_version: latestVersion,
          });
          await addActivityLogEntry({
            actor: "cron/sdk-check",
            action: "mark_fixed",
            target_type: "integration",
            target_id: integration._id,
            target_name: integration.name,
            details: `SDK version ${integration.current_sdk_version} matches latest — auto-resolved`,
            pr_url: null,
          });
        }
        continue;
      }
      if (integration.health === "outdated") {
        // Already marked, just update latest_sdk_version if changed
        if (integration.latest_sdk_version !== latestVersion) {
          await updateIntegrationHealth(integration._id, "outdated", {
            latest_sdk_version: latestVersion,
          });
        }
        continue;
      }

      // Mark as outdated
      await updateIntegrationHealth(integration._id, "outdated", {
        latest_sdk_version: latestVersion,
        outdated_since: new Date(),
      });

      await addActivityLogEntry({
        actor: "cron/sdk-check",
        action: "mark_outdated",
        target_type: "integration",
        target_id: integration._id,
        target_name: integration.name,
        details: `SDK ${integration.current_sdk_version} → ${latestVersion}`,
        pr_url: null,
      });

      newlyOutdated.push({
        name: integration.name,
        slug: integration.slug,
        current_sdk_version: integration.current_sdk_version,
        latest_sdk_version: latestVersion,
      });

      markedOutdated++;
    }

    // Slack notify for newly outdated integrations
    if (newlyOutdated.length > 0) {
      await notifyStaleIntegrations(newlyOutdated).catch((e) =>
        console.error("[Cron SDK Check] Slack notify error:", e),
      );
    }

    return NextResponse.json({
      success: true,
      exa_py: exaPyVersion,
      exa_js: exaJsVersion,
      integrations_checked: integrations.length,
      marked_outdated: markedOutdated,
    });
  } catch (error) {
    console.error("[Cron SDK Check] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
