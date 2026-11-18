import { Application } from "@/features/application";

// The Dashboard is the home page (plan v3, R0): the daily overview with month-end progress.
export default function Page() {
  return <Application path={["workspace", "dashboard"]} />;
}
