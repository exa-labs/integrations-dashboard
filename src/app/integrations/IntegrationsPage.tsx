"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ManagerTab } from "./ManagerTab";
import { ScoutTab } from "./ScoutTab";
import { ActivityTab } from "./ActivityTab";
import type {
  Integration,
  ScoutRepo,
  ActivityLogEntry,
  ManagerSummary,
  ScoutSummary,
  SdkState,
} from "@/types/integrations";
import { cx } from "@/lib/utils";

type TabId = "manager" | "scout" | "activity";

interface Props {
  initialManager: {
    integrations: Integration[];
    summary: ManagerSummary;
    sdkState: SdkState | null;
  };
  initialScout: {
    repos: ScoutRepo[];
    summary: ScoutSummary;
  };
  initialActivity: {
    entries: ActivityLogEntry[];
  };
}

const TABS: { id: TabId; label: string }[] = [
  { id: "manager", label: "Manager" },
  { id: "scout", label: "Scout" },
  { id: "activity", label: "Activity" },
];

export function IntegrationsPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageInner {...props} />
    </Suspense>
  );
}

function IntegrationsPageInner({
  initialManager,
  initialScout,
  initialActivity,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "manager",
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.replace(`/integrations?tab=${tab}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor integration health, discover new repos, and track activity.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cx(
                "whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "manager" && (
        <ManagerTab
          integrations={initialManager.integrations}
          summary={initialManager.summary}
          sdkState={initialManager.sdkState}
        />
      )}
      {activeTab === "scout" && (
        <ScoutTab
          repos={initialScout.repos}
          summary={initialScout.summary}
        />
      )}
      {activeTab === "activity" && (
        <ActivityTab entries={initialActivity.entries} />
      )}
    </div>
  );
}
