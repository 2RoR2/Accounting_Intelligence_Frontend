import type { Role } from "@/types";

export const PUBLIC_ROUTES = new Set(["login", "welcome", "request-access", "activate", "forgot-password", "reset-password", "help"]);
export const WORKSPACE_AREA: Record<Role, string> = { SUPER_ADMIN: "admin", LOCAL_ADMIN: "company", ACCOUNTANT: "workspace" };
export const WORKSPACE_PAGES: Record<string, ReadonlySet<string>> = {
  admin: new Set(["dashboard", "approvals", "tenants", "users", "processing", "performance", "records", "audit", "settings", "profile"]),
  company: new Set(["dashboard", "documents", "upload", "exceptions", "records", "users", "validation-rules", "reports", "audit", "settings", "profile"]),
  workspace: new Set(["dashboard", "documents", "upload", "exceptions", "records", "profile"]),
};
const DETAIL_PAGES = new Set(["tenants", "documents", "records"]);
export const isPublicRoute = (path: string[]) => path.length === 1 && PUBLIC_ROUTES.has(path[0]);
export function isAllowedWorkspaceRoute(path: string[], role: Role) {
  const [area, page, id] = path;
  return path.length <= 3 && area === WORKSPACE_AREA[role] && WORKSPACE_PAGES[area]?.has(page) === true && (!id || DETAIL_PAGES.has(page));
}
