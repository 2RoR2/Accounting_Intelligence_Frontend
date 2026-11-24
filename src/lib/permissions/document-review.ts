import type { Document, User } from "@/types";
import type { DocumentReviews } from "@/lib/api/workflow.service";
import { canDocument } from "./index";
/** UI affordances only. The backend enforces every action independently. */
export function canEditDocument(user: User, doc: Document, hasRecord = false): boolean {
  return ["LOCAL_ADMIN", "ACCOUNTANT"].includes(user.role) && !!user.tenantId && canDocument(user, doc)
    && !hasRecord && !["COMPLETED", "STANDARDISED"].includes(doc.status);
}
export function canDecideReview(user: User, doc: Document, reviews: DocumentReviews | null): boolean {
  // GET reviews has no submission revision; conservatively use the latest actor.
  // The server additionally checks current revision and distinct submitter.
  const latest = reviews?.submissions[0];
  return user.role === "LOCAL_ADMIN" && canEditDocument(user, doc) && doc.status === "IN_REVIEW"
    && !!latest && latest.decision === "SUBMITTED" && latest.submittedBy !== user.id;
}
/** Why Approve is unavailable, in plain words, or null when it is available (24 Nov demo bug b: the button was
 *  disabled with no reason). Mirrors the server's rules; the server still decides. */
export function approvalBlockedReason(user: User, doc: Document, reviews: DocumentReviews | null,
  validation: { validationStatus?: string; coverageComplete?: boolean; failed?: number } | null | undefined): string | null {
  if (user.role !== "LOCAL_ADMIN") return "Only a local admin can approve.";
  if (doc.status !== "IN_REVIEW") return "This document is not waiting for approval.";
  const latest = reviews?.submissions[0];
  if (!latest || latest.decision !== "SUBMITTED") return "This document has not been submitted for approval.";
  if (latest.submittedBy === user.id) return "You submitted this document. A different local admin must approve it.";
  if (!canEditDocument(user, doc)) return "You cannot change this document.";
  if (!validation) return "The checks for this version are not loaded yet. Open the document and check it again.";
  if (validation.validationStatus !== "PASS") {
    const failed = validation.failed ?? 0;
    return failed > 0 ? `${failed} ${failed === 1 ? "check fails" : "checks fail"} on this version. Return it to the accountant, or open it to see what to fix.`
      : "The checks did not pass on this version. Open the document to see which check blocks it.";
  }
  if (validation.coverageComplete === false) return "Some required checks could not run on this version. Open the document to see which.";
  return null;
}
export function hasCurrentApproval(reviews: DocumentReviews | null, revision: number | undefined): boolean {
  return !!revision && !!reviews?.decisions.some(decision => decision.decision === "APPROVED" && decision.approvedRevision === revision);
}
