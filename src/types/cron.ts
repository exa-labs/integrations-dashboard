export type CronJobType = "audit" | "scout";
export type CronSessionStatus = "idle" | "running" | "completed" | "failed";

export interface CronJobState {
  _id: string; // "audit" | "scout"
  type: CronJobType;
  enabled: boolean;

  // Tick tracking (lock mechanism)
  last_tick_at: Date | null;
  tick_lock_until: Date | null;

  // Session scheduling
  cooldown_minutes: number;
  max_concurrent_sessions: number;
  last_spawn_at: Date | null;

  // For global jobs (scout): single active session
  active_session_id: string | null;
  active_session_url: string | null;
  active_session_started_at: Date | null;
  active_session_status: CronSessionStatus;
  active_session_result: string | null;

  // Stats
  total_runs: number;
  total_sessions_spawned: number;
  last_error: string | null;
  last_error_at: Date | null;
}

export const CRON_JOB_DEFAULTS: Record<CronJobType, Omit<CronJobState, "_id">> =
  {
    audit: {
      type: "audit",
      enabled: true,
      last_tick_at: null,
      tick_lock_until: null,
      cooldown_minutes: 1440, // 24 hours between audit rounds
      max_concurrent_sessions: 3,
      last_spawn_at: null,
      active_session_id: null,
      active_session_url: null,
      active_session_started_at: null,
      active_session_status: "idle",
      active_session_result: null,
      total_runs: 0,
      total_sessions_spawned: 0,
      last_error: null,
      last_error_at: null,
    },
    scout: {
      type: "scout",
      enabled: true,
      last_tick_at: null,
      tick_lock_until: null,
      cooldown_minutes: 1440, // 24 hours between scout runs
      max_concurrent_sessions: 1,
      last_spawn_at: null,
      active_session_id: null,
      active_session_url: null,
      active_session_started_at: null,
      active_session_status: "idle",
      active_session_result: null,
      total_runs: 0,
      total_sessions_spawned: 0,
      last_error: null,
      last_error_at: null,
    },
  };
