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
        // A key written to memory (while storage was full or blocked) is still found here.
        get: (name) => { try { return storage.getItem(name) ?? memory.get(name) ?? null; } catch { return memory.get(name) ?? null; } },
        set: (name, value) => { try { storage.setItem(name, value); } catch { memory.set(name, value); } },
        remove: (name) => { try { storage.removeItem(name); } catch { /* ignore */ } memory.delete(name); },
      };
    }
  } catch { /* sessionStorage blocked */ }
  return { get: (name) => memory.get(name) ?? null, set: (name, value) => { memory.set(name, value); }, remove: (name) => { memory.delete(name); } };
}

/** The exact decimal written, without float rounding: "10", "10.0" and "010.00" are one amount; "10.005" is not "10.01". */
export function canonicalAmount(value?: string): string {
  const text = (value ?? "").trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${whole}${fraction ? "." + fraction : ""}`;
}

/** A stable text for the submitted content. */
export function journalFingerprint(content: JournalAttemptContent): string {
  const amount = canonicalAmount;
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

/**
 * A post for this content succeeded. Forget its key only when the person saw the result (the form was still open);
 * otherwise keep it, so retrying the same entry after reopening returns the recorded journal instead of a duplicate.
 */
export function journalPostFinished(content: JournalAttemptContent, resultShown: boolean, store: KeyStore = defaultStore()): void {
  if (resultShown) settleJournalAttempt(content, store);
}

/** Forget the key once the server has answered for this content (posted or already recorded). */
export function settleJournalAttempt(content: JournalAttemptContent, store: KeyStore = defaultStore()): void {
  store.remove(PREFIX + journalFingerprint(content));
}
