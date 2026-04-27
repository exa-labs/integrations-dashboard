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
import { editIntegrationContext, removeIntegration } from "./actions";
import { CapabilitiesSection } from "./CapabilitiesSection";
import type {
  Integration,
  IntegrationType,
  IntegrationUpdateContext,
  ExaEndpoint,
  ExaSearchType,
  ExaContentOption,
} from "@/types/integrations";

interface Props {
  integration: Integration;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: IntegrationType; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "typescript", label: "TypeScript" },
  { value: "external", label: "External" },
  { value: "sheets", label: "Sheets" },
  { value: "other", label: "Other" },
];

export function EditContextDialog({ integration, onClose }: Props) {
  const ctx = integration.update_context;
  const [name, setName] = useState(integration.name);
  const [type, setType] = useState<IntegrationType>(integration.type);
  const [repo, setRepo] = useState(integration.repo);
  const [notes, setNotes] = useState(ctx.notes);
  const [keyFiles, setKeyFiles] = useState(ctx.key_files.join(", "));
  const [buildCmd, setBuildCmd] = useState(ctx.build_cmd);
  const [testCmd, setTestCmd] = useState(ctx.test_cmd);
  const [publishCmd, setPublishCmd] = useState(ctx.publish_cmd);
  const [externalRepo, setExternalRepo] = useState(ctx.external_repo ?? "");
  const [externalRepoPath, setExternalRepoPath] = useState(
    ctx.external_repo_path ?? "",
  );
  const [endpoints, setEndpoints] = useState<ExaEndpoint[]>(
    ctx.capabilities?.supported_endpoints ?? [],
  );
  const [searchTypes, setSearchTypes] = useState<ExaSearchType[]>(
    ctx.capabilities?.supported_search_types ?? [],
  );
  const [contentOptions, setContentOptions] = useState<ExaContentOption[]>(
    ctx.capabilities?.supported_content_options ?? [],
  );
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();

  const handleSubmit = () => {
    const context: IntegrationUpdateContext = {
      notes,
      key_files: keyFiles
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean),
      build_cmd: buildCmd,
      test_cmd: testCmd,
      publish_cmd: publishCmd,
      ...(externalRepo ? { external_repo: externalRepo } : {}),
      ...(externalRepoPath ? { external_repo_path: externalRepoPath } : {}),
      ...(endpoints.length > 0 || searchTypes.length > 0 || contentOptions.length > 0
        ? {
            capabilities: {
              supported_endpoints: endpoints,
              supported_search_types: searchTypes,
              supported_content_options: contentOptions,
            },
          }
        : {}),
    };

    const extra: { name?: string; type?: IntegrationType; repo?: string } = {};
    if (name !== integration.name) extra.name = name;
    if (type !== integration.type) extra.type = type;
    if (repo !== integration.repo) extra.repo = repo;

    startTransition(async () => {
      const result = await editIntegrationContext(
        integration._id,
        name || integration.name,
        context,
        Object.keys(extra).length > 0 ? extra : undefined,
      );
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to update context");
      }
    });
  };

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await removeIntegration(
        integration._id,
        integration.name,
      );
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to delete integration");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Edit {integration.name}</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IntegrationType)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Repo
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <hr className="border-gray-200" />
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Update Context
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Key Files (comma-separated)
          </label>
          <input
            type="text"
            value={keyFiles}
            onChange={(e) => setKeyFiles(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Build Command
            </label>
            <input
              type="text"
              value={buildCmd}
              onChange={(e) => setBuildCmd(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Test Command
            </label>
            <input
              type="text"
              value={testCmd}
              onChange={(e) => setTestCmd(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Publish Command
            </label>
            <input
              type="text"
              value={publishCmd}
              onChange={(e) => setPublishCmd(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              External Repo (optional)
            </label>
            <input
              type="text"
              value={externalRepo}
              onChange={(e) => setExternalRepo(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              External Repo Path (optional)
            </label>
            <input
              type="text"
              value={externalRepoPath}
              onChange={(e) => setExternalRepoPath(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <hr className="border-gray-200" />
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Capabilities (SDK Benchmark)
        </p>
        <CapabilitiesSection
          endpoints={endpoints}
          searchTypes={searchTypes}
          contentOptions={contentOptions}
          onEndpointsChange={setEndpoints}
          onSearchTypesChange={setSearchTypes}
          onContentOptionsChange={setContentOptions}
        />

        <hr className="border-gray-200" />
        <div>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Delete this integration
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-md bg-red-50 p-3">
              <span className="text-sm text-red-700">
                Delete {integration.name}? This cannot be undone.
              </span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
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
          {isPending ? "Saving..." : "Save Changes"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
