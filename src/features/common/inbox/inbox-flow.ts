import { actionIsRunnable, type InboxAction, type InboxItem } from "./inbox-contract";

/**
 * The AI Inbox as a small state machine, free of React so its rules can be tested:
 *  - Accept never runs anything by itself. It opens a confirmation naming the exact call; only `confirm()` runs it.
 *  - After a confirmed call succeeds the list is loaded again.
 *  - A draft has no action to run at all; the page offers Copy for it.
 *  - A 403 means AI_ASSIST is off: the phase becomes "off" and the page and menu hide the feature.
 */
export interface InboxDeps {
  load(): Promise<InboxItem[]>;
  run(action: InboxAction): Promise<void>;
  dismiss(id: string): Promise<void>;
}
export interface PendingAccept { item: InboxItem; action: InboxAction; running: boolean; error: string }
export interface InboxState {
  /** idle: nothing asked yet · loading · ready · off (assistant not turned on) · error (the first load failed) */
  phase: "idle" | "loading" | "ready" | "off" | "error";
  items: InboxItem[];
  error: string;
  pending: PendingAccept | null;
  /** Ids being dismissed, so a card can show it is busy. */
  dismissing: ReadonlySet<string>;
  notice: string;
}

const isOff = (error: unknown) => error instanceof Error && error.name === "AiAssistOffError";
const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export class InboxFlow {
  private state: InboxState = { phase: "idle", items: [], error: "", pending: null, dismissing: new Set(), notice: "" };
  private listeners = new Set<() => void>();
  private loads = 0;

  constructor(private readonly deps: InboxDeps) {}

  getState = (): InboxState => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<InboxState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((listener) => listener()); }

  /** Load the list. A failed reload keeps what is on screen and reports the error beside it. */
  async refresh(): Promise<void> {
    const mine = ++this.loads;
    if (this.state.phase === "idle" || this.state.phase === "error") this.set({ phase: "loading", error: "" });
    try {
      const items = await this.deps.load();
      if (mine === this.loads) this.set({ phase: "ready", items, error: "" });
    } catch (error) {
      if (mine !== this.loads) return;
      if (isOff(error)) this.set({ phase: "off", items: [], error: "", pending: null });
      else this.set(this.state.phase === "ready"
        ? { error: messageOf(error, "Could not refresh the inbox.") }
        : { phase: "error", error: messageOf(error, "Could not load the inbox.") });
    }
  }

  /** Load once for the menu badge; later calls do nothing until the page refreshes. */
  ensureLoaded(): Promise<void> { return this.state.phase === "idle" ? this.refresh() : Promise.resolve(); }

  /** Step 1 of Accept: show what would run. Nothing is called. */
  requestAccept(item: InboxItem, action: InboxAction): boolean {
    if (item.draft || !actionIsRunnable(action)) return false;
    this.set({ pending: { item, action, running: false, error: "" }, notice: "" });
    return true;
  }

  cancel(): void {
    if (this.state.pending?.running) return;
    this.set({ pending: null });
  }

  /** Step 2 of Accept: the person confirmed. Run the one listed call, then refresh. */
  async confirm(): Promise<boolean> {
    const pending = this.state.pending;
    if (!pending || pending.running) return false;
    this.set({ pending: { ...pending, running: true, error: "" } });
    try {
      await this.deps.run(pending.action);
    } catch (error) {
      if (isOff(error)) { this.set({ phase: "off", items: [], pending: null }); return false; }
      this.set({ pending: { ...pending, running: false, error: messageOf(error, "That did not work.") } });
      return false;
    }
    this.set({ pending: null, notice: `Done: ${pending.action.label}.` });
    await this.refresh();
    return true;
  }

  async dismiss(id: string): Promise<void> {
    if (this.state.dismissing.has(id)) return;
    this.set({ dismissing: new Set([...this.state.dismissing, id]), error: "", notice: "" });
    try {
      await this.deps.dismiss(id);
      this.set({ items: this.state.items.filter((item) => item.id !== id) });
    } catch (error) {
      this.set(isOff(error) ? { phase: "off", items: [] } : { error: messageOf(error, "Could not dismiss that suggestion.") });
    } finally {
      const next = new Set(this.state.dismissing);
      next.delete(id);
      this.set({ dismissing: next });
    }
  }

  clearNotice(): void { this.set({ notice: "" }); }
}
