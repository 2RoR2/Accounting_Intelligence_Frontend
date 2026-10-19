import { PublicPage } from "@/features/auth/public-pages";
import { Suspense } from "react";
export default function Home() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <PublicPage page="" />
    </Suspense>
  );
}
