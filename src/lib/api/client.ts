// Keep the browser and API on the same host name so SameSite=strict auth
// cookies are sent after login. Configure NEXT_PUBLIC_API_URL when the API
// is deployed separately. For a same-origin deployment, use relative URLs;
// local development continues to use the backend on port 8000.
const configuredApiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_BASE = (configuredApiBase ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "ApiError";
  }
}

function apiUrl(path: string) {
  if (typeof window !== "undefined") {
    // Always use the same-origin Next.js proxy in the browser. This keeps the
    // MFA/session cookies on the exact host the user is visiting and avoids
    // localhost/127.0.0.1/CORS mismatches.
    return path;
  }
  return `${API_BASE}${path}`;
}

// These endpoints establish or end a session, or respond to one that is not
// yet active; a 401 from them must surface instead of triggering a refresh.
const NO_REFRESH = /^\/api\/auth\/(refresh|login|verify-mfa|resend-mfa|logout|forgot-password|verify-reset-code|reset-status|reset-password|activate|recover-authenticator)\b/;
let refreshInFlight: Promise<boolean> | null = null;

/** Refresh tokens rotate on use, so concurrent 401s must share one refresh request. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(apiUrl("/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "X-Requested-With": "AccountingIntelligence" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).then(response => response.ok).catch(() => false).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function readError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get("Content-Type") ?? "";
  const plain = contentType.includes("text/plain");
  const body = plain ? null : await response.json().catch(() => null);
  const reason = plain ? (await response.text()).trim() : "";
  const detail = body && typeof body.detail === "string"
    ? body.detail
    : body?.detail?.message
      ? `${body.detail.message}${body.detail.existingDocumentCode ? ` Existing document: ${body.detail.existingDocumentCode}.` : ""}`
      : typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : reason || (response.status >= 500
            ? `The backend could not complete this request (${response.status}). Check the API and database service logs.`
            : `Request failed (${response.status})`);
  const details = body?.detail && typeof body.detail === "object" && !Array.isArray(body.detail) ? body.detail as Record<string, unknown> : undefined;
  return new ApiError(detail, response.status, details);
}

async function request<T>(path: string, read: (response: Response) => Promise<T>, init: RequestInit, allowRefresh: boolean): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "AccountingIntelligence");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  // An upload (up to 20 MiB) needs far longer than an ordinary request on a slow connection.
  const timeout = globalThis.setTimeout(() => controller.abort(), init.body instanceof FormData ? 120000 : 15000);
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await readError(response);
      if (response.status === 401 && allowRefresh && !NO_REFRESH.test(path) && await refreshSession()) {
        return await request(path, read, init, false);
      }
      throw error;
    }
    // Keep the timeout active while the response body is being read.
    return await read(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw transportFailure(new Error("The request timed out. Check that the backend and database are running, then try again."));
    }
    if (error instanceof Error && (error.message.startsWith("Your session expired") || error.message.startsWith("Request failed") || error.message.startsWith("Unable to reach") || error.message.startsWith("The request timed out") || error.message.includes("not allowed") || error.message.includes("required") || error.message.includes("invalid"))) {
      throw error;
    }
    // Preserve API/application errors. Only browser transport failures should
    // be rewritten as an unreachable-backend message.
    if (error instanceof Error && error.name !== "TypeError") throw error;
    throw transportFailure(new Error("Unable to reach the backend API. Check your connection, then try again."));
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** A new key for one user action (a save, an approve). Reused on that action's automatic retries only. */
export function newIdempotencyKey(): string {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// POST writes the backend makes safe to retry with an Idempotency-Key (services/routes/idempotency.py): typed document
// create, issue/send/void/post, duplicate, convert, delivered, scanned post, and the scanned-document review actions.
const RETRY_SAFE_WRITES: readonly RegExp[] = [
  /^\/api\/erp\/documents\/[^/]+$/,
  /^\/api\/erp\/documents\/[^/]+\/[^/]+\/(transition|duplicate|transfer)$/,
  /^\/api\/erp\/documents\/delivery-order\/[^/]+\/delivered$/,
  /^\/api\/erp\/scanned\/([^/]+\/post|post-bulk)$/,
  /^\/api\/documents\/[^/]+\/(exclude|review|review\/decision)$/,
  /^\/api\/documents\/review\/(bulk-submit|bulk-decision)$/,
  /^\/api\/records\/from-document\/[^/]+$/,
  /^\/api\/review\/(bulk-submit|bulk-approve)$/,
];

export function isRetrySafeWrite(method: string | undefined, path: string): boolean {
  if ((method ?? "GET").toUpperCase() !== "POST") return false;
  const bare = path.split(/[?#]/, 1)[0];
  return RETRY_SAFE_WRITES.some((pattern) => pattern.test(bare));
}

const transportFailures = new WeakSet<Error>();
function transportFailure(error: Error): Error {
  transportFailures.add(error);
  return error;
}

/** A failure where the server may or may not have acted: a timeout, a dropped connection, a gateway error. */
function mayHaveReachedServer(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 502 || error.status === 503 || error.status === 504;
  return error instanceof Error && transportFailures.has(error);
}

const RETRY_DELAY_MS = 800;

/** One attempt, then (for a keyed write) one more with the same key: the server answers a repeat with the first result. */
async function keyedRequest<T>(path: string, read: (response: Response) => Promise<T>, init: RequestInit, allowRefresh: boolean): Promise<T> {
  try {
    return await request(path, read, init, allowRefresh);
  } catch (error) {
    if (!mayHaveReachedServer(error)) throw error;
    await new Promise((resolve) => globalThis.setTimeout(resolve, RETRY_DELAY_MS));
    return await request(path, read, init, allowRefresh);
  }
}

/** Adds an Idempotency-Key to a retry-safe write that has none (one key per call = one user action). */
export function withIdempotencyKey(path: string, init: RequestInit, key = newIdempotencyKey()): RequestInit {
  if (!isRetrySafeWrite(init.method, path)) return init;
  const headers = new Headers(init.headers);
  if (headers.has(IDEMPOTENCY_HEADER)) return init;
  headers.set(IDEMPOTENCY_HEADER, key);
  return { ...init, headers };
}

export function api<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const read = (response: Response) => response.json().catch(() => null) as Promise<T>;
  const keyed = withIdempotencyKey(path, init);
  if (new Headers(keyed.headers).has(IDEMPOTENCY_HEADER)) return keyedRequest(path, read, keyed, allowRefresh);
  return request(path, read, init, allowRefresh);
}

export async function download(path: string, filename: string) {
  const blob = await request(path, (response) => response.blob(), {}, true);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A binary response (a PDF rendered from the form, a stored copy) through the refresh-aware request. */
export function fetchBlob(path: string, init: RequestInit = {}) {
  return request(path, (response) => response.blob(), init, true);
}

/** Open a file (e.g. a PDF) in a new tab through the refresh-aware request, so an expired access cookie is renewed first. */
export async function openInNewTab(path: string, fallbackName = "document.pdf") {
  const tab = globalThis.open("", "_blank");  // opened before the await so pop-up blockers allow it
  try {
    const blob = await request(path, (response) => response.blob(), {}, true);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else if (!globalThis.open(url, "_blank")) {
      // Pop-ups blocked: save the file instead of doing nothing.
      const link = document.createElement("a");
      link.href = url;
      link.download = fallbackName;
      link.click();
    }
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export const get = <T>(path: string) => api<T>(path);
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, json("POST", body));
