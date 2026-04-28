import {
  updateIntegrationAuditStatus,
  updateIntegrationHealth,
  addAuditHistoryEntry,
  addActivityLogEntry,
} from "./firebase-integrations";
import type {
  Integration,
  IntegrationHealth,
  AuditTriggerSource,
} from "@/types/integrations";

// ─── Devin API Types ─────────────────────────────────────────────

export interface DevinSessionResponse {
  session_id: string;
  status: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
}

export interface DevinSessionState {
  session_id: string;
  status: string;
  status_enum: string;
  structured_output: Record<string, unknown> | null;
  isFinished: boolean;
  isFailed: boolean;
  isRunning: boolean;
}

export interface AuditResult {
  health: IntegrationHealth;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary: string;
}

export interface ScoutResult {
  repos: Array<{
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
  summary: string;
}

// ─── Devin API Helpers ───────────────────────────────────────────

function getDevinApiKey(): string {
  const key = process.env.DEVIN_API_KEY;
  if (!key) throw new Error("DEVIN_API_KEY not configured");
  return key;
}

/**
 * Poll a Devin session and determine its state.
 * Centralizes the isTerminal/isBlocked/isFinished logic.
 */
export async function pollDevinSession(
  sessionId: string,
): Promise<DevinSessionState> {
  const apiKey = getDevinApiKey();

  const response = await fetch(
    `https://api.devin.ai/v1/session/${sessionId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (!response.ok) {
    throw new Error(`Devin API error: ${response.status}`);
  }

  const session = (await response.json()) as DevinSessionResponse;

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

  const isFinished =
    isTerminal || (isBlocked && session.structured_output !== null);

  const isFailed =
    session.status_enum === "failed" || session.status === "failed";

  const isRunning = !isFinished && !isFailed;

  return {
    session_id: session.session_id,
    status: session.status,
    status_enum: session.status_enum,
    structured_output: session.structured_output,
    isFinished,
    isFailed,
    isRunning,
  };
}

/**
 * Spawn a new Devin session with a prompt and structured output schema.
 */
export async function spawnDevinSession(
  prompt: string,
  title: string,
  schema: object,
): Promise<{ session_id: string; url: string }> {
  const apiKey = getDevinApiKey();

  const response = await fetch("https://api.devin.ai/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      title,
      structured_output_schema: schema,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Devin API error: ${response.status} — ${errorText}`);
  }

  const data = (await response.json()) as { session_id: string; url: string };
  return data;
}

// ─── Shared Completion Logic ─────────────────────────────────────

/**
 * Complete an audit for an integration. Handles:
 * - Updating integration health from audit result
 * - Updating audit status to completed/failed
 * - Writing audit history entry (idempotent via session_id)
 * - Writing activity log entry
 * - Setting last_audit_completed_at
 *
 * Called by both the cron orchestrator and the manual checkAuditStatus action.
 * Idempotent — safe to call multiple times for the same audit.
 */
export async function completeAudit(
  integration: Integration,
  sessionState: DevinSessionState,
  triggeredBy: AuditTriggerSource,
): Promise<void> {
  const integrationId = integration._id;
  const sessionId = integration.audit_session_id ?? "";
  const sessionUrl = integration.audit_session_url ?? "";

  if (sessionState.isFailed) {
    await updateIntegrationAuditStatus(integrationId, "failed", {
      result: JSON.stringify({ summary: "Audit session failed" }),
    });

    await addAuditHistoryEntry(integrationId, {
      session_id: sessionId,
      session_url: sessionUrl,
      started_at: integration.audit_started_at ?? null,
      completed_at: new Date(),
      status: "failed",
      result: JSON.stringify({ summary: "Audit session failed" }),
      health_at_completion: integration.health,
      triggered_by: triggeredBy,
    });

    await addActivityLogEntry({
      actor: triggeredBy === "cron" ? "cron/orchestrator" : "system",
      action: "audit_completed",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: "Audit session failed",
      pr_url: null,
    });

    return;
  }

  if (sessionState.isFinished) {
    const auditResult = sessionState.structured_output as AuditResult | null;

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
        integrationId,
        auditResult.health,
        healthUpdate,
      );
    }

    const resultJson = auditResult
      ? JSON.stringify(auditResult)
      : JSON.stringify({
          summary: "Session completed without structured output",
        });

    await updateIntegrationAuditStatus(integrationId, "completed", {
      result: resultJson,
    });

    // Set last_audit_completed_at — used by scheduler for priority ordering
    const { getFirestore } = await import("./firebase");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = getFirestore();
    if (db) {
      await db
        .collection("integrations")
        .doc(integrationId)
        .update({
          last_audit_completed_at: FieldValue.serverTimestamp(),
        });
    }

    await addAuditHistoryEntry(integrationId, {
      session_id: sessionId,
      session_url: sessionUrl,
      started_at: integration.audit_started_at ?? null,
      completed_at: new Date(),
      status: "completed",
      result: resultJson,
      health_at_completion: auditResult?.health ?? integration.health,
      triggered_by: triggeredBy,
    });

    await addActivityLogEntry({
      actor: triggeredBy === "cron" ? "cron/orchestrator" : "system",
      action: "audit_completed",
      target_type: "integration",
      target_id: integrationId,
      target_name: integration.name,
      details: auditResult
        ? `Audit completed: ${auditResult.health} — ${auditResult.summary}`
        : "Audit completed (no structured output)",
      pr_url: null,
    });
  }
}

