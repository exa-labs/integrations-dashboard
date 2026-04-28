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

      {ctx.capabilities && (
        <div className="flex flex-wrap gap-4">
          {ctx.capabilities.supported_endpoints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Endpoints</p>
              <div className="flex flex-wrap gap-1">
                {ctx.capabilities.supported_endpoints.map((ep) => (
                  <span key={ep} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{ep}</span>
                ))}
              </div>
            </div>
          )}
          {ctx.capabilities.supported_search_types.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Search Types</p>
              <div className="flex flex-wrap gap-1">
                {ctx.capabilities.supported_search_types.map((st) => (
                  <span key={st} className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">{st}</span>
                ))}
              </div>
            </div>
          )}
          {ctx.capabilities.supported_content_options.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Content Options</p>
              <div className="flex flex-wrap gap-1">
                {ctx.capabilities.supported_content_options.map((co) => (
                  <span key={co} className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">{co}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit result */}
      {integration.audit_result && (() => {
        try {
          const result = JSON.parse(integration.audit_result) as {
            health?: string;
            current_sdk_version?: string | null;
            latest_sdk_version?: string | null;
            missing_features?: string[];
            summary?: string;
          };
          return (
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <p className="text-xs font-medium text-gray-500 mb-2">
                Last Audit Result
              </p>
              {result.summary && (
                <p className="text-sm text-gray-700 mb-2">{result.summary}</p>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                {result.health && (
                  <span>
                    Health:{" "}
                    <span
                      className={
                        result.health === "healthy"
                          ? "text-green-600 font-medium"
                          : result.health === "outdated"
                            ? "text-red-600 font-medium"
                            : "text-yellow-600 font-medium"
                      }
                    >
                      {result.health}
                    </span>
                  </span>
                )}
                {result.current_sdk_version && (
                  <span>
                    SDK: <span className="font-mono">{result.current_sdk_version}</span>
                    {result.latest_sdk_version &&
                      result.current_sdk_version !== result.latest_sdk_version && (
                        <span className="text-red-500 ml-1">
                          → {result.latest_sdk_version}
                        </span>
                      )}
                  </span>
                )}
              </div>
              {result.missing_features && result.missing_features.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500">Missing Features:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {result.missing_features.map((f) => (
                      <span
                        key={f}
                        className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        } catch {
          return null;
        }
      })()}

      {/* Audit session link */}
      {integration.audit_session_url && (
        <div className="flex items-center gap-2">
          <a
            href={integration.audit_session_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-600 hover:underline"
          >
            View Audit Session →
          </a>
          {integration.audit_started_at && (
            <span className="text-xs text-gray-400">
              Started {new Date(integration.audit_started_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
