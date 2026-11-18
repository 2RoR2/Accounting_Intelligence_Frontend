/**
 * Inbox upload queue: the rules behind the Inbox page, kept free of React so they can be tested.
 *
 * - Up to `concurrency` (3) uploads run at once through POST /api/documents; the rest wait in the browser.
 * - After upload each file is followed by polling GET /api/documents/{id} until it reaches a final state:
 *   ready, needs fixing, duplicate or failed.
 * - `dispatchAccepted: false` from the server means "stored, waiting for a free reader": normal progress.
 * - The type is detected by the server (`kind=auto`). A server without that support answers 422
 *   "Invalid document kind"; the queue then pauses and asks once for a type (`needsType`).
 */

export type InboxState = "waiting" | "uploading" | "queued" | "reading" | "ready" | "needs_fixing" | "duplicate" | "failed";
export type InboxCategory = "ACCOUNTS_PAYABLE" | "ACCOUNTS_RECEIVABLE";
export type InboxKind = "AUTO" | "INVOICE" | "BILL" | "RECEIPT";

/** The parts of a browser File the queue reads. The original object is what gets uploaded. */
export type InboxFile = { name: string; size: number; lastModified?: number };

export type UploadReceipt = {
  id: string;
  code?: string;
  kind?: string;
  status?: string;
  jobId?: string;
  dispatchAccepted?: boolean;
};
export type DocumentSnapshot = { id: string; code?: string; status: string; kind?: string; type?: string };

export interface InboxDeps<F extends InboxFile = InboxFile> {
  upload(file: F, kind: InboxKind, category: InboxCategory): Promise<UploadReceipt>;
  getDocument(documentId: string): Promise<DocumentSnapshot>;
  retryReading(documentId: string): Promise<unknown>;
}

export interface InboxItem<F extends InboxFile = InboxFile> {
  key: string;
  file: F;
  name: string;
  size: number;
  state: InboxState;
  category: InboxCategory;
  documentId?: string;
  code?: string;
  /** Detected (or chosen) type, upper case, once the server knows it. */
  kind?: string;
  /** One plain sentence for this file's state when the label alone is not enough. */
  note?: string;
  existing?: { id: string; code?: string; name?: string };
  /** What "Try again" does: upload the file again, or ask the server to read the stored file again. */
  retry?: "upload" | "reading";
}

export const FINAL_STATES: ReadonlySet<InboxState> = new Set(["ready", "needs_fixing", "duplicate", "failed"]);
export const isFinal = (state: InboxState) => FINAL_STATES.has(state);

export const MAX_BYTES = 20 * 1024 * 1024;
const EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);
/** The server's neutral code for a document whose type is not detected yet. */
export const PENDING_CODE_PREFIX = "DOC_";

/** Returns why a file cannot be sent, or null when it can. Checked in the browser before any upload. */
export function rejectReason(file: InboxFile): string | null {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!EXTENSIONS.has(extension)) return "Only PDF files and photos (PNG or JPEG) can be read.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return "This file is larger than 20 MB.";
  return null;
}

const READING = new Set(["PROCESSING", "VALIDATING"]);
const WAITING = new Set(["UPLOADED", "QUEUED"]);
const DONE = new Set(["EXTRACTED", "IN_REVIEW", "CORRECTED", "VALIDATED", "STANDARDISED", "COMPLETED"]);

/** State for a document status from the server. */
export function stateForDocument(status: string, code?: string): Pick<InboxItem, "state" | "note" | "retry"> {
  const value = String(status || "").toUpperCase();
  if (WAITING.has(value)) return { state: "queued" };
  if (READING.has(value)) return { state: "reading" };
  if (value === "FAILED") return { state: "failed", note: "This file could not be read.", retry: "reading" };
  if (value === "EXCEPTION") return { state: "needs_fixing" };
  if (DONE.has(value)) {
    if (code?.startsWith(PENDING_CODE_PREFIX)) return { state: "needs_fixing", note: "The type was not recognised. Choose it when you check the document." };
    return { state: "ready" };
  }
  return { state: "reading" };
}

