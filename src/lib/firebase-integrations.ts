import * as admin from "firebase-admin";
import { getFirestore } from "./firebase";
import type {
  Integration,
  IntegrationHealth,
  IntegrationType,
  IntegrationUpdateContext,
  AuditStatus,
  AuditHistoryEntry,
  ScoutRepo,
  ActivityLogEntry,
  ActivityAction,
  SdkState,
  ManagerSummary,
  ScoutSummary,
} from "@/types/integrations";

// ─── Collection names ────────────────────────────────────────────

const INTEGRATIONS = "integrations";
const SCOUT_REPOS = "scout_repos";
const ACTIVITY_LOG = "activity_log";

// ─── Converters ──────────────────────────────────────────────────

function docToIntegration(
  doc: admin.firestore.DocumentSnapshot,
): Integration {
  const d = doc.data()!;
  return {
    _id: doc.id,
    name: d.name,
    slug: d.slug,
    type: d.type ?? "other",
    repo: d.repo ?? "",
    health: d.health ?? "needs_audit",
    current_sdk_version: d.current_sdk_version ?? null,
    latest_sdk_version: d.latest_sdk_version ?? null,
    missing_features: d.missing_features ?? [],
    outdated_since: d.outdated_since?.toDate?.() ?? null,
    last_checked: d.last_checked?.toDate?.() ?? new Date(),
    update_context: d.update_context ?? {
      notes: "",
      key_files: [],
      build_cmd: "",
      test_cmd: "",
      publish_cmd: "",
    },
    approval_status: d.approval_status ?? "none",
    approved_by: d.approved_by ?? null,
    approved_at: d.approved_at?.toDate?.() ?? null,
    audit_session_id: d.audit_session_id ?? null,
    audit_session_url: d.audit_session_url ?? null,
    audit_status: d.audit_status ?? "none",
    audit_started_at: d.audit_started_at?.toDate?.() ?? null,
    audit_result: d.audit_result ?? null,
  };
}

function docToScoutRepo(
  doc: admin.firestore.DocumentSnapshot,
): ScoutRepo {
  const d = doc.data()!;
  return {
    _id: doc.id,
    full_name: d.full_name,
    url: d.url ?? `https://github.com/${d.full_name}`,
    stars: d.stars ?? 0,
    star_velocity: d.star_velocity ?? 0,
    score: d.score ?? "weak",
    uses_search: d.uses_search ?? null,
    readme_summary: d.readme_summary ?? "",
    integration_pattern: d.integration_pattern ?? null,
    key_reviewers: d.key_reviewers ?? [],
    outreach_status: d.outreach_status ?? "pending",
    outreach_draft: d.outreach_draft ?? null,
    discovered_at: d.discovered_at?.toDate?.() ?? new Date(),
    contacted_at: d.contacted_at?.toDate?.() ?? null,
    contacted_by: d.contacted_by ?? null,
  };
}

function docToActivityLogEntry(
  doc: admin.firestore.DocumentSnapshot,
): ActivityLogEntry {
  const d = doc.data()!;
  return {
    _id: doc.id,
    actor: d.actor,
    action: d.action,
    target_type: d.target_type,
    target_id: d.target_id ?? null,
    target_name: d.target_name ?? "",
    details: d.details ?? "",
    pr_url: d.pr_url ?? null,
    created_at: d.created_at?.toDate?.() ?? new Date(),
  };
}

// ─── Integrations ────────────────────────────────────────────────

export async function fetchIntegrations(
  healthFilter?: IntegrationHealth,
): Promise<Integration[]> {
  const db = getFirestore();
  if (!db) return [];

  let query: admin.firestore.Query = db
    .collection(INTEGRATIONS)
    .orderBy("name", "asc");
  if (healthFilter) {
    query = query.where("health", "==", healthFilter);
  }
  const snap = await query.get();
  return snap.docs.map(docToIntegration);
}

export async function getIntegration(
  id: string,
): Promise<Integration | null> {
  const db = getFirestore();
  if (!db) return null;
  const doc = await db.collection(INTEGRATIONS).doc(id).get();
  return doc.exists ? docToIntegration(doc) : null;
}

