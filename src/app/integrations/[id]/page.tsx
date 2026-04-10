import {
  getIntegration,
  fetchAuditHistory,
  fetchActivityForIntegration,
} from "@/lib/firebase-integrations";
import { IntegrationDetailPage } from "./IntegrationDetailPage";
import { notFound } from "next/navigation";
import type {
  AuditHistoryEntry,
  ActivityLogEntry,
} from "@/types/integrations";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IntegrationPage({ params }: Props) {
  const { id } = await params;
  const integration = await getIntegration(id);

  if (!integration) {
    notFound();
  }

  // These queries may fail if Firestore composite indexes haven't been created yet.
  // Catch errors gracefully so the page still loads.
  let auditHistory: AuditHistoryEntry[] = [];
  let activity: ActivityLogEntry[] = [];
  try {
    [auditHistory, activity] = await Promise.all([
      fetchAuditHistory(id).catch(() => [] as AuditHistoryEntry[]),
      fetchActivityForIntegration(id).catch(() => [] as ActivityLogEntry[]),
    ]);
  } catch {
    // Indexes not yet created — page still loads with empty tabs
  }

  return (
    <IntegrationDetailPage
      integration={integration}
      auditHistory={auditHistory}
      activity={activity}
    />
  );
}
