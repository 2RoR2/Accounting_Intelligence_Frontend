import { Application } from "@/features/application";

// AI Inbox (F3): proposals to accept or dismiss. Hidden from the menu, and refused by the API, when AI_ASSIST is off.
export default function Page() {
  return <Application path={["workspace", "ai-inbox"]} />;
}
