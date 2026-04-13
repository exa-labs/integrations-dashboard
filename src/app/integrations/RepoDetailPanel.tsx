"use client";

import type { ScoutRepo } from "@/types/integrations";

interface Props {
  repo: ScoutRepo;
}

export function RepoDetailPanel({ repo }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {repo.full_name}
        </h3>
        <span className="text-xs text-gray-400">
          {repo.stars.toLocaleString()} stars
        </span>
      </div>

      {repo.readme_summary && (
        <div>
          <p className="text-xs font-medium text-gray-500">README Summary</p>
          <p className="text-sm text-gray-700">{repo.readme_summary}</p>
        </div>
      )}

      {repo.integration_opportunity && (
        <div>
          <p className="text-xs font-medium text-gray-500">
            Integration Opportunity
          </p>
          <p className="text-sm text-gray-700">
            {repo.integration_opportunity}
          </p>
        </div>
      )}

      {repo.integration_pattern && (
        <div>
          <p className="text-xs font-medium text-gray-500">
            Integration Pattern
          </p>
          <code className="text-sm text-gray-800">
            {repo.integration_pattern}
          </code>
        </div>
      )}

      {repo.key_reviewers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500">Key Reviewers</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {repo.key_reviewers.map((r) => (
              <a
                key={r}
                href={`https://github.com/${r}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-blue-600 hover:underline"
              >
                @{r}
              </a>
            ))}
          </div>
        </div>
      )}

      {repo.outreach_note && (
        <div>
          <p className="text-xs font-medium text-gray-500">Outreach Note</p>
          <div className="mt-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
            {repo.outreach_note}
          </div>
        </div>
      )}

      {repo.outreach_draft && (
        <div>
          <p className="text-xs font-medium text-gray-500">Outreach Draft</p>
          <div className="mt-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
            {repo.outreach_draft}
          </div>
        </div>
      )}
    </div>
  );
}
