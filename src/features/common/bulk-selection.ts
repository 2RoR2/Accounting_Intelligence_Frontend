export const BULK_LIMIT = 100;

export function hasContentRevision<T extends { contentRevision?: number | null }>(
  item: T,
): item is T & { contentRevision: number } {
  return typeof item.contentRevision === "number" && Number.isInteger(item.contentRevision) && item.contentRevision > 0;
}

export function selectedIds(selected: readonly string[], eligible: readonly string[]) {
  const eligibleSet = new Set(eligible);
  return selected.filter((id) => eligibleSet.has(id));
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((item) => item !== id);
  if (selected.length >= BULK_LIMIT) return [...selected];
  return [...selected, id];
}

export function bulkResultSummary<T extends { ok: boolean; reason?: string }>(
  action: "submitted" | "approved" | "posted",
  results: readonly T[],
  label: (result: T) => string,
) {
  const refused = results.filter((item) => !item.ok);
  const counts = `${results.length - refused.length} ${action}, ${refused.length} not`;
  if (!refused.length) return counts;
  return `${counts}: ${refused.map((item) => `${label(item)}: ${item.reason || "No reason provided."}`).join(" · ")}`;
}

export type SavedToRecords = { saved: number; failed: Array<{ id: string; reason: string }> };

/**
 * Saves each approved document to records (the same call as the document's "Save to records" button), one at a
 * time. A failure is reported for that document only; the approval itself stands and the rest are still saved.
 */
export async function saveApprovedToRecords(ids: readonly string[], save: (id: string) => Promise<unknown>): Promise<SavedToRecords> {
  const failed: SavedToRecords["failed"] = [];
  for (const id of ids) {
    try {
      await save(id);
    } catch (error) {
      failed.push({ id, reason: error instanceof Error ? error.message : "The record could not be saved." });
    }
  }
  return { saved: ids.length - failed.length, failed };
}

export function savedToRecordsSummary(result: SavedToRecords, label: (id: string) => string) {
  if (!result.saved && !result.failed.length) return "";
  const counts = `${result.saved} saved to records`;
  if (!result.failed.length) return counts;
  return `${counts}, ${result.failed.length} not: ${result.failed.map((item) => `${label(item.id)}: ${item.reason}`).join(" · ")} Open it and use Save to records.`;
}
