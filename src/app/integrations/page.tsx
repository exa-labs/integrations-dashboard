import {
  getInitialManagerData,
  getInitialScoutData,
  getInitialActivityData,
} from "./actions";
import { IntegrationsPage } from "./IntegrationsPage";

export const dynamic = "force-dynamic";

export default async function IntegrationsRoute() {
  const [managerData, scoutData, activityData] = await Promise.all([
    getInitialManagerData(),
    getInitialScoutData(),
    getInitialActivityData(),
  ]);

  return (
    <IntegrationsPage
      initialManager={managerData}
      initialScout={scoutData}
      initialActivity={activityData}
    />
  );
}
