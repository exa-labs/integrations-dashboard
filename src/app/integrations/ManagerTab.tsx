"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SummaryCard } from "@/components/ui/summary-card";
import { MarkFixedDialog } from "./MarkFixedDialog";
import { ApproveUpdateDialog } from "./ApproveUpdateDialog";
import { AddIntegrationDialog } from "./AddIntegrationDialog";
import { EditContextDialog } from "./EditContextDialog";
import { IntegrationContextPanel } from "./IntegrationContextPanel";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { triggerAudit, triggerBulkAudit, triggerGhostPr, checkAuditStatus, getIntegrationData, recalculateAllBenchmarks } from "./actions";
import type {
  Integration,
  IntegrationHealth,
  AuditStatus,
  SdkState,
} from "@/types/integrations";
import type { CronJobState } from "@/types/cron";

interface Props {
  integrations: Integration[];
  sdkState: SdkState | null;
  cronStates: CronJobState[];
}

const healthLabels: Record<IntegrationHealth, string> = {
  healthy: "Healthy",
  outdated: "Outdated",
  needs_audit: "Needs Audit",
};

const auditStatusLabels: Record<AuditStatus, string> = {
  none: "",
  running: "Auditing...",
  completed: "Audit Done",
  failed: "Audit Failed",
};

const columnHelper = createColumnHelper<Integration>();

function isCronLocked(state: CronJobState): boolean {
  return !!state.tick_lock_until && new Date(state.tick_lock_until) > new Date();
}