// ─── Audit Prompt Builder ────────────────────────────────────────

function buildTaskSteps(integration: Integration): string[] {
  const baseline = integration.baseline_type;

  if (baseline === "first_party") {
    return [
      "1. This is a FIRST-PARTY Exa product. Do NOT audit it against another SDK.",
      "2. Clone the repository and verify it builds and tests pass.",
      "3. Check if there are any open issues or recent regressions.",
      "4. Report health as 'healthy' unless build/tests are broken.",
    ];
  }

  if (baseline === "na") {
    return [
      "1. This integration is a payment/access method — not a code integration.",
      "2. Verify the integration still references valid Exa endpoints or documentation.",
      "3. Report health as 'healthy' if the reference is still correct.",
    ];
  }

  if (baseline === "python_sdk") {
    return [
      "1. Clone the repository and check the current state of the integration.",
      "2. Check which version of exa-py (Python SDK) is being used.",
      "3. Compare against the latest exa-py version on PyPI.",
      "4. Verify the declared capabilities by reading the integration code.",
      "   Check which Exa endpoints (search, search_streaming, get_contents, find_similar, answer, answer_streaming, research) are supported.",
      "   Check which search types and content options are actually passed through.",
      "5. If you find capabilities that are declared but NOT implemented, or capabilities",
      "   that exist in code but are NOT declared, note them in the missing_features array.",
      "6. Report your findings using the structured output schema.",
    ];
  }

  if (baseline === "typescript_sdk") {
    return [
      "1. Clone the repository and check the current state of the integration.",
      "2. Check which version of exa-js (TypeScript SDK) is being used.",
      "3. Compare against the latest exa-js version on npm.",
      "4. Verify the declared capabilities by reading the integration code.",
      "   Check which Exa endpoints (search, search_streaming, get_contents, find_similar, answer, answer_streaming, research) are supported.",
      "   Check which search types and content options are actually passed through.",
      "5. If you find capabilities that are declared but NOT implemented, or capabilities",
      "   that exist in code but are NOT declared, note them in the missing_features array.",
      "6. Report your findings using the structured output schema.",
    ];
  }

  if (baseline === "mcp") {
    return [
      "1. Clone the repository and check the current state of the integration.",
      "2. This integration depends on exa-mcp-server. Do NOT compare against exa-py or exa-js.",
      "3. Check which MCP tools from exa-mcp-server are used: search, get_contents, find_similar, research.",
      "4. Check which search types (auto, fast, instant) and content options (text, highlights, summary, subpages) are exposed.",
      "5. Verify the integration correctly passes through MCP tool parameters.",
      "6. If you find capabilities that are declared but NOT implemented, note them in the missing_features array.",
      "7. Report your findings using the structured output schema.",
    ];
  }

  if (baseline === "api_direct") {
    return [
      "1. Clone the repository and check the current state of the integration.",
      "2. This integration calls the Exa API directly (no SDK dependency). Do NOT compare against exa-py or exa-js versions.",
      "3. Check which Exa API endpoints are called: /search, /contents, /findSimilar, /answer.",
      "4. Verify the API request format matches the current Exa API specification.",
      "5. Check which search types and content options are passed in requests.",
      "6. If you find capabilities that are declared but NOT implemented, note them in the missing_features array.",
      "7. Report your findings using the structured output schema.",
    ];
  }

  if (baseline === "docs") {
    return [
      "1. Check the current state of this documentation/guide integration.",
      "2. This is documentation — do NOT compare against SDK versions.",
      "3. Verify code examples reference correct Exa API endpoints and parameters.",
      "4. Check if the documentation mentions deprecated features or outdated API patterns.",
      "5. Compare code examples against the current Exa API docs at docs.exa.ai.",
      "6. Note any outdated or incorrect information in the missing_features array.",
      "7. Report your findings using the structured output schema.",
    ];
  }

  if (baseline === "websets_api") {
    return [
      "1. Clone the repository and check the current state of the integration.",
      "2. This integration uses the Exa Websets API — NOT the search API. Do NOT compare against exa-py or exa-js.",
      "3. Verify the Websets CRUD operations are correctly implemented.",
      "4. Report your findings using the structured output schema.",
    ];
  }

  return [
    "1. Clone the repository and check the current state of the integration.",
    "2. Verify the declared capabilities by reading the integration code.",
    "3. Report your findings using the structured output schema.",
  ];
}

