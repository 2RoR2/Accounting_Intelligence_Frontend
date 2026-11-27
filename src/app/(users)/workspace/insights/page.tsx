"use client";

import { Application } from "@/features/application";
import { InsightsPage } from "@/features/common/insights/insights-page";
import { WORKSPACE_AREA } from "@/lib/constants/routes";

export default function Page() {
  return <Application path={["workspace", "insights"]} page={(user) => <InsightsPage base={`/${WORKSPACE_AREA[user.role]}`} />} />;
}
