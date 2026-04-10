"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { triggerAudit, checkAuditStatus } from "../actions";
import type {
  Integration,
  AuditHistoryEntry,
  ActivityLogEntry,
  IntegrationHealth,
  AuditStatus,
} from "@/types/integrations";

// ─── Types ───────────────────────────────────────────────────────

interface Props {
  integration: Integration;
  auditHistory: AuditHistoryEntry[];
  activity: ActivityLogEntry[];
}

type TabId = "overview" | "context" | "history" | "activity";

interface AuditResultParsed {
  health?: string;
  current_sdk_version?: string | null;
  latest_sdk_version?: string | null;
  missing_features?: string[];
  summary?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

const healthLabels: Record<IntegrationHealth, string> = {
  healthy: "Healthy",
  outdated: "Outdated",
  needs_audit: "Needs Audit",
};

const auditStatusLabels: Record<AuditStatus, string> = {
  none: "No Audits",
  running: "Auditing...",
  completed: "Audit Done",
  failed: "Audit Failed",
};

function parseAuditResult(raw: string | null): AuditResultParsed | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuditResultParsed;
  } catch {
    return null;
  }
}

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Tab definitions ─────────────────────────────────────────────

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "context", label: "Context" },
  { id: "history", label: "Audit History" },
  { id: "activity", label: "Activity" },
];

// ─── Component ───────────────────────────────────────────────────

