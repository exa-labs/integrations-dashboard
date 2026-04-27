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
import { addNewIntegration } from "./actions";
import { CapabilitiesSection } from "./CapabilitiesSection";
import type {
  IntegrationType,
  IntegrationUpdateContext,
  ExaEndpoint,
  ExaSearchType,
  ExaContentOption,
} from "@/types/integrations";

interface Props {
  onClose: () => void;
}

const TYPE_OPTIONS: { value: IntegrationType; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "typescript", label: "TypeScript" },
  { value: "external", label: "External" },
  { value: "sheets", label: "Sheets" },
  { value: "other", label: "Other" },
];

export function AddIntegrationDialog({ onClose }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<IntegrationType>("python");
  const [repo, setRepo] = useState("");
  const [notes, setNotes] = useState("");
  const [keyFiles, setKeyFiles] = useState("");
  const [buildCmd, setBuildCmd] = useState("");
  const [testCmd, setTestCmd] = useState("");
  const [publishCmd, setPublishCmd] = useState("");
  const [externalRepo, setExternalRepo] = useState("");
  const [externalRepoPath, setExternalRepoPath] = useState("");
  const [endpoints, setEndpoints] = useState<ExaEndpoint[]>([]);
  const [searchTypes, setSearchTypes] = useState<ExaSearchType[]>([]);
  const [contentOptions, setContentOptions] = useState<ExaContentOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !slug.trim()) return;

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
      capabilities:
        endpoints.length > 0 || searchTypes.length > 0 || contentOptions.length > 0
          ? {
              supported_endpoints: endpoints,
              supported_search_types: searchTypes,
              supported_content_options: contentOptions,
            }
          : undefined,
    };

    startTransition(async () => {
      const result = await addNewIntegration(name, slug, type, repo, context);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        alert(result.error ?? "Failed to add integration");
      }
    });
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Add Integration</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., LangChain (Python)"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g., langchain-python"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
              Repo (owner/name)
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="e.g., exa-labs/exa-py"
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
            placeholder="What makes this integration unique? What does a Devin thread need to know to check/update it?"
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
            placeholder="e.g., src/index.ts, package.json"
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
              placeholder="npm run build"
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
              placeholder="npm test"
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
              placeholder="npm publish"
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
              placeholder="e.g., langchain-ai/langchain"
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
              placeholder="e.g., libs/partners/exa/"
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
          disabled={isPending || !name.trim() || !slug.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Adding..." : "Add Integration"}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