export async function updateIntegrationHealth(
  id: string,
  health: IntegrationHealth,
  extra?: Partial<Record<string, unknown>>,
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const update: Record<string, unknown> = {
    health,
    ...extra,
    last_checked: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (health === "healthy") {
    update.outdated_since = null;
    update.missing_features = [];
    update.approval_status = "none";
    update.approved_by = null;
    update.approved_at = null;
  }

  await db.collection(INTEGRATIONS).doc(id).update(update);
  return true;
}

export async function updateIntegrationApproval(
  id: string,
  status: Integration["approval_status"],
  approvedBy?: string,
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const update: Record<string, unknown> = { approval_status: status };
  if (status === "none") {
    update.approved_by = null;
    update.approved_at = null;
  } else if (approvedBy) {
    update.approved_by = approvedBy;
    update.approved_at = admin.firestore.FieldValue.serverTimestamp();
  }
  await db.collection(INTEGRATIONS).doc(id).update(update);
  return true;
}

export async function getManagerSummary(): Promise<ManagerSummary> {
  const all = await fetchIntegrations();
  return {
    total: all.length,
    outdated: all.filter((i) => i.health === "outdated").length,
    healthy: all.filter((i) => i.health === "healthy").length,
    needs_audit: all.filter((i) => i.health === "needs_audit").length,
  };
}

export async function upsertIntegrations(
  integrations: Array<Record<string, unknown>>,
): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;

  const BATCH_LIMIT = 500;
  let written = 0;

  for (let i = 0; i < integrations.length; i += BATCH_LIMIT) {
    const chunk = integrations.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const integration of chunk) {
      const slug = integration.slug as string;
      const ref = db.collection(INTEGRATIONS).doc(slug);
      batch.set(
        ref,
        {
          ...integration,
          last_checked: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

export async function addIntegration(data: {
  name: string;
  slug: string;
  type: IntegrationType;
  repo: string;
  update_context: IntegrationUpdateContext;
}): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const ref = db.collection(INTEGRATIONS).doc(data.slug);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      throw new Error(`Integration with slug "${data.slug}" already exists`);
    }

    tx.set(ref, {
      ...data,
      health: "needs_audit" as IntegrationHealth,
      current_sdk_version: null,
      latest_sdk_version: null,
      missing_features: [],
      outdated_since: null,
      last_checked: admin.firestore.FieldValue.serverTimestamp(),
      approval_status: "none",
      approved_by: null,
      approved_at: null,
      audit_session_id: null,
      audit_session_url: null,
      audit_status: "none",
      audit_started_at: null,
      audit_result: null,
    });
  });
  return true;
}

export async function updateIntegrationContext(
  id: string,
  context: IntegrationUpdateContext,
  extra?: { name?: string; type?: IntegrationType; repo?: string },
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const update: Record<string, unknown> = { update_context: context };
  if (extra?.name !== undefined) update.name = extra.name;
  if (extra?.type !== undefined) update.type = extra.type;
  if (extra?.repo !== undefined) update.repo = extra.repo;

  await db.collection(INTEGRATIONS).doc(id).update(update);
  return true;
}

export async function deleteIntegration(id: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  await db.collection(INTEGRATIONS).doc(id).delete();
  return true;
}

// ─── Audit Session Tracking ──────────────────────────────────────

export async function updateIntegrationAuditStatus(
  id: string,
  status: AuditStatus,
  extra?: {
    session_id?: string;
    session_url?: string;
    result?: string;
  },
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  const update: Record<string, unknown> = { audit_status: status };

  if (extra?.session_id !== undefined) {
    update.audit_session_id = extra.session_id;
  }
  if (extra?.session_url !== undefined) {
    update.audit_session_url = extra.session_url;
  }
  if (status === "running") {
    update.audit_started_at = admin.firestore.FieldValue.serverTimestamp();
    update.audit_result = null;
  }
  if (extra?.result !== undefined) {
    update.audit_result = extra.result;
  }

  await db.collection(INTEGRATIONS).doc(id).update(update);
  return true;
}

export async function getIntegrationByAuditSessionId(
  sessionId: string,
): Promise<Integration | null> {
  const db = getFirestore();
  if (!db) return null;

  const snap = await db
    .collection(INTEGRATIONS)
    .where("audit_session_id", "==", sessionId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return docToIntegration(snap.docs[0]);
}

// ─── Audit History (subcollection) ───────────────────────────────

export async function addAuditHistoryEntry(
  integrationId: string,
  entry: Omit<AuditHistoryEntry, "_id">,
): Promise<string> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not initialized");

  // Use session_id as document ID for idempotency — prevents duplicate entries
  // when both cron poll-audits and client-side checkAuditStatus race to complete
  // the same audit simultaneously.
  const docId = entry.session_id || undefined;
  const colRef = db
    .collection(INTEGRATIONS)
    .doc(integrationId)
    .collection("audit_history");

  const data = {
    ...entry,
    started_at: entry.started_at ?? null,
    completed_at: entry.completed_at
      ? entry.completed_at
      : admin.firestore.FieldValue.serverTimestamp(),
  };

  if (docId) {
    // set() with merge is idempotent — second writer just overwrites with same data
    await colRef.doc(docId).set(data, { merge: true });
    return docId;
  }

  const ref = await colRef.add(data);
  return ref.id;
}

export async function fetchAuditHistory(
  integrationId: string,
): Promise<AuditHistoryEntry[]> {
  const db = getFirestore();
  if (!db) return [];

  const snap = await db
    .collection(INTEGRATIONS)
    .doc(integrationId)
    .collection("audit_history")
    .orderBy("completed_at", "desc")
    .limit(50)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      _id: doc.id,
      session_id: d.session_id ?? "",
      session_url: d.session_url ?? "",
      started_at: d.started_at?.toDate?.() ?? null,
      completed_at: d.completed_at?.toDate?.() ?? null,
      status: d.status ?? "completed",
      result: d.result ?? null,
      health_at_completion: d.health_at_completion ?? null,
    };
  });
}

