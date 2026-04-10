export type IntegrationHealth = "healthy" | "outdated" | "needs_audit";
export type IntegrationType =
  | "python"
  | "typescript"
  | "external"
  | "sheets"
  | "other";
export type ScoutScore = "strong" | "medium" | "weak";
export type OutreachStatus =
  | "pending"
  | "contacted"
  | "responded"
  | "declined"
  | "integrated";
export type ActivityAction =
  | "mark_outdated"
  | "mark_fixed"
  | "pr_created"
  | "pr_merged"
  | "outreach_sent"
  | "outreach_responded"
  | "status_change"
  | "update_approved"
  | "note";

export interface IntegrationUpdateContext {
  notes: string;
  key_files: string[];
  build_cmd: string;
  test_cmd: string;
  publish_cmd: string;
  external_repo?: string;
  external_repo_path?: string;
}

export interface Integration {
  _id: string;
  name: string;
  slug: string;
  type: IntegrationType;
  repo: string;
  health: IntegrationHealth;
  current_sdk_version: string | null;
  latest_sdk_version: string | null;
  missing_features: string[];
  outdated_since: Date | null;
  last_checked: Date;
  update_context: IntegrationUpdateContext;
  approval_status: "none" | "pending_approval" | "approved" | "in_progress";
  approved_by: string | null;
  approved_at: Date | null;
}

export interface ScoutRepo {
  _id: string;
  full_name: string;
  url: string;
  stars: number;
  star_velocity: number;
  score: ScoutScore;
  uses_search: string | null;
  readme_summary: string;
  integration_pattern: string | null;
  key_reviewers: string[];
  outreach_status: OutreachStatus;
  outreach_draft: string | null;
  discovered_at: Date;
  contacted_at: Date | null;
  contacted_by: string | null;
}

export interface ActivityLogEntry {
  _id: string;
  actor: string;
  action: ActivityAction;
  target_type: "integration" | "scout_repo" | "general";
  target_id: string | null;
  target_name: string;
  details: string;
  pr_url: string | null;
  created_at: Date;
}

export interface SdkState {
  exa_py_version: string;
  exa_js_version: string;
  exa_py_types_hash: string;
  exa_js_types_hash: string;
  last_checked: Date;
}

export interface ManagerSummary {
  total: number;
  outdated: number;
  healthy: number;
  needs_audit: number;
}

export interface ScoutSummary {
  discovered_this_week: number;
  strong: number;
  pending_outreach: number;
}
