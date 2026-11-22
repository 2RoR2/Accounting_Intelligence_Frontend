"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BULK_LIMIT, selectedIds, toggleSelection } from "./bulk-selection";

export function useBulkSelection(eligibleIds: string[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] });
  useEffect(() => {
    setSelection((current) => current.scope === scope ? current : { scope, ids: [] });
  }, [scope]);
  const ids = selectedIds(selection.scope === scope ? selection.ids : [], eligibleIds);
  const checked = new Set(ids);
  const allIds = eligibleIds.slice(0, BULK_LIMIT);
  const allSelected = allIds.length > 0 && allIds.every((id) => checked.has(id));

  return {
    ids,
    checked,
    atLimit: ids.length >= BULK_LIMIT,
    allSelected,
    toggle: (id: string) => setSelection({ scope, ids: toggleSelection(ids, id) }),
    toggleAll: () => setSelection({ scope, ids: allSelected ? [] : allIds }),
    clear: () => setSelection({ scope, ids: [] }),
  };
}

export function BulkControls({ selection, eligibleCount, busy, children }: {
  selection: ReturnType<typeof useBulkSelection>;
  eligibleCount: number;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <div className="filter-bar">
      <label>
        <input type="checkbox" checked={selection.allSelected} disabled={busy || !eligibleCount}
          ref={(input) => { if (input) input.indeterminate = !selection.allSelected && selection.ids.length > 0; }}
          onChange={selection.toggleAll} /> Select all{eligibleCount > BULK_LIMIT ? ` (first ${BULK_LIMIT})` : ""}
      </label>
      <span role="status">{selection.ids.length} selected</span>
      {children}
    </div>
  );
}
