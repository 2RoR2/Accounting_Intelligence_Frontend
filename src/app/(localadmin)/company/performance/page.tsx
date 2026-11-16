import { Application } from "@/features/application";

// Processing performance moved here from /company/reports, which now shows the accounting reports.
export default function Page() {
  return <Application path={["company", "performance"]} />;
}