export function buildAuditPrompt(integration: Integration): string {
  const ctx = integration.update_context;
  const baseline = integration.baseline_type;
  const showSdkVersion = baseline === "python_sdk" || baseline === "typescript_sdk";

  const lines = [
    `# Audit: ${integration.name} (${integration.slug})`,
    "",
    `**Type:** ${integration.type}`,
    `**Baseline:** ${baseline}`,
    `**Repo:** ${integration.repo}`,
    ctx.external_repo ? `**External Repo:** ${ctx.external_repo}` : null,
    showSdkVersion ? `**Current SDK Version:** ${integration.current_sdk_version ?? "unknown"}` : null,
    showSdkVersion ? `**Latest SDK Version:** ${integration.latest_sdk_version ?? "unknown"}` : null,
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
    ctx.capabilities
      ? [
          "## Declared Capabilities",
          `- **Endpoints:** ${ctx.capabilities.supported_endpoints.join(", ") || "(none)"}`,
          `- **Search Types:** ${ctx.capabilities.supported_search_types.join(", ") || "(none)"}`,
          `- **Content Options:** ${ctx.capabilities.supported_content_options.join(", ") || "(none)"}`,
        ].join("\n")
      : null,
    "",
    "## Task",
    ...buildTaskSteps(integration),
    "",
    "## Structured Output",
    "You MUST provide structured output with these fields:",
    "- `health`: one of 'healthy', 'outdated', 'needs_audit'",
    showSdkVersion ? "- `current_sdk_version`: the version currently used (string or null)" : null,
    showSdkVersion ? "- `latest_sdk_version`: the latest available version (string or null)" : null,
    "- `missing_features`: array of missing feature/endpoint/param names",
    "- `summary`: a brief summary of the audit findings including capability coverage",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const AUDIT_STRUCTURED_OUTPUT_SCHEMA = {
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
};

// ─── Scout Prompt Builder ────────────────────────────────────────

export function buildScoutPrompt(skipSlugs: string[]): string {
  const skipSection =
    skipSlugs.length > 0
      ? [
          "",
          "## Already Known Repos — SKIP THESE",
          "The following repos are already tracked. Do NOT spend time on them:",
          skipSlugs.map((s) => `- ${s}`).join("\n"),
          "",
        ].join("\n")
      : "";

  return `# Scout: Find Repos That Would Benefit From an Exa Integration

## Goal
Find the fastest-growing AI agent and retrieval-related GitHub repositories that do NOT already use Exa but WOULD benefit from an Exa integration. We are looking for outreach targets — repos where adding Exa search/contents/highlights would be a meaningful improvement.

## Important: What NOT to Look For
- Do NOT find repos that already use the Exa SDK (exa-py, exa-js, api.exa.ai)
- Do NOT include any repos under the \`exa-labs\` GitHub org — those are our own
- Do NOT include repos that are just tutorials, toy examples, or inactive (no commits in 3+ months)
${skipSection}
## Phase 1 — Find Trending Agent/AI Repos

Search for recently popular GitHub repositories in these categories:
1. **AI agent frameworks** — autonomous agents, multi-agent systems, agent toolkits
2. **RAG pipelines** — retrieval-augmented generation, document Q&A, knowledge bases
3. **Research assistants** — deep research tools, web research automation
4. **Search-augmented LLM apps** — chatbots with web search, fact-checking tools

Use multiple search strategies:
- Browse https://github.com/trending for today's trending repos
- Search GitHub for repos with keywords: "agent framework", "RAG", "web search tool", "retrieval augmented", "research assistant"
- Look for repos that gained significant stars recently (high velocity)

Target: surface 8–12 distinct repos that are active, growing, and agent/retrieval-related.

## Phase 2 — Evaluate Each Repo

For the most promising repos (top 6–8), dig deeper:
1. Read the README to understand what the repo does
2. Check what search/retrieval tools it currently uses (Tavily, Serper, SerpAPI, Bing, Google, Perplexity, etc.)
3. Determine if it has a plugin/tool system where Exa could be added
4. Check star count, recent commit activity, and contributor count

## Phase 3 — Score Exa Fit

For each repo, assign an \`exa_fit\` score:
- **strong** — already uses web search/retrieval with an inferior tool (Tavily, SerpAPI, Serper, Bing) OR has a tool/plugin interface that clearly lacks good search. Exa would be a direct upgrade.
- **medium** — does research, Q&A, or browsing tasks but doesn't yet have a search layer. Exa could add real-time web access.
- **weak** — agent is code-execution focused, math, vision, or purely local. Search wouldn't add much.

Only include repos with \`exa_fit\` of "strong" or "medium" in your output. Drop "weak" repos entirely.

## Phase 4 — Output

Return your findings as structured output. For the top 2–3 "strong" fit repos, also write a brief 2–3 sentence outreach note that frames Exa as the search layer worth trying (mention exa.ai).

## Structured Output
You MUST provide structured output with these fields:
- \`repos\`: array of discovered repos, each with:
  - \`full_name\`: "owner/repo" format
  - \`url\`: GitHub URL
  - \`stars\`: star count
  - \`star_velocity\`: approximate stars per week (0 if unknown)
  - \`exa_fit\`: "strong" or "medium"
  - \`current_search_tool\`: what search/retrieval tool the repo currently uses (e.g. "Tavily", "SerpAPI", "none") or null
  - \`readme_summary\`: one-sentence description of what the repo does
  - \`integration_opportunity\`: how Exa could be integrated (e.g. "Replace Tavily in tool config", "Add as search provider plugin") or null
  - \`key_reviewers\`: array of GitHub usernames of active maintainers
  - \`outreach_note\`: 2–3 sentence outreach message for "strong" fit repos, null for others
- \`summary\`: brief summary of discovery results (e.g. "Found 8 repos, 3 strong Exa fit targets")
`;
}

export const SCOUT_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    repos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          full_name: { type: "string" },
          url: { type: "string" },
          stars: { type: "number" },
          star_velocity: { type: "number" },
          exa_fit: { type: "string", enum: ["strong", "medium"] },
          current_search_tool: { type: ["string", "null"] },
          readme_summary: { type: "string" },
          integration_opportunity: { type: ["string", "null"] },
          key_reviewers: { type: "array", items: { type: "string" } },
          outreach_note: { type: ["string", "null"] },
        },
        required: [
          "full_name",
          "url",
          "stars",
          "exa_fit",
          "readme_summary",
        ],
      },
    },
    summary: { type: "string" },
  },
  required: ["repos", "summary"],
};

