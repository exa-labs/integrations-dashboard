import { getIntegrationDetail } from "../actions";
import { IntegrationDetailPage } from "./IntegrationDetailPage";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IntegrationPage({ params }: Props) {
  const { id } = await params;
  const { integration, auditHistory, activity } = await getIntegrationDetail(id);

  if (!integration) {
    notFound();
  }

  return (
    <IntegrationDetailPage
      integration={integration}
      auditHistory={auditHistory}
      activity={activity}
    />
  );
}
