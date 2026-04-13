/**
 * Slack notification helper.
 * Sends messages to a configured Slack incoming webhook.
 * Gracefully no-ops if SLACK_WEBHOOK_URL is not set.
 */

const DASHBOARD_URL = "https://integrations-dashboard-eta.vercel.app";

function getWebhookUrl(): string | null {
  return process.env.SLACK_WEBHOOK_URL ?? null;
}

async function sendSlackMessage(blocks: object[], text: string): Promise<boolean> {
  const url = getWebhookUrl();
  if (!url) {
    console.log("[Slack] SLACK_WEBHOOK_URL not set, skipping notification");
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });

    if (!response.ok) {
      console.error(`[Slack] Webhook error: ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Slack] Failed to send notification:", error);
    return false;
  }
}

// ─── Notification Types ─────────────────────────────────────────

/**
 * Notify when integrations are detected as outdated (stale SDK version).
 */
export async function notifyStaleIntegrations(
  integrations: Array<{ name: string; slug: string; current_sdk_version: string | null; latest_sdk_version: string | null }>,
): Promise<boolean> {
  if (integrations.length === 0) return false;

  const list = integrations
    .map(
      (i) =>
        `- *<${DASHBOARD_URL}/integrations/${i.slug}|${i.name}>*: ${i.current_sdk_version ?? "unknown"} -> ${i.latest_sdk_version ?? "unknown"}`,
    )
    .join("\n");

  const text = `${integrations.length} integration(s) detected as outdated`;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Outdated Integrations Detected",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${integrations.length} integration(s) have outdated SDK versions:\n\n${list}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Dashboard" },
          url: `${DASHBOARD_URL}/integrations`,
        },
      ],
    },
  ];

  return sendSlackMessage(blocks, text);
}

/**
 * Notify when scout discovers repos with strong Exa fit.
 */
export async function notifyStrongScoutFinds(
  repos: Array<{ full_name: string; url: string; exa_fit: string; current_search_tool: string | null; readme_summary: string }>,
  summary: string,
): Promise<boolean> {
  if (repos.length === 0) return false;

  const strongRepos = repos.filter((r) => r.exa_fit === "strong");
  if (strongRepos.length === 0) return false;

  const list = strongRepos
    .map(
      (r) =>
        `- *<${r.url}|${r.full_name}>*: ${r.readme_summary.slice(0, 100)}${r.current_search_tool ? ` (currently uses ${r.current_search_tool})` : ""}`,
    )
    .join("\n");

  const text = `Scout found ${strongRepos.length} strong Exa fit repo(s)`;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Scout: Strong Exa Fit Repos Found",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${strongRepos.length} repo(s) are strong candidates for Exa integration:\n\n${list}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: summary,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Scout Tab" },
          url: `${DASHBOARD_URL}/integrations`,
        },
      ],
    },
  ];

  return sendSlackMessage(blocks, text);
}

/**
 * Notify when an audit completes with findings.
 */
export async function notifyAuditCompleted(
  integrationName: string,
  integrationSlug: string,
  health: string,
  summary: string,
): Promise<boolean> {
  // Only notify for non-healthy results
  if (health === "healthy") return false;

  const emoji = health === "outdated" ? "warning" : "mag";
  const text = `Audit completed for ${integrationName}: ${health}`;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Audit: ${integrationName}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:${emoji}: *${health.toUpperCase()}*\n\n${summary}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Details" },
          url: `${DASHBOARD_URL}/integrations/${integrationSlug}`,
        },
      ],
    },
  ];

  return sendSlackMessage(blocks, text);
}