export async function fetchActivityForIntegration(
  integrationId: string,
  limit = 50,
): Promise<ActivityLogEntry[]> {
  const db = getFirestore();
  if (!db) return [];

  const snap = await db
    .collection(ACTIVITY_LOG)
    .where("target_id", "==", integrationId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  return snap.docs.map(docToActivityLogEntry);
}

// ─── Scout Repos ─────────────────────────────────────────────────

export async function fetchScoutRepos(options?: {
  score?: string;
  outreach_status?: string;
  limit?: number;
}): Promise<ScoutRepo[]> {
  const db = getFirestore();
  if (!db) return [];

  let query: admin.firestore.Query = db
    .collection(SCOUT_REPOS)
    .orderBy("discovered_at", "desc");

  if (options?.score) {
    query = query.where("score", "==", options.score);
  }
  if (options?.outreach_status) {
    query = query.where("outreach_status", "==", options.outreach_status);
  }

  const snap = await query.limit(options?.limit ?? 200).get();
  return snap.docs.map(docToScoutRepo);
}

export async function updateScoutRepoOutreach(
  repoId: string,
  status: string,
  contactedBy: string,
): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;

  await db.collection(SCOUT_REPOS).doc(repoId).update({
    outreach_status: status,
    contacted_at: admin.firestore.FieldValue.serverTimestamp(),
    contacted_by: contactedBy,
  });
  return true;
}

export async function getScoutSummary(): Promise<ScoutSummary> {
  const db = getFirestore();
  if (!db)
    return { discovered_this_week: 0, strong: 0, pending_outreach: 0 };

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [thisWeek, strong, pending] = await Promise.all([
    db
      .collection(SCOUT_REPOS)
      .where("discovered_at", ">=", oneWeekAgo)
      .count()
      .get(),
    db
      .collection(SCOUT_REPOS)
      .where("score", "==", "strong")
      .count()
      .get(),
    db
      .collection(SCOUT_REPOS)
      .where("outreach_status", "==", "pending")
      .count()
      .get(),
  ]);

  return {
    discovered_this_week: thisWeek.data().count,
    strong: strong.data().count,
    pending_outreach: pending.data().count,
  };
}

export async function upsertScoutRepos(
  repos: Array<Record<string, unknown>>,
): Promise<number> {
  const db = getFirestore();
  if (!db) return 0;

  const BATCH_LIMIT = 500;
  let written = 0;

  for (let i = 0; i < repos.length; i += BATCH_LIMIT) {
    const chunk = repos.slice(i, i + BATCH_LIMIT);

    const refs = chunk.map((repo) => {
      const fullName = repo.full_name as string;
      const docId = fullName.replace("/", "__");
      return db.collection(SCOUT_REPOS).doc(docId);
    });
    const snapshots = await db.getAll(...refs);
    const existingIds = new Set(
      snapshots.filter((s) => s.exists).map((s) => s.id),
    );

    const batch = db.batch();
    for (let j = 0; j < chunk.length; j++) {
      const repo = chunk[j];
      const ref = refs[j];
      const data: Record<string, unknown> = { ...repo };
      if (!existingIds.has(ref.id)) {
        data.discovered_at = admin.firestore.FieldValue.serverTimestamp();
      }
      batch.set(ref, data, { merge: true });
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

// ─── Activity Log ────────────────────────────────────────────────

export async function fetchActivityLog(options?: {
  actor?: string;
  action?: ActivityAction;
  since?: Date;
  limit?: number;
}): Promise<ActivityLogEntry[]> {
  const db = getFirestore();
  if (!db) return [];

  let query: admin.firestore.Query = db
    .collection(ACTIVITY_LOG)
    .orderBy("created_at", "desc");

  if (options?.actor && options.actor !== "all") {
    query = query.where("actor", "==", options.actor);
  }
  if (options?.action) {
    query = query.where("action", "==", options.action);
  }
  if (options?.since) {
    query = query.where("created_at", ">=", options.since);
  }

  const snap = await query.limit(options?.limit ?? 100).get();
  return snap.docs.map(docToActivityLogEntry);
}

export async function addActivityLogEntry(
  entry: Omit<ActivityLogEntry, "_id" | "created_at">,
): Promise<string> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not initialized");

  const ref = await db.collection(ACTIVITY_LOG).add({
    ...entry,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// ─── SDK State ───────────────────────────────────────────────────

export async function getSdkState(): Promise<SdkState | null> {
  const db = getFirestore();
  if (!db) return null;

  const doc = await db.collection("sdk_state").doc("current").get();
  if (!doc.exists) return null;
  const d = doc.data()!;
  return {
    exa_py_version: d.exa_py_version,
    exa_js_version: d.exa_js_version,
    exa_py_types_hash: d.exa_py_types_hash ?? "",
    exa_js_types_hash: d.exa_js_types_hash ?? "",
    last_checked: d.last_checked?.toDate?.() ?? new Date(),
  };
}

export async function updateSdkState(
  state: Omit<SdkState, "last_checked">,
): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  await db
    .collection("sdk_state")
    .doc("current")
    .set({
      ...state,
      last_checked: admin.firestore.FieldValue.serverTimestamp(),
    });
}