type ErrorLike = { message?: string; status?: number; details?: Record<string, unknown> };

/** True when the server does not accept kind=auto yet (it predates the Inbox). */
export function isKindUnsupported(error: unknown) {
  const e = (error ?? {}) as ErrorLike;
  return e.status === 422 && /document kind/i.test(String(e.message ?? ""));
}

/** State after a failed upload request. */
export function stateForUploadError(error: unknown): Pick<InboxItem, "state" | "note" | "existing" | "retry"> {
  const e = (error ?? {}) as ErrorLike;
  if (e.status === 409) {
    const details = e.details ?? {};
    const id = typeof details.existingDocumentId === "string" ? details.existingDocumentId : "";
    return {
      state: "duplicate",
      note: "This exact file is already in your documents.",
      existing: id ? { id, code: details.existingDocumentCode as string | undefined, name: details.existingFilename as string | undefined } : undefined,
    };
  }
  if (e.status === 413) return { state: "failed", note: "This file is larger than 20 MB." };
  if (e.status === 422) return { state: "failed", note: e.message || "This file cannot be read. Check it is a PDF or a photo." };
  if (e.status === 403) return { state: "failed", note: "Your account cannot upload documents." };
  return { state: "failed", note: e.message || "The upload did not finish.", retry: "upload" };
}

const kindOf = (value?: string) => {
  const kind = String(value ?? "").toUpperCase();
  return kind && kind !== "AUTO" ? kind : undefined;
};

export type InboxSummary = Record<InboxState, number> & { total: number; done: number };

export function summarise(items: readonly InboxItem[]): InboxSummary {
  const counts = { waiting: 0, uploading: 0, queued: 0, reading: 0, ready: 0, needs_fixing: 0, duplicate: 0, failed: 0 };
  for (const item of items) counts[item.state] += 1;
  const done = counts.ready + counts.needs_fixing + counts.duplicate + counts.failed;
  return { ...counts, total: items.length, done };
}

export class InboxQueue<F extends InboxFile = InboxFile> {
  private items: InboxItem<F>[] = [];
  private listeners = new Set<() => void>();
  private uploading = 0;
  private polling = false;
  private disposed = false;
  private sequence = 0;
  private round = 0;
  private polledAt = new Map<string, number>();
  private kind: InboxKind = "AUTO";
  /** True when the server cannot detect the type: waiting files need one chosen type. */
  needsType = false;
  readonly concurrency: number;
  readonly maxPolls: number;

  constructor(private readonly deps: InboxDeps<F>, options: { concurrency?: number; maxPolls?: number } = {}) {
    this.concurrency = options.concurrency ?? 3;
    this.maxPolls = options.maxPolls ?? 6;
  }

