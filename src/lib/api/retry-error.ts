import { ApiError } from "./client";
export function retryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Retry was not confirmed. Refresh processing status.";
  if (!(error instanceof ApiError)) return message;
  const details = error.details;
  const status = typeof details?.jobStatus === "string" ? " Existing job status: " + details.jobStatus + "." : "";
  const dispatch = details?.dispatchAttempted === false ? " No additional retry was dispatched." : "";
  return message + status + dispatch;
}
