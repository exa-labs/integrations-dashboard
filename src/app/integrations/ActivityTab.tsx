"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { LogActionDialog } from "./LogActionDialog";
import { formatRelativeTime } from "@/lib/utils";
import type { ActivityLogEntry, ActivityAction } from "@/types/integrations";

interface Props {
  entries: ActivityLogEntry[];
}

const actionLabels: Record<ActivityAction, string> = {
  mark_outdated: "marked outdated",
  mark_fixed: "marked fixed",
  pr_created: "created PR",
  pr_merged: "merged PR",
  outreach_sent: "sent outreach",
  outreach_responded: "received response",
  status_change: "changed status",
  update_approved: "approved update",
  audit_triggered: "triggered audit",
  audit_completed: "audit completed",
  ghost_pr_started: "started ghost PR",
  ghost_pr_completed: "ghost PR completed",
  scout_started: "started scout discovery",
  scout_completed: "scout discovery completed",
  note: "added note",
};

const actionDotColors: Record<ActivityAction, string> = {
  mark_fixed: "bg-green-500",
  pr_merged: "bg-green-500",
  mark_outdated: "bg-red-500",
  pr_created: "bg-blue-500",
  outreach_sent: "bg-blue-500",
  update_approved: "bg-indigo-500",
  audit_triggered: "bg-purple-500",
  audit_completed: "bg-purple-500",
  ghost_pr_started: "bg-emerald-500",
  ghost_pr_completed: "bg-emerald-500",
  scout_started: "bg-teal-500",
  scout_completed: "bg-teal-500",
  outreach_responded: "bg-purple-500",
  status_change: "bg-gray-400",
  note: "bg-gray-400",
};

type TimeFilter = "24h" | "7d" | "30d" | "all";

export function ActivityTab({ entries }: Props) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("7d");
  const [actionFilter, setActionFilter] = useState<ActivityAction | "all">(
    "all",
  );
  const [showLogDialog, setShowLogDialog] = useState(false);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (timeFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (timeFilter === "24h") cutoff.setHours(now.getHours() - 24);
      else if (timeFilter === "7d") cutoff.setDate(now.getDate() - 7);
      else if (timeFilter === "30d") cutoff.setDate(now.getDate() - 30);
      result = result.filter((e) => new Date(e.created_at) >= cutoff);
    }

    if (actionFilter !== "all") {
      result = result.filter((e) => e.action === actionFilter);
    }

    return result;
  }, [entries, timeFilter, actionFilter]);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Time:</span>
            {(["24h", "7d", "30d", "all"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  timeFilter === filter
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filter === "all" ? "All" : filter}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) =>
                setActionFilter(e.target.value as ActivityAction | "all")
              }
              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All</option>
              {Object.entries(actionLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => setShowLogDialog(true)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Log Action
        </button>
      </div>

      {/* Feed */}
      <div className="space-y-1">
        {filteredEntries.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center text-gray-400">
            No activity found for the selected filters.
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry._id}
              className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${actionDotColors[entry.action] ?? "bg-gray-400"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">
                    {entry.actor}
                  </span>
                  <span className="text-gray-500">
                    {actionLabels[entry.action] ?? entry.action}
                  </span>
                  {entry.target_name && (
                    <Badge variant="default">{entry.target_name}</Badge>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-gray-400">
                    {formatRelativeTime(new Date(entry.created_at))}
                  </span>
                </div>
                {entry.details && (
                  <p className="mt-0.5 text-sm text-gray-600">
                    {entry.details}
                  </p>
                )}
                {entry.pr_url && (
                  <a
                    href={entry.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 text-xs text-blue-600 hover:underline"
                  >
                    {entry.pr_url}
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showLogDialog && (
        <LogActionDialog onClose={() => setShowLogDialog(false)} />
      )}
    </div>
  );
}
