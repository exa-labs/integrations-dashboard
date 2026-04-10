import {
  getIntegration,
  fetchAuditHistory,
  fetchActivityForIntegration,
} from "@/lib/firebase-integrations";
import { IntegrationDetailPage } from "./IntegrationDetailPage";
import { notFound } from "next/navigation";
import type {
  Integration,
  AuditHistoryEntry,
  ActivityLogEntry,
} from "@/types/integrations";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

// Serialize Date objects to ISO strings for safe server→client transfer
function serializeIntegration(i: Integration): Integration {
  return JSON.parse(JSON.stringify(i)) as Integration;
}

function serializeAuditHistory(entries: AuditHistoryEntry[]): AuditHistoryEntry[] {
  return JSON.parse(JSON.stringify(entries)) as AuditHistoryEntry[];
}

function serializeActivity(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  return JSON.parse(JSON.stringify(entries)) as ActivityLogEntry[];
}

export default async function IntegrationPage({ params }: Props) {
  const { id } = await params;
  const integration = await getIntegration(id);

  if (!integration) {
    notFound();
  }

  const [auditHistory, activity] = await Promise.all([
    fetchAuditHistory(id),
    fetchActivityForIntegration(id),
  ]);

  return (
    <IntegrationDetailPage
      integration={serializeIntegration(integration)}
      auditHistory={serializeAuditHistory(auditHistory)}
      activity={serializeActivity(activity)}
    />
  );
}
