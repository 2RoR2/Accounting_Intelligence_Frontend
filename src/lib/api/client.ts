export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let refreshInProgress: Promise<boolean> | null = null;

function request(path: string, body?: unknown, method?: string) {
  return fetch(`/api${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Requested-With": "AccountingIntelligence" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function refreshAccessToken() {
  if (!refreshInProgress) {
    refreshInProgress = request("/auth/refresh", {})
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => { refreshInProgress = null; });
  }
  return refreshInProgress;
}

function canRefresh(path: string) {
  const endpoint = path.split("?", 1)[0];
  return endpoint === "/auth/me" || endpoint === "/auth/authorize" || endpoint === "/auth/change-password";
}

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  let response: Response;
  try {
    response = await request(path, body, method);
    if (response.status === 401 && canRefresh(path) && await refreshAccessToken()) {
      response = await request(path, body, method);
    }
  } catch {
    throw new ApiError("Cannot reach the account service. Please try again shortly.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.detail === "string" ? data.detail
      : response.status === 422 ? "Check the required fields and try again."
      : "Account service is unavailable. Please try again shortly.";
    throw new ApiError(message, response.status);
  }
  return data as T;
}