export function ManagerTab({ integrations, sdkState, cronStates }: Props) {
  const auditCron = cronStates.find((c) => c.type === "audit");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "health", desc: false },
  ]);
  const [healthFilter, setHealthFilter] = useState<IntegrationHealth | "all">(
    "all",
  );
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [markFixedTarget, setMarkFixedTarget] = useState<Integration | null>(
    null,
  );
  const [approveTarget, setApproveTarget] = useState<Integration | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Integration | null>(null);
  const [auditLoading, setAuditLoading] = useState<string | null>(null);
  const [pollLoading, setPollLoading] = useState<string | null>(null);
  const [bulkAuditLoading, setBulkAuditLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [localIntegrations, setLocalIntegrations] = useState(integrations);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localIntegrationsRef = useRef(localIntegrations);
  localIntegrationsRef.current = localIntegrations;

  useEffect(() => {
    setLocalIntegrations(integrations);
  }, [integrations]);

  // Auto-poll running audits every 30s
  const hasRunningAudits = useMemo(
    () => localIntegrations.some((i) => i.audit_status === "running"),
    [localIntegrations],
  );

  useEffect(() => {
    if (!hasRunningAudits) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const running = localIntegrationsRef.current.filter(
        (i) => i.audit_status === "running",
      );
      for (const integration of running) {
        if (cancelled) return;
        const result = await checkAuditStatus(integration._id);
        if (
          result.success &&
          (result.audit_status === "completed" || result.audit_status === "failed")
        ) {
          const updated = await getIntegrationData(integration._id);
          if (updated) {
            setLocalIntegrations((prev) =>
              prev.map((i) => (i._id === integration._id ? updated : i)),
            );
          }
        }
      }
      if (!cancelled) {
        pollTimerRef.current = setTimeout(poll, 30_000);
      }
    };

    // Start first poll after 30s delay
    pollTimerRef.current = setTimeout(poll, 30_000);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [hasRunningAudits]);

  const handleBulkAudit = useCallback(async () => {
    if (bulkAuditLoading) return;
    const count = localIntegrations.filter((i) => i.audit_status !== "running" && i.approval_status !== "in_progress" && i.baseline_type !== "first_party" && i.baseline_type !== "na").length;
    if (!confirm(`Trigger audits for ${count} integration(s)?`)) return;
    setBulkAuditLoading(true);
    try {
      const result = await triggerBulkAudit();
      if (result.success) {
        // Refresh all integrations to reflect new audit status
        const updated = await Promise.all(
          localIntegrations.map((i) => getIntegrationData(i._id)),
        );
        setLocalIntegrations(
          updated.filter((i): i is Integration => i !== null),
        );
        alert(
          `Triggered ${result.triggered} audit(s)${result.skipped ? `, ${result.skipped} skipped (already running)` : ""}${result.errors.length ? `\nErrors: ${result.errors.join(", ")}` : ""}`,
        );
      } else {
        alert(result.error ?? "Failed to trigger bulk audit");
      }
    } finally {
      setBulkAuditLoading(false);
    }
  }, [bulkAuditLoading, localIntegrations]);

  const handleRecalcAll = useCallback(async () => {
    if (recalcLoading) return;
    setRecalcLoading(true);
    try {
      const result = await recalculateAllBenchmarks();
      if (result.success) {
        const updated = await Promise.all(
          localIntegrations.map((i) => getIntegrationData(i._id)),
        );
        setLocalIntegrations(
          updated.filter((i): i is Integration => i !== null),
        );
        alert(`Recalculated ${result.updated} benchmark(s), ${result.skipped} skipped (no capabilities)`);
      } else {
        alert(result.error ?? "Failed to recalculate benchmarks");
      }
    } finally {
      setRecalcLoading(false);
    }
  }, [recalcLoading, localIntegrations]);

  const [ghostPrLoading, setGhostPrLoading] = useState<string | null>(null);

  const handleTriggerGhostPr = useCallback(async (integration: Integration) => {
    if (ghostPrLoading) return;
    setGhostPrLoading(integration._id);
    try {
      const result = await triggerGhostPr(integration._id);
      if (result.success) {
        const updated = await getIntegrationData(integration._id);
        if (updated) {
          setLocalIntegrations((prev) =>
            prev.map((i) => (i._id === updated._id ? updated : i)),
          );
        }
        alert(`Ghost PR session started: ${result.session_url}`);
      } else {
        alert(result.error ?? "Failed to start ghost PR");
      }
    } finally {
      setGhostPrLoading(null);
    }
  }, [ghostPrLoading]);

  const handleTriggerAudit = useCallback(async (integration: Integration) => {
    if (auditLoading) return;
    setAuditLoading(integration._id);
    try {
      const result = await triggerAudit(integration._id);
      if (result.success && result.session_url) {
        setLocalIntegrations((prev) =>
          prev.map((i) =>
            i._id === integration._id
              ? {
                  ...i,
                  audit_status: "running" as AuditStatus,
                  audit_session_id: result.session_id ?? null,
                  audit_session_url: result.session_url ?? null,
                  audit_started_at: new Date(),
                  audit_result: null,
                }
              : i,
          ),
        );
      } else if (result.error === "Audit already running" && result.session_url) {
        window.open(result.session_url, "_blank");
      } else {
        alert(result.error ?? "Failed to trigger audit");
      }
    } finally {
      setAuditLoading(null);
    }
  }, [auditLoading]);

  const handleCheckStatus = useCallback(async (integration: Integration) => {
    if (pollLoading) return;
    setPollLoading(integration._id);
    try {
      const result = await checkAuditStatus(integration._id);
      if (result.success && result.audit_status) {
        if (result.audit_status === "completed" || result.audit_status === "failed") {
          const updated = await getIntegrationData(integration._id);
          if (updated) {
            setLocalIntegrations((prev) =>
              prev.map((i) => (i._id === integration._id ? updated : i)),
            );
          }
        }
      }
    } finally {
      setPollLoading(null);
    }
  }, [pollLoading]);

  const filteredData = useMemo(() => {
    if (healthFilter === "all") return localIntegrations;
    return localIntegrations.filter((i) => i.health === healthFilter);
  }, [localIntegrations, healthFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Integration",
        size: 180,
        cell: (info) => (
          <div>
            <Link
              href={`/integrations/${info.row.original._id}`}
              className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {info.getValue()}
            </Link>
            <span className="ml-2 text-xs text-gray-400">
              {info.row.original.type}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("health", {
        header: "Health",
        size: 90,
        cell: (info) => (
          <Badge variant={info.getValue()}>
            {healthLabels[info.getValue()]}
          </Badge>
        ),
        sortingFn: (a, b) => {
          const order: Record<string, number> = {
            outdated: 0,
            needs_audit: 1,
            healthy: 2,
          };
          return (
            (order[a.original.health] ?? 3) - (order[b.original.health] ?? 3)
          );
        },
      }),
      columnHelper.accessor("benchmark", {
        header: "Score",
        size: 70,
        cell: (info) => {
          const bm = info.getValue();
          if (!bm) return <span className="text-xs text-gray-400 italic">N/A</span>;
          const score = bm.score;
          const color =
            score >= 90
              ? "bg-green-100 text-green-800"
              : score >= 60
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800";
          const epSupported = bm.endpoint_coverage.filter((e: { supported: boolean }) => e.supported).length;
          const epTotal = bm.endpoint_coverage.length;
          const stTotal = bm.missing_search_types.length + bm.search_type_coverage.length;
          const coTotal = bm.missing_content_options.length + bm.content_option_coverage.length;
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
              title={`Endpoints: ${epSupported}/${epTotal} | Search types: ${bm.search_type_coverage.length}/${stTotal} | Content: ${bm.content_option_coverage.length}/${coTotal}${info.row.original.baseline_type === "python_sdk" || info.row.original.baseline_type === "typescript_sdk" ? ` | SDK: ${bm.sdk_version_match ? "match" : "mismatch"}` : ""}`}
            >
              {score}/100
            </span>
          );
        },
        sortingFn: (a, b) => {
          const aScore = a.original.benchmark?.score ?? -1;
          const bScore = b.original.benchmark?.score ?? -1;
          return aScore - bScore;
        },
      }),
      columnHelper.accessor("current_sdk_version", {
        header: "SDK Version",
        size: 120,
        cell: (info) => {
          const current = info.getValue();
          const latest = info.row.original.latest_sdk_version;
          if (!current)
            return <span className="text-xs text-gray-400 italic">No SDK dependency</span>;
          return (
            <span className="font-mono text-sm">
              {current}
              {latest && current !== latest && (
                <span className="ml-1 text-xs text-red-500">→ {latest}</span>
              )}
            </span>
          );
        },
      }),
      columnHelper.accessor("missing_features", {
        header: "Missing Features",
        size: 220,
        cell: (info) => {
          const features = info.getValue();
          if (!features.length)
            return <span className="text-gray-400">—</span>;
          return (
            <div className="flex flex-wrap gap-1 max-w-[150px]">
              {features.slice(0, 2).map((f) => (
                <span
                  key={f}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700 truncate max-w-[140px]"
                  title={f}
                >
                  {f}
                </span>
              ))}
              {features.length > 2 && (
                <span className="text-xs text-gray-400">
                  +{features.length - 2}
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      }),
      columnHelper.accessor("outdated_since", {
        header: "Outdated Since",
        size: 100,
        cell: (info) => (
          <span className="text-sm text-gray-600">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("approval_status", {
        header: "Approval",
        size: 90,
        cell: (info) => {
          const status = info.getValue();
          if (status === "none") return <span className="text-gray-400">—</span>;
          return <Badge variant={status}>{status.replace("_", " ")}</Badge>;
        },
      }),
      columnHelper.accessor("audit_status", {
        header: "Audit",
        size: 90,
        cell: (info) => {
          const status = info.getValue();
          const label = auditStatusLabels[status];
          if (!label) return <span className="text-gray-400">—</span>;
          const variant =
            status === "running"
              ? "needs_audit"
              : status === "completed"
                ? "healthy"
                : status === "failed"
                  ? "outdated"
                  : "needs_audit";
          return <Badge variant={variant}>{label}</Badge>;
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        size: 150,
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex gap-2 whitespace-nowrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedRow(
                    expandedRow === row._id ? null : row._id,
                  );
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {expandedRow === row._id ? "Hide" : "Context"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditTarget(row);
                }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Edit
              </button>
              {row.health === "outdated" && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMarkFixedTarget(row);
                    }}
                    className="text-xs text-green-600 hover:text-green-800"
                  >
                    Mark Fixed
                  </button>
                  {row.approval_status === "none" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setApproveTarget(row);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Approve Update
                    </button>
                  )}
                  {row.approval_status === "approved" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerGhostPr(row);
                      }}
                      disabled={ghostPrLoading === row._id}
                      className="text-xs text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
                    >
                      {ghostPrLoading === row._id ? "Starting..." : "Create PR"}
                    </button>
                  )}
                  {row.approval_status === "in_progress" && row.ghost_pr_session_url && (
                    <a
                      href={row.ghost_pr_session_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                    >
                      PR in Progress
                    </a>
                  )}
                </>
              )}
              {row.ghost_pr_url && (
                <a
                  href={row.ghost_pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-green-600 hover:text-green-800 underline"
                >
                  View PR
                </a>
              )}
              {row.audit_status === "running" ? (
                <>
                  {row.audit_session_url && (
                    <a
                      href={row.audit_session_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-purple-600 hover:text-purple-800 underline"
                    >
                      View Session
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckStatus(row);
                    }}
                    disabled={pollLoading === row._id}
                    className="text-xs text-orange-600 hover:text-orange-800 disabled:opacity-50"
                  >
                    {pollLoading === row._id ? "Checking..." : "Check Status"}
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTriggerAudit(row);
                  }}
                  disabled={auditLoading === row._id}
                  className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                >
                  {auditLoading === row._id ? "Starting..." : "Trigger Audit"}
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [expandedRow, auditLoading, pollLoading, ghostPrLoading, handleCheckStatus, handleTriggerAudit, handleTriggerGhostPr],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Summary cards — recomputed from local state */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total" value={localIntegrations.length} />
        <SummaryCard
          label="Outdated"
          value={localIntegrations.filter((i) => i.health === "outdated").length}
          color="red"
        />
        <SummaryCard
          label="Healthy"
          value={localIntegrations.filter((i) => i.health === "healthy").length}
          color="green"
        />
        <SummaryCard
          label="Needs Audit"
          value={localIntegrations.filter((i) => i.health === "needs_audit").length}
          color="yellow"
        />
      </div>

      {/* Cron status bar */}
      {auditCron && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isCronLocked(auditCron) ? "bg-yellow-500 animate-pulse" : "bg-green-500"
              }`}
            />
            <span className="font-medium">
              {isCronLocked(auditCron) ? "Cron Running" : "Cron Idle"}
            </span>
          </div>
          {auditCron.last_tick_at && (
            <span className="text-xs text-gray-400">
              Last tick: {formatRelativeTime(new Date(auditCron.last_tick_at))}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">
            Cooldown: {auditCron.cooldown_minutes}min · {auditCron.total_sessions_spawned} sessions spawned
          </span>
        </div>
      )}

      {/* SDK state bar */}
      {sdkState && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
          <span>
            exa-py:{" "}
            <span className="font-mono font-medium">
              {sdkState.exa_py_version}
            </span>
          </span>
          <span>
            exa-js:{" "}
            <span className="font-mono font-medium">
              {sdkState.exa_js_version}
            </span>
          </span>
          <span className="ml-auto text-xs text-gray-400">
            Last checked: {formatDate(sdkState.last_checked)}
          </span>
        </div>
      )}

      {/* Filter + Add */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter:</span>
        {(["all", "outdated", "needs_audit", "healthy"] as const).map(
          (filter) => (
            <button
              key={filter}
              onClick={() => setHealthFilter(filter)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                healthFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter === "all"
                ? "All"
                : healthLabels[filter as IntegrationHealth]}
            </button>
          ),
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleRecalcAll}
            disabled={recalcLoading}
            className="rounded-md bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {recalcLoading ? "Calculating..." : "Recalc Scores"}
          </button>
          <button
            onClick={handleBulkAudit}
            disabled={bulkAuditLoading || localIntegrations.length === 0}
            className="rounded-md bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {bulkAuditLoading ? "Auditing..." : "Audit All"}
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Add Integration
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "27%" }} />
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${header.column.id === "missing_features" ? "max-w-[200px]" : ""}`}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{
                      cursor: header.column.getCanSort() ? "pointer" : "default",
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      {header.column.getIsSorted() === "asc" && " ↑"}
                      {header.column.getIsSorted() === "desc" && " ↓"}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No integrations found. Run a sync to populate data.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className="border-b border-gray-100 transition-colors hover:bg-gray-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`px-4 py-3 ${cell.column.id === "missing_features" ? "max-w-[200px] overflow-hidden" : ""}`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                  {expandedRow === row.original._id && (
                    <tr>
                      <td colSpan={columns.length} className="bg-gray-50 px-4 py-4">
                        <IntegrationContextPanel
                          integration={row.original}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialogs */}
      {markFixedTarget && (
        <MarkFixedDialog
          integration={markFixedTarget}
          onClose={() => setMarkFixedTarget(null)}
        />
      )}
      {approveTarget && (
        <ApproveUpdateDialog
          integration={approveTarget}
          onClose={() => setApproveTarget(null)}
        />
      )}
      {showAddDialog && (
        <AddIntegrationDialog onClose={() => setShowAddDialog(false)} />
      )}
      {editTarget && (
        <EditContextDialog
          integration={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
