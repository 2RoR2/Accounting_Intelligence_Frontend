"use client";
import { Application } from "@/features/application";
import { InboxPage } from "./inbox-page";

/** The upload page inside the normal sign-in check and app shell, for /workspace/upload and /company/upload. */
export function InboxRoute({ area }: { area: "workspace" | "company" }) {
  return <Application path={[area, "upload"]} page={(user) => <InboxPage user={user} />} />;
}