// ─── Ghost-mode PR Prompt Builder ────────────────────────────────

function buildGhostPrTaskSteps(integration: Integration): string[] {
  const baseline = integration.baseline_type;

  if (baseline === "python_sdk" || baseline === "typescript_sdk") {
    const sdk = baseline === "python_sdk" ? "exa-py" : "exa-js";
    return [
      "1. Clone the repository using the GHOST_GITHUB_TOKEN for authentication.",
      `2. Create a new branch with a human-style name (e.g. 'update-${sdk}-v${integration.latest_sdk_version ?? "latest"}').`,
      `3. Update ${sdk} from ${integration.current_sdk_version ?? "current"} to ${integration.latest_sdk_version ?? "latest"}.`,
      "4. Run the build and test commands to verify the update works.",
      "5. Fix any breaking changes if needed.",
      "6. Commit with a natural human-style message.",
      "7. Push and create a PR using the GHOST_GITHUB_TOKEN.",
      "8. Report the PR URL in structured output.",
    ];
  }

  if (baseline === "mcp") {
    return [
      "1. Clone the repository using the GHOST_GITHUB_TOKEN for authentication.",
      "2. Create a new branch with a human-style name.",
      "3. Update the exa-mcp-server dependency or configuration to address missing features.",
      "4. Run the build and test commands to verify the update works.",
      "5. Commit with a natural human-style message.",
      "6. Push and create a PR using the GHOST_GITHUB_TOKEN.",
      "7. Report the PR URL in structured output.",
    ];
  }

  if (baseline === "docs") {
    return [
      "1. Clone the repository using the GHOST_GITHUB_TOKEN for authentication.",
      "2. Create a new branch with a human-style name.",
      "3. Update the code examples and documentation to reflect the current Exa API.",
      "4. Verify the examples are correct and use current parameters.",
      "5. Commit with a natural human-style message.",
      "6. Push and create a PR using the GHOST_GITHUB_TOKEN.",
      "7. Report the PR URL in structured output.",
    ];
  }

  if (baseline === "api_direct") {
    return [
      "1. Clone the repository using the GHOST_GITHUB_TOKEN for authentication.",
      "2. Create a new branch with a human-style name.",
      "3. Update the API calls to use current Exa API endpoints and parameters.",
      "4. Run the build and test commands to verify the update works.",
      "5. Commit with a natural human-style message.",
      "6. Push and create a PR using the GHOST_GITHUB_TOKEN.",
      "7. Report the PR URL in structured output.",
    ];
  }

  return [
    "1. Clone the repository using the GHOST_GITHUB_TOKEN for authentication.",
    "2. Create a new branch with a human-style name.",
    "3. Address the identified issues and missing features.",
    "4. Run the build and test commands to verify the update works.",
    "5. Commit with a natural human-style message.",
    "6. Push and create a PR using the GHOST_GITHUB_TOKEN.",
    "7. Report the PR URL in structured output.",
  ];
}

