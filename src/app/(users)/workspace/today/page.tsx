import { redirect } from "next/navigation";

// B3 called the home page "Today"; old links and bookmarks land on the Dashboard.
export default function Page() {
  redirect("/workspace/dashboard");
}
