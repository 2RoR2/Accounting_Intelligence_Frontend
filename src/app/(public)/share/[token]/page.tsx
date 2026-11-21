import type { Metadata } from "next";
import { SharedDocumentView } from "@/features/public/shared-document";

export const metadata: Metadata = {
  title: "Shared document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedDocumentView key={token} token={token} />;
}
