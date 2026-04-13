import * as admin from "firebase-admin";
import { getFirestore } from "./firebase";
import type { CronJobState, CronJobType } from "@/types/cron";
import { CRON_JOB_DEFAULTS } from "@/types/cron";

const CRON_JOBS = "cron_jobs";

// ─── Converters ──────────────────────────────────────────────────

function docToCronJobState(
  doc: admin.firestore.DocumentSnapshot,
): CronJobState {
  const d = doc.data()!;
  return {
    _id: doc.id,
    type: d.type ?? doc.id,
    enabled: d.enabled ?? true,
    last_tick_at: d.last_tick_at?.toDate?.() ?? null,
    tick_lock_until: d.tick_lock_until?.toDate?.() ?? null,
    cooldown_minutes: d.cooldown_minutes ?? 1440,
    max_concurrent_sessions: d.max_concurrent_sessions ?? 3,
    last_spawn_at: d.last_spawn_at?.toDate?.() ?? null,
    active_session_id: d.active_session_id ?? null,
    active_session_url: d.active_session_url ?? null,
    active_session_started_at: d.active_session_started_at?.toDate?.() ?? null,
    active_session_status: d.active_session_status ?? "idle",
    active_session_result: d.active_session_result ?? null,
    total_runs: d.total_runs ?? 0,
    total_sessions_spawned: d.total_sessions_spawned ?? 0,
    last_error: d.last_error ?? null,
    last_error_at: d.last_error_at?.toDate?.() ?? null,
  };
}

// ─── Read ────────────────────────────────────────────────────────

export async function getCronJobState(
  type: CronJobType,
): Promise<CronJobState | null> {
  const db = getFirestore();
  if (!db) return null;

  const doc = await db.collection(CRON_JOBS).doc(type).get();
  if (!doc.exists) return null;
  return docToCronJobState(doc);
}

export async function getAllCronJobStates(): Promise<CronJobState[]> {
  const db = getFirestore();
  if (!db) return [];

  const snap = await db.collection(CRON_JOBS).get();
  return snap.docs.map(docToCronJobState);
}

// ─── Bootstrap (create if not exists) ────────────────────────────

export async function ensureCronJobExists(
  type: CronJobType,
): Promise<CronJobState> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not initialized");

  const ref = db.collection(CRON_JOBS).doc(type);
  const doc = await ref.get();

  if (doc.exists) {
    return docToCronJobState(doc);
  }

  // Create with defaults
  const defaults = CRON_JOB_DEFAULTS[type];
  await ref.set(defaults);
  return { _id: type, ...defaults };
}

// ─── Tick Lock (transactional) ───────────────────────────────────

/**
 * Attempt to acquire the tick lock for a cron job.
 * Uses a Firestore transaction to ensure only one tick runs at a time.
 * Returns the current state if lock acquired, null if locked by another tick.
 */
export async function acquireTickLock(
  type: CronJobType,
  lockDurationMs: number = 4 * 60 * 1000, // 4 minutes
): Promise<CronJobState | null> {
  const db = getFirestore();
  if (!db) return null;

  const ref = db.collection(CRON_JOBS).doc(type);

  try {
    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);

      if (!doc.exists) {
        // Bootstrap: create the doc with defaults and acquire lock
        const defaults = CRON_JOB_DEFAULTS[type];
        const now = new Date();
        const data = {
          ...defaults,
          tick_lock_until: new Date(now.getTime() + lockDurationMs),
          last_tick_at: admin.firestore.FieldValue.serverTimestamp(),
        };
        tx.set(ref, data);
        return {
          _id: type,
          ...defaults,
          tick_lock_until: new Date(now.getTime() + lockDurationMs),
          last_tick_at: now,
        } as CronJobState;
      }

      const state = docToCronJobState(doc);

      // Check if locked by another tick
      if (state.tick_lock_until && state.tick_lock_until > new Date()) {
        return null; // Locked
      }

      // Acquire lock
      const now = new Date();
      tx.update(ref, {
        tick_lock_until: new Date(now.getTime() + lockDurationMs),
        last_tick_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        ...state,
        tick_lock_until: new Date(now.getTime() + lockDurationMs),
        last_tick_at: now,
      };
    });

    return result;
  } catch (error) {
    console.error(`[Cron Lock] Failed to acquire lock for ${type}:`, error);
    return null;
  }
}

/**
 * Release the tick lock after processing completes.
 */
export async function releaseTickLock(type: CronJobType): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db
    .collection(CRON_JOBS)
    .doc(type)
    .update({
      tick_lock_until: null,
      last_tick_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ─── Update helpers ──────────────────────────────────────────────

export async function updateCronJobState(
  type: CronJobType,
  update: Partial<Record<string, unknown>>,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db.collection(CRON_JOBS).doc(type).update(update);
}

export async function recordCronSpawn(
  type: CronJobType,
  sessionsSpawned: number,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db
    .collection(CRON_JOBS)
    .doc(type)
    .update({
      last_spawn_at: admin.firestore.FieldValue.serverTimestamp(),
      total_sessions_spawned:
        admin.firestore.FieldValue.increment(sessionsSpawned),
      total_runs: admin.firestore.FieldValue.increment(1),
    });
}

export async function recordCronError(
  type: CronJobType,
  error: string,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db.collection(CRON_JOBS).doc(type).update({
    last_error: error,
    last_error_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── Scout session state ─────────────────────────────────────────

export async function updateScoutSession(
  update: Partial<{
    active_session_id: string | null;
    active_session_url: string | null;
    active_session_started_at: Date | admin.firestore.FieldValue | null;
    active_session_status: string;
    active_session_result: string | null;
  }>,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db.collection(CRON_JOBS).doc("scout").update(update);
}

// ─── Toggle ──────────────────────────────────────────────────────

export async function toggleCronJob(
  type: CronJobType,
  enabled: boolean,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db.collection(CRON_JOBS).doc(type).update({ enabled });
}