  getItems(): readonly InboxItem<F>[] { return this.items; }
  getKind() { return this.kind; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit() {
    if (this.disposed) return;
    this.listeners.forEach((listener) => listener());
  }

  private patch(key: string, change: Partial<InboxItem<F>>) {
    this.items = this.items.map((item) => (item.key === key ? { ...item, ...change } : item));
    this.emit();
  }

  /** Adds files and starts uploading right away. Files the server cannot take fail here, without a request. */
  add(files: readonly F[], category: InboxCategory = "ACCOUNTS_PAYABLE") {
    const added: InboxItem<F>[] = [];
    for (const file of files) {
      // The same file picked twice in one session (paste and drop, say) is listed once.
      const twin = [...this.items, ...added].some((item) => item.state !== "failed" && item.name === file.name && item.size === file.size
        && (item.file.lastModified ?? 0) === (file.lastModified ?? 0));
      if (twin) continue;
      const reason = rejectReason(file);
      added.push({ key: `inbox-${++this.sequence}`, file, name: file.name, size: file.size, category,
        state: reason ? "failed" : "waiting", note: reason ?? undefined });
    }
    if (!added.length) return [];
    this.items = [...this.items, ...added];
    this.emit();
    this.pump();
    return added.map((item) => item.key);
  }

  /** Chooses the type for the waiting files when the server cannot detect it, and resumes. */
  chooseKind(kind: Exclude<InboxKind, "AUTO">) {
    this.kind = kind;
    this.needsType = false;
    this.emit();
    this.pump();
  }

  remove(key: string) {
    const item = this.items.find((entry) => entry.key === key);
    if (!item || item.state === "uploading") return;
    this.items = this.items.filter((entry) => entry.key !== key);
    this.emit();
  }

  /** Clears finished rows (ready, needs fixing, duplicate, failed) from the list. Documents stay stored. */
  clearFinished() {
    this.items = this.items.filter((item) => !isFinal(item.state));
    this.emit();
  }

  async retry(key: string) {
    const item = this.items.find((entry) => entry.key === key);
    if (!item || item.state !== "failed" || !item.retry) return;
    if (item.retry === "upload") {
      this.patch(key, { state: "waiting", note: undefined, retry: undefined });
      this.pump();
      return;
    }
    if (!item.documentId) return;
    this.patch(key, { state: "queued", note: undefined, retry: undefined });
    try {
      await this.deps.retryReading(item.documentId);
    } catch (error) {
      this.patch(key, { state: "failed", note: (error as ErrorLike)?.message || "The file could not be sent for reading again.", retry: "reading" });
    }
  }

  /** Starts uploads until `concurrency` are running. Safe to call any time. */
  pump() {
    if (this.disposed || this.needsType) return;
    while (this.uploading < this.concurrency) {
      const next = this.items.find((item) => item.state === "waiting");
      if (!next) return;
      this.uploading += 1;
      this.patch(next.key, { state: "uploading", note: undefined });
      void this.send(next.key, next.file, next.category);
    }
  }

  private async send(key: string, file: F, category: InboxCategory) {
    const kind = this.kind;
    try {
      const receipt = await this.deps.upload(file, kind, category);
      const state = receipt.dispatchAccepted === false ? { state: "queued" as const } : stateForDocument(receipt.status ?? "QUEUED", receipt.code);
      this.patch(key, { ...state, documentId: receipt.id, code: receipt.code, kind: kindOf(receipt.kind) });
    } catch (error) {
      if (kind === "AUTO" && isKindUnsupported(error)) {
        // Older server: put this file back and ask once for a type for everything still waiting.
        if (this.kind === "AUTO") this.needsType = true;
        this.patch(key, { state: "waiting" });
      } else {
        this.patch(key, stateForUploadError(error));
      }
    } finally {
      this.uploading -= 1;
      this.pump();
    }
  }

  /** One polling round over files the server still holds (in line or being read); least recently asked first. */
  async tick() {
    if (this.disposed || this.polling) return;
    const open = this.items
      .filter((item) => (item.state === "queued" || item.state === "reading") && item.documentId)
      .sort((a, b) => (this.polledAt.get(a.key) ?? 0) - (this.polledAt.get(b.key) ?? 0))
      .slice(0, this.maxPolls);
    if (!open.length) return;
    this.round += 1;
    open.forEach((item) => this.polledAt.set(item.key, this.round));
    this.polling = true;
    try {
      await Promise.all(open.map(async (item) => {
        try {
          const document = await this.deps.getDocument(item.documentId!);
          const current = this.items.find((entry) => entry.key === item.key);
          if (!current || isFinal(current.state)) return;
          this.patch(item.key, { ...stateForDocument(document.status, document.code), code: document.code ?? current.code,
            kind: kindOf(document.kind ?? document.type) ?? current.kind });
        } catch {
          // A missed poll is not a result: the next round asks again.
        }
      }));
    } finally {
      this.polling = false;
    }
  }

  /** True while anything is uploading or still held by the server. */
  busy() {
    return this.items.some((item) => !isFinal(item.state));
  }

  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
