import { Application } from "@/features/application";

// "Today" is the home page. It shows the existing dashboard until task B3 rebuilds it.
export default function Page() {
  return <Application path={["company", "today"]} />;
}
