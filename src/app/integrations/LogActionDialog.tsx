"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { logManualAction } from "./actions";
import type { ActivityAction } from "@/types/integrations";

interface Props {
  onClose: () => void;
}

const actionOptions: { value: ActivityAction; label: string }[] = [
  { value: "pr_created", label: "PR Created" },
  { value: "pr_merged", label: "PR Merged" },
  { value: "outreach_sent", label: "Outreach Sent" },
  { value: "outreach_responded", label: "Outreach Responded" },
  { value: "mark_fixed", label: "Mark Fixed" },
  { value: "status_change", label: "Status Change" },
  { value: "note", label: "Note" },
];

export function LogActionDialog({ onClose }: Props) {
  const [action, setAction] = useState<ActivityAction>("note");
  const [targetType, setTargetType] = useState<
    "integration" | "scout_repo" | "general"
  >("general");
  const [targetName, setTargetName] = useState("");
  const [details, setDetails] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = () => {
    if (!details.trim()) {
      alert("Details are required");
      return;
    }

    startTransition(async () => {
      const result = await logManualAction(
        action,
        targetType,
        targetName || null,
        targetName || "general",
        details,
        prUrl || undefined,
      );
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to log action");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Log Action</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Action Type
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ActivityAction)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Target Type
            </label>
            <select
              value={targetType}
              onChange={(e) =>
                setTargetType(
                  e.target.value as "integration" | "scout_repo" | "general",
                )
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="general">General</option>
              <option value="integration">Integration</option>
              <option value="scout_repo">Scout Repo</option>
            </select>
          </div>
        </div>

        {targetType !== "general" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Target Name
            </label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder={
                targetType === "integration"
                  ? "e.g., haystack"
                  : "e.g., composiohq/composio"
              }
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Details
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Describe the action taken..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            PR URL (optional)
          </label>
          <input
            type="url"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Log Action"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
