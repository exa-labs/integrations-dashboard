# Integrations Dashboard — AGENTS.md

> Context file for LLM agents working on this codebase. Updated with each feature.

## Project Overview

Internal dashboard for Exa (exa.ai) to monitor, audit, and manage all third-party integrations of the Exa SDK. Two main verticals:

1. **Integration Manager** — Track known integrations, trigger automated audits via Devin sessions, detect SDK staleness, approve updates
2. **Integration Scout** — Discover trending GitHub repos that do NOT use Exa but would benefit from an integration (outreach targets)

**Production URL:** https://integrations-dashboard-eta.vercel.app
**Repo:** https://github.com/exa-labs/integrations-dashboard

## Tech Stack

- **Framework:** Next.js 15 (App Router, Server Actions, React 19)
- **Language:** TypeScript 5.8
- **Styling:** Tailwind CSS 4
- **Database:** Firebase Firestore (via `firebase-admin`)
- **Table:** @tanstack/react-table v8
- **Icons:** lucide-react
- **Toasts:** react-toastify
- **Validation:** zod
- **Hosting:** Vercel (with Vercel Cron)
- **AI Sessions:** Devin API (`api.devin.ai/v1/sessions`)

## Environment Variables

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account JSON (single-line) |
| `CRON_SECRET` | Bearer token for authenticating cron/API routes |
| `DEVIN_API_KEY` | Devin API key for spawning audit/scout sessions |
| `SLACK_WEBHOOK_URL` | (Optional) Slack incoming webhook for notifications |
| `GHOST_GITHUB_TOKEN` | (Optional) Human's GitHub PAT for ghost-mode PR creation |

## Project Structure

```
src/
  app/
    page.tsx                          # Redirects to /integrations
    layout.tsx                        # Root layout
    integrations/
      page.tsx                        # Server component — fetches data, renders IntegrationsPage
      IntegrationsPage.tsx            # Client component — tab container (Manager, Scout, Activity)
      ManagerTab.tsx                  # Integration table with audit triggers, health filters
      ScoutTab.tsx                    # Scout repo table with exa_fit filters
      ActivityTab.tsx                 # Activity log timeline
      actions.ts                     # Server actions (CRUD, audit, scout data fetching)
      AddIntegrationDialog.tsx        # Add new integration form
      EditContextDialog.tsx           # Edit integration context
      MarkFixedDialog.tsx             # Mark integration as fixed
      ApproveUpdateDialog.tsx         # Approve update for ghost-mode PR
      MarkContactedDialog.tsx         # Mark scout repo as contacted
      LogActionDialog.tsx             # Log manual activity
      IntegrationContextPanel.tsx     # Expandable context panel in table row
      RepoDetailPanel.tsx             # Scout repo detail slide-out panel
      [id]/
        page.tsx                      # Integration detail page (server component)
        IntegrationDetailPage.tsx     # Detail page with Overview/Audits/Activity tabs
    api/
      cron/
        orchestrator/route.ts         # Unified cron poller (runs every 5 min)
        sdk-check/route.ts            # SDK version checker (MWF 8am UTC)
      integrations/
        sync/route.ts                 # Bulk upsert integrations
        seed/route.ts                 # Seed sample data (dev only)
        audit/route.ts                # Trigger audit for single integration
        audit/status/route.ts         # Check audit session status
        approve/route.ts              # Approve integration update
        scout/route.ts                # DELETE: clear scout_repos collection
  lib/
    firebase.ts                       # Firebase Admin SDK initialization (singleton)
    firebase-integrations.ts          # Firestore CRUD for integrations, scout_repos, activity_log
    firebase-cron.ts                  # Firestore CRUD for cron_jobs (lock, state, toggle)
    devin-session.ts                  # Devin API helpers (spawn, poll, completeAudit, prompt builders)
    slack.ts                          # Slack webhook notifications (stale, scout, audit)
    seed-data.ts                      # Sample integration data
    utils.ts                          # formatDate, formatRelativeTime, cn()
  types/
    integrations.ts                   # Integration, ScoutRepo, ActivityLogEntry, AuditHistoryEntry, etc.
    cron.ts                           # CronJobState, CronJobType, CRON_JOB_DEFAULTS
  components/ui/
    badge.tsx                         # Colored badge component
    dialog.tsx                        # Modal dialog component
    summary-card.tsx                  # Summary stat card component
```

## Firestore Collections

### `integrations` (doc ID = slug)
Core integration records. Each has:
- `name`, `slug`, `type` (python/typescript/external/sheets/other)
- `repo` (GitHub URL)
- `health` (healthy/outdated/needs_audit)
- `current_sdk_version`, `latest_sdk_version`, `missing_features[]`
- `update_context` (notes, key_files[], build_cmd, test_cmd, publish_cmd)
- `approval_status` (none/pending_approval/approved/in_progress)
- `ghost_pr_session_id`, `ghost_pr_session_url`, `ghost_pr_url` — ghost-mode PR tracking
- `audit_status` (none/running/completed/failed), `audit_session_id`, `audit_session_url`
- Subcollection: `audit_history` (doc ID = session_id for idempotency)

