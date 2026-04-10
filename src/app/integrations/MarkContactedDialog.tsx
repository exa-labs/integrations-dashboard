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
import { markRepoContacted } from "./actions";
import type { ScoutRepo } from "@/types/integrations";

interface Props {
  repo: ScoutRepo;
  onClose: () => void;
}

export function MarkContactedDialog({ repo, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await markRepoContacted(repo._id, notes);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to mark as contacted");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Mark {repo.full_name} as Contacted</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <p className="text-sm text-gray-600">
          Record that outreach has been sent for this repository.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was outreach sent? e.g., Opened GitHub issue, DM'd maintainer"
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
          className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Mark Contacted"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
