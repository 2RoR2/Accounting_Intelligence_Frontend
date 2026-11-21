/**
 * Idempotency keys for manual journal posts, tied to what was submitted and kept outside the form.
 *
 * - The same content always gets the same key until a post is confirmed, so a retry after a timeout (even after the
 *   form unmounted, e.g. on a tab switch) returns the journal the server already recorded instead of posting it twice.
 * - Changed content gets its own key, so an edited entry is never answered with the earlier journal.
 * Keys live in sessionStorage when it is available (one browser tab), otherwise in memory.
 */
export type JournalAttemptContent = {
  periodId: string;
  journalDate: string;
  description: string;
  lines: Array<{ accountId: string; debit?: string; credit?: string }>;
};

export type KeyStore = { get(name: string): string | null; set(name: string, value: string): void; remove(name: string): void };

const PREFIX = "journal-attempt:";
const memory = new Map<string, string>();

function defaultStore(): KeyStore {
  try {
    const storage = globalThis.sessionStorage;
    if (storage) {
      return {
        get: (name) => { try { return storage.getItem(name); } catch { return memory.get(name) ?? null; } },
        set: (name, value) => { try { storage.setItem(name, value); } catch { memory.set(name, value); } },
        remove: (name) => { try { storage.removeItem(name); } catch { /* ignore */ } memory.delete(name); },
      };
    }
  } catch { /* sessionStorage blocked */ }
  return { get: (name) => memory.get(name) ?? null, set: (name, value) => { memory.set(name, value); }, remove: (name) => { memory.delete(name); } };
}

/** A stable text for the submitted content: amounts are normalised so "10" and "10.00" are the same entry. */
export function journalFingerprint(content: JournalAttemptContent): string {
  const amount = (value?: string) => (value == null || value === "" ? "" : Number(value).toFixed(2));
  return JSON.stringify([content.periodId, content.journalDate, content.description.trim(),
    content.lines.map((line) => [line.accountId, amount(line.debit), amount(line.credit)])]);
}

/** The key to send for this content: the pending one if this exact content was tried before, else a new one. */
export function journalAttemptKey(content: JournalAttemptContent, store: KeyStore = defaultStore(),
  newKey: () => string = () => crypto.randomUUID()): string {
  const name = PREFIX + journalFingerprint(content);
  const existing = store.get(name);
  if (existing) return existing;
  const key = newKey();
  store.set(name, key);
  return key;
}

/** Forget the key once the server has answered for this content (posted or already recorded). */
export function settleJournalAttempt(content: JournalAttemptContent, store: KeyStore = defaultStore()): void {
  store.remove(PREFIX + journalFingerprint(content));
}
