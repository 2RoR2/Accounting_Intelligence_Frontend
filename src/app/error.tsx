"use client";
import { ErrorState } from "@/components/common/ui";
export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="content">
      <ErrorState message={error.message} retry={reset} />
    </main>
  );
}
