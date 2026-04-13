"use client";

import { useState, useMemo, Fragment } from "react";
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
import { MarkContactedDialog } from "./MarkContactedDialog";
import { RepoDetailPanel } from "./RepoDetailPanel";
import { formatRelativeTime } from "@/lib/utils";
import type { ScoutRepo, ExaFit, ScoutSummary } from "@/types/integrations";
import type { CronJobState } from "@/types/cron";

interface Props {
  repos: ScoutRepo[];
  summary: ScoutSummary;
  cronStates: CronJobState[];
}

const exaFitLabels: Record<ExaFit, string> = {
  strong: "Strong Fit",
  medium: "Medium Fit",
};

const columnHelper = createColumnHelper<ScoutRepo>();

function isCronLocked(state: CronJobState): boolean {
  return !!state.tick_lock_until && new Date(state.tick_lock_until) > new Date();
}

export function ScoutTab({ repos, summary, cronStates }: Props) {
  const scoutCron = cronStates.find((c) => c.type === "scout");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "exa_fit", desc: false },
  ]);
  const [fitFilter, setFitFilter] = useState<ExaFit | "all">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [contactTarget, setContactTarget] = useState<ScoutRepo | null>(null);

  const filteredData = useMemo(() => {
    if (fitFilter === "all") return repos;
    return repos.filter((r) => r.exa_fit === fitFilter);
  }, [repos, fitFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("full_name", {
        header: "Repository",
        cell: (info) => (
          <a
            href={info.row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            {info.getValue()}
          </a>
        ),
      }),
      columnHelper.accessor("stars", {
        header: "Stars",
        cell: (info) => (
          <span className="text-sm text-gray-700">
            {info.getValue().toLocaleString()}
          </span>
        ),
      }),
      columnHelper.accessor("star_velocity", {
        header: "Velocity",
        cell: (info) => (
          <span className="text-sm text-gray-700">
            +{info.getValue()}/wk
          </span>
        ),
      }),
      columnHelper.accessor("exa_fit", {
        header: "Exa Fit",
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span className="text-gray-400">—</span>;
          return (
            <Badge variant={val}>
              {exaFitLabels[val]}
            </Badge>
          );
        },
        sortingFn: (a, b) => {
          const order: Record<string, number> = {
            strong: 0,
            medium: 1,
          };
          return (
            (order[a.original.exa_fit ?? ""] ?? 2) - (order[b.original.exa_fit ?? ""] ?? 2)
          );
        },
      }),
      columnHelper.accessor("current_search_tool", {
        header: "Current Search Tool",
        cell: (info) => {
          const val = info.getValue();
          if (!val || val === "none") return <span className="text-gray-400">None</span>;
          return (
            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">
              {val}
            </span>
          );
        },
      }),
      columnHelper.accessor("outreach_status", {
        header: "Outreach",
        cell: (info) => (
          <Badge variant={info.getValue()}>
            {info.getValue()}
          </Badge>
        ),
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
                  setExpandedRow(expandedRow === row._id ? null : row._id);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {expandedRow === row._id ? "Hide" : "Details"}
              </button>
              {row.outreach_status === "pending" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setContactTarget(row);
                  }}
                  className="text-xs text-purple-600 hover:text-purple-800"
                >
                  Mark Contacted
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [expandedRow],
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
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Discovered This Week"
          value={summary.discovered_this_week}
          color="blue"
        />
        <SummaryCard label="Strong Fit" value={summary.strong} color="green" />
        <SummaryCard
          label="Pending Outreach"
          value={summary.pending_outreach}
          color="yellow"
        />
      </div>

      {/* Scout cron status */}
      {scoutCron && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isCronLocked(scoutCron) ? "bg-yellow-500 animate-pulse" : "bg-green-500"
              }`}
            />
            <span className="font-medium">
              {isCronLocked(scoutCron) ? "Scout Running" : "Scout Idle"}
            </span>
          </div>
          {scoutCron.last_tick_at && (
            <span className="text-xs text-gray-400">
              Last run: {formatRelativeTime(new Date(scoutCron.last_tick_at))}
            </span>
          )}
          {scoutCron.active_session_id && scoutCron.active_session_status === "running" && (
            <span className="text-xs text-gray-500">
              Session active
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter:</span>
        {(["all", "strong", "medium"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setFitFilter(filter)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              fitFilter === filter
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {filter === "all" ? "All" : exaFitLabels[filter as ExaFit]}
          </button>
        ))}
      </div>

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
                  No repos discovered yet. Run the Scout playbook to populate data.
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
                      <td
                        colSpan={columns.length}
                        className="bg-gray-50 px-4 py-4"
                      >
                        <RepoDetailPanel repo={row.original} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {contactTarget && (
        <MarkContactedDialog
          repo={contactTarget}
          onClose={() => setContactTarget(null)}
        />
      )}
    </div>
  );
}
