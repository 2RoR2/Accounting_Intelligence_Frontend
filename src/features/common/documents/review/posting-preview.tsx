"use client";
/**
 * What approving this document would do to the books, in plain words (roadmap P10). Read only: the server builds the
 * proposed journal with the same plan the real posting uses, from the values on this version, and posts nothing.
 */
import { useResource } from "@/features/common/hooks/use-resource";
import { get } from "@/lib/api/client";

export interface PostingPreview {
  documentId: string; contentRevision: number; basis: string; date?: string | null; problem: string | null;
  lines: Array<{ code: string | null; name: string | null; description: string; debit: string | null; credit: string | null }>;
  sentences: string[];
}

/** One sentence per journal line, or the reason no journal can be proposed. Pure, so it can be unit tested. */
export function previewSummary(preview: PostingPreview | null | undefined): { lines: string[]; note: string } {
  if (!preview) return { lines: [], note: "The proposed journal could not be loaded." };
  if (preview.problem) return { lines: [], note: preview.problem };
  return { lines: preview.sentences, note: preview.basis };
}

export function PostingPreviewPanel({ documentId, revision }: { documentId: string; revision: number }) {
  const { data, loading, error } = useResource(
    () => get<PostingPreview>(`/api/documents/${encodeURIComponent(documentId)}/posting-preview`),
    `posting-preview:${documentId}:${revision}`);
  const summary = previewSummary(error ? null : data);
  return (
    <section className="review-posting-preview" aria-label="What approval would post">
      <strong>What approval would post</strong>
      {loading ? <p className="review-section-help">Building the proposed journal…</p> : <>
        {summary.lines.length > 0 && <ul>{summary.lines.map(line => <li key={line}>{line}</li>)}</ul>}
        <p className="review-section-help">{summary.note}</p>
      </>}
    </section>
  );
}
