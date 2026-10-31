import { PublicPage } from "@/features/auth/public-pages";
import { AppLoader } from "@/components/common/feedback/app-loader";
import { Suspense } from "react";
export default function Home() {
  return (
    <Suspense fallback={<AppLoader />}>
      <PublicPage page="" />
    </Suspense>
  );
}