export function buildGhostPrPrompt(integration: Integration): string {
  const ctx = integration.update_context;
  const baseline = integration.baseline_type;
  const showSdkVersion = baseline === "python_sdk" || baseline === "typescript_sdk";

  const lines = [
    `# Ghost-mode PR: Update ${integration.name} (${integration.slug})`,
    "",
    "## CRITICAL: Ghost Mode Rules",
    "You are creating a PR that MUST appear as if a human wrote it.",
    "- Do NOT mention Devin, AI, automation, bots, or any non-human involvement in commit messages, PR title, PR description, or code comments.",
    "- Write commit messages in a natural human style.",
    "- Write the PR description as a normal developer would — brief, to the point, referencing the changes.",
    "- Do NOT add any AI-generated comments, annotations, or explanations in the code.",
    "- Use the GHOST_GITHUB_TOKEN environment variable for all git operations (clone, push, PR creation).",
    "",
    `**Type:** ${integration.type}`,
    `**Baseline:** ${baseline}`,
    `**Repo:** ${integration.repo}`,
    ctx.external_repo ? `**External Repo:** ${ctx.external_repo}` : null,
    showSdkVersion ? `**Current SDK Version:** ${integration.current_sdk_version ?? "unknown"}` : null,
    showSdkVersion ? `**Latest SDK Version:** ${integration.latest_sdk_version ?? "unknown"}` : null,
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
    ...buildGhostPrTaskSteps(integration),
    "",
    "## Structured Output",
    "You MUST provide structured output with these fields:",
    "- `pr_url`: the URL of the created PR (string or null if failed)",
    "- `branch`: the branch name used",
    "- `summary`: brief description of what was done",
    "- `success`: boolean indicating if the PR was created successfully",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const GHOST_PR_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    pr_url: { type: ["string", "null"] },
    branch: { type: "string" },
    summary: { type: "string" },
    success: { type: "boolean" },
  },
  required: ["summary", "success"],
};

// ─── Stuck Session Detection ─────────────────────────────────────

const STUCK_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isSessionStuck(startedAt: Date | null): boolean {
  if (!startedAt) return false;
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return elapsed > STUCK_SESSION_TIMEOUT_MS;
}
