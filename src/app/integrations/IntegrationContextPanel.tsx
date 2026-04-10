"use client";

import type { Integration } from "@/types/integrations";

interface Props {
  integration: Integration;
}

export function IntegrationContextPanel({ integration }: Props) {
  const ctx = integration.update_context;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {integration.name} — Update Context
        </h3>
        <a
          href={`https://github.com/${integration.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          {integration.repo}
        </a>
      </div>

      {ctx.notes && (
        <div>
          <p className="text-xs font-medium text-gray-500">Notes</p>
          <p className="text-sm text-gray-700">{ctx.notes}</p>
        </div>
      )}

      {ctx.key_files.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500">Key Files</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ctx.key_files.map((f) => (
              <code
                key={f}
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-800"
              >
                {f}
              </code>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {ctx.build_cmd && (
          <div>
            <p className="text-xs font-medium text-gray-500">Build</p>
            <code className="text-xs text-gray-800">{ctx.build_cmd}</code>
          </div>
        )}
        {ctx.test_cmd && (
          <div>
            <p className="text-xs font-medium text-gray-500">Test</p>
            <code className="text-xs text-gray-800">{ctx.test_cmd}</code>
          </div>
        )}
        {ctx.publish_cmd && (
          <div>
            <p className="text-xs font-medium text-gray-500">Publish</p>
            <code className="text-xs text-gray-800">{ctx.publish_cmd}</code>
          </div>
        )}
      </div>

      {ctx.external_repo && (
        <div>
          <p className="text-xs font-medium text-gray-500">External Repo</p>
          <a
            href={`https://github.com/${ctx.external_repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {ctx.external_repo}
            {ctx.external_repo_path && ` → ${ctx.external_repo_path}`}
          </a>
        </div>
      )}
    </div>
  );
}