export function IntegrationDetailPage({
  integration: initialIntegration,
  auditHistory,
  activity,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [integration, setIntegration] = useState(initialIntegration);
  const [auditLoading, setAuditLoading] = useState(false);
  const [pollLoading, setPollLoading] = useState(false);

  const handleTriggerAudit = useCallback(async () => {
    if (auditLoading) return;
    setAuditLoading(true);
    try {
      const result = await triggerAudit(integration._id);
      if (result.success) {
        setIntegration((prev) => ({
          ...prev,
          audit_status: "running" as AuditStatus,
          audit_session_id: result.session_id ?? null,
          audit_session_url: result.session_url ?? null,
          audit_started_at: new Date(),
          audit_result: null,
        }));
      } else {
        alert(result.error ?? "Failed to trigger audit");
      }
    } finally {
      setAuditLoading(false);
    }
  }, [auditLoading, integration._id]);

  const handleCheckStatus = useCallback(async () => {
    if (pollLoading) return;
    setPollLoading(true);
    try {
      const result = await checkAuditStatus(integration._id);
      if (result.success && result.audit_status) {
        setIntegration((prev) => ({
          ...prev,
          audit_status: result.audit_status as AuditStatus,
        }));
      }
    } finally {
      setPollLoading(false);
    }
  }, [pollLoading, integration._id]);

  const auditResult = parseAuditResult(integration.audit_result);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="mb-4">
            <Link
              href="/integrations"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Back to Integrations
            </Link>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {integration.name}
                </h1>
                <Badge variant={integration.health}>
                  {healthLabels[integration.health]}
                </Badge>
                {integration.audit_status !== "none" && (
                  <Badge
                    variant={
                      integration.audit_status === "completed"
                        ? "healthy"
                        : integration.audit_status === "failed"
                          ? "outdated"
                          : "needs_audit"
                    }
                  >
                    {auditStatusLabels[integration.audit_status]}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {integration.type}
                </span>
                <a
                  href={`https://github.com/${integration.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {integration.repo}
                </a>
                {integration.update_context.external_repo && (
                  <a
                    href={`https://github.com/${integration.update_context.external_repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {integration.update_context.external_repo}
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {integration.audit_session_url && (
                <a
                  href={integration.audit_session_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-gray-50"
                >
                  View Session
                </a>
              )}
              {integration.audit_status === "running" ? (
                <button
                  onClick={handleCheckStatus}
                  disabled={pollLoading}
                  className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {pollLoading ? "Checking..." : "Check Status"}
                </button>
              ) : (
                <button
                  onClick={handleTriggerAudit}
                  disabled={auditLoading}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {auditLoading ? "Starting..." : "Trigger Audit"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {tab.id === "history" && auditHistory.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {auditHistory.length}
                  </span>
                )}
                {tab.id === "activity" && activity.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {activity.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {activeTab === "overview" && (
          <OverviewTab integration={integration} auditResult={auditResult} />
        )}
        {activeTab === "context" && (
          <ContextTab integration={integration} />
        )}
        {activeTab === "history" && (
          <AuditHistoryTab history={auditHistory} />
        )}
        {activeTab === "activity" && (
          <ActivityTab activity={activity} />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────

function OverviewTab({
  integration,
  auditResult,
}: {
  integration: Integration;
  auditResult: AuditResultParsed | null;
}) {
  return (
    <div className="space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatusCard
          label="Health"
          value={healthLabels[integration.health]}
          variant={integration.health}
        />
        <StatusCard
          label="SDK Version"
          value={
            integration.current_sdk_version
              ? integration.current_sdk_version
              : "No SDK dependency"
          }
          subValue={
            integration.latest_sdk_version &&
            integration.current_sdk_version !== integration.latest_sdk_version
              ? `Latest: ${integration.latest_sdk_version}`
              : undefined
          }
          variant={
            integration.current_sdk_version &&
            integration.latest_sdk_version &&
            integration.current_sdk_version !== integration.latest_sdk_version
              ? "outdated"
              : "healthy"
          }
        />
        <StatusCard
          label="Audit Status"
          value={auditStatusLabels[integration.audit_status]}
          subValue={
            integration.audit_started_at
              ? `Started ${formatDate(integration.audit_started_at)}`
              : undefined
          }
          variant={
            integration.audit_status === "completed"
              ? "healthy"
              : integration.audit_status === "failed"
                ? "outdated"
                : integration.audit_status === "running"
                  ? "needs_audit"
                  : "none"
          }
        />
        <StatusCard
          label="Approval"
          value={
            integration.approval_status === "none"
              ? "Not requested"
              : integration.approval_status.replace("_", " ")
          }
          variant={integration.approval_status}
        />
      </div>

      {/* Latest audit result */}
      {auditResult && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">
            Latest Audit Result
          </h3>
          {auditResult.summary && (
            <p className="mb-4 text-sm text-gray-700">{auditResult.summary}</p>
          )}
          <div className="flex flex-wrap gap-6 text-sm">
            {auditResult.health && (
              <div>
                <span className="text-gray-500">Health: </span>
                <Badge variant={auditResult.health}>{auditResult.health}</Badge>
              </div>
            )}
            {auditResult.current_sdk_version && (
              <div>
                <span className="text-gray-500">Current SDK: </span>
                <span className="font-mono text-gray-900">
                  {auditResult.current_sdk_version}
                </span>
              </div>
            )}
            {auditResult.latest_sdk_version && (
              <div>
                <span className="text-gray-500">Latest SDK: </span>
                <span className="font-mono text-gray-900">
                  {auditResult.latest_sdk_version}
                </span>
              </div>
            )}
          </div>
          {auditResult.missing_features &&
            auditResult.missing_features.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Missing Features
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {auditResult.missing_features.map((f) => (
                    <span
                      key={f}
                      className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Outdated since / missing features quick view */}
      {integration.health === "outdated" && integration.outdated_since && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            Marked outdated since{" "}
            <span className="font-medium">
              {formatDate(integration.outdated_since)}
            </span>
          </p>
        </div>
      )}

      {integration.missing_features.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Missing Features ({integration.missing_features.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {integration.missing_features.map((f) => (
              <span
                key={f}
                className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Context Tab ─────────────────────────────────────────────────

function ContextTab({ integration }: { integration: Integration }) {
  const ctx = integration.update_context;

  return (
    <div className="space-y-6">
      {/* Notes */}
      {ctx.notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Notes</h3>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {ctx.notes}
          </p>
        </div>
      )}

      {/* Key files */}
      {ctx.key_files.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Key Files
          </h3>
          <div className="flex flex-wrap gap-2">
            {ctx.key_files.map((f) => (
              <code
                key={f}
                className="rounded bg-gray-100 px-2.5 py-1 text-xs text-gray-800"
              >
                {f}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Commands */}
      {(ctx.build_cmd || ctx.test_cmd || ctx.publish_cmd) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Commands
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {ctx.build_cmd && (
              <CommandCard label="Build" command={ctx.build_cmd} />
            )}
            {ctx.test_cmd && (
              <CommandCard label="Test" command={ctx.test_cmd} />
            )}
            {ctx.publish_cmd && (
              <CommandCard label="Publish" command={ctx.publish_cmd} />
            )}
          </div>
        </div>
      )}

      {/* External repo */}
      {ctx.external_repo && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            External Repository
          </h3>
          <a
            href={`https://github.com/${ctx.external_repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {ctx.external_repo}
            {ctx.external_repo_path && ` \u2192 ${ctx.external_repo_path}`}
          </a>
        </div>
      )}

      {/* Empty state */}
      {!ctx.notes &&
        ctx.key_files.length === 0 &&
        !ctx.build_cmd &&
        !ctx.test_cmd &&
        !ctx.publish_cmd &&
        !ctx.external_repo && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-sm text-gray-500">
              No update context configured for this integration.
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Edit the integration from the Manager tab to add context.
            </p>
          </div>
        )}
    </div>
  );
}

// ─── Audit History Tab ───────────────────────────────────────────

function AuditHistoryTab({ history }: { history: AuditHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm text-gray-500">No audit history yet.</p>
        <p className="mt-1 text-xs text-gray-400">
          Trigger an audit from the Overview tab to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => {
        const result = parseAuditResult(entry.result);
        return (
          <div
            key={entry._id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    entry.status === "completed" ? "healthy" : "outdated"
                  }
                >
                  {entry.status === "completed" ? "Completed" : "Failed"}
                </Badge>
                {entry.health_at_completion && (
                  <Badge variant={entry.health_at_completion}>
                    {healthLabels[entry.health_at_completion]}
                  </Badge>
                )}
                <span className="text-xs text-gray-500">
                  {formatDateTime(entry.completed_at)}
                </span>
              </div>
              {entry.session_url && (
                <a
                  href={entry.session_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-600 hover:underline"
                >
                  View Session &rarr;
                </a>
              )}
            </div>

            {result?.summary && (
              <p className="mt-2 text-sm text-gray-700">{result.summary}</p>
            )}

            {result && (
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                {result.current_sdk_version && (
                  <span>
                    SDK:{" "}
                    <span className="font-mono text-gray-700">
                      {result.current_sdk_version}
                    </span>
                  </span>
                )}
                {result.missing_features &&
                  result.missing_features.length > 0 && (
                    <span>
                      Missing: {result.missing_features.join(", ")}
                    </span>
                  )}
              </div>
            )}

            {entry.started_at && entry.completed_at && (
              <p className="mt-1 text-xs text-gray-400">
                Duration:{" "}
                {Math.round(
                  (new Date(entry.completed_at).getTime() -
                    new Date(entry.started_at).getTime()) /
                    60000,
                )}{" "}
                min
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────────────

function ActivityTab({ activity }: { activity: ActivityLogEntry[] }) {
  if (activity.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
        <p className="text-sm text-gray-500">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activity.map((entry) => (
        <div
          key={entry._id}
          className="flex items-start gap-3 rounded-lg px-4 py-3 hover:bg-white"
        >
          <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-gray-300" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {entry.actor}
              </span>
              <Badge variant="default" className="text-[10px]">
                {entry.action.replace(/_/g, " ")}
              </Badge>
              <span className="text-xs text-gray-400">
                {entry.created_at
                  ? formatRelativeTime(new Date(entry.created_at))
                  : "—"}
              </span>
            </div>
            {entry.details && (
              <p className="mt-0.5 text-sm text-gray-600 truncate">
                {entry.details}
              </p>
            )}
            {entry.pr_url && (
              <a
                href={entry.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-xs text-blue-600 hover:underline"
              >
                View PR &rarr;
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────

function StatusCard({
  label,
  value,
  subValue,
  variant = "none",
}: {
  label: string;
  value: string;
  subValue?: string;
  variant?: string;
}) {
  const borderColors: Record<string, string> = {
    healthy: "border-l-green-500",
    outdated: "border-l-red-500",
    needs_audit: "border-l-yellow-500",
    approved: "border-l-indigo-500",
    in_progress: "border-l-yellow-500",
    pending_approval: "border-l-orange-500",
    none: "border-l-gray-300",
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 border-l-4 bg-white p-4 ${
        borderColors[variant] ?? borderColors.none
      }`}
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      {subValue && (
        <p className="mt-0.5 text-xs text-gray-500">{subValue}</p>
      )}
    </div>
  );
}

function CommandCard({
  label,
  command,
}: {
  label: string;
  command: string;
}) {
  return (
    <div className="rounded-md bg-gray-50 p-3">
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <code className="text-xs text-gray-800">{command}</code>
    </div>
  );
}
