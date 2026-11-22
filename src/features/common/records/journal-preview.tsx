"use client";

import { useState } from "react";
import { DataTable, LoadingState, Modal, formatDate, money } from "@/components/common/ui";
import { useResource } from "@/features/common/hooks/use-resource";
import { ApiError } from "@/lib/api/client";
import { getScannedPostPreview, postScannedRecord } from "@/lib/api/erp.service";
import { previewTotals } from "./posting-logic";

export function JournalPostingPreview({ recordId, canPost, onClose, onPosted }: {
  recordId: string;
  canPost: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const { data, error, loading, refresh, setData } = useResource(() => getScannedPostPreview(recordId), recordId);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [reloadState, setReloadState] = useState<"idle" | "loading" | "failed">("idle");
  const [previewNotice, setPreviewNotice] = useState("");
  const totals = data ? previewTotals(data) : undefined;
  const ready = !!data?.planHash && !!totals?.balanced && !data.alreadyPosted && !data.problem && reloadState === "idle";

  async function reloadChangedPreview() {
    setReloadState("loading");
    setPreviewNotice("Reloading the journal preview…");
    try {
      const updated = await getScannedPostPreview(recordId);
      if (!updated) throw new Error("No journal preview was returned.");
      setData(updated);
      setReloadState("idle");
      setPreviewNotice("Journal preview refreshed. Review it before posting.");
    } catch {
      setReloadState("failed");
      setPreviewNotice("Unable to refresh the journal preview. Reload it before posting.");
    }
  }

  async function post() {
    if (!data?.planHash || !ready || !canPost || posting) return;
    setPosting(true);
    setPostError("");
    try {
      await postScannedRecord(recordId, { expectedPlanHash: data.planHash });
      onPosted();
    } catch (e) {
      setPostError(e instanceof Error ? e.message : "Unable to post this journal.");
      if (e instanceof ApiError && e.status === 409) await reloadChangedPreview();
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal title="Preview journal" onClose={onClose} closeDisabled={posting}>
      <div className="panel-body">
        {!canPost && <p>A company admin posts approved documents.</p>}
        {loading && <LoadingState />}
        {error && <>
          <p className="notice danger" role="alert">{error}</p>
          <button className="btn" type="button" onClick={() => void refresh()}>Retry preview</button>
        </>}
        {previewNotice && <p role="status">{previewNotice}</p>}
        {reloadState === "failed" && <button className="btn" type="button" onClick={() => void reloadChangedPreview()}>Reload preview</button>}
        {data && totals && reloadState === "idle" && <>
          <p>Journal date {formatDate(data.journalDate)}</p>
          {data.lines.length > 0 && <DataTable
            rows={data.lines.map((line, index) => ({ ...line, index }))}
            rowKey={(line) => String(line.index)}
            columns={[
              { label: "Account", render: (line) => `${line.code} ${line.name}` },
              { label: "Description", render: (line) => line.description },
              { label: "Debit", render: (line) => money(line.debit) },
              { label: "Credit", render: (line) => money(line.credit) },
            ]}
          />}
          <dl className="detail-list">
            <div><dt>Total debit</dt><dd>{money(totals.debit)}</dd></div>
            <div><dt>Total credit</dt><dd>{money(totals.credit)}</dd></div>
          </dl>
          <p className={totals.balanced ? "notice success" : "notice danger"}>{totals.balanced ? "Balanced" : "Not balanced"}</p>
          {data.alreadyPosted && <p>This journal is already posted.</p>}
          {data.previouslyReversed && <p>Previously reversed - posting creates a new journal</p>}
          {data.problem && <p className="notice danger" role="alert">{data.problem}</p>}
        </>}
        {postError && <p className="notice danger" role="alert">{postError}</p>}
        {canPost && <div className="modal-actions">
          <button type="button" className="btn primary" disabled={!ready || posting} onClick={() => void post()}>
            {posting ? "Posting…" : "Post"}
          </button>
        </div>}
      </div>
    </Modal>
  );
}
