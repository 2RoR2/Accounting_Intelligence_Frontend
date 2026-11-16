import { redirect } from "next/navigation";

// The home page is now "Today". Old links and bookmarks land there.
export default function Page() {
  redirect("/company/today");
}
