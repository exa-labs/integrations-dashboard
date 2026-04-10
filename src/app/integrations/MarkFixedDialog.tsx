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
import { markIntegrationFixed } from "./actions";
import type { Integration } from "@/types/integrations";

interface Props {
  integration: Integration;
  onClose: () => void;
}

export function MarkFixedDialog({ integration, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await markIntegrationFixed(
        integration._id,
        notes,
        prUrl || undefined,
      );
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to mark as fixed");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Mark {integration.name} as Fixed</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <p className="text-sm text-gray-600">
          This will update the health status to &quot;Healthy&quot; and log the
          action.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was fixed? e.g., Updated to exa-py 1.12.0"
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
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Mark Fixed"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