### `scout_repos` (doc ID = `owner__repo`)
Discovered repos from scout sessions:
- `full_name`, `url`, `stars`, `star_velocity`
- `exa_fit` (strong/medium) — new field, replaces old `score`
- `current_search_tool` — what search tool the repo currently uses
- `integration_opportunity`, `outreach_note`
- `outreach_status` (pending/contacted/responded/declined/integrated)

### `activity_log`
Timeline of all actions (audit triggers, completions, outreach, manual notes).

### `cron_jobs` (doc ID = "audit" | "scout")
State for each cron job type — tick lock, cooldown, active session tracking, stats.

## Cron Architecture

A unified orchestrator runs every 5 minutes via Vercel Cron (`/api/cron/orchestrator`):

1. **Scout job:** If no active session and cooldown passed (7 days), spawns a Devin scout session. If session running, polls it. On completion, upserts discovered repos + Slack notifies for strong fits.
2. **Audit job:** Polls running audit sessions (max 5/tick). Spawns new audits for eligible integrations (priority: needs_audit > outdated > healthy). Max 2 spawns/tick, max 3 concurrent. Slack notifies for non-healthy audit results.
3. **Ghost PR polling:** Polls in-progress ghost PR sessions (`approval_status === "in_progress"`). On completion, extracts PR URL and marks integration healthy.

Both audit and scout use transactional tick locks to prevent duplicate processing.

SDK version check runs separately MWF 8am UTC (`/api/cron/sdk-check`). Compares each integration's `current_sdk_version` against latest from PyPI/npm. Newly outdated integrations get Slack notifications. Auto-resolves integrations whose version now matches latest.

## Key Patterns

### Server Actions (actions.ts)
All data mutations go through server actions. The UI calls these directly — no HTTP round-trips to own API routes (avoids Vercel deployment protection issues).

### Devin Session Lifecycle
1. `spawnDevinSession()` creates a session with a prompt + structured output schema
2. `pollDevinSession()` checks status. Terminal states: stopped, finished, blocked-with-output, failed
3. `completeAudit()` processes results: updates health, writes audit history, logs activity. Idempotent via session_id doc IDs.

### Dynamic Skip List (Scout)
Before spawning a scout session, `getKnownRepoSlugs()` fetches all integration repo URLs + existing scout_repos slugs. These are injected into the prompt so Devin doesn't waste time on already-known repos.

### Bulk Audit
`triggerBulkAudit()` server action spawns Devin audit sessions for all integrations not currently running. The "Audit All" button in ManagerTab confirms with the user, then fires all audits in sequence.

### Slack Notifications (`src/lib/slack.ts`)
Gracefully no-ops if `SLACK_WEBHOOK_URL` is not set. Three notification types:
- `notifyStaleIntegrations()` — called by sdk-check cron when integrations are newly outdated
- `notifyStrongScoutFinds()` — called by orchestrator when scout discovers strong-fit repos
- `notifyAuditCompleted()` — called by orchestrator when audit completes with non-healthy result

### Ghost-mode PR Creation
When an integration's `approval_status` is "approved", the user can click "Create PR" which:
1. Spawns a Devin session with `buildGhostPrPrompt()` — instructs Devin to use `GHOST_GITHUB_TOKEN` and leave zero AI traces
2. Sets `approval_status` to "in_progress" and tracks `ghost_pr_session_id`
3. Orchestrator polls the session every 5 min
4. On completion, extracts `pr_url` from structured output, marks integration healthy

### Staleness Detection
The sdk-check cron (`/api/cron/sdk-check`) runs MWF 8am UTC:
1. Fetches latest exa-py version from PyPI and exa-js from npm
2. Compares each integration's `current_sdk_version` against latest
3. Marks mismatched integrations as "outdated" with `outdated_since` timestamp
4. Auto-resolves integrations that now match latest back to "healthy"
5. Sends Slack notification for all newly outdated integrations

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
```

## Conventions

- Use `"use server"` for server action files
- Use `"use client"` for interactive components
- Firestore timestamps: always use `.toDate?.()` with `?? null` fallback in converters
- Document IDs: slugs for integrations, `owner__repo` for scout repos, job type for cron
- Activity logging: every mutation should also write to activity_log
- Badge variants match health/status values (healthy, outdated, needs_audit, etc.)
- No external CSS — all styling via Tailwind classes
- Prefer `@/` path aliases for imports

## Feature Status

### Built
- [x] Integration registry (CRUD with context)
- [x] Automated audits via Devin sessions
- [x] Auto-poll running audits (client-side 30s polling)
- [x] Live summary cards (computed from local state)
- [x] Integration detail page with tabs (Overview, Audits, Activity)
- [x] Scout discovery (rewired to find repos WITHOUT Exa)
- [x] Dynamic skip list for scout deduplication
- [x] Unified cron orchestrator (5-min tick)
- [x] SDK version check cron (MWF)
- [x] Activity log timeline
- [x] Vercel deployment with cron routes
- [x] Bulk audit trigger ("Audit All" button)
- [x] Slack notifications (stale integrations, strong scout fits, audit results)
- [x] Ghost-mode PR creation (human-token, no AI traces, orchestrator polling)
- [x] Staleness detection (auto-compare SDK versions, auto-flag outdated, auto-resolve healthy)
