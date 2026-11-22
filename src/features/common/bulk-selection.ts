export const BULK_LIMIT = 100;

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
