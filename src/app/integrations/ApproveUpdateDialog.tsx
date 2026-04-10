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
import { Badge } from "@/components/ui/badge";
import { approveIntegrationUpdate } from "./actions";
import type { Integration } from "@/types/integrations";

interface Props {
  integration: Integration;
  onClose: () => void;
}

export function ApproveUpdateDialog({ integration, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await approveIntegrationUpdate(integration._id, notes);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to approve update");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Approve Update: {integration.name}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
          <p className="text-sm text-blue-800">
            Approving will queue a ghost-mode PR that appears as your commit.
            No AI or automation traces will be visible in the PR.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Current SDK</span>
            <span className="font-mono">
              {integration.current_sdk_version ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Latest SDK</span>
            <span className="font-mono">
              {integration.latest_sdk_version ?? "—"}
            </span>
          </div>
          {integration.missing_features.length > 0 && (
            <div>
              <span className="text-gray-500">Missing features:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {integration.missing_features.map((f) => (
                  <Badge key={f} variant="outdated">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special instructions for the update..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
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
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Approving..." : "Approve Update"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
