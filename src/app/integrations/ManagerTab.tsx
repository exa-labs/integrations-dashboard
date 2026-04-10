"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
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
import { formatDate } from "@/lib/utils";
import { triggerAudit, checkAuditStatus, getIntegrationData } from "./actions";
import type {
  Integration,
  IntegrationHealth,
  AuditStatus,
  SdkState,
} from "@/types/integrations";

interface Props {
  integrations: Integration[];
  sdkState: SdkState | null;
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

export function ManagerTab({ integrations, sdkState }: Props) {
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
  const [localIntegrations, setLocalIntegrations] = useState(integrations);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      const running = localIntegrations.filter(
        (i) => i.audit_status === "running",
      );
      for (const integration of running) {
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
    }, 30_000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [hasRunningAudits, localIntegrations]);

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
        cell: (info) => (
          <div>
            <span className="font-medium text-gray-900">
              {info.getValue()}
            </span>
            <span className="ml-2 text-xs text-gray-400">
              {info.row.original.type}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("health", {
        header: "Health",
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
      columnHelper.accessor("current_sdk_version", {
        header: "SDK Version",
        cell: (info) => {
          const current = info.getValue();
          const latest = info.row.original.latest_sdk_version;
          if (!current) return <span className="text-gray-400">—</span>;
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
        cell: (info) => {
          const features = info.getValue();
          if (!features.length)
            return <span className="text-gray-400">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {features.slice(0, 2).map((f) => (
                <span
                  key={f}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
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
        cell: (info) => (
          <span className="text-sm text-gray-600">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("approval_status", {
        header: "Approval",
        cell: (info) => {
          const status = info.getValue();
          if (status === "none") return <span className="text-gray-400">—</span>;
          return <Badge variant={status}>{status.replace("_", " ")}</Badge>;
        },
      }),
      columnHelper.accessor("audit_status", {
        header: "Audit",
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
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex gap-2">
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
                </>
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
    [expandedRow, auditLoading, pollLoading, handleCheckStatus, handleTriggerAudit],
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
        <button
          onClick={() => setShowAddDialog(true)}
          className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          + Add Integration
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
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
                      <td key={cell.id} className="px-4 py-3">
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
