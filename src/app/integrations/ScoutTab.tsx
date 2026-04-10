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
import type { ScoutRepo, ScoutScore, ScoutSummary } from "@/types/integrations";

interface Props {
  repos: ScoutRepo[];
  summary: ScoutSummary;
}

const scoreLabels: Record<ScoutScore, string> = {
  strong: "Strong",
  medium: "Medium",
  weak: "Weak",
};

const columnHelper = createColumnHelper<ScoutRepo>();

export function ScoutTab({ repos, summary }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "score", desc: false },
  ]);
  const [scoreFilter, setScoreFilter] = useState<ScoutScore | "all">("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [contactTarget, setContactTarget] = useState<ScoutRepo | null>(null);

  const filteredData = useMemo(() => {
    if (scoreFilter === "all") return repos;
    return repos.filter((r) => r.score === scoreFilter);
  }, [repos, scoreFilter]);

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
      columnHelper.accessor("score", {
        header: "Score",
        cell: (info) => (
          <Badge variant={info.getValue()}>
            {scoreLabels[info.getValue()]}
          </Badge>
        ),
        sortingFn: (a, b) => {
          const order: Record<string, number> = {
            strong: 0,
            medium: 1,
            weak: 2,
          };
          return (
            (order[a.original.score] ?? 3) - (order[b.original.score] ?? 3)
          );
        },
      }),
      columnHelper.accessor("uses_search", {
        header: "Uses Search",
        cell: (info) => {
          const val = info.getValue();
          if (!val) return <span className="text-gray-400">—</span>;
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

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter:</span>
        {(["all", "strong", "medium", "weak"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setScoreFilter(filter)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              scoreFilter === filter
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {filter === "all" ? "All" : scoreLabels[filter as ScoutScore]}
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
